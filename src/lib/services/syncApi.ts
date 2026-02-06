export interface SyncStatus {
  running: boolean;
  intervalMinutes: number;
  enabled: boolean;
  nextRunAt: string | null;
  retrying: boolean;
  retryCount: number;
  lastRun: SyncLog | null;
}

export interface SyncLog {
  total: number;
  updated: number;
  inserted: number;
  unchanged: number;
  detailsUpdated: string[];
  detailsInserted: string[];
  timestamp: string;
  success: boolean;
  error?: string;
}

export async function fetchSyncStatus(): Promise<SyncStatus> {
  const base = import.meta.env.VITE_BACKEND_URL && import.meta.env.VITE_BACKEND_URL.length ? import.meta.env.VITE_BACKEND_URL : '';
  const path = '/api/sync/status';
  const url = base ? `${base}${path}` : path;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Failed to fetch sync status: ${res.status}`);
  return (await res.json()) as SyncStatus;
}

export async function runSync(): Promise<SyncLog | null> {
  const base = import.meta.env.VITE_BACKEND_URL && import.meta.env.VITE_BACKEND_URL.length ? import.meta.env.VITE_BACKEND_URL : '';
  const path = '/api/sync/run';
  const url = base ? `${base}${path}` : path;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(`Failed to run sync: ${res.status}`);
  const json = (await res.json()) as { lastRun: SyncLog | null };
  return json.lastRun ?? null;
}

export async function updateSyncConfig(intervalMinutes: number, enabled: boolean): Promise<{ intervalMinutes: number; enabled: boolean; nextRunAt: string | null }> {
  const base = import.meta.env.VITE_BACKEND_URL && import.meta.env.VITE_BACKEND_URL.length ? import.meta.env.VITE_BACKEND_URL : '';
  const path = '/api/sync/config';
  const url = base ? `${base}${path}` : path;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intervalMinutes, enabled }),
  });
  if (!res.ok) throw new Error(`Failed to update sync config: ${res.status}`);
  return (await res.json()) as { intervalMinutes: number; enabled: boolean; nextRunAt: string | null };
}

export async function fetchSyncLogs(): Promise<SyncLog[]> {
  const base = import.meta.env.VITE_BACKEND_URL && import.meta.env.VITE_BACKEND_URL.length ? import.meta.env.VITE_BACKEND_URL : '';
  const path = '/api/sync/logs';
  const url = base ? `${base}${path}` : path;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Failed to fetch sync logs: ${res.status}`);
  const json = (await res.json()) as { logs: SyncLog[] };
  return json.logs ?? [];
}
