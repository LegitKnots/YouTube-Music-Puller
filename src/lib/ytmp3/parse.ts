/** Remove noisy suffixes like "(Official Audio)" etc. — JS-safe regex */
export function cleanTitleSuffix(title: string): string {
  // Case-insensitive via /.../i; non-capturing group for the alternation
  let t = title.replace(
    /\s*\((?:official\s+audio|official\s+video|lyrics?|lyric\s+video|visualizer|audio)\)\s*$/i,
    ""
  );
  // Trim trailing repeated dashes if any left
  t = t.replace(/(?:\s*[-–—]\s*)+$/g, "");
  return t.trim();
}

/** From "Artist - Track (Official Audio)" => { artist, track } */
export function parseArtistTrackFromTitle(rawTitle: string): {
  artist?: string;
  track?: string;
} {
  const title = cleanTitleSuffix(rawTitle);
  const m = title.match(/^([^-]{1,100})\s*-\s*(.+)$/);
  if (m) return { artist: m[1].trim(), track: m[2].trim() };
  return { track: title };
}
