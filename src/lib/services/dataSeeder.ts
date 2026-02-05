import {
  Employee,
  Schedule,
  Controller,
  EmployeeScheduleAssignment,
  AttendanceRules,
  ProcessedAttendanceRecord,
  AttendanceStatus,
  RecordValidity,
} from '../models';

// Generate unique IDs
const generateId = () => Math.random().toString(36).substring(2, 11);

// Departments and divisions data
const departments = ['Engineering', 'Operations', 'Finance', 'Human Resources', 'Marketing'];
const divisions = ['North', 'South', 'Central', 'East', 'West'];
const sections = ['Section A', 'Section B', 'Section C'];
const positions = ['Engineer', 'Manager', 'Analyst', 'Specialist', 'Coordinator', 'Director'];

// Names for employees
const firstNames = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'Robert', 'Lisa', 'William', 'Amanda', 
                   'James', 'Jennifer', 'Daniel', 'Michelle', 'Matthew', 'Jessica', 'Anthony', 'Ashley', 'Mark', 'Nicole'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
                   'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'];

// Controller locations
const controllerLocations = ['Main Entrance', 'Building A', 'Building B'];

// Generate schedules
export const generateSchedules = (): Schedule[] => {
  const now = new Date();
  return [
    {
      id: 'schedule-morning',
      name: 'Morning Shift',
      timeIn: '07:00',
      timeOut: '15:00',
      isOvernight: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'schedule-night',
      name: 'Night Shift',
      timeIn: '23:00',
      timeOut: '07:00',
      isOvernight: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'schedule-normal',
      name: 'Normal Shift',
      timeIn: '08:00',
      timeOut: '16:00',
      isOvernight: false,
      createdAt: now,
      updatedAt: now,
    },
  ];
};

// Generate controllers
export const generateControllers = (): Controller[] => {
  const now = new Date();
  return controllerLocations.map((location, index) => ({
    id: `controller-${index + 1}`,
    name: `Controller ${index + 1}`,
    location,
    ipAddress: `192.168.1.${100 + index}`,
    status: 'active' as const,
    createdAt: now,
    updatedAt: now,
  }));
};

// Generate employees
export const generateEmployees = (): Employee[] => {
  const now = new Date();
  return Array.from({ length: 20 }, (_, index) => ({
    id: `emp-${index + 1}`,
    employeeId: `EMP${String(index + 1).padStart(4, '0')}`,
    name: `${firstNames[index]} ${lastNames[index]}`,
    department: departments[index % departments.length],
    division: divisions[index % divisions.length],
    section: sections[index % sections.length],
    position: positions[index % positions.length],
    email: `${firstNames[index].toLowerCase()}.${lastNames[index].toLowerCase()}@company.com`,
    createdAt: now,
    updatedAt: now,
  }));
};

// Generate employee schedule assignments
export const generateAssignments = (employees: Employee[], schedules: Schedule[]): EmployeeScheduleAssignment[] => {
  const now = new Date();
  return employees.map((emp, index) => ({
    id: `assignment-${index + 1}`,
    employeeId: emp.id,
    scheduleId: schedules[index % schedules.length].id,
    effectiveFrom: new Date(now.getFullYear(), now.getMonth(), 1),
    effectiveTo: null,
    createdAt: now,
    updatedAt: now,
  }));
};

// Generate default attendance rules
export const generateDefaultRules = (): AttendanceRules => {
  const now = new Date();
  return {
    id: 'rules-default',
    earlyThresholdMinutes: 30,
    onTimeThresholdMinutes: 5,
    lateThresholdMinutes: 15,
    validRequiresIn: true,
    validRequiresOut: false,
    createdAt: now,
    updatedAt: now,
  };
};

