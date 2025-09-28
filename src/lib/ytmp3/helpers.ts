/** Tiny concurrency helper */
export async function mapWithConcurrency<T, R>(
  items: T[],
  worker: (item: T, idx: number) => Promise<R>,
  concurrency = 1
): Promise<R[]> {
  concurrency = Math.max(1, Math.min(3, concurrency || 1));
  let i = 0;
  const results: R[] = new Array(items.length) as any;
  const runners = new Array(concurrency).fill(0).map(async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) break;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}
