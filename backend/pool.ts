import sql from "mssql";

/**
 * Builds a lazily-connected, cached pool getter.
 *
 * Two failure modes are handled here that a bare `new ConnectionPool(...)`
 * does not:
 *
 * 1. `ConnectionPool` is an EventEmitter, and mssql re-emits connection
 *    failures as an `error` event. In Node an `error` event with no listener
 *    is fatal, so a transient DB outage would take the whole backend down
 *    rather than failing the request that touched it.
 * 2. Caching the promise returned by `connect()` also caches its rejection.
 *    Once the first connect failed, every later call inherited that same
 *    rejected promise and the process could never recover without a restart.
 */
export function createPoolGetter(
  label: string,
  buildConfig: () => sql.config
): () => Promise<sql.ConnectionPool> {
  let cached: Promise<sql.ConnectionPool> | undefined;
  let generation = 0;

  return function getPool(): Promise<sql.ConnectionPool> {
    if (cached) return cached;

    const myGeneration = ++generation;
    // Only drop the cache if it still belongs to this attempt, so a late
    // error from a superseded pool cannot discard a newer healthy one.
    const invalidate = (): void => {
      if (generation === myGeneration) cached = undefined;
    };

    const pool = new sql.ConnectionPool(buildConfig());
    pool.on("error", (err: unknown) => {
      console.error(`[db:${label}] pool error:`, err instanceof Error ? err.message : err);
    });

    cached = pool.connect().catch((err: unknown) => {
      invalidate();
      throw err;
    });
    return cached;
  };
}
