import { NextRequest, NextResponse } from "next/server";
import { makeSpotify } from "@/lib/spotify";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code)
    return NextResponse.json({ error: "Missing code" }, { status: 400 });

  const spotify = makeSpotify(process.env.SPOTIFY_REDIRECT_URI!);
  try {
    const { body } = await spotify.authorizationCodeGrant(code);
    const refresh = body.refresh_token;

    // For multi-user apps, store per-user in a DB. For single-user dev:
    return new NextResponse(
      `<h2>Refresh token minted ✅</h2>
       <p>Copy this into <code>.env.local</code> as <b>SPOTIFY_REFRESH_TOKEN</b>:</p>
       <pre>${refresh}</pre>
       <p>Then go back to the app.</p>`,
      { headers: { "content-type": "text/html" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Auth error" },
      { status: 500 }
    );
  }
}
