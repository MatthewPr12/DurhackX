#!/usr/bin/env node
// Minimal HTTP helper for TalkJS-based join/leave handling
// Replaces the old WebSocket relay when TalkJS is used as the canonical transport.
// Usage: node server/ws-server.js [port]

const http = require('http');
const { URL } = require('url');

const PORT = Number(process.argv[2] || process.env.PORT || 8080);

// In-memory allocation (playerId -> colorIndex) and used set
const alloc = { byId: {}, used: new Set() };

const TALKJS_APP_ID = process.env.TALKJS_APP_ID;
const TALKJS_SECRET = process.env.TALKJS_SECRET;
const TALKJS_CONVERSATION_ID = process.env.TALKJS_CONVERSATION_ID || 'durhack-game';

// Runtime conversation id used for participant additions. We generate a
// fresh conversation id on each server start (when TalkJS credentials exist)
// to ensure a blank participant list after restart.
let ACTIVE_TALKJS_CONVERSATION_ID = TALKJS_CONVERSATION_ID;

function makeRuntimeConversationId() {
  const base = TALKJS_CONVERSATION_ID || 'durhack-game';
  const suffix = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8);
  return `${base}-${suffix}`;
}

function assignColorIndexFor(id) {
  let colorIndex = null;
  for (let i = 0; i < 26; i++) {
    if (!alloc.used.has(i)) { colorIndex = i; break; }
  }
  if (colorIndex === null) colorIndex = Math.floor(Math.random() * 26);
  alloc.byId[id] = colorIndex;
  alloc.used.add(colorIndex);
  return colorIndex;
}

function freeColorIndexFor(id) {
  const idx = alloc.byId[id];
  if (typeof idx === 'number') {
    delete alloc.byId[id];
    alloc.used.delete(idx);
    return idx;
  }
  return null;
}

