import { UA } from ".";
import { spawn } from "child_process";

/** MusicBrainz search & Cover Art Archive lookup */
export async function mbSearchAndCover(
  artistGuess: string | undefined,
  trackGuess: string
) {
  const q = artistGuess
    ? `artist:"${artistGuess}" AND recording:"${trackGuess}"`
    : `recording:"${trackGuess}"`;
  const searchUrl = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(
    q
  )}&fmt=json`;
  const recRes = await fetch(searchUrl, { headers: UA });
  if (!recRes.ok) throw new Error(`MusicBrainz search ${recRes.status}`);
  const rec = await recRes.json();
  const recording = rec?.recordings?.[0];
  if (!recording) return null;

  const rel =
    (recording.releases || []).find(
      (r: any) => String(r.status || "").toLowerCase() === "official"
    ) || recording.releases?.[0];

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

/** Basic info via yt-dlp JSON (no download) */
export async function getYtInfo(url: string): Promise<{
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
    p.stderr.on("data", (d) =>
      console.error(`[yt-dlp] ${d.toString().trimEnd()}`)
    );
    p.on("error", reject);
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`yt-dlp -J exit ${code}`))
    );
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
