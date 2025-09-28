import { NextRequest, NextResponse } from "next/server";
import { fetchLiked, fetchPlaylist, makeSpotify } from "@/lib/spotify";
import { runMapToYouTube, writeOutputs } from "@/lib/core";
import { Options } from "@/lib/types";

export const maxDuration = 60;        // allow longer runs on some hosts
export const dynamic = "force-dynamic"; // disable caching

// Try to robustly extract a YouTube URL from a row object regardless of shape.
function extractYoutubeUrl(row: any): string | null {
  // Common shapes:
  // - row.youtubeUrl
  // - row.youtube?.url
  // - row.url (if already normalized to the YT URL)
  // - row.youtube_url
  const candidates = [
    row?.youtubeUrl,
    row?.youtube?.url,
    row?.url,
    row?.youtube_url,
  ].filter(Boolean) as string[];

  for (const c of candidates) {
    if (typeof c === "string" && /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(c)) {
      return c;
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mode = body?.mode as "liked" | "playlist";
    const playlistId = body?.playlistId as string | undefined;
    const options = (body?.options ?? {}) as Partial<Options>;

    // Sanitize options with safe defaults
    const opt: Options = {
      verifyDuration: options.verifyDuration ?? true,
      toleranceMs:
        typeof options.toleranceMs === "number" ? options.toleranceMs : 6000,
      concurrency: Math.min(Math.max(options.concurrency ?? 3, 1), 6),
      preferTopic: options.preferTopic ?? true,
      excludeKeywords: Array.isArray(options.excludeKeywords)
        ? options.excludeKeywords
        : [],
    };

    const spotify = makeSpotify(process.env.SPOTIFY_REDIRECT_URI || "");

    // Fetch source tracks from Spotify
    let tracks = [];
    if (mode === "liked") {
      tracks = await fetchLiked(spotify);
    } else if (mode === "playlist" && playlistId) {
      tracks = await fetchPlaylist(spotify, playlistId);
    } else {
      return NextResponse.json({ error: "Bad params" }, { status: 400 });
    }

    // Map to YouTube
    const rows = await runMapToYouTube(spotify, tracks, opt);

    // Persist the usual outputs (JSON/CSV) for your existing download endpoints
    writeOutputs(rows);

    // Build a URLs-only list for the new flow
    const urls = rows
      .map(extractYoutubeUrl)
      .filter((u): u is string => !!u);

    // Respond with count + urls-only array
    return NextResponse.json({
      count: rows.length,
      urls, // just the YouTube URLs, nothing else
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
