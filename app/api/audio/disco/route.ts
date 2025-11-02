import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Resolve the MP3 located at the repo root: funky-disco-155292.mp3
    const filePath = path.resolve(process.cwd(), "funky-disco-155292.mp3");
    const data = await fs.readFile(filePath);
    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        // Allow some caching during dev; adjust for production as needed
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    // Not found or cannot read: return 404
    return new NextResponse("Audio not found", { status: 404 });
  }
}
