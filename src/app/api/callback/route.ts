// src/app/api/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { makeSpotify } from "@/lib/spotify";

export const runtime = "nodejs";          // avoid edge runtime cookie oddities
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const spotify = makeSpotify(process.env.SPOTIFY_REDIRECT_URI!);

  try {
    const { body } = await spotify.authorizationCodeGrant(code);
    const refresh = body.refresh_token;

    if (!refresh) {
      return NextResponse.json(
        { error: "No refresh_token returned from Spotify" },
        { status: 400 }
      );
    }

    const isProd = process.env.NODE_ENV === "production";

    // Build a normal 200 HTML response that immediately navigates to "/"
    const html = `<!doctype html>
<html>
  <head>
    <meta http-equiv="refresh" content="0;url=/" />
    <script>window.location.replace("/");</script>
  </head>
  <body>Redirecting…</body>
</html>`;

    const res = new NextResponse(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });

    // Set the cookie on this 200 response (browser will keep it on nav)
    res.cookies.set("spotify_refresh_token", refresh, {
      httpOnly: true,
      sameSite: "lax",
      secure: isProd, // must be true on HTTPS
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
      // domain: isProd ? ".yourdomain.com" : undefined, // uncomment if subdomains involved
    });

    return res;
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Auth error" },
      { status: 500 }
    );
  }
}
