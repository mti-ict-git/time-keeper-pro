import { buildApiUrl } from "@/lib/config/api";
export type AttendanceReportRow = Record<string, unknown>;

/**
 * The backend explains why a request was rejected (e.g. "Date range too large
 * (max 31 days)"). Surfacing only the status code left the user with no way to
 * tell what to change, so prefer the server's message when there is one.
 */
async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) return body.error.trim();
  } catch {
    // Body was not JSON; fall back to the generic message below.
  }
  return `${fallback}: ${res.status}`;
}

export interface AttendanceQuery {
  from?: string;
  to?: string;
  search?: string;
  employeeId?: string;
  department?: string;
  employeeGroup?: "all" | "indonesia" | "expatriate";
  limit?: number;
}

export async function fetchAttendanceReport(params?: AttendanceQuery): Promise<AttendanceReportRow[]> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  if (params?.employeeId) qs.set("employeeId", params.employeeId);
  if (params?.search) qs.set("search", params.search);
  if (params?.department) qs.set("department", params.department);
  if (params?.employeeGroup) qs.set("employeeGroup", params.employeeGroup);
  if (params?.limit) qs.set("limit", String(params.limit));
  const url = buildApiUrl("attendance/report", qs);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Failed to fetch attendance report"));
  }
  const json = (await res.json()) as { data: AttendanceReportRow[] };
  return json.data;
}

export interface ContractorAttendanceQuery {
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
}

export async function fetchContractorAttendance(params?: ContractorAttendanceQuery): Promise<AttendanceReportRow[]> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  if (params?.search) qs.set("search", params.search);
  if (params?.limit) qs.set("limit", String(params.limit));
  const url = buildApiUrl("attendance/contractors", qs);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "Failed to fetch contractor attendance"));
  }
  const json = (await res.json()) as { data: AttendanceReportRow[] };
  return json.data;
}
