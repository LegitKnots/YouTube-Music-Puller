import fs from "fs";
import path from "path";
import SpotifyWebApi from "spotify-web-api-node";
import pLimit from "p-limit";
import { stringify } from "csv-stringify/sync";
import { makeYouTube } from "./youtube";
import { CompactTrack, Options, ResultRow } from "./types";
import { msToHMS } from "./utils";
import { pickBestYouTube } from "./pickBest";

// Main Wrapper
export async function runMapToYouTube(
  spotify: SpotifyWebApi,
  tracks: CompactTrack[],
  opt: Options
): Promise<ResultRow[]> {
  const yt = makeYouTube();
  const limit = pLimit(Math.min(Math.max(opt.concurrency, 1), 6));
  const rows: ResultRow[] = [];

  await Promise.all(
    tracks.map((t) =>
      limit(async () => {
        try {
          const best = await pickBestYouTube(yt, t, opt);
          rows.push({
            spotify_track: t.name,
            artists: t.artists.join(", "),
            duration: msToHMS(t.duration_ms),
            album: t.album?.name ?? "",
            isrc: t.isrc,
            youtube_url: best.url,
            match_debug: best.debug,
          });
        } catch (e: any) {
          rows.push({
            spotify_track: t.name,
            artists: t.artists.join(", "),
            duration: msToHMS(t.duration_ms),
            album: t.album?.name ?? "",
            isrc: t.isrc,
            youtube_url: null,
            error: String(e?.message ?? e),
          });
        }
      })
    )
  );

  return rows;
}

// Outputs
export function writeOutputs(rows: ResultRow[]) {
  const dir =
    process.env.NODE_ENV === "production"
      ? "/tmp"
      : path.join(process.cwd(), "output");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const jsonPath = path.join(dir, "spotify_to_youtube.json");
  const csvPath = path.join(dir, "spotify_to_youtube.csv");

  fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2), "utf8");

  const csv = stringify(
    rows.map((r) => [
      r.spotify_track,
      r.artists,
      r.duration,
      r.album,
      r.isrc ?? "",
      r.youtube_url ?? "",
    ]),
    {
      header: true,
      columns: ["Track", "Artists", "Duration", "Album", "ISRC", "YouTube URL"],
    }
  );
  fs.writeFileSync(csvPath, csv, "utf8");

  return { dir, jsonPath, csvPath };
}