// Calculate attendance status based on rules
const calculateStatus = (
  scheduledTime: string,
  actualTime: string | null,
  rules: AttendanceRules,
  isTimeIn: boolean
): AttendanceStatus => {
  if (!actualTime) return 'missing';

  const [schedHour, schedMin] = scheduledTime.split(':').map(Number);
  const [actHour, actMin] = actualTime.split(':').map(Number);
  
  const scheduledMinutes = schedHour * 60 + schedMin;
  const actualMinutes = actHour * 60 + actMin;
  
  const diff = isTimeIn 
    ? scheduledMinutes - actualMinutes  // For clock in: early if actual < scheduled
    : actualMinutes - scheduledMinutes; // For clock out: early if actual < scheduled

  if (isTimeIn) {
    // For clock in
    if (diff > rules.earlyThresholdMinutes) return 'early';
    if (diff >= -rules.onTimeThresholdMinutes) return 'ontime';
    if (diff >= -rules.lateThresholdMinutes) return 'late';
    return 'late';
  } else {
    // For clock out
    if (diff < -rules.earlyThresholdMinutes) return 'early';
    if (diff <= rules.onTimeThresholdMinutes) return 'ontime';
    return 'late';
  }
};

// Calculate validity
const calculateValidity = (
  actualIn: string | null,
  actualOut: string | null,
  rules: AttendanceRules
): RecordValidity => {
  if (rules.validRequiresIn && !actualIn) return 'invalid';
  if (rules.validRequiresOut && !actualOut) return 'invalid';
  if (!actualIn && !actualOut) return 'invalid';
  return 'valid';
};

// Generate random time around scheduled time
const generateRandomTime = (scheduledTime: string, variance: number): string | null => {
  // 20% chance of missing
  if (Math.random() < 0.2) return null;

  const [hour, minute] = scheduledTime.split(':').map(Number);
  const totalMinutes = hour * 60 + minute;
  
  // Random variance between -variance and +variance minutes
  const offset = Math.floor(Math.random() * variance * 2) - variance;
  let newTotal = totalMinutes + offset;
  
  // Clamp to valid time
  if (newTotal < 0) newTotal += 24 * 60;
  if (newTotal >= 24 * 60) newTotal -= 24 * 60;
  
  const newHour = Math.floor(newTotal / 60);
  const newMinute = newTotal % 60;
  
  return `${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`;
};

// Generate processed attendance records for the last 7 days
export const generateAttendanceRecords = (
  employees: Employee[],
  schedules: Schedule[],
  assignments: EmployeeScheduleAssignment[],
  controllers: Controller[],
  rules: AttendanceRules
): ProcessedAttendanceRecord[] => {
  const records: ProcessedAttendanceRecord[] = [];
  const today = new Date();

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const date = new Date(today);
    date.setDate(date.getDate() - dayOffset);
    date.setHours(0, 0, 0, 0);

    for (const employee of employees) {
      const assignment = assignments.find(a => a.employeeId === employee.id);
      if (!assignment) continue;

      const schedule = schedules.find(s => s.id === assignment.scheduleId);
      if (!schedule) continue;

      const controller = controllers[Math.floor(Math.random() * controllers.length)];
      
      const actualIn = generateRandomTime(schedule.timeIn, 45);
      const actualOut = generateRandomTime(schedule.timeOut, 45);

      const statusIn = calculateStatus(schedule.timeIn, actualIn, rules, true);
      const statusOut = calculateStatus(schedule.timeOut, actualOut, rules, false);
      const validity = calculateValidity(actualIn, actualOut, rules);

      records.push({
        id: `record-${employee.id}-${date.toISOString().split('T')[0]}`,
        employeeId: employee.id,
        employeeName: employee.name,
        department: employee.department,
        division: employee.division,
        section: employee.section,
        position: employee.position,
        date,
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        scheduledIn: schedule.timeIn,
        scheduledOut: schedule.timeOut,
        actualIn,
        actualOut,
        controllerId: controller.id,
        controllerName: controller.name,
        statusIn,
        statusOut,
        validity,
      });
    }
  }

  return records;
};

// Initialize all data
export const seedData = () => {
  const schedules = generateSchedules();
  const controllers = generateControllers();
  const employees = generateEmployees();
  const assignments = generateAssignments(employees, schedules);
  const rules = generateDefaultRules();
  const attendanceRecords = generateAttendanceRecords(employees, schedules, assignments, controllers, rules);

  return {
    schedules,
    controllers,
    employees,
    assignments,
    rules,
    attendanceRecords,
  };
};
