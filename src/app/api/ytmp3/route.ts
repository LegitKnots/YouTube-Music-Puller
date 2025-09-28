// src/app/api/ytmp3/route.ts
import { NextRequest } from "next/server";
import { tmpdir } from "os";
import { mkdtemp, rm, stat } from "fs/promises";
import { join, basename } from "path";
import archiver from "archiver";
import { PassThrough } from "stream";

import { mapWithConcurrency, processOneUrl } from "@/lib/ytmp3";
import { ReqBody } from "@/lib/ytmp3/types";

export async function POST(req: NextRequest) {
  let body: ReqBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const urls = Array.isArray(body.urls)
    ? Array.from(
        new Set(body.urls.map((u) => String(u).trim()).filter(Boolean))
      )
    : [];
  if (urls.length === 0) {
    return new Response(JSON.stringify({ error: "No URLs provided" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const albumName = body.album;
  const concurrency = body.concurrency ?? 1;

  const workDir = await mkdtemp(join(tmpdir(), "ytmp3-"));

  let finalFiles: string[];
  try {
    finalFiles = await mapWithConcurrency(
      urls,
      (u) => processOneUrl(u, workDir, albumName),
      concurrency
    );
  } catch (e: any) {
    await rm(workDir, { recursive: true, force: true });
    return new Response(
      JSON.stringify({ error: e?.message ?? "Download error" }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }

  // Stream a ZIP of MP3s
  const pass = new PassThrough();
  const archive = archiver("zip", { zlib: { level: 9 } });

  const cleanup = async () => {
    await rm(workDir, { recursive: true, force: true });
  };

  archive.on("error", async (err) => {
    console.error("[archiver] error:", err);
    pass.destroy(err);
    await cleanup();
  });
  archive.on("end", async () => {
    await cleanup();
  });

  archive.pipe(pass);

  (async () => {
    try {
      for (const p of finalFiles) {
        const st = await stat(p);
        if (st.isFile()) archive.file(p, { name: basename(p) });
      }
      await archive.finalize();
    } catch (err) {
      archive.destroy(err as Error);
    }
  })();

  const headers = new Headers();
  headers.set("Content-Type", "application/zip");
  headers.set(
    "Content-Disposition",
    `attachment; filename="yt-mp3-${Date.now()}.zip"`
  );
  headers.set("Cache-Control", "no-store");

  return new Response(pass as any, { status: 200, headers });
}
