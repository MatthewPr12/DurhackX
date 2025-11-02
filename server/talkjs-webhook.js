#!/usr/bin/env node
// Minimal TalkJS webhook receiver that accepts command messages starting
// with '#' (e.g. '#setcolour userId 12') and replies into the conversation
// with a canonical confirmation message via the TalkJS Data API.

const http = require('http');
const { URL } = require('url');

const TALKJS_APP_ID = process.env.TALKJS_APP_ID || process.env.NEXT_PUBLIC_TALKJS_APP_ID;
const TALKJS_SECRET = process.env.TALKJS_SECRET;
const PORT = Number(process.env.TALKJS_PORT || process.env.PORT || 9001);

if (!TALKJS_APP_ID || !TALKJS_SECRET) {
  console.error('[talkjs-webhook] Missing TALKJS_APP_ID or TALKJS_SECRET env vars');
  console.error('Set TALKJS_APP_ID and TALKJS_SECRET before running this webhook');
  process.exit(1);
}

// simple in-memory color allocation (0..25)
const alloc = { byId: {}, used: new Set() };

function allocateColorFor(id, preferred) {
  // if preferred numeric and available, honor it
  if (preferred != null) {
    const n = Number(preferred);
    if (!Number.isNaN(n) && n >= 0 && n < 26 && !alloc.used.has(n)) {
      alloc.byId[id] = n;
      alloc.used.add(n);
      return n;
    }
  }
  // if already assigned, return
  if (typeof alloc.byId[id] === 'number') return alloc.byId[id];
  // pick lowest unused
  for (let i = 0; i < 26; i++) {
    if (!alloc.used.has(i)) {
      alloc.byId[id] = i;
      alloc.used.add(i);
      return i;
    }
  }
  // fallback random
  const fallback = Math.floor(Math.random() * 26);
  alloc.byId[id] = fallback;
  alloc.used.add(fallback);
  return fallback;
}

async function postTalkJSMessage(conversationId, text) {
  const url = `https://api.talkjs.com/v1/${encodeURIComponent(TALKJS_APP_ID)}/conversations/${encodeURIComponent(conversationId)}/messages`;
  const auth = Buffer.from(`${TALKJS_SECRET}:`).toString('base64');
  const body = { text, sender: { id: 'system', name: 'Server' } };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error('[talkjs-webhook] post message failed', res.status, txt);
    }
  } catch (e) {
    console.error('[talkjs-webhook] post message error', e && e.message);
  }
}

function handleCommand(conversationId, text) {
  const parts = text.trim().split(/\s+/);
  const cmd = parts[0].slice(1).toLowerCase();
  if (cmd === 'setcolour' || cmd === 'setcolor') {
    const target = parts[1];
    const color = parts[2];
    if (!target) return postTalkJSMessage(conversationId, 'Usage: #setcolour <userId> <colorIndex|hex>');
    const idx = allocateColorFor(target, color);
    const reply = `#setcolour ${target} ${idx}`;
    // post canonical confirmation into conversation
    return postTalkJSMessage(conversationId, reply);
  }
  // unknown commands: echo back
  return postTalkJSMessage(conversationId, `Unknown command: ${text}`);
}

function collectBody(req) {
  return new Promise((res, rej) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk.toString(); });
    req.on('end', () => { res(data); });
    req.on('error', rej);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || new URL(req.url, `http://localhost`).pathname !== '/talkjs-webhook') {
    res.writeHead(404); res.end('Not found'); return;
  }
  try {
    const raw = await collectBody(req);
    let body = null;
    try { body = JSON.parse(raw); } catch (e) { body = null; }
    // TalkJS webhook for message.create often has type: 'message.create'
    // and body.message with text and conversationId in body.conversation.id
    const eventType = body?.type || (body && body.event);
    const message = body?.message || body?.payload?.message || null;
    const conversation = body?.conversation || body?.payload?.conversation || null;
    if (eventType === 'message.create' && message && conversation) {
      const text = message.text || '';
      const convId = conversation.id || conversation._id || conversation;
      if (typeof text === 'string' && text.trim().startsWith('#')) {
        // handle as command
        await handleCommand(convId, text.trim());
      }
    }
    res.writeHead(200); res.end('ok');
  } catch (e) {
    console.error('[talkjs-webhook] error handling request', e && e.message);
    res.writeHead(500); res.end('error');
  }
});

server.listen(PORT, () => {
  console.log(`[talkjs-webhook] listening on http://0.0.0.0:${PORT}/talkjs-webhook`);
});
