export type CompactTrack = {
  id: string;
  name: string;
  duration_ms: number;
  artists: string[];
  album: { name?: string; release_date?: string };
  isrc: string | null;
};

export type Options = {
  verifyDuration: boolean;
  toleranceMs: number; // e.g. 6000
  concurrency: number; // 1..6
  preferTopic: boolean;
  excludeKeywords: string[]; // lowercase keywords to penalize
};

export type ResultRow = {
  spotify_track: string;
  artists: string;
  duration: string;
  album: string;
  isrc: string | null;
  youtube_url: string | null;
  match_debug?: {
    picked_title?: string;
    picked_channel?: string;
    picked_score?: number;
    duration_match?: boolean;
    queried?: string;
  };
  error?: string;
};

export type AICandidate = {
  id: string;
  title: string;
  channel: string;
  duration_ms: number;
  has_bad_words: boolean;
  is_topic: boolean;
  isrc_in_description: boolean;
  url: string;
};
