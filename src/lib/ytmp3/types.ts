export type ReqBody = {
  urls: string[];
  album?: string; // optional album override for the whole batch
  concurrency?: number; // 1–3 recommended
};
