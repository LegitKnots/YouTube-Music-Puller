import fs from "fs";
import path from "path";
import SpotifyWebApi from "spotify-web-api-node";
import pLimit from "p-limit";
import { stringify } from "csv-stringify/sync";
import { makeYouTube } from "./youtube";
import { youtube_v3 } from "googleapis";

export type CompactTrack = {
  id: string;
  name: string;
  duration_ms: number;
  artists: string[];
  album: { name?: string; release_date?: string };
  isrc: string | null;
};

export type Options = {
  verifyDuration: boolean;
  toleranceMs: number;   // e.g. 6000
  concurrency: number;   // 1..6
  preferTopic: boolean;
  excludeKeywords: string[]; // lowercase keywords to penalize
};

export type ResultRow = {
  spotify_track: string;
  artists: string;
  duration: string;
  album: string;
  isrc: string | null;
  youtube_url: string | null;
  match_debug?: {
    picked_title?: string;
    picked_channel?: string;
    picked_score?: number;
    duration_match?: boolean;
    queried?: string;
  };
  error?: string;
};

const msToHMS = (ms: number): string => {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toString().padStart(2, "0")}`;
};
const iso8601ToMs = (iso: string): number => {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!m) return 0;
  const h = parseInt(m[1] ?? "0", 10);
  const min = parseInt(m[2] ?? "0", 10);
  const s = parseInt(m[3] ?? "0", 10);
  return ((h * 60 + min) * 60 + s) * 1000;
};

const baseBadWords = [
  "official music video","music video","mv","m/v","live","lyric","lyrics",
  "visualizer","visualiser","teaser","trailer","dance practice","cover",
  "fanmade","fan made","reaction","remix","sped up","slowed","8d","nightcore",
];

const looksBad = (title: string, extra: string[]) => {
  const t = title.toLowerCase();
  return [...baseBadWords, ...extra.map(x => x.toLowerCase())].some(w => w && t.includes(w));
};
const likeOfficialAudio = (title: string) =>
  title.toLowerCase().includes("official audio") || /\baudio\b/i.test(title);
const preferTopic = (channel?: string) => /- Topic$/i.test(channel ?? "");

const scoreCandidate = (title: string, channel: string, opt: Options) => {
  let score = 0;
  if (likeOfficialAudio(title)) score -= 10;
  if (opt.preferTopic && preferTopic(channel)) score -= 15;
  if (looksBad(title, opt.excludeKeywords)) score += 100;
  return score;
};

const buildQuery = (t: CompactTrack) =>
  `${t.artists.join(" ")} - ${t.name} official audio ${t.album?.name ?? ""}`.trim();

async function ensureSpotifyAccess(spotify: SpotifyWebApi) {
  const refresh = process.env.SPOTIFY_REFRESH_TOKEN;
  if (refresh) {
    spotify.setRefreshToken(refresh);
    const { body } = await spotify.refreshAccessToken();
    spotify.setAccessToken(body.access_token);
  } else {
    const cc = await spotify.clientCredentialsGrant();
    spotify.setAccessToken(cc.body.access_token);
  }
}

export async function fetchLiked(spotify: SpotifyWebApi): Promise<CompactTrack[]> {
  if (!process.env.SPOTIFY_REFRESH_TOKEN) {
    throw new Error("Liked Songs requires SPOTIFY_REFRESH_TOKEN");
  }
  await ensureSpotifyAccess(spotify);
  const out: CompactTrack[] = [];
  let offset = 0;
  const limit = 50;
  while (true) {
    const { body } = await spotify.getMySavedTracks({ limit, offset });
    for (const item of body.items) {
      const t: any = item.track;
      if (!t) continue;
      out.push({
        id: t.id,
        name: t.name,
        duration_ms: t.duration_ms,
        artists: (t.artists ?? []).map((a: any) => a.name),
        album: { name: t.album?.name, release_date: t.album?.release_date },
        isrc: t.external_ids?.isrc ?? null,
      });
    }
    if (body.items.length < limit) break;
    offset += limit;
  }
  return out;
}

export async function fetchPlaylist(spotify: SpotifyWebApi, playlistId: string): Promise<CompactTrack[]> {
  await ensureSpotifyAccess(spotify);
  const out: CompactTrack[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const { body } = await spotify.getPlaylistTracks(playlistId, { limit, offset });
    for (const item of body.items) {
      const t: any = (item as any).track;
      if (!t) continue;
      out.push({
        id: t.id,
        name: t.name,
        duration_ms: t.duration_ms,
        artists: (t.artists ?? []).map((a: any) => a.name),
        album: { name: t.album?.name, release_date: t.album?.release_date },
        isrc: t.external_ids?.isrc ?? null,
      });
    }
    if (body.items.length < limit) break;
    offset += limit;
  }
  return out;
}

export async function pickBestYouTube(
  yt: youtube_v3.Youtube,
  track: CompactTrack,
  opt: Options
): Promise<{ url: string | null; debug?: ResultRow["match_debug"] }> {
  const q = buildQuery(track);
  const { data } = await yt.search.list({
    part: ["snippet"],
    q: q,
    type: ["video"],
    maxResults: 6,
    videoCategoryId: "10",
  });
  const items = data.items ?? [];
  if (items.length === 0) return { url: null, debug: { queried: q } };

  const candidates = items
    .map((it) => {
      const title = it.snippet?.title ?? "";
      const channel = it.snippet?.channelTitle ?? "";
      return {
        id: it.id?.videoId ?? "",
        title,
        channel,
        score: scoreCandidate(title, channel, opt),
      };
    })
    .sort((a, b) => a.score - b.score);

  let pick = candidates[0];
  let durationMatch: boolean | undefined;

  if (opt.verifyDuration && pick?.id) {
    const vd = await yt.videos.list({ id: [pick.id], part: ["contentDetails"] });
    const d = iso8601ToMs(vd.data.items?.[0]?.contentDetails?.duration ?? "PT0S");
    durationMatch = Math.abs(d - track.duration_ms) <= opt.toleranceMs;
    if (!durationMatch) {
      for (let i = 1; i < candidates.length; i++) {
        const alt = candidates[i];
        const altV = await yt.videos.list({ id: [alt.id], part: ["contentDetails"] });
        const d2 = iso8601ToMs(altV.data.items?.[0]?.contentDetails?.duration ?? "PT0S");
        if (Math.abs(d2 - track.duration_ms) <= opt.toleranceMs) {
          pick = alt; durationMatch = true; break;
        }
      }
    }
  }

  return {
    url: pick?.id ? `https://www.youtube.com/watch?v=${pick.id}` : null,
    debug: { picked_title: pick?.title, picked_channel: pick?.channel, picked_score: pick?.score, duration_match: durationMatch, queried: q },
  };
}

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

export function writeOutputs(rows: ResultRow[]) {
  const dir = process.env.NODE_ENV === "production" ? "/tmp" : path.join(process.cwd(), "output");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const jsonPath = path.join(dir, "spotify_to_youtube.json");
  const csvPath  = path.join(dir, "spotify_to_youtube.csv");

  fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2), "utf8");

  const csv = stringify(
    rows.map((r) => [r.spotify_track, r.artists, r.duration, r.album, r.isrc ?? "", r.youtube_url ?? ""]),
    { header: true, columns: ["Track","Artists","Duration","Album","ISRC","YouTube URL"] }
  );
  fs.writeFileSync(csvPath, csv, "utf8");

  return { dir, jsonPath, csvPath };
}
