import { NextResponse } from "next/server";

const QUIZ_API_BASE = process.env.QUIZ_API_BASE || process.env.NEXT_PUBLIC_QUIZ_API_BASE || "https://durhack1.enego.co.uk";

export async function POST(req: Request) {
  try {
    let body: any = {};
    try { body = await req.json(); } catch {}
    const { question_id, choice_index, talk_conversation_id } = body || {};
    if (typeof question_id !== 'number' || typeof choice_index !== 'number') {
      return NextResponse.json({ ok: false, error: "question_id and choice_index required (number)" }, { status: 400 });
    }
    const upstream = await fetch(`${QUIZ_API_BASE}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ question_id, choice_index, talk_conversation_id }),
    });
    const text = await upstream.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    return NextResponse.json({ ok: upstream.ok, status: upstream.status, body: json ?? text });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
