import { youtube_v3 } from "googleapis";
import { aiPickBestWithOllama } from "./ai";
import { CompactTrack, ResultRow, Options, AICandidate } from "./types";
import {
  buildQuery,
  iso8601ToMs,
  looksBad,
  preferTopic,
  scoreCandidate,
} from "./utils";

// YouTube picking (AI + fallback)
export async function pickBestYouTube(
  yt: youtube_v3.Youtube,
  track: CompactTrack,
  opt: Options
): Promise<{ url: string | null; debug?: ResultRow["match_debug"] }> {
  // Pull a slightly bigger pool for the AI to choose from
  const q = buildQuery(track);
  const { data } = await yt.search.list({
    part: ["snippet"],
    q: q,
    type: ["video"],
    maxResults: 12,
    videoCategoryId: "10",
  });
  const items = data.items ?? [];
  if (items.length === 0) return { url: null, debug: { queried: q } };

  // Enrich candidates with duration + description so the model can reason
  const ids = items.map((it) => it.id?.videoId).filter(Boolean) as string[];
  const details = new Map<
    string,
    { duration_ms: number; description: string }
  >();

  // videos.list can take up to 50 ids; we have <=12 already
  if (ids.length > 0) {
    const vd = await yt.videos.list({
      id: ids,
      part: ["contentDetails", "snippet"],
    });
    for (const v of vd.data.items ?? []) {
      const dur = iso8601ToMs(v.contentDetails?.duration ?? "PT0S");
      const desc = v.snippet?.description ?? "";
      details.set(v.id!, { duration_ms: dur, description: desc });
    }
  }

  const aiCandidates: AICandidate[] = items
    .map((it) => {
      const id = it.id?.videoId ?? "";
      const title = it.snippet?.title ?? "";
      const channel = it.snippet?.channelTitle ?? "";
      const d = details.get(id);
      const dur = d?.duration_ms ?? 0;
      const desc = d?.description ?? "";
      return {
        id,
        title,
        channel,
        duration_ms: dur,
        has_bad_words: looksBad(title, opt.excludeKeywords),
        is_topic: preferTopic(channel),
        isrc_in_description: !!(
          track.isrc && desc.toUpperCase().includes(track.isrc.toUpperCase())
        ),
        url: id ? `https://www.youtube.com/watch?v=${id}` : "",
      };
    })
    .filter((c) => c.id);

  // Ask Ollama to pick the best
  let chosenId: string | null = null;
  let aiReason: string | undefined;
  try {
    const ai = await aiPickBestWithOllama(track, aiCandidates);
    chosenId = ai.bestId || null;
    aiReason = ai.reason;
  } catch {
    // ignore — fallback below
  }

  // Fallback to heuristic (with duration check) when AI fails or returns null
  if (!chosenId) {
    const candidates = aiCandidates
      .map((c) => ({
        id: c.id,
        title: c.title,
        channel: c.channel,
        score: scoreCandidate(c.title, c.channel, opt),
      }))
      .sort((a, b) => a.score - b.score);

    let pick = candidates[0];
    let durationMatch: boolean | undefined;

    if (opt.verifyDuration && pick?.id) {
      const d = details.get(pick.id)?.duration_ms ?? 0;
      durationMatch = Math.abs(d - track.duration_ms) <= opt.toleranceMs;
      if (!durationMatch) {
        for (let i = 1; i < candidates.length; i++) {
          const alt = candidates[i];
          const d2 = details.get(alt.id)?.duration_ms ?? 0;
          if (Math.abs(d2 - track.duration_ms) <= opt.toleranceMs) {
            pick = alt;
            durationMatch = true;
            break;
          }
        }
      }
    }

    return {
      url: pick?.id ? `https://www.youtube.com/watch?v=${pick.id}` : null,
      debug: {
        picked_title: pick?.title,
        picked_channel: pick?.channel,
        picked_score: pick?.score,
        duration_match: opt.verifyDuration ? !!durationMatch : undefined,
        queried: q,
      } as any,
    };
  }

  // happy path — AI provided a choice
  const picked = aiCandidates.find((c) => c.id === chosenId);
  return {
    url: picked ? `https://www.youtube.com/watch?v=${picked.id}` : null,
    debug: {
      picked_title: picked?.title,
      picked_channel: picked?.channel,
      picked_score: undefined, // AI-based
      duration_match: opt.verifyDuration
        ? Math.abs((picked?.duration_ms || 0) - track.duration_ms) <=
          opt.toleranceMs
        : undefined,
      queried: q + " [AI]",
    },
  };
}
