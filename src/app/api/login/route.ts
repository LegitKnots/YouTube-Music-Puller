import { NextResponse } from "next/server";
import { makeSpotify } from "@/lib/spotify";

export async function GET() {
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI!;
  const spotify = makeSpotify(redirectUri);
  const scopes = ["user-library-read","playlist-read-private","playlist-read-collaborative"];
  const url = spotify.createAuthorizeURL(scopes, "webstate123", true);
  return NextResponse.redirect(url);
}
