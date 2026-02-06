export type AttendanceReportRow = Record<string, unknown>;

export interface AttendanceQuery {
  from?: string;
  to?: string;
  search?: string;
  employeeId?: string;
  department?: string;
  limit?: number;
}

export async function fetchAttendanceReport(params?: AttendanceQuery): Promise<AttendanceReportRow[]> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  if (params?.employeeId) qs.set("employeeId", params.employeeId);
  if (params?.search) qs.set("search", params.search);
  if (params?.department) qs.set("department", params.department);
  if (params?.limit) qs.set("limit", String(params.limit));
  const base = import.meta.env.VITE_BACKEND_URL && import.meta.env.VITE_BACKEND_URL.length ? import.meta.env.VITE_BACKEND_URL : "";
  const path = "/api/attendance/report";
  const url = base ? `${base}${path}${qs.toString() ? `?${qs.toString()}` : ""}` : `${path}${qs.toString() ? `?${qs.toString()}` : ""}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Failed to fetch attendance report: ${res.status}`);
  }
  const json = (await res.json()) as { data: AttendanceReportRow[] };
  return json.data;
}
