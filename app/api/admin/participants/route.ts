import { NextResponse } from 'next/server';

/**
 * Admin helper: list and delete participants for the configured conversation.
 * GET  -> list participants
 * POST -> delete a participant (body: { playerId: string })
 *
 * This endpoint is intended for local/dev diagnostics only. It requires
 * the same TALKJS_APP_ID / TALKJS_SECRET env vars used by the other
 * Data API routes.
 */

async function talkFetch(url: string, opts: RequestInit = {}) {
  return fetch(url, opts);
}

export async function GET(req: Request) {
  const talkAppId = process.env.TALKJS_APP_ID;
  const talkSecret = process.env.TALKJS_SECRET;
  const conversationId = process.env.TALKJS_CONVERSATION_ID || 'durhack-game';

  if (!talkAppId || !talkSecret) {
    return NextResponse.json({ ok: false, error: 'TALKJS_APP_ID or TALKJS_SECRET not set on server' }, { status: 500 });
  }

  try {
    // Allow overriding conversationId via query param for diagnostics
    let convId = conversationId;
    try {
      const u = new URL(req.url);
      const q = u.searchParams.get('conversationId');
      if (q) convId = q;
    } catch (e) {}
    const url = `https://api.talkjs.com/v1/${encodeURIComponent(talkAppId)}/conversations/${encodeURIComponent(convId)}/participants`;
    const res = await talkFetch(url, { headers: { 'Authorization': 'Basic ' + Buffer.from(`${talkSecret}:`).toString('base64') } });
    const txt = await res.text();
    let json: any = null;
    try { json = txt ? JSON.parse(txt) : null; } catch (e) { json = txt; }
    if (!res.ok) return NextResponse.json({ ok: false, status: res.status, body: json }, { status: 500 });
    return NextResponse.json({ ok: true, status: res.status, body: json });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e && (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const talkAppId = process.env.TALKJS_APP_ID;
  const talkSecret = process.env.TALKJS_SECRET;
  const conversationId = process.env.TALKJS_CONVERSATION_ID || 'durhack-game';

  if (!talkAppId || !talkSecret) {
    return NextResponse.json({ ok: false, error: 'TALKJS_APP_ID or TALKJS_SECRET not set on server' }, { status: 500 });
  }

  let body: any = {};
  try { body = await req.json(); } catch (e) { return NextResponse.json({ ok: false, error: 'invalid json body' }, { status: 400 }); }
  const playerId = body && body.playerId;
  if (!playerId) return NextResponse.json({ ok: false, error: 'playerId required' }, { status: 400 });

  try {
    const url = `https://api.talkjs.com/v1/${encodeURIComponent(talkAppId)}/conversations/${encodeURIComponent(conversationId)}/participants/${encodeURIComponent(playerId)}`;
    const res = await talkFetch(url, { method: 'DELETE', headers: { 'Authorization': 'Basic ' + Buffer.from(`${talkSecret}:`).toString('base64') } });
    const txt = await res.text();
    let json: any = null;
    try { json = txt ? JSON.parse(txt) : null; } catch (e) { json = txt; }

    if (res.status === 404) {
      return NextResponse.json({ ok: true, status: 404, message: 'participant not found (treated as removed)', body: json });
    }
    if (!res.ok) return NextResponse.json({ ok: false, status: res.status, body: json }, { status: 500 });
    return NextResponse.json({ ok: true, status: res.status, body: json });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e && (e as Error).message }, { status: 500 });
  }
}
