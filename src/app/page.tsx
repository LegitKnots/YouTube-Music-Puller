"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

type Mode = "liked" | "playlist";

export default function Home() {
  const [mode, setMode] = useState<Mode>("liked");
  const [playlistId, setPlaylistId] = useState("");
  const [verifyDuration, setVerifyDuration] = useState(true);
  const [toleranceSec, setToleranceSec] = useState(6);
  const [concurrency, setConcurrency] = useState(3);
  const [preferTopic, setPreferTopic] = useState(true);
  const [excludeKeywords, setExcludeKeywords] = useState(
    [
      "official music video",
      "music video",
      "mv",
      "m/v",
      "live",
      "lyric",
      "lyrics",
      "visualizer",
      "visualiser",
      "teaser",
      "trailer",
      "dance practice",
      "cover",
      "fanmade",
      "fan made",
      "reaction",
      "remix",
      "sped up",
      "slowed",
      "8d",
      "nightcore",
    ].join(", ")
  );

  const [isRunning, setIsRunning] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [jsonUrl, setJsonUrl] = useState<string | null>(null);
  const [csvUrl, setCsvUrl] = useState<string | null>(null);
  const [log, setLog] = useState<string>("");
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  const canRun = useMemo(() => {
    if (mode === "playlist") {
      return playlistId.trim().length > 0 && !isRunning;
    }
    return !isRunning;
  }, [mode, playlistId, isRunning]);

  const appendLog = (line: string) =>
    setLog((prev) => (prev ? prev + "\n" + line : line));

  const onRun = async () => {
    setIsRunning(true);
    setJsonUrl(null);
    setCsvUrl(null);
    setCount(null);
    setLog("");

    // Basic validations
    if (mode === "playlist" && playlistId.trim().length === 0) {
      appendLog("Please enter a Spotify playlist ID.");
      setIsRunning(false);
      return;
    }
    if (toleranceSec < 0 || toleranceSec > 30) {
      appendLog("Tolerance should be between 0 and 30 seconds.");
      setIsRunning(false);
      return;
    }
    if (concurrency < 1 || concurrency > 6) {
      appendLog("Concurrency should be between 1 and 6.");
      setIsRunning(false);
      return;
    }

    appendLog("Starting… This may take a few minutes for large lists.");

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          playlistId: mode === "playlist" ? playlistId.trim() : undefined,
          options: {
            verifyDuration,
            toleranceMs: Math.round(toleranceSec * 1000),
            concurrency,
            preferTopic,
            excludeKeywords: excludeKeywords
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        appendLog(`Error: ${data.error || res.statusText}`);
        setIsRunning(false);
        return;
      }

      setCount(data.count ?? null);
      setJsonUrl("/api/download/json");
      setCsvUrl("/api/download/csv");
      appendLog(
        `Done. Processed ${data.count ?? "N/A"} tracks.\n` +
          `JSON: ${location.origin}/api/download/json\n` +
          `CSV : ${location.origin}/api/download/csv`
      );
    } catch (e: any) {
      appendLog(`Unexpected error: ${e?.message ?? String(e)}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-start justify-items-center min-h-screen p-8 pb-20 gap-10 sm:p-16">
      <main className="flex flex-col gap-8 row-start-2 w-full max-w-4xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              className="dark:invert"
              src="/next.svg"
              alt="Next.js logo"
              width={120}
              height={28}
              priority
            />
            <span className="text-lg font-medium">
              Spotify → YouTube (Official Audio)
            </span>
          </div>

          <a
            href="/api/login"
            className="rounded-lg border border-solid border-black/[.08] dark:border-white/[.145] transition-colors flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 font-medium text-sm h-10 px-4"
          >
            Login to Spotify
          </a>
        </div>

        {/* Mode */}
        <section className="rounded-2xl border border-black/10 dark:border-white/15 p-5">
          <h2 className="text-base font-semibold mb-3">Source</h2>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-6">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  className="size-4"
                  checked={mode === "liked"}
                  onChange={() => setMode("liked")}
                />
                <span>Liked Songs</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  className="size-4"
                  checked={mode === "playlist"}
                  onChange={() => setMode("playlist")}
                />
                <span>Playlist ID</span>
              </label>
            </div>

            {mode === "playlist" && (
              <div className="flex flex-col gap-2">
                <label className="text-sm text-black/70 dark:text-white/70">
                  Spotify Playlist ID
                </label>
                <input
                  className="rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20"
                  placeholder="e.g. 37i9dQZF1DXcBWIGoYBM5M"
                  value={playlistId}
                  onChange={(e) => setPlaylistId(e.target.value)}
                />
                <p className="text-xs text-black/60 dark:text-white/50">
                  Paste the ID from a Spotify playlist URL like&nbsp;
                  <code className="bg-black/5 dark:bg-white/10 px-1 py-0.5 rounded">
                    https://open.spotify.com/playlist/&lt;ID&gt;
                  </code>
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Options */}
        <section className="rounded-2xl border border-black/10 dark:border-white/15 p-5">
          <h2 className="text-base font-semibold mb-3">Matching Options</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-3">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={verifyDuration}
                  onChange={(e) => setVerifyDuration(e.target.checked)}
                />
                <span>Verify duration against Spotify</span>
              </label>

              <div className="flex items-center gap-3">
                <label className="text-sm w-48">
                  Duration tolerance (seconds)
                </label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  step={1}
                  className="w-28 rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20"
                  value={toleranceSec}
                  onChange={(e) => setToleranceSec(Number(e.target.value))}
                  disabled={!verifyDuration}
                />
              </div>

              <div className="flex items-center gap-3">
                <label className="text-sm w-48">Concurrency</label>
                <input
                  type="range"
                  min={1}
                  max={6}
                  value={concurrency}
                  onChange={(e) => setConcurrency(Number(e.target.value))}
                />
                <span className="text-sm tabular-nums w-6 text-center">
                  {concurrency}
                </span>
              </div>

              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={preferTopic}
                  onChange={(e) => setPreferTopic(e.target.checked)}
                />
                <span>Prefer “Artist – Topic” channels</span>
              </label>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm">Exclude keywords (comma-separated)</label>
              <textarea
                className="min-h-28 rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20"
                value={excludeKeywords}
                onChange={(e) => setExcludeKeywords(e.target.value)}
              />
              <p className="text-xs text-black/60 dark:text-white/50">
                Any result whose title includes one of these will be heavily
                penalized (e.g. MV, live, lyrics, remix).
              </p>
            </div>
          </div>
        </section>

        {/* Actions */}
        <section className="rounded-2xl border border-black/10 dark:border-white/15 p-5 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={onRun}
              disabled={!canRun}
              className={`rounded-lg transition-colors px-4 h-10 font-medium ${
                canRun
                  ? "bg-foreground text-background hover:opacity-90"
                  : "bg-black/10 dark:bg-white/10 text-black/50 dark:text-white/50 cursor-not-allowed"
              }`}
            >
              {isRunning ? "Running…" : "Run"}
            </button>

            {jsonUrl && (
              <a
                className="rounded-lg border border-solid border-black/[.08] dark:border-white/[.145] transition-colors flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 font-medium text-sm h-10 px-4"
                href={jsonUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Download JSON
              </a>
            )}
            {csvUrl && (
              <a
                className="rounded-lg border border-solid border-black/[.08] dark:border-white/[.145] transition-colors flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 font-medium text-sm h-10 px-4"
                href={csvUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Download CSV
              </a>
            )}

            {typeof count === "number" && (
              <span className="text-sm text-black/70 dark:text-white/70">
                Processed: <b className="tabular-nums">{count}</b> tracks
              </span>
            )}
          </div>

          <pre
            ref={logRef}
            className="h-56 overflow-auto bg-black/[.04] dark:bg-white/[.06] border border-black/10 dark:border-white/15 rounded-lg p-3 text-sm whitespace-pre-wrap"
          >
            {log || "Logs will appear here…"}
          </pre>
        </section>
      </main>

      <footer className="row-start-3 flex gap-6 flex-wrap items-center justify-center text-sm text-black/70 dark:text-white/70">
        <a
          className="flex items-center gap-2 hover:underline hover:underline-offset-4"
          href="https://developer.spotify.com/dashboard"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image aria-hidden src="/globe.svg" alt="" width={16} height={16} />
          Spotify Dashboard
        </a>
        <a
          className="flex items-center gap-2 hover:underline hover:underline-offset-4"
          href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image aria-hidden src="/globe.svg" alt="" width={16} height={16} />
          YouTube Data API
        </a>
      </footer>
    </div>
  );
}
