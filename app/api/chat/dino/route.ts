import { NextResponse } from "next/server";

async function postTalkjs(path: string, body: any, appId: string, secret: string) {
  const origin = process.env.TALKJS_API_ORIGIN || 'https://api.talkjs.com';
  const url = `${origin}/v1/${encodeURIComponent(appId)}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + Buffer.from(`${secret}:`).toString('base64'),
    },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  let json: any = null;
  try { json = txt ? JSON.parse(txt) : null; } catch { json = txt; }
  return { ok: res.ok, status: res.status, body: json };
}

export async function POST(req: Request) {
  const talkAppId = process.env.TALKJS_APP_ID;
  const talkSecret = process.env.TALKJS_SECRET;
  if (!talkAppId || !talkSecret) {
    return NextResponse.json({ ok: false, error: 'TALKJS_APP_ID or TALKJS_SECRET not set on server' }, { status: 500 });
  }

  let body: any = {};
  try { body = await req.json(); } catch {}

  const conversationId: string = body?.conversationId || process.env.TALKJS_CONVERSATION_ID || '';
  const senderId: string | undefined = body?.senderId;
  let imageUrl: string | undefined = body?.imageUrl;

  if (!conversationId) {
    return NextResponse.json({ ok: false, error: 'conversationId required' }, { status: 400 });
  }
  if (!senderId) {
    return NextResponse.json({ ok: false, error: 'senderId required' }, { status: 400 });
  }

  // Build an absolute URL for the image if needed
  if (!imageUrl || imageUrl.startsWith('/')) {
    const headers = (req as any).headers as Headers;
    const proto = headers.get('x-forwarded-proto') || 'https';
    const host = headers.get('x-forwarded-host') || headers.get('host');
    const base = host ? `${proto}://${host}` : '';
    imageUrl = `${base}${imageUrl || '/api/media/dino'}`;
  }

  // TalkJS Data API message with rich content (image)
  const msg = {
    type: 'UserMessage',
    sender: senderId,
    content: [
      { type: 'image', url: imageUrl }
    ],
  };

  const res = await postTalkjs(`/conversations/${encodeURIComponent(conversationId)}/messages`, [msg], talkAppId, talkSecret);
  const status = res.ok ? 200 : (res.status || 500);
  return NextResponse.json({ ok: res.ok, status, body: res.body, imageUrl });
}
