// src/app/api/ytmp3/route.ts
import { NextRequest } from "next/server";
import { tmpdir } from "os";
import {
  mkdtemp,
  rm,
  readdir,
  stat,
  writeFile,
  rename,
} from "fs/promises";
import { join, basename } from "path";
import { spawn } from "child_process";
import archiver from "archiver";
import { PassThrough } from "stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReqBody = {
  urls: string[];
  album?: string;        // optional album override for the whole batch
  concurrency?: number;  // 1–3 recommended
};

const UA = { "User-Agent": "SP2YT/1.0 (your-email@example.com)" };

/** Remove noisy suffixes like "(Official Audio)" etc. — JS-safe regex */
function cleanTitleSuffix(title: string): string {
  // Case-insensitive via /.../i; non-capturing group for the alternation
  let t = title.replace(
    /\s*\((?:official\s+audio|official\s+video|lyrics?|lyric\s+video|visualizer|audio)\)\s*$/i,
    ""
  );
  // Trim trailing repeated dashes if any left
  t = t.replace(/(?:\s*[-–—]\s*)+$/g, "");
  return t.trim();
}

/** From "Artist - Track (Official Audio)" => { artist, track } */
function parseArtistTrackFromTitle(rawTitle: string): { artist?: string; track?: string } {
  const title = cleanTitleSuffix(rawTitle);
  const m = title.match(/^([^-]{1,100})\s*-\s*(.+)$/);
  if (m) return { artist: m[1].trim(), track: m[2].trim() };
  return { track: title };
}

/** Spawn a command; resolve on code 0, reject otherwise. */
function run(cmd: string, args: string[], options: { cwd?: string } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    p.stdout.on("data", (d) => console.log(`[${cmd}] ${d.toString().trimEnd()}`));
    p.stderr.on("data", (d) => console.error(`[${cmd}] ${d.toString().trimEnd()}`));
    p.on("error", reject);
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}`))));
  });
}

/** Basic info via yt-dlp JSON (no download) */
async function getYtInfo(url: string): Promise<{
  id: string;
  title: string;
  uploader?: string;
  playlist_title?: string;
}> {
  const args = ["-J", "--no-playlist", url];
  const chunks: string[] = [];
  await new Promise<void>((resolve, reject) => {
    const p = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    p.stdout.on("data", (d) => chunks.push(d.toString()));
    p.stderr.on("data", (d) => console.error(`[yt-dlp] ${d.toString().trimEnd()}`));
    p.on("error", reject);
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`yt-dlp -J exit ${code}`))));
  });
  const json = JSON.parse(chunks.join(""));
  const item = json?.entries?.[0] ?? json;
  return {
    id: item?.id,
    title: item?.title,
    uploader: item?.uploader,
    playlist_title: json?.title,
  };
}

/** MusicBrainz search & Cover Art Archive lookup */
async function mbSearchAndCover(artistGuess: string | undefined, trackGuess: string) {
  const q = artistGuess
    ? `artist:"${artistGuess}" AND recording:"${trackGuess}"`
    : `recording:"${trackGuess}"`;
  const searchUrl = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(q)}&fmt=json`;
  const recRes = await fetch(searchUrl, { headers: UA });
  if (!recRes.ok) throw new Error(`MusicBrainz search ${recRes.status}`);
  const rec = await recRes.json();
  const recording = rec?.recordings?.[0];
  if (!recording) return null;

  const rel =
    (recording.releases || []).find((r: any) => String(r.status || "").toLowerCase() === "official") ||
    recording.releases?.[0];

  let coverUrl: string | null = null;
  if (rel?.id) {
    const caaUrl = `https://coverartarchive.org/release/${rel.id}`;
    const caaRes = await fetch(caaUrl, { headers: UA });
    if (caaRes.ok) {
      const caa = await caaRes.json();
      const front = caa.images?.find((i: any) => i.front) || caa.images?.[0];
      coverUrl = front?.image || null;
    }
  }

  return {
    artist: recording["artist-credit"]?.map((a: any) => a.name).join(", "),
    title: recording.title,
    album: rel?.title,
    date: rel?.date,
    releaseId: rel?.id,
    coverUrl,
  } as {
    artist?: string;
    title?: string;
    album?: string;
    date?: string;
    releaseId?: string;
    coverUrl: string | null;
  };
}

/** Download a URL to file */
async function downloadToFile(url: string, outPath: string) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outPath, buf);
}

