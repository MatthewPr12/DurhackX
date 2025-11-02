import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const talkAppId = process.env.TALKJS_APP_ID;
  const talkSecret = process.env.TALKJS_SECRET;
  const conversationId = process.env.TALKJS_CONVERSATION_ID || 'durhack-game';

  if (!talkAppId || !talkSecret) {
    return NextResponse.json({ ok: false, error: 'TALKJS_APP_ID or TALKJS_SECRET not set on server' }, { status: 500 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch (e) {
    // If parsing as JSON failed (e.g. navigator.sendBeacon or a text body),
    // attempt to read raw text and parse JSON or form-encoded values.
    try {
      const txt = await req.text();
      if (txt) {
        try { body = JSON.parse(txt); } catch (e2) {
          // fallback to URLSearchParams for form-encoded bodies
          try {
            const params = new URLSearchParams(txt);
            const obj: any = {};
            for (const [k, v] of params.entries()) obj[k] = v;
            body = obj;
          } catch (e3) {
            body = {};
          }
        }
      }
    } catch (e3) {
      body = {};
    }
  }

  const playerId = body && body.playerId;
  const convFromBody = body && body.conversationId;
  if (!playerId) return NextResponse.json({ ok: false, error: 'playerId required' }, { status: 400 });

  // allow caller to pass a conversationId to remove from the same conversation
  // the participant was added to. Fall back to the server env var.
  const targetConv = convFromBody || conversationId;

  try {
    const url = `https://api.talkjs.com/v1/${encodeURIComponent(talkAppId)}/conversations/${encodeURIComponent(targetConv)}/participants/${encodeURIComponent(playerId)}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${talkSecret}:`).toString('base64')
      }
    });
    const txt = await res.text();
    let json: any = null;
    try { json = txt ? JSON.parse(txt) : null; } catch (e) { json = txt; }

    // If the participant is already absent, treat as success (idempotent).
    if (res.status === 404) {
      return NextResponse.json({ ok: true, status: 404, message: 'participant not found (treated as removed)', body: json });
    }

    if (!res.ok) {
      return NextResponse.json({ ok: false, status: res.status, body: json }, { status: 500 });
    }
    return NextResponse.json({ ok: true, status: res.status, body: json });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e && (e as Error).message }, { status: 500 });
  }
}
