import { NextResponse } from "next/server";

// Server-side base URL for the external quiz API
const QUIZ_API_BASE = process.env.QUIZ_API_BASE || process.env.NEXT_PUBLIC_QUIZ_API_BASE || "https://durhack1.enego.co.uk";

export async function POST(req: Request) {
  try {
    let body: any = {};
    try { body = await req.json(); } catch {}
    const user_id = encodeURIComponent(body?.user_id || body?.userId || "");
    const name = encodeURIComponent(body?.name || "");
    const photoUrl = body?.photo_url || body?.photoUrl || body?.photo || "";
    const photo_q = photoUrl ? `&photo_url=${encodeURIComponent(photoUrl)}` : "";

    if (!user_id || !name) {
      return NextResponse.json({ ok: false, error: "user_id and name required" }, { status: 400 });
    }

    const url = `${QUIZ_API_BASE}/talkjs/bootstrap?user_id=${user_id}&name=${name}${photo_q}`;
    const upstream = await fetch(url, { method: "POST" });
    const text = await upstream.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* leave as text */ }
    return NextResponse.json({ ok: upstream.ok, status: upstream.status, body: json ?? text });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
