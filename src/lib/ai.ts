import { CompactTrack, AICandidate } from "./types";

const OLLAMA_URL = process.env.OLLAMA_URL || "";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "";

export async function aiPickBestWithOllama(
  track: CompactTrack,
  candidates: AICandidate[]
): Promise<{ bestId: string | null; confidence?: number; reason?: string }> {
  // Build a compact, deterministic prompt for JSON-only response
  const sys = `You are selecting the best YouTube video that matches a Spotify track's OFFICIAL AUDIO (not music video, not live, not lyrics).
Return STRICT JSON: {"bestId": "<videoId or null>", "confidence": <0..1>, "reason": "<short>"} and NOTHING else.`;

  const user = {
    track: {
      title: track.name,
      artists: track.artists,
      album: track.album?.name ?? "",
      duration_ms: track.duration_ms,
      isrc: track.isrc || null,
    },
    instructions: {
      must_match_title: true,
      must_prefer_official_audio: true,
      avoid_music_video_live_lyrics: true,
      prefer_topic_channel_if_right: true,
      consider_duration_proximity_ms: true,
      consider_isrc_in_description: true,
    },
    candidates,
  };

  // Ollama /api/generate expects: model, prompt, stream, options
  // We'll include a simple formatting to push JSON output.
  const prompt = `${sys}\n\nUser:\n${JSON.stringify(
    user,
    null,
    2
  )}\n\nReturn strict JSON only.`;

  try {
    const res = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: {
          temperature: 0,
        },
        // format: "json" is supported by some models; if not, we still enforce via prompt
        // format: "json",
      }),
    });

    if (!res.ok) {
      // Network/HTTP error—fallback
      return { bestId: null };
    }
    const payload = (await res.json()) as { response?: string };
    const text = (payload?.response || "").trim();
    console.log("AI Responded");
    console.log(text);

    // Try to parse JSON directly; if the model wrapped it in text, extract with a loose regex
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch {}
      }
    }
    if (!parsed || typeof parsed !== "object") return { bestId: null };

    const bestId = typeof parsed.bestId === "string" ? parsed.bestId : null;
    const confidence =
      typeof parsed.confidence === "number" ? parsed.confidence : undefined;
    const reason =
      typeof parsed.reason === "string" ? parsed.reason : undefined;
    return { bestId, confidence, reason };
  } catch {
    return { bestId: null };
  }
}
