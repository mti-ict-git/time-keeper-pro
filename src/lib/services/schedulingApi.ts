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

export async function fetchSchedulingEmployees(params?: { dayType?: string }): Promise<SchedulingEmployee[]> {
  const qs = new URLSearchParams();
  if (params?.dayType) qs.set("dayType", params.dayType);
  const url = qs.toString() ? `/api/scheduling/employees?${qs.toString()}` : "/api/scheduling/employees";
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
  const res = await fetch("/api/scheduling/combos", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch schedule combos: ${res.status}`);
  }
  const json = (await res.json()) as { data: ScheduleCombo[] };
  return json.data;
}
