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