/** Process one YT URL: download mp3, enrich tags, rename to canonical name */
async function processOneUrl(url: string, workDir: string, forcedAlbum?: string) {
  // 1) Inspect video
  const info = await getYtInfo(url);
  if (!info?.id || !info?.title) throw new Error("Failed to read video info");

  const cleaned = cleanTitleSuffix(info.title);
  const guess = parseArtistTrackFromTitle(cleaned);
  const artistGuess = guess.artist ?? info.uploader;
  const trackGuess = guess.track ?? cleaned;

  // 2) Download → MP3 with yt-dlp (temporary file named by ID)
  const tempOut = join(workDir, `${info.id}.%(ext)s`);
  // NOTE: For yt-dlp, Python regex supports inline flags like (?i) at the START.
  // We avoid (?i:...) and move (?i) to the beginning.
  const ytReplaceSuffix =
    "(?i)\\s*\\((official\\s+audio|official\\s+video|lyrics?|lyric\\s+video|visualizer|audio)\\)\\s*$";

  const args: string[] = [
    url,
    "-x",
    "--audio-format", "mp3",
    "--audio-quality", "0",
    "--restrict-filenames",
    "--no-playlist",

    // Clean title inside yt-dlp tags
    "--replace-in-metadata", "title", ytReplaceSuffix, "",
    "--replace-in-metadata", "title", "(?:\\s*[-–—]\\s*)+$", "",

    "-o", tempOut,
  ];
  await run("yt-dlp", args);

  const tempMp3 = join(workDir, `${info.id}.mp3`);

  // 3) Enrich with MusicBrainz/CAA (best-effort)
  let mb:
    | {
        artist?: string;
        title?: string;
        album?: string;
        date?: string;
        releaseId?: string;
        coverUrl: string | null;
      }
    | null = null;

  try {
    if (trackGuess) mb = await mbSearchAndCover(artistGuess, trackGuess);
  } catch (e) {
    console.warn("MB/CAA lookup failed:", (e as Error).message);
  }

  const finalArtist = (mb?.artist || artistGuess || info.uploader || "Unknown Artist").toString();
  const finalTitle  = (mb?.title  || trackGuess  || cleaned || info.title).toString();
  const finalAlbum  = (forcedAlbum && forcedAlbum.trim())
    ? forcedAlbum.trim()
    : (mb?.album || info.playlist_title || undefined);
  const finalDate   = mb?.date || undefined;
  const coverUrl    = mb?.coverUrl || null;

  // 4) Retag with ffmpeg, embed cover art if available
  const taggedTmp = join(workDir, `${info.id}.tagged.mp3`);
  const ffArgs = ["-y", "-i", tempMp3];

  let coverPath: string | undefined;
  if (coverUrl) {
    try {
      coverPath = join(workDir, `${info.id}.cover.jpg`);
      await downloadToFile(coverUrl, coverPath);
      ffArgs.push("-i", coverPath, "-map", "0:a", "-map", "1", "-c", "copy");
      ffArgs.push(
        "-metadata:s:v", "title=Album cover",
        "-metadata:s:v", "comment=Cover (front)"
      );
    } catch (e) {
      console.warn("Cover download failed, embedding skipped:", (e as Error).message);
      ffArgs.push("-c", "copy");
    }
  } else {
    ffArgs.push("-c", "copy");
  }

  ffArgs.push(
    "-id3v2_version", "3",
    "-metadata", `artist=${finalArtist}`,
    "-metadata", `title=${finalTitle}`
  );
  if (finalAlbum) {
    ffArgs.push("-metadata", `album=${finalAlbum}`);
  }
  if (finalDate) {
    ffArgs.push("-metadata", `date=${finalDate}`);
    ffArgs.push("-metadata", `year=${finalDate.substring(0, 4)}`);
  }
  ffArgs.push(taggedTmp);

  await run("ffmpeg", ffArgs);

  await rename(taggedTmp, tempMp3);
  if (coverPath) await rm(coverPath, { force: true });

  // 5) Canonical filename
  const safeArtist = finalArtist.replace(/[\\/:*?"<>|]+/g, "_").trim();
  const safeTitle  = finalTitle.replace(/[\\/:*?"<>|]+/g, "_").trim();
  const finalName  = `${safeArtist || "Unknown Artist"} - ${safeTitle || "Unknown Title"} [${info.id}].mp3`;
  const finalPath  = join(workDir, finalName);
  await rename(tempMp3, finalPath);

  return finalPath;
}

/** Tiny concurrency helper */
async function mapWithConcurrency<T, R>(
  items: T[],
  worker: (item: T, idx: number) => Promise<R>,
  concurrency = 1
): Promise<R[]> {
  concurrency = Math.max(1, Math.min(3, concurrency || 1));
  let i = 0;
  const results: R[] = new Array(items.length) as any;
  const runners = new Array(concurrency).fill(0).map(async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) break;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

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
    ? Array.from(new Set(body.urls.map((u) => String(u).trim()).filter(Boolean)))
    : [];
  if (urls.length === 0) {
    return new Response(JSON.stringify({ error: "No URLs provided" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const albumName   = body.album;
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
    return new Response(JSON.stringify({ error: e?.message ?? "Download error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
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
  headers.set("Content-Disposition", `attachment; filename="yt-mp3-${Date.now()}.zip"`);
  headers.set("Cache-Control", "no-store");

  return new Response(pass as any, { status: 200, headers });
}
