import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Resolve the AVIF located at the repo root: dino.avif
    const filePath = path.resolve(process.cwd(), "dino.avif");
    const data = await fs.readFile(filePath);
    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": "image/avif",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    return new NextResponse("Dino image not found", { status: 404 });
  }
}
