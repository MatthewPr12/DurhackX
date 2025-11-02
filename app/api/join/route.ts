import { NextResponse } from 'next/server';

type Body = { playerId?: string; name?: string; photo?: string };

async function putTalkjs(path: string, body: any, appId: string, secret: string) {
  const url = `https://api.talkjs.com/v1/${encodeURIComponent(appId)}${path}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + Buffer.from(`${secret}:`).toString('base64'),
    },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  let json: any = null;
  try { json = txt ? JSON.parse(txt) : null; } catch (e) { json = txt; }
  return { ok: res.ok, status: res.status, body: json };
}

export async function POST(req: Request) {
  const talkAppId = process.env.TALKJS_APP_ID;
  const talkSecret = process.env.TALKJS_SECRET;
  const conversationId = process.env.TALKJS_CONVERSATION_ID || 'durhack-game';

  if (!talkAppId || !talkSecret) {
    return NextResponse.json({ ok: false, error: 'TALKJS_APP_ID or TALKJS_SECRET not set on server' }, { status: 500 });
  }

  let body: Body = {};
  try { body = await req.json(); } catch (e) { /* ignore */ }

  const { playerId, name, photo } = body;
  if (!playerId) return NextResponse.json({ ok: false, error: 'playerId required' }, { status: 400 });

  // Create/update TalkJS user via Data API
  const userPayload = { id: playerId, name: name || playerId, photoUrl: photo || undefined } as any;
  const userRes = await putTalkjs(`/users/${encodeURIComponent(playerId)}`, userPayload, talkAppId, talkSecret);

  // Add participant to the conversation
  const partRes = await putTalkjs(`/conversations/${encodeURIComponent(conversationId)}/participants/${encodeURIComponent(playerId)}`, { id: playerId }, talkAppId, talkSecret);

  return NextResponse.json({ ok: true, conversationId, userRes, partRes });
}
