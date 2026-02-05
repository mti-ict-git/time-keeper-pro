import { z } from 'zod';

// Employee
export const EmployeeSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  name: z.string().min(1, 'Name is required'),
  department: z.string().min(1, 'Department is required'),
  division: z.string(),
  section: z.string(),
  position: z.string(),
  email: z.string().email().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Employee = z.infer<typeof EmployeeSchema>;

// Schedule
export const ScheduleSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Name is required'),
  timeIn: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
  timeOut: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
  isOvernight: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Schedule = z.infer<typeof ScheduleSchema>;

// Controller/Device
export const ControllerSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Name is required'),
  location: z.string(),
  ipAddress: z.string(),
  status: z.enum(['active', 'inactive', 'maintenance']),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Controller = z.infer<typeof ControllerSchema>;

// Employee Schedule Assignment
export const EmployeeScheduleAssignmentSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  scheduleId: z.string(),
  effectiveFrom: z.date(),
  effectiveTo: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type EmployeeScheduleAssignment = z.infer<typeof EmployeeScheduleAssignmentSchema>;

// Attendance Status
export type AttendanceStatus = 'early' | 'ontime' | 'late' | 'missing';
export type RecordValidity = 'valid' | 'invalid';

// Attendance Rules
export const AttendanceRulesSchema = z.object({
  id: z.string(),
  earlyThresholdMinutes: z.number().min(0),
  onTimeThresholdMinutes: z.number().min(0),
  lateThresholdMinutes: z.number().min(0),
  validRequiresIn: z.boolean(),
  validRequiresOut: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type AttendanceRules = z.infer<typeof AttendanceRulesSchema>;

// Raw Event (from controller)
export const RawEventSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  controllerId: z.string(),
  timestamp: z.date(),
  eventType: z.enum(['in', 'out']),
});

export type RawEvent = z.infer<typeof RawEventSchema>;

// Processed Attendance Record
export interface ProcessedAttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  division: string;
  section: string;
  position: string;
  date: Date;
  scheduleId: string;
  scheduleName: string;
  scheduledIn: string;
  scheduledOut: string;
  actualIn: string | null;
  actualOut: string | null;
  controllerId: string | null;
  controllerName: string | null;
  statusIn: AttendanceStatus;
  statusOut: AttendanceStatus;
  validity: RecordValidity;
}

// Audit Log
export const AuditLogSchema = z.object({
  id: z.string(),
  userId: z.string(),
  action: z.enum(['create', 'update', 'delete', 'login', 'logout']),
  entityType: z.string(),
  entityId: z.string(),
  before: z.any().nullable(),
  after: z.any().nullable(),
  timestamp: z.date(),
  ipAddress: z.string().optional(),
});

export type AuditLog = z.infer<typeof AuditLogSchema>;

// Auth State
export interface AuthState {
  isAuthenticated: boolean;
  user: string | null;
}

// Filter types
export interface AttendanceFilters {
  search: string;
  department: string;
  division: string;
  section: string;
  dayType: string;
  statusIn: AttendanceStatus | '';
  statusOut: AttendanceStatus | '';
  dateFrom: Date | null;
  dateTo: Date | null;
}

export interface PaginationState {
  pageIndex: number;
  pageSize: number;
}

export interface SortingState {
  id: string;
  desc: boolean;
}

// Dashboard Stats
export interface DashboardStats {
  totalRecords: number;
  clockIns: number;
  validRecords: number;
  invalidRecords: number;
}

export interface ChartDataPoint {
  date: string;
  clockIn: number;
  clockOut: number;
}

export interface StatusDistribution {
  name: string;
  value: number;
  fill: string;
}

export interface ControllerStats {
  controller: string;
  valid: number;
  invalid: number;
}
