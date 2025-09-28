import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import SpotifyWebApi from "spotify-web-api-node";

// Optional: make sure this runs on Node
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const refresh = cookieStore.get("spotify_refresh_token")?.value;

  if (!refresh) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }

  try {
    // Init Spotify client. You can also reuse your makeSpotify() if it fits here.
    const spotify = new SpotifyWebApi({
      clientId: process.env.SPOTIFY_CLIENT_ID!,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
      redirectUri: process.env.SPOTIFY_REDIRECT_URI!,
    });

    spotify.setRefreshToken(refresh);

    // Get a fresh access token
    const tokenResp = await spotify.refreshAccessToken();
    const accessToken = tokenResp.body.access_token;
    spotify.setAccessToken(accessToken);

    // Get user profile
    const me = await spotify.getMe();

    return NextResponse.json(
      {
        authenticated: true,
        id: me.body.id,
        username: me.body.display_name ?? me.body.id,
        imageUrl: me.body.images?.[0]?.url ?? null,
      },
      { status: 200 }
    );
  } catch (e: any) {
    // If refresh fails (revoked/expired), clear cookie optionally
    const res = NextResponse.json(
      { authenticated: false, error: e?.message ?? "refresh_failed" },
      { status: 200 }
    );
    // res.cookies.set("spotify_refresh_token", "", { path: "/", maxAge: 0 }); // uncomment to auto-log-out on failure
    return res;
  }
}
