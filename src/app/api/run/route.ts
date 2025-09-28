import { NextRequest, NextResponse } from "next/server";
import { fetchLiked, fetchPlaylist, makeSpotify } from "@/lib/spotify";
import { runMapToYouTube, writeOutputs } from "@/lib/core";
import { Options } from "@/lib/types";

export const maxDuration = 60;           // allow longer runs on some hosts
export const dynamic = "force-dynamic";  // disable caching

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mode = body?.mode as "liked" | "playlist";
    const playlistId = body?.playlistId as string | undefined;
    const options = (body?.options ?? {}) as Partial<Options>;

    const opt: Options = {
      verifyDuration: options.verifyDuration ?? true,
      toleranceMs: typeof options.toleranceMs === "number" ? options.toleranceMs : 6000,
      concurrency: Math.min(Math.max(options.concurrency ?? 3, 1), 6),
      preferTopic: options.preferTopic ?? true,
      excludeKeywords: Array.isArray(options.excludeKeywords) ? options.excludeKeywords : [],
    };

    const spotify = makeSpotify(process.env.SPOTIFY_REDIRECT_URI || "");

    let tracks = [];
    if (mode === "liked") {
      tracks = await fetchLiked(spotify);
    } else if (mode === "playlist" && playlistId) {
      tracks = await fetchPlaylist(spotify, playlistId);
    } else {
      return NextResponse.json({ error: "Bad params" }, { status: 400 });
    }

    const rows = await runMapToYouTube(spotify, tracks, opt);
    writeOutputs(rows);

    return NextResponse.json({ count: rows.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
