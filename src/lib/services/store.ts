import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  Employee,
  Schedule,
  Controller,
  EmployeeScheduleAssignment,
  AttendanceRules,
  ProcessedAttendanceRecord,
  AuditLog,
  AuthState,
} from '../models';
import { seedData, generateAttendanceRecords } from './dataSeeder';

// Generate unique ID
const generateId = () => Math.random().toString(36).substring(2, 11);

// Initialize data
const initialData = seedData();

interface AppState {
  // Auth
  auth: AuthState;
  login: (username: string, password: string) => boolean;
  loginExternal: (username: string) => void;
  logout: () => void;

  // Employees
  employees: Employee[];
  addEmployee: (employee: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateEmployee: (id: string, employee: Partial<Employee>) => void;
  deleteEmployee: (id: string) => void;

  // Schedules
  schedules: Schedule[];
  addSchedule: (schedule: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateSchedule: (id: string, schedule: Partial<Schedule>) => void;
  deleteSchedule: (id: string) => void;

  // Controllers
  controllers: Controller[];
  addController: (controller: Omit<Controller, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateController: (id: string, controller: Partial<Controller>) => void;
  deleteController: (id: string) => void;

  // Assignments
  assignments: EmployeeScheduleAssignment[];
  addAssignment: (assignment: Omit<EmployeeScheduleAssignment, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateAssignment: (id: string, assignment: Partial<EmployeeScheduleAssignment>) => void;
  deleteAssignment: (id: string) => void;

  // Rules
  rules: AttendanceRules;
  updateRules: (rules: Partial<AttendanceRules>) => void;

  // Attendance Records
  attendanceRecords: ProcessedAttendanceRecord[];
  refreshAttendanceRecords: () => void;

  // Audit Logs
  auditLogs: AuditLog[];
  addAuditLog: (log: Omit<AuditLog, 'id' | 'timestamp'>) => void;
  clearAuditLogs: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Auth
      auth: { isAuthenticated: false, user: null },
      login: (username: string, password: string) => {
        const envUser = import.meta.env.VITE_SUPERADMIN_USER || 'admin';
        const envPass = import.meta.env.VITE_SUPERADMIN_PASS || 'admin123';
        
        if (username === envUser && password === envPass) {
          set({ auth: { isAuthenticated: true, user: username } });
          get().addAuditLog({
            userId: username,
            action: 'login',
            entityType: 'auth',
            entityId: username,
            before: null,
            after: { user: username },
          });
          return true;
        }
        return false;
      },
      loginExternal: (username: string) => {
        set({ auth: { isAuthenticated: true, user: username } });
        get().addAuditLog({
          userId: username,
          action: 'login',
          entityType: 'auth',
          entityId: username,
          before: null,
          after: { user: username },
        });
      },
      logout: () => {
        const user = get().auth.user;
        get().addAuditLog({
          userId: user || 'unknown',
          action: 'logout',
          entityType: 'auth',
          entityId: user || 'unknown',
          before: { user },
          after: null,
        });
        set({ auth: { isAuthenticated: false, user: null } });
      },

      // Employees
      employees: initialData.employees,
      addEmployee: (employee) => {
        const now = new Date();
        const newEmployee = {
          ...employee,
          id: generateId(),
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          employees: [...state.employees, newEmployee],
        }));
        get().addAuditLog({
          userId: get().auth.user || 'system',
          action: 'create',
          entityType: 'employee',
          entityId: newEmployee.id,
          before: null,
          after: newEmployee,
        });
      },
      updateEmployee: (id, employee) => {
        const existing = get().employees.find((e) => e.id === id);
        set((state) => ({
          employees: state.employees.map((e) =>
            e.id === id ? { ...e, ...employee, updatedAt: new Date() } : e
          ),
        }));
        get().addAuditLog({
          userId: get().auth.user || 'system',
          action: 'update',
          entityType: 'employee',
          entityId: id,
          before: existing,
          after: { ...existing, ...employee },
        });
      },
      deleteEmployee: (id) => {
        const existing = get().employees.find((e) => e.id === id);
        set((state) => ({
          employees: state.employees.filter((e) => e.id !== id),
        }));
        get().addAuditLog({
          userId: get().auth.user || 'system',
          action: 'delete',
          entityType: 'employee',
          entityId: id,
          before: existing,
          after: null,
        });
      },

      // Schedules
      schedules: initialData.schedules,
      addSchedule: (schedule) => {
        const now = new Date();
        const newSchedule = {
          ...schedule,
          id: generateId(),
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          schedules: [...state.schedules, newSchedule],
        }));
        get().addAuditLog({
          userId: get().auth.user || 'system',
          action: 'create',
          entityType: 'schedule',
          entityId: newSchedule.id,
          before: null,
          after: newSchedule,
        });
      },
      updateSchedule: (id, schedule) => {
        const existing = get().schedules.find((s) => s.id === id);
        set((state) => ({
          schedules: state.schedules.map((s) =>
            s.id === id ? { ...s, ...schedule, updatedAt: new Date() } : s
          ),
        }));
        get().addAuditLog({
          userId: get().auth.user || 'system',
          action: 'update',
          entityType: 'schedule',
          entityId: id,
          before: existing,
          after: { ...existing, ...schedule },
        });
      },
      deleteSchedule: (id) => {
        const existing = get().schedules.find((s) => s.id === id);
        set((state) => ({
          schedules: state.schedules.filter((s) => s.id !== id),
        }));
        get().addAuditLog({
          userId: get().auth.user || 'system',
          action: 'delete',
          entityType: 'schedule',
          entityId: id,
          before: existing,
          after: null,
        });
      },

