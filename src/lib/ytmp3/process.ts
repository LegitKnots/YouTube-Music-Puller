import { rm, writeFile, rename } from "fs/promises";
import { join } from "path";
import { getYtInfo, mbSearchAndCover } from "./info";
import { cleanTitleSuffix, parseArtistTrackFromTitle } from "./parse";
import { spawn } from "child_process";

import { UA } from ".";

/** Spawn a command; resolve on code 0, reject otherwise. */
function run(
  cmd: string,
  args: string[],
  options: { cwd?: string } = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    p.stdout.on("data", (d) =>
      console.log(`[${cmd}] ${d.toString().trimEnd()}`)
    );
    p.stderr.on("data", (d) =>
      console.error(`[${cmd}] ${d.toString().trimEnd()}`)
    );
    p.on("error", reject);
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}`))
    );
  });
}

/** Download a URL to file */
async function downloadToFile(url: string, outPath: string) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outPath, buf);
}

/** Process one YT URL: download mp3, enrich tags, rename to canonical name */
export async function processOneUrl(
  url: string,
  workDir: string,
  forcedAlbum?: string
) {
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
    "--audio-format",
    "mp3",
    "--audio-quality",
    "0",
    "--restrict-filenames",
    "--no-playlist",

    // Clean title inside yt-dlp tags
    "--replace-in-metadata",
    "title",
    ytReplaceSuffix,
    "",
    "--replace-in-metadata",
    "title",
    "(?:\\s*[-–—]\\s*)+$",
    "",

    "-o",
    tempOut,
  ];
  await run("yt-dlp", args);

  const tempMp3 = join(workDir, `${info.id}.mp3`);

  // 3) Enrich with MusicBrainz/CAA (best-effort)
  let mb: {
    artist?: string;
    title?: string;
    album?: string;
    date?: string;
    releaseId?: string;
    coverUrl: string | null;
  } | null = null;

  try {
    if (trackGuess) mb = await mbSearchAndCover(artistGuess, trackGuess);
  } catch (e) {
    console.warn("MB/CAA lookup failed:", (e as Error).message);
  }

  const finalArtist = (
    mb?.artist ||
    artistGuess ||
    info.uploader ||
    "Unknown Artist"
  ).toString();
  const finalTitle = (
    mb?.title ||
    trackGuess ||
    cleaned ||
    info.title
  ).toString();
  const finalAlbum =
    forcedAlbum && forcedAlbum.trim()
      ? forcedAlbum.trim()
      : mb?.album || info.playlist_title || undefined;
  const finalDate = mb?.date || undefined;
  const coverUrl = mb?.coverUrl || null;

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
        "-metadata:s:v",
        "title=Album cover",
        "-metadata:s:v",
        "comment=Cover (front)"
      );
    } catch (e) {
      console.warn(
        "Cover download failed, embedding skipped:",
        (e as Error).message
      );
      ffArgs.push("-c", "copy");
    }
  } else {
    ffArgs.push("-c", "copy");
  }

  ffArgs.push(
    "-id3v2_version",
    "3",
    "-metadata",
    `artist=${finalArtist}`,
    "-metadata",
    `title=${finalTitle}`
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
  const safeTitle = finalTitle.replace(/[\\/:*?"<>|]+/g, "_").trim();
  const finalName = `${safeArtist || "Unknown Artist"} - ${
    safeTitle || "Unknown Title"
  }.mp3`;
  const finalPath = join(workDir, finalName);
  await rename(tempMp3, finalPath);

  return finalPath;
}
