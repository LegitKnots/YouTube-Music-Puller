import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import SpotifyWebApi from 'spotify-web-api-node';
import { google, youtube_v3 } from 'googleapis';
import pLimit from 'p-limit';
import { stringify } from 'csv-stringify/sync';

export type CompactTrack = {
  id: string;
  name: string;
  duration_ms: number;
  artists: string[];
  album: { name?: string; release_date?: string };
  isrc: string | null;
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

const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REDIRECT_URI,
  SPOTIFY_REFRESH_TOKEN,
  YOUTUBE_API_KEY,
} = process.env;

if (!YOUTUBE_API_KEY) throw new Error('Missing YOUTUBE_API_KEY');

const spotify = new SpotifyWebApi({
  clientId: SPOTIFY_CLIENT_ID,
  clientSecret: SPOTIFY_CLIENT_SECRET,
  redirectUri: SPOTIFY_REDIRECT_URI,
});
if (SPOTIFY_REFRESH_TOKEN) spotify.setRefreshToken(SPOTIFY_REFRESH_TOKEN);

const youtube: youtube_v3.Youtube = google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const msToHMS = (ms: number): string => {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toString().padStart(2, '0')}`;
};
const iso8601ToMs = (iso: string): number => {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!m) return 0;
  const h = parseInt(m[1] ?? '0', 10);
  const min = parseInt(m[2] ?? '0', 10);
  const s = parseInt(m[3] ?? '0', 10);
  return ((h * 60 + min) * 60 + s) * 1000;
};

const BAD_WORDS = [
  'official music video','music video','mv','m/v','live','lyric','lyrics',
  'visualizer','visualiser','teaser','trailer','dance practice','cover',
  'fanmade','fan made','reaction','remix','sped up','slowed','8d','nightcore',
];

const looksLikeMV = (title: string) => BAD_WORDS.some(w => title.toLowerCase().includes(w));
const likeOfficialAudio = (title: string) => title.toLowerCase().includes('official audio') || /\baudio\b/i.test(title);
const preferTopic = (channel?: string) => /- Topic$/i.test(channel ?? '');
const scoreCandidate = (title: string, channel: string) => {
  let score = 0;
  if (likeOfficialAudio(title)) score -= 10;
  if (preferTopic(channel)) score -= 15;
  if (looksLikeMV(title)) score += 100;
  return score;
};
const buildQuery = (t: CompactTrack) => `${t.artists.join(' ')} - ${t.name} official audio ${t.album?.name ?? ''}`.trim();

async function ensureSpotifyAccess(): Promise<void> {
  if (SPOTIFY_REFRESH_TOKEN) {
    const { body } = await spotify.refreshAccessToken();
    spotify.setAccessToken(body.access_token);
  } else {
    const cc = await spotify.clientCredentialsGrant();
    spotify.setAccessToken(cc.body.access_token);
  }
}

export async function fetchLiked(): Promise<CompactTrack[]> {
  if (!SPOTIFY_REFRESH_TOKEN) throw new Error('Liked Songs requires SPOTIFY_REFRESH_TOKEN');
  await ensureSpotifyAccess();
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
    await sleep(120);
  }
  return out;
}

export async function fetchPlaylist(playlistId: string): Promise<CompactTrack[]> {
  await ensureSpotifyAccess();
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
    await sleep(120);
  }
  return out;
}

export async function pickBestYouTube(
  track: CompactTrack,
  verifyDuration = true,
  tolMs = 6000
): Promise<{ url: string | null; debug?: ResultRow['match_debug'] }> {
  const q = buildQuery(track);
  const { data } = await youtube.search.list({
    part: ['snippet'],
    q: q,
    type: ['video'],
    maxResults: 6,
    videoCategoryId: '10',
  });
  const items = data.items ?? [];
  if (items.length === 0) return { url: null, debug: { queried: q } };

  const cands = items.map(it => {
    const title = it.snippet?.title ?? '';
    const channel = it.snippet?.channelTitle ?? '';
    return {
      id: it.id?.videoId ?? '',
      title, channel,
      score: scoreCandidate(title, channel),
    };
  }).sort((a,b) => a.score - b.score);

  let pick = cands[0];
  let durationMatch: boolean | undefined;

  if (verifyDuration && pick?.id) {
    const vd = await youtube.videos.list({ id: [pick.id], part: ['contentDetails'] });
    const d = iso8601ToMs(vd.data.items?.[0]?.contentDetails?.duration ?? 'PT0S');
    durationMatch = Math.abs(d - track.duration_ms) <= tolMs;
    if (!durationMatch) {
      for (let i = 1; i < cands.length; i++) {
        const alt = cands[i];
        const altV = await youtube.videos.list({ id: [alt.id], part: ['contentDetails'] });
        const d2 = iso8601ToMs(altV.data.items?.[0]?.contentDetails?.duration ?? 'PT0S');
        if (Math.abs(d2 - track.duration_ms) <= tolMs) { pick = alt; durationMatch = true; break; }
      }
    }
  }

  return {
    url: pick?.id ? `https://www.youtube.com/watch?v=${pick.id}` : null,
    debug: { picked_title: pick?.title, picked_channel: pick?.channel, picked_score: pick?.score, duration_match: durationMatch, queried: q }
  };
}

export async function runMapToYouTube(tracks: CompactTrack[]): Promise<ResultRow[]> {
  const limit = pLimit(3);
  const out: ResultRow[] = [];
  await Promise.all(tracks.map(t => limit(async () => {
    try {
      const best = await pickBestYouTube(t, true);
      out.push({
        spotify_track: t.name,
        artists: t.artists.join(', '),
        duration: msToHMS(t.duration_ms),
        album: t.album?.name ?? '',
        isrc: t.isrc,
        youtube_url: best.url,
        match_debug: best.debug,
      });
    } catch (e: any) {
      out.push({
        spotify_track: t.name,
        artists: t.artists.join(', '),
        duration: msToHMS(t.duration_ms),
        album: t.album?.name ?? '',
        isrc: t.isrc,
        youtube_url: null,
        error: String(e?.message ?? e),
      });
    }
  })));
  return out;
}

export function writeOutputs(rows: ResultRow[]) {
  const dir = path.join(process.cwd(), 'output');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const jsonPath = path.join(dir, 'spotify_to_youtube.json');
  const csvPath = path.join(dir, 'spotify_to_youtube.csv');

  fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2), 'utf8');

  const csv = stringify(
    rows.map(r => [r.spotify_track, r.artists, r.duration, r.album, r.isrc ?? '', r.youtube_url ?? '']),
    { header: true, columns: ['Track','Artists','Duration','Album','ISRC','YouTube URL'] }
  );
  fs.writeFileSync(csvPath, csv, 'utf8');

  return { jsonPath, csvPath };
}
