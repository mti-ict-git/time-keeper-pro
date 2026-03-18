export interface SchedulingEmployee {
  employeeId: string;
  name: string;
  gender: string;
  division: string;
  department: string;
  section: string;
  supervisorId: string;
  supervisorName: string;
  positionTitle: string;
  gradeInterval: string;
  phone: string;
  dayType: string;
  description: string;
  timeIn: string;
  timeOut: string;
  nextDay: boolean;
}

import { buildApiUrl } from "@/lib/config/api";

export async function fetchSchedulingEmployees(params?: { description?: string; dayType?: string; timeIn?: string; timeOut?: string; nextDay?: boolean }): Promise<SchedulingEmployee[]> {
  const qs = new URLSearchParams();
  if (params?.description) qs.set("description", params.description);
  if (params?.dayType) qs.set("dayType", params.dayType);
  if (params?.timeIn) qs.set("timeIn", params.timeIn);
  if (params?.timeOut) qs.set("timeOut", params.timeOut);
  if (typeof params?.nextDay === "boolean") qs.set("nextDay", String(params.nextDay));
  const url = buildApiUrl("scheduling/employees", qs);
  const res = await fetch(url, {
    headers: { "Accept": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch scheduling employees: ${res.status}`);
  }
  const json = (await res.json()) as { data: SchedulingEmployee[] };
  return json.data;
}

export interface ScheduleCombo {
  label: string;
  dayType: string;
  timeIn: string;
  timeOut: string;
  nextDay: boolean;
  count: number;
}

export async function fetchScheduleCombos(): Promise<ScheduleCombo[]> {
  const res = await fetch(buildApiUrl("scheduling/combos"), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch schedule combos: ${res.status}`);
  }
  const json = (await res.json()) as { data: ScheduleCombo[] };
  return json.data;
}

export interface ScheduleHistoryItem {
  changeId: number;
  employeeId: string;
  changedAt: string;
  timeIn: string;
  timeOut: string;
  nextDay: boolean;
  sourceHash: string;
}

export interface ScheduleAsOfResult {
  employeeId: string;
  at: string;
  source: "history" | "current" | "none";
  changedAt: string | null;
  timeIn: string;
  timeOut: string;
  nextDay: boolean;
  description?: string;
  dayType?: string;
  sourceHash: string;
  nextChangeAt: string | null;
}

export interface ScheduleLockItem {
  employeeId: string;
  shiftDate: string;
  scheduledIn: string;
  scheduledOut: string;
  nextDay: boolean;
  lockedAt: string;
  sourceHash: string;
}

export async function fetchScheduleHistory(params: {
  employeeId: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<ScheduleHistoryItem[]> {
  const qs = new URLSearchParams();
  qs.set("employeeId", params.employeeId);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.limit) qs.set("limit", String(params.limit));
  const res = await fetch(buildApiUrl("scheduling/history", qs), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch schedule history: ${res.status}`);
  }
  const json = (await res.json()) as { data: ScheduleHistoryItem[] };
  return json.data;
}

export async function fetchScheduleAsOf(employeeId: string, at: string): Promise<ScheduleAsOfResult> {
  const qs = new URLSearchParams();
  qs.set("employeeId", employeeId);
  qs.set("at", at);
  const res = await fetch(buildApiUrl("scheduling/as-of", qs), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch schedule as-of data: ${res.status}`);
  }
  const json = (await res.json()) as { data: ScheduleAsOfResult };
  return json.data;
}

export async function fetchScheduleLocks(params: {
  employeeId: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): Promise<ScheduleLockItem[]> {
  const qs = new URLSearchParams();
  qs.set("employeeId", params.employeeId);
  if (params.fromDate) qs.set("fromDate", params.fromDate);
  if (params.toDate) qs.set("toDate", params.toDate);
  if (params.limit) qs.set("limit", String(params.limit));
  const res = await fetch(buildApiUrl("scheduling/locks", qs), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch schedule locks: ${res.status}`);
  }
  const json = (await res.json()) as { data: ScheduleLockItem[] };
  return json.data;
}
