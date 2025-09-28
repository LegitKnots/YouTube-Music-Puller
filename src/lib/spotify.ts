import SpotifyWebApi from "spotify-web-api-node";

export function makeSpotify(redirectUri: string) {
  return new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID || "",
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || "",
    redirectUri,
  });
}