async function ensureTalkjsUser(playerId, name, photoUrl, colorIndex) {
  if (!TALKJS_APP_ID || !TALKJS_SECRET) return null;
  try {
    const url = `https://api.talkjs.com/v1/${encodeURIComponent(TALKJS_APP_ID)}/users/${encodeURIComponent(playerId)}`;
    const body = {
      id: playerId,
      name: name || playerId,
      photoUrl: photoUrl || undefined,
      // Add a small data object so the TalkJS user has metadata available.
      // The TalkJS Data API accepts an arbitrary payload for the user PUT.
      data: { colorIndex }
    };
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${TALKJS_SECRET}:`).toString('base64')
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const txt = await res.text();
      console.warn('[ws-server] TalkJS user create/update failed', res.status, txt);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn('[ws-server] TalkJS user create/update error', e && e.message);
    return null;
  }
}

async function ensureTalkjsParticipant(playerId, conversationId) {
  if (!TALKJS_APP_ID || !TALKJS_SECRET) return null;
  try {
    // Try to PUT a participant resource for the conversation. The TalkJS Data API
    // supports managing participants via a PUT to /conversations/{convId}/participants/{participantId}.
    const url = `https://api.talkjs.com/v1/${encodeURIComponent(TALKJS_APP_ID)}/conversations/${encodeURIComponent(conversationId)}/participants/${encodeURIComponent(playerId)}`;
    const body = { id: playerId };
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${TALKJS_SECRET}:`).toString('base64')
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const txt = await res.text();
      console.warn('[ws-server] TalkJS participant PUT failed', res.status, txt);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn('[ws-server] TalkJS participant error', e && e.message);
    return null;
  }
}

function jsonResponse(res, code, obj) {
  const s = JSON.stringify(obj || {});
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(s);
}

async function handleJoin(req, res, body) {
  const { playerId, name, photo } = body || {};
  if (!playerId) return jsonResponse(res, 400, { error: 'playerId required' });

  // If already assigned, return existing index
  if (typeof alloc.byId[playerId] === 'number') {
    return jsonResponse(res, 200, { playerId, colorIndex: alloc.byId[playerId], reused: true });
  }

  const colorIndex = assignColorIndexFor(playerId);

  // Optionally create/update the TalkJS user so the TalkJS Data store contains metadata
  const talkjsResult = await ensureTalkjsUser(playerId, name, photo, colorIndex);
  // Also attempt to add the user as a participant to the active conversation.
  const participantResult = await ensureTalkjsParticipant(playerId, ACTIVE_TALKJS_CONVERSATION_ID);

  return jsonResponse(res, 200, { playerId, colorIndex, conversationId: ACTIVE_TALKJS_CONVERSATION_ID, talkjsResult: !!talkjsResult, participantResult: !!participantResult });
}

async function handleLeave(req, res, body) {
  const { playerId } = body || {};
  if (!playerId) return jsonResponse(res, 400, { error: 'playerId required' });
  const freed = freeColorIndexFor(playerId);
  return jsonResponse(res, 200, { playerId, freed });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  if (u.pathname === '/join' && req.method === 'POST') {
    try {
      let buf = '';
      for await (const chunk of req) buf += chunk;
      const body = buf ? JSON.parse(buf) : {};
      return await handleJoin(req, res, body);
    } catch (e) {
      return jsonResponse(res, 400, { error: 'invalid json', message: e && e.message });
    }
  }

  if (u.pathname === '/leave' && req.method === 'POST') {
    try {
      let buf = '';
      for await (const chunk of req) buf += chunk;
      const body = buf ? JSON.parse(buf) : {};
      return await handleLeave(req, res, body);
    } catch (e) {
      return jsonResponse(res, 400, { error: 'invalid json', message: e && e.message });
    }
  }

  // basic status / debug
  if (u.pathname === '/' && req.method === 'GET') {
    return jsonResponse(res, 200, { status: 'ok', mode: 'talkjs-join-service', allocCount: Object.keys(alloc.byId).length });
  }

  // Return the active conversation id for inspection
  if (u.pathname === '/conversation' && req.method === 'GET') {
    return jsonResponse(res, 200, { conversationId: ACTIVE_TALKJS_CONVERSATION_ID });
  }

  // Reset: clear allocations and rotate the active conversation id
  if (u.pathname === '/reset' && req.method === 'POST') {
    try {
      let buf = '';
      for await (const chunk of req) buf += chunk; // drain body if any
      const cleared = Object.keys(alloc.byId).length;
      alloc.byId = {};
      alloc.used = new Set();
      if (TALKJS_APP_ID && TALKJS_SECRET) {
        ACTIVE_TALKJS_CONVERSATION_ID = makeRuntimeConversationId();
      } else {
        ACTIVE_TALKJS_CONVERSATION_ID = TALKJS_CONVERSATION_ID;
      }
      return jsonResponse(res, 200, { cleared, conversationId: ACTIVE_TALKJS_CONVERSATION_ID });
    } catch (e) {
      return jsonResponse(res, 500, { error: 'reset failed', message: e && e.message });
    }
  }

  jsonResponse(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`[ws-server] (http) listening on http://0.0.0.0:${PORT}`);
  if (!TALKJS_APP_ID || !TALKJS_SECRET) {
    console.log('[ws-server] TALKJS_APP_ID or TALKJS_SECRET not set; TalkJS user creation will be skipped.');
    // Use configured conversation id when credentials aren't present.
    ACTIVE_TALKJS_CONVERSATION_ID = TALKJS_CONVERSATION_ID;
  } else {
    // Create a fresh runtime conversation id for this process so participants
    // from previous runs are not reused.
    ACTIVE_TALKJS_CONVERSATION_ID = makeRuntimeConversationId();
    console.log('[ws-server] TalkJS credentials detected; will attempt to create/update users via TalkJS Data API.');
    console.log('[ws-server] active conversation id:', ACTIVE_TALKJS_CONVERSATION_ID);
  }
});

// helper endpoints are handled inside the main request handler above

process.on('SIGINT', () => {
  console.log('[ws-server] shutting down');
  server.close(() => process.exit(0));
});
