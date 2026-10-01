/** Run a batch without allowing slow items to consume the whole cron window. */
export async function runBounded<T>(
  items: T[],
  work: (item: T) => Promise<void>,
  concurrency: number,
  deadline: number,
  now: () => number = Date.now,
): Promise<{ completed: number; deferred: number; failed: number }> {
  let next = 0
  let completed = 0
  let failed = 0
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (next < items.length && now() < deadline) {
      const item = items[next++]
      try { await work(item); completed++ } catch { failed++ }
    }
  }))
  return { completed, deferred: items.length - next, failed }
}
