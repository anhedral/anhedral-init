export async function mapWithConcurrency(values, concurrency, mapper) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new TypeError('concurrency must be a positive integer');
  }

  const items = Array.from(values);
  const results = new Array(items.length);
  let nextIndex = 0;
  let firstError;

  async function worker() {
    while (firstError === undefined) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try {
        results[index] = await mapper(items[index], index);
      } catch (error) {
        firstError ??= error;
      }
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (firstError !== undefined) throw firstError;
  return results;
}