      // Controllers
      controllers: initialData.controllers,
      addController: (controller) => {
        const now = new Date();
        const newController = {
          ...controller,
          id: generateId(),
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          controllers: [...state.controllers, newController],
        }));
        get().addAuditLog({
          userId: get().auth.user || 'system',
          action: 'create',
          entityType: 'controller',
          entityId: newController.id,
          before: null,
          after: newController,
        });
      },
      updateController: (id, controller) => {
        const existing = get().controllers.find((c) => c.id === id);
        set((state) => ({
          controllers: state.controllers.map((c) =>
            c.id === id ? { ...c, ...controller, updatedAt: new Date() } : c
          ),
        }));
        get().addAuditLog({
          userId: get().auth.user || 'system',
          action: 'update',
          entityType: 'controller',
          entityId: id,
          before: existing,
          after: { ...existing, ...controller },
        });
      },
      deleteController: (id) => {
        const existing = get().controllers.find((c) => c.id === id);
        set((state) => ({
          controllers: state.controllers.filter((c) => c.id !== id),
        }));
        get().addAuditLog({
          userId: get().auth.user || 'system',
          action: 'delete',
          entityType: 'controller',
          entityId: id,
          before: existing,
          after: null,
        });
      },

      // Assignments
      assignments: initialData.assignments,
      addAssignment: (assignment) => {
        const now = new Date();
        const newAssignment = {
          ...assignment,
          id: generateId(),
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          assignments: [...state.assignments, newAssignment],
        }));
        get().addAuditLog({
          userId: get().auth.user || 'system',
          action: 'create',
          entityType: 'assignment',
          entityId: newAssignment.id,
          before: null,
          after: newAssignment,
        });
      },
      updateAssignment: (id, assignment) => {
        const existing = get().assignments.find((a) => a.id === id);
        set((state) => ({
          assignments: state.assignments.map((a) =>
            a.id === id ? { ...a, ...assignment, updatedAt: new Date() } : a
          ),
        }));
        get().addAuditLog({
          userId: get().auth.user || 'system',
          action: 'update',
          entityType: 'assignment',
          entityId: id,
          before: existing,
          after: { ...existing, ...assignment },
        });
      },
      deleteAssignment: (id) => {
        const existing = get().assignments.find((a) => a.id === id);
        set((state) => ({
          assignments: state.assignments.filter((a) => a.id !== id),
        }));
        get().addAuditLog({
          userId: get().auth.user || 'system',
          action: 'delete',
          entityType: 'assignment',
          entityId: id,
          before: existing,
          after: null,
        });
      },

      // Rules
      rules: initialData.rules,
      updateRules: (rules) => {
        const existing = get().rules;
        set((state) => ({
          rules: { ...state.rules, ...rules, updatedAt: new Date() },
        }));
        get().addAuditLog({
          userId: get().auth.user || 'system',
          action: 'update',
          entityType: 'rules',
          entityId: get().rules.id,
          before: existing,
          after: { ...existing, ...rules },
        });
      },

      // Attendance Records
      attendanceRecords: initialData.attendanceRecords,
      refreshAttendanceRecords: () => {
        // Regenerate records with current data
        const { employees, schedules, assignments, controllers, rules } = get();
        const newRecords = regenerateRecords(employees, schedules, assignments, controllers, rules);
        set({ attendanceRecords: newRecords });
      },

      // Audit Logs
      auditLogs: [],
      addAuditLog: (log) => {
        const newLog = {
          ...log,
          id: generateId(),
          timestamp: new Date(),
        };
        set((state) => ({
          auditLogs: [newLog, ...state.auditLogs].slice(0, 1000), // Keep last 1000 logs
        }));
      },
      clearAuditLogs: () => {
        set({ auditLogs: [] });
      },
    }),
    {
      name: 'attendance-app-storage',
      partialize: (state) => ({
        auth: state.auth,
        employees: state.employees,
        schedules: state.schedules,
        controllers: state.controllers,
        assignments: state.assignments,
        rules: state.rules,
        auditLogs: state.auditLogs,
      }),
    }
  )
);

// Helper to regenerate attendance records
function regenerateRecords(
  employees: Employee[],
  schedules: Schedule[],
  assignments: EmployeeScheduleAssignment[],
  controllers: Controller[],
  rules: AttendanceRules
): ProcessedAttendanceRecord[] {
  return generateAttendanceRecords(employees, schedules, assignments, controllers, rules);
}
