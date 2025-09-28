import { google, youtube_v3 } from "googleapis";

export function makeYouTube(): youtube_v3.Youtube {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("Missing YOUTUBE_API_KEY");
  return google.youtube({ version: "v3", auth: key });
}
