import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const dir =
    process.env.NODE_ENV === "production"
      ? "/tmp"
      : path.join(process.cwd(), "output");
  const p = path.join(dir, "spotify_to_youtube.json");
  if (!fs.existsSync(p))
    return NextResponse.json({ error: "No file yet" }, { status: 404 });
  const buf = fs.readFileSync(p);
  return new NextResponse(buf, {
    headers: { "content-type": "application/json" },
  });
}
