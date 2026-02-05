export type MtiUserRow = {
  employee_id: string;
  employee_name: string;
  gender: string | null;
  division: string | null;
  department: string | null;
  section: string | null;
  supervisor_id: string | null;
  supervisor_name: string | null;
  position_title: string | null;
  grade_interval: string | null;
  phone: string | null;
  day_type: string | null;
  description: string | null;
  time_in: string | null;
  time_out: string | null;
  next_day: string | number | boolean | null;
};

export type SchedulingEmployee = {
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
};

export type MtiScheduleComboRow = {
  description: string | null;
  day_type: string | null;
  time_in: string | null;
  time_out: string | null;
  next_day: string | number | boolean | null;
  count: number;
};

export type ScheduleCombo = {
  label: string;
  dayType: string;
  timeIn: string;
  timeOut: string;
  nextDay: boolean;
  count: number;
};
