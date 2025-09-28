// src/app/api/ytmp3/route.ts
import { NextRequest } from "next/server";
import { tmpdir } from "os";
import { mkdtemp, rm, readdir, stat } from "fs/promises";
import { join, basename } from "path";
import { spawn } from "child_process";
import archiver from "archiver";
import { PassThrough } from "stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReqBody = { urls: string[] };

function runYtDlpToMp3(url: string, outDir: string) {
  const args = [
    "-x",
    "--audio-format", "mp3",
    "--no-playlist",
    "--restrict-filenames",
    "-o", join(outDir, "%(title)s.%(id)s.%(ext)s"),
    url,
  ];

  return new Promise<void>((resolve, reject) => {
    const p = spawn("yt-dlp", args, { stdio: "inherit" });
    p.on("error", reject);
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`yt-dlp exit ${code}`))));
  });
}

export async function POST(req: NextRequest) {
  // 1) Parse input
  let body: ReqBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const urls = Array.isArray(body.urls) ? body.urls.filter(Boolean) : [];
  if (urls.length === 0) {
    return new Response(JSON.stringify({ error: "No URLs provided" }), { status: 400 });
  }

  // 2) Prepare temp dir
  const workDir = await mkdtemp(join(tmpdir(), "ytmp3-"));

  // 3) Download/convert sequentially (simple & stable)
  try {
    for (const url of urls) {
      await runYtDlpToMp3(url, workDir);
    }
  } catch (e: any) {
    await rm(workDir, { recursive: true, force: true });
    return new Response(JSON.stringify({ error: e?.message ?? "Download error" }), { status: 500 });
  }

  // 4) Create a Node PassThrough and pipe archiver into it
  const pass = new PassThrough();
  const archive = archiver("zip", { zlib: { level: 9 } });

  archive.on("error", async (err) => {
    pass.destroy(err);
    await rm(workDir, { recursive: true, force: true });
  });

  archive.on("end", async () => {
    // archiver finished writing
    await rm(workDir, { recursive: true, force: true });
  });

  archive.pipe(pass);

  // Add files to archive asynchronously and finalize
  (async () => {
    try {
      const files = await readdir(workDir);
      for (const f of files) {
        const full = join(workDir, f);
        const st = await stat(full);
        if (st.isFile() && (f.endsWith(".mp3") || f.endsWith(".m4a") || f.endsWith(".webm"))) {
          archive.file(full, { name: basename(full) });
        }
      }
      await archive.finalize();
    } catch (err) {
      archive.destroy(err as Error);
    }
  })();

  // 5) Return the ZIP stream
  const headers = new Headers();
  headers.set("Content-Type", "application/zip");
  headers.set("Content-Disposition", `attachment; filename="yt-mp3-${Date.now()}.zip"`);
  headers.set("Cache-Control", "no-store");

  return new Response(pass as any, { status: 200, headers });
}
