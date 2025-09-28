"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

type Mode = "liked" | "playlist";

type MeResponse =
  | { authenticated: false; error?: string }
  | { authenticated: true; id: string; username: string; imageUrl: string | null };

export default function Home() {
  const [isDarkMode, setIsDarkMode] = useState(true);

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

  // Spotify user (derived from server via httpOnly cookie)
  const [me, setMe] = useState<MeResponse>({ authenticated: false });
  const [meLoading, setMeLoading] = useState(true);

  // Theme toggle persistence
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
    try {
      localStorage.setItem("theme", isDarkMode ? "dark" : "light");
    } catch {}
  }, [isDarkMode]);

  // Auto-scroll logs
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  // Check current Spotify auth via server (reads httpOnly cookie)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setMeLoading(true);
        const res = await fetch("/api/me", { cache: "no-store" });
        const data: MeResponse = await res.json();
        if (!cancelled) setMe(data);
      } catch {
        if (!cancelled) setMe({ authenticated: false });
      } finally {
        if (!cancelled) setMeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-slate-950 dark:via-indigo-950 dark:to-purple-950">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(120,119,198,0.1),transparent_50%)] dark:bg-[radial-gradient(circle_at_30%_20%,rgba(120,119,198,0.05),transparent_50%)]"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(168,85,247,0.08),transparent_50%)] dark:bg-[radial-gradient(circle_at_70%_80%,rgba(168,85,247,0.03),transparent_50%)]"></div>

      <div className="relative container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <header className="mb-16">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-6">
              <div className="relative group">
                <div className="absolute -inset-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl opacity-20 group-hover:opacity-30 transition-opacity blur-lg"></div>
                <div className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl p-3 border border-white/20 dark:border-slate-700/50">
                  <Image
                    className="dark:invert drop-shadow-sm"
                    src="/icon.png"
                    alt="SP2YT Logo"
                    width={120}
                    height={28}
                    priority
                  />
                </div>
              </div>
              <div className="hidden sm:block w-px h-12 bg-gradient-to-b from-transparent via-slate-300 to-transparent dark:via-slate-600"></div>
              <div className="flex flex-col">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 dark:from-blue-400 dark:via-purple-400 dark:to-indigo-400 bg-clip-text text-transparent">
                  Spotify → YouTube Converter
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Transform your music library seamlessly
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Theme toggle */}
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="group relative overflow-hidden rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-700 p-4 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 border border-white/20 dark:border-slate-700/50"
                aria-label="Toggle theme"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative z-10 w-6 h-6">
                  {isDarkMode ? (
                    <svg
                      className="w-6 h-6 text-yellow-500 transition-transform duration-300 group-hover:rotate-12"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-6 h-6 text-slate-700 transition-transform duration-300 group-hover:-rotate-12"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                    </svg>
                  )}
                </div>
              </button>

              {/* Auth area */}
              {meLoading ? (
                <div className="h-[52px] min-w-[52px] rounded-2xl bg-white/70 dark:bg-slate-800/70 border border-white/20 dark:border-slate-700/50 animate-pulse" />
              ) : me.authenticated ? (
                <div
                  className="group relative overflow-hidden rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm px-3 py-2 border border-white/20 dark:border-slate-700/50 shadow-lg hover:shadow-xl"
                  title="Connected to Spotify"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative z-10 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl overflow-hidden bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                      {me.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={me.imageUrl}
                          alt="Spotify profile"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <svg
                          className="w-5 h-5 text-emerald-600 dark:text-emerald-300"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M12 12a5 5 0 100-10 5 5 0 000 10zm-7 9a7 7 0 0114 0H5z" />
                        </svg>
                      )}
                    </div>
                    <div className="flex flex-col leading-tight">
                      <span className="text-xs text-emerald-600 dark:text-emerald-300 font-medium">
                        Connected to Spotify
                      </span>
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate max-w-[180px]">
                        {me.username}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <a
                  href="/api/login"
                  className="group relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-600 hover:via-teal-600 hover:to-cyan-600 text-white font-semibold px-8 py-4 transition-all duration-300 shadow-lg hover:shadow-2xl hover:scale-105"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 opacity-0 group-hover:opacity-30 transition-opacity duration-300"></div>
                  <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
                  <span className="relative z-10 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z" />
                    </svg>
                    Login to Spotify
                  </span>
                </a>
              )}
            </div>
          </div>

          {/* Source Section */}
          <section className="group relative mb-8">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 via-purple-500 to-indigo-500 rounded-3xl opacity-20 group-hover:opacity-30 transition-opacity duration-300 blur-lg"></div>
            <div className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl border border-white/20 dark:border-slate-700/50 p-8 shadow-xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-2 h-8 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full"></div>
                <h2 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
                  Source
                </h2>
              </div>

              <div className="flex flex-col gap-6">
                <div className="flex items-center gap-8">
                  <label className="group/radio inline-flex items-center gap-3 cursor-pointer">
                    <div className="relative">
                      <input
                        type="radio"
                        className="sr-only"
                        checked={mode === "liked"}
                        onChange={() => setMode("liked")}
                      />
                      <div
                        className={`w-5 h-5 rounded-full border-2 transition-all duration-200 ${
                          mode === "liked"
                            ? "border-blue-500 bg-blue-500"
                            : "border-slate-300 dark:border-slate-600 group-hover/radio:border-blue-400"
                        }`}
                      >
                        {mode === "liked" && (
                          <div className="w-2 h-2 bg-white rounded-full absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div>
                        )}
                      </div>
                    </div>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      Liked Songs
                    </span>
                  </label>

                  <label className="group/radio inline-flex items-center gap-3 cursor-pointer">
                    <div className="relative">
                      <input
                        type="radio"
                        className="sr-only"
                        checked={mode === "playlist"}
                        onChange={() => setMode("playlist")}
                      />
                      <div
                        className={`w-5 h-5 rounded-full border-2 transition-all duration-200 ${
                          mode === "playlist"
                            ? "border-blue-500 bg-blue-500"
                            : "border-slate-300 dark:border-slate-600 group-hover/radio:border-blue-400"
                        }`}
                      >
                        {mode === "playlist" && (
                          <div className="w-2 h-2 bg-white rounded-full absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div>
                        )}
                      </div>
                    </div>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      Playlist ID
                    </span>
                  </label>
                </div>

                {mode === "playlist" && (
                  <div className="flex flex-col gap-3 animate-in slide-in-from-top-2 duration-300">
                    <label className="text-sm font-medium text-slate-600 dark:text-slate-400">
                      Spotify Playlist ID
                    </label>
                    <div className="relative">
                      <input
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white/50 dark:bg-slate-700/50 backdrop-blur-sm px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all duration-200 placeholder:text-slate-400"
                        placeholder="e.g. 37i9dQZF1DXcBWIGoYBM5M"
                        value={playlistId}
                        onChange={(e) => setPlaylistId(e.target.value)}
                      />
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/5 to-purple-500/5 pointer-events-none"></div>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Paste the ID from a Spotify playlist URL like{" "}
                      <code className="bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-md font-mono text-xs">
                        https://open.spotify.com/playlist/&lt;ID&gt;
                      </code>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Options Section */}
          <section className="group relative mb-8">
            <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 rounded-3xl opacity-20 group-hover:opacity-30 transition-opacity duration-300 blur-lg"></div>
            <div className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl border border-white/20 dark:border-slate-700/50 p-8 shadow-xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-2 h-8 bg-gradient-to-b from-emerald-500 to-teal-500 rounded-full"></div>
                <h2 className="text-xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-400 bg-clip-text text-transparent">
                  Matching Options
                </h2>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="flex flex-col gap-6">
                  <label className="group/checkbox inline-flex items-center gap-3 cursor-pointer">
                    <div className="relative">
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={verifyDuration}
                        onChange={(e) => setVerifyDuration(e.target.checked)}
                      />
                      <div
                        className={`w-5 h-5 rounded-md border-2 transition-all duration-200 ${
                          verifyDuration
                            ? "border-emerald-500 bg-emerald-500"
                            : "border-slate-300 dark:border-slate-600 group-hover/checkbox:border-emerald-400"
                        }`}
                      >
                        {verifyDuration && (
                          <svg
                            className="w-3 h-3 text-white absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      Verify duration against Spotify
                    </span>
                  </label>

                  <div className="flex items-center gap-4">
                    <label className="text-sm font-medium text-slate-600 dark:text-slate-400 w-48">
                      Duration tolerance (seconds)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={30}
                        step={1}
                        className="w-28 rounded-xl border border-slate-200 dark:border-slate-600 bg-white/50 dark:bg-slate-700/50 backdrop-blur-sm px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all duration-200 disabled:opacity-50"
                        value={toleranceSec}
                        onChange={(e) =>
                          setToleranceSec(Number(e.target.value))
                        }
                        disabled={!verifyDuration}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <label className="text-sm font-medium text-slate-600 dark:text-slate-400 w-48">
                      Concurrency
                    </label>
                    <div className="flex-1 relative">
                      <input
                        type="range"
                        min={1}
                        max={6}
                        value={concurrency}
                        onChange={(e) => setConcurrency(Number(e.target.value))}
                        className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer slider"
                        style={{
                          background: `linear-gradient(to right, rgb(16 185 129) 0%, rgb(16 185 129) ${
                            ((concurrency - 1) / 5) * 100
                          }%, rgb(203 213 225) ${
                            ((concurrency - 1) / 5) * 100
                          }%, rgb(203 213 225) 100%)`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-bold tabular-nums w-8 text-center bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded-lg">
                      {concurrency}
                    </span>
                  </div>

                  <label className="group/checkbox inline-flex items-center gap-3 cursor-pointer">
                    <div className="relative">
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={preferTopic}
                        onChange={(e) => setPreferTopic(e.target.checked)}
                      />
                      <div
                        className={`w-5 h-5 rounded-md border-2 transition-all duration-200 ${
                          preferTopic
                            ? "border-emerald-500 bg-emerald-500"
                            : "border-slate-300 dark:border-slate-600 group-hover/checkbox:border-emerald-400"
                        }`}
                      >
                        {preferTopic && (
                          <svg
                            className="w-3 h-3 text-white absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      Prefer "Artist – Topic" channels
                    </span>
                  </label>
                </div>

                <div className="flex flex-col gap-3">
                  <label className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    Exclude keywords (comma-separated)
                  </label>
                  <div className="relative">
                    <textarea
                      className="w-full min-h-32 rounded-xl border border-slate-200 dark:border-slate-600 bg-white/50 dark:bg-slate-700/50 backdrop-blur-sm px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all duration-200 placeholder:text-slate-400 resize-none"
                      value={excludeKeywords}
                      onChange={(e) => setExcludeKeywords(e.target.value)}
                    />
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-emerald-500/5 to-teal-500/5 pointer-events-none"></div>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Any result whose title includes one of these will be heavily
                    penalized (e.g. MV, live, lyrics, remix).
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Actions Section */}
          <section className="group relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 rounded-3xl opacity-20 group-hover:opacity-30 transition-opacity duration-300 blur-lg"></div>
            <div className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl border border-white/20 dark:border-slate-700/50 p-8 shadow-xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-2 h-8 bg-gradient-to-b from-orange-500 to-red-500 rounded-full"></div>
                <h2 className="text-xl font-bold bg-gradient-to-r from-orange-600 to-red-600 dark:from-orange-400 dark:to-red-400 bg-clip-text text-transparent">
                  Actions
                </h2>
              </div>

              <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-center gap-4">
                  <button
                    onClick={onRun}
                    disabled={!canRun}
                    className={`group relative overflow-hidden rounded-xl font-semibold px-8 py-4 transition-all duration-300 shadow-lg hover:shadow-xl ${
                      canRun
                        ? "bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 hover:from-orange-600 hover:via-red-600 hover:to-pink-600 text-white hover:scale-105"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                    }`}
                  >
                    {canRun && (
                      <>
                        <div className="absolute inset-0 bg-gradient-to-r from-orange-400 via-red-400 to-pink-400 opacity-0 group-hover:opacity-30 transition-opacity duration-300"></div>
                        <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
                      </>
                    )}
                    <span className="relative z-10 flex items-center gap-2">
                      {isRunning ? (
                        <>
                          <svg
                            className="w-5 h-5 animate-spin"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                          Running…
                        </>
                      ) : (
                        <>
                          <svg
                            className="w-5 h-5"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                              clipRule="evenodd"
                            />
                          </svg>
                          Run Conversion
                        </>
                      )}
                    </span>
                  </button>

                  {jsonUrl && (
                    <a
                      className="group relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-600 bg-white/50 dark:bg-slate-700/50 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-600 transition-all duration-300 flex items-center justify-center font-medium text-sm px-6 py-4 shadow-lg hover:shadow-xl hover:scale-105"
                      href={jsonUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                      <span className="relative z-10 flex items-center gap-2">
                        <svg
                          className="w-4 h-4"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                          />
                        </svg>
                        Download JSON
                      </span>
                    </a>
                  )}

                  {csvUrl && (
                    <a
                      className="group relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-600 bg-white/50 dark:bg-slate-700/50 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-600 transition-all duration-300 flex items-center justify-center font-medium text-sm px-6 py-4 shadow-lg hover:shadow-xl hover:scale-105"
                      href={csvUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                      <span className="relative z-10 flex items-center gap-2">
                        <svg
                          className="w-4 h-4"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                          />
                        </svg>
                        Download CSV
                      </span>
                    </a>
                  )}

                  {typeof count === "number" && (
                    <div className="flex items-center gap-2 bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 text-green-700 dark:text-green-300 px-4 py-2 rounded-xl border border-green-200 dark:border-green-800">
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        />
                      </svg>
                      <span className="text-sm font-medium">
                        Processed:{" "}
                        <span className="font-bold tabular-nums">{count}</span>{" "}
                        tracks
                      </span>
                    </div>
                  )}
                </div>

                <div className="relative">
                  <div className="absolute -inset-1 bg-gradient-to-r from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 rounded-xl opacity-50"></div>
                  <pre
                    ref={logRef}
                    className="relative h-64 overflow-auto bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-sm whitespace-pre-wrap font-mono shadow-inner"
                  >
                    {log || (
                      <span className="text-slate-400 dark:text-slate-500 italic">
                        Logs will appear here when you run the conversion…
                      </span>
                    )}
                  </pre>
                </div>
              </div>
            </div>
          </section>
        </header>

        {/* Footer */}
        <footer className="flex gap-8 flex-wrap items-center justify-center text-sm text-slate-600 dark:text-slate-400 mt-16">
          <a
            className="group flex items-center gap-3 hover:text-slate-900 dark:hover:text-slate-200 transition-colors duration-200"
            href="https://developer.spotify.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center group-hover:bg-green-200 dark:group-hover:bg-green-900/50 transition-colors duration-200">
              <Image aria-hidden src="/globe.svg" alt="" width={16} height={16} />
            </div>
            <span className="font-medium">Spotify Dashboard</span>
          </a>
          <a
            className="group flex items-center gap-3 hover:text-slate-900 dark:hover:text-slate-200 transition-colors duration-200"
            href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center group-hover:bg-red-200 dark:group-hover:bg-red-900/50 transition-colors duration-200">
              <Image aria-hidden src="/globe.svg" alt="" width={16} height={16} />
            </div>
            <span className="font-medium">YouTube Data API</span>
          </a>
        </footer>
      </div>
    </div>
  );
}
