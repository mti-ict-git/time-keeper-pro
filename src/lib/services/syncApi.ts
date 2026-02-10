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
	  runId?: string;
	}

export interface SyncLogPage {
	  logs: SyncLog[];
	  page: number;
	  pageSize: number;
	  total: number;
	  totalPages: number;
	}

import { buildApiUrl } from "@/lib/config/api";

export async function fetchSyncStatus(): Promise<SyncStatus> {
  const res = await fetch(buildApiUrl('sync/status'), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Failed to fetch sync status: ${res.status}`);
  return (await res.json()) as SyncStatus;
}

export async function runSync(): Promise<SyncLog | null> {
  const res = await fetch(buildApiUrl('sync/run'), { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(`Failed to run sync: ${res.status}`);
  const json = (await res.json()) as { lastRun: SyncLog | null };
  return json.lastRun ?? null;
}

export async function updateSyncConfig(intervalMinutes: number, enabled: boolean): Promise<{ intervalMinutes: number; enabled: boolean; nextRunAt: string | null }> {
  const res = await fetch(buildApiUrl('sync/config'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intervalMinutes, enabled }),
  });
  if (!res.ok) throw new Error(`Failed to update sync config: ${res.status}`);
  return (await res.json()) as { intervalMinutes: number; enabled: boolean; nextRunAt: string | null };
}

export async function fetchSyncLogs(params?: { page?: number; pageSize?: number; withChangesOnly?: boolean }): Promise<SyncLogPage> {
	  const queryParts: string[] = [];
	  if (params?.page && Number.isFinite(params.page) && params.page > 0) {
	    queryParts.push(`page=${params.page}`);
	  }
	  if (params?.pageSize && Number.isFinite(params.pageSize) && params.pageSize > 0) {
	    queryParts.push(`pageSize=${params.pageSize}`);
	  }
	  if (params?.withChangesOnly) {
	    queryParts.push('withChanges=true');
	  }
	  const qs = queryParts.length ? `?${queryParts.join('&')}` : '';
	  const res = await fetch(buildApiUrl(`sync/logs${qs}`), { headers: { Accept: 'application/json' } });
	  if (!res.ok) throw new Error(`Failed to fetch sync logs: ${res.status}`);
	  const json = (await res.json()) as SyncLogPage;
	  return {
	    logs: json.logs ?? [],
	    page: json.page ?? 1,
	    pageSize: json.pageSize ?? (params?.pageSize ?? 20),
	    total: json.total ?? (json.logs?.length ?? 0),
	    totalPages: json.totalPages ?? 1,
	  };
	}

export {};
