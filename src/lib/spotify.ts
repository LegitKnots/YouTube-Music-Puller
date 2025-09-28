import SpotifyWebApi from "spotify-web-api-node";
import { CompactTrack } from "./types";
import { ensureSpotifyAccess } from "./utils";

// API Helper
export function makeSpotify(redirectUri: string) {
  return new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID || "",
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || "",
    redirectUri,
  });
}

// Fetches liked songs from Spotify
export async function fetchLiked(
  spotify: SpotifyWebApi
): Promise<CompactTrack[]> {
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

// Fetches full playlist by ID
export async function fetchPlaylist(
  spotify: SpotifyWebApi,
  playlistId: string
): Promise<CompactTrack[]> {
  await ensureSpotifyAccess(spotify);
  const out: CompactTrack[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const { body } = await spotify.getPlaylistTracks(playlistId, {
      limit,
      offset,
    });
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
