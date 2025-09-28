import { cookies } from "next/headers";
import SpotifyWebApi from "spotify-web-api-node";
import { CompactTrack, Options } from "./types";

// Convert milliseconds to "M:SS" format
export const msToHMS = (ms: number): string => {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toString().padStart(2, "0")}`;
};

// Convert an ISO 8601 duration string (e.g. PT3M20S) to milliseconds
export const iso8601ToMs = (iso: string): number => {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!m) return 0;
  const h = parseInt(m[1] ?? "0", 10);
  const min = parseInt(m[2] ?? "0", 10);
  const s = parseInt(m[3] ?? "0", 10);
  return ((h * 60 + min) * 60 + s) * 1000;
};

// Keywords that typically indicate "bad" videos (not official audio)
export const baseBadWords = [
  "official music video",
  "music video",
  "mv",
  "m/v",
  "live",
  "lyric",
  "lyrics",
  "visualizer",
  "visualiser",
  "teaser",
  "trailer",
  "dance practice",
  "cover",
  "fanmade",
  "fan made",
  "reaction",
  "remix",
  "sped up",
  "slowed",
  "8d",
  "nightcore",
];

// Check if a video title contains any "bad" keywords
export const looksBad = (title: string, extra: string[]) => {
  const t = title.toLowerCase();
  return [...baseBadWords, ...extra.map((x) => x.toLowerCase())].some(
    (w) => w && t.includes(w)
  );
};

// Check if a title looks like it’s labeled as official audio
export const likeOfficialAudio = (title: string) =>
  title.toLowerCase().includes("official audio") || /\baudio\b/i.test(title);

// Check if a channel is an "Artist - Topic" auto-generated channel
export const preferTopic = (channel?: string) =>
  /- Topic$/i.test(channel ?? "");

// Produce a heuristic score for a candidate video based on title/channel
export const scoreCandidate = (
  title: string,
  channel: string,
  opt: Options
) => {
  let score = 0;
  if (likeOfficialAudio(title)) score -= 10;
  if (opt.preferTopic && preferTopic(channel)) score -= 15;
  if (looksBad(title, opt.excludeKeywords)) score += 100;
  return score;
};

// Build a basic YouTube search query string from a Spotify track
export const buildQuery = (t: CompactTrack) =>
  `${t.artists.join(" ")} - ${t.name}`.trim();

// Ensure the Spotify API client has a valid access token
// Uses refresh token if available, otherwise falls back to client credentials grant
export async function ensureSpotifyAccess(spotify: SpotifyWebApi) {
  const refresh = (await cookies()).get('spotify_refresh_token')?.value
  if (refresh) {
    spotify.setRefreshToken(refresh);
    const { body } = await spotify.refreshAccessToken();
    spotify.setAccessToken(body.access_token);
  } else {
    const cc = await spotify.clientCredentialsGrant();
    spotify.setAccessToken(cc.body.access_token);
  }
}
