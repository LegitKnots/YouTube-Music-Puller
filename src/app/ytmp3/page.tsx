"use client";

import { useState } from "react";

export default function TestYtToMp3Page() {
  const [urlsText, setUrlsText] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Split by commas and/or newlines, trim, and dedupe
  function parseUrls(input: string): string[] {
    const parts = input
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return Array.from(new Set(parts));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const urls = parseUrls(urlsText);
    if (urls.length === 0) {
      setError("Please enter at least one YouTube URL.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/ytmp3", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });

      if (!res.ok) {
        // Try to parse error JSON, fallback to status text
        let msg = res.statusText;
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {}
        throw new Error(msg);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `yt-mp3-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message || "Download failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow border border-gray-200 p-6">
        <h1 className="text-2xl font-semibold mb-2">Test: YouTube → MP3 (ZIP)</h1>
        <p className="text-sm text-gray-600 mb-6">
          Paste YouTube URLs separated by commas or new lines. Submitting will call{" "}
          <code className="bg-gray-100 px-1 py-0.5 rounded">/api/ytmp3</code> and download a ZIP of MP3s.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block text-sm font-medium text-gray-700">
            YouTube URLs
          </label>
          <textarea
            className="w-full min-h-40 rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder={[
              "https://www.youtube.com/watch?v=XXXXXXXXXXX,",
              "https://youtu.be/YYYYYYYYYYY",
            ].join("\n")}
            value={urlsText}
            onChange={(e) => setUrlsText(e.target.value)}
          />

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className={`inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-white font-medium transition
                ${submitting ? "bg-gray-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700"}`}
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                  </svg>
                  Processing…
                </span>
              ) : (
                "Submit & Download ZIP"
              )}
            </button>

            <button
              type="button"
              className="text-sm text-gray-600 hover:text-gray-800 underline"
              onClick={() =>
                setUrlsText(
                  [
                    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    "https://youtu.be/o-YBDTqX_ZU",
                  ].join("\n")
                )
              }
            >
              Fill with sample URLs
            </button>
          </div>

          {/* Preview of parsed URLs */}
          <ParsedPreview input={urlsText} />
        </form>
      </div>
    </main>
  );
}

function ParsedPreview({ input }: { input: string }) {
  const urls = input
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (urls.length === 0) return null;
  return (
    <div className="mt-4">
      <div className="text-xs font-medium text-gray-700 mb-1">
        Parsed URLs ({urls.length})
      </div>
      <ul className="text-xs text-gray-600 max-h-28 overflow-auto border border-gray-200 rounded-md p-2 bg-gray-50">
        {urls.map((u, i) => (
          <li key={i} className="truncate">
            {u}
          </li>
        ))}
      </ul>
    </div>
  );
}
