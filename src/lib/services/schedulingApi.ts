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

export async function fetchSchedulingEmployees(): Promise<SchedulingEmployee[]> {
  const res = await fetch("/api/scheduling/employees", {
    headers: { "Accept": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch scheduling employees: ${res.status}`);
  }
  const json = (await res.json()) as { data: SchedulingEmployee[] };
  return json.data;
}

