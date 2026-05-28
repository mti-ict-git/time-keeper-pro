# Frontend (Web UI)

## Overview

- Runtime: Vite + React + TypeScript.
- Routing: `react-router-dom`.
- UI primitives: shadcn-ui (Radix-based), Tailwind CSS.
- Charts: Recharts (dashboard page).
- Entry: [main.tsx](file:///c:/Scripts/Projects/time-keeper-pro/src/main.tsx) → [App.tsx](file:///c:/Scripts/Projects/time-keeper-pro/src/App.tsx)

## Application Entry and Routing

### main.tsx

- Renders the app into the DOM and wires theme support via `next-themes`.

### App.tsx

Source: [App.tsx](file:///c:/Scripts/Projects/time-keeper-pro/src/App.tsx)

- Providers:
  - `QueryClientProvider` (TanStack React Query)
  - Tooltip + toast providers (shadcn-ui)
- Routes:
  - Public pages: `/dashboard`, `/scheduling`, `/attendance`
  - Admin login: `/admin/login`
  - Protected admin pages under `/admin/*` via [ProtectedRoute](file:///c:/Scripts/Projects/time-keeper-pro/src/components/layout/ProtectedRoute.tsx)

## Layout and Navigation

Source: [MainLayout](file:///c:/Scripts/Projects/time-keeper-pro/src/components/layout/MainLayout.tsx)

- Defines shared navigation (public + admin sections).
- Renders children routes inside the main layout frame.

## State Management

### Zustand Store (client-side state + persistence)

Source: [useAppStore](file:///c:/Scripts/Projects/time-keeper-pro/src/lib/services/store.ts#L66-L380)

- Persists key slices to localStorage via `zustand/middleware` `persist`.
- Responsibilities:
  - Admin auth gating state.
  - In-browser CRUD collections (employees, schedules, controllers, assignments).
  - Attendance “rules” and locally generated attendance records for demo/seeded data flows.
  - Audit log trail for mutations and auth events.

Auth flows in the store:

- [login](file:///c:/Scripts/Projects/time-keeper-pro/src/lib/services/store.ts#L71-L88) uses `VITE_SUPERADMIN_USER` and `VITE_SUPERADMIN_PASS` (defaults: `admin` / `admin123`).
- [loginExternal](file:///c:/Scripts/Projects/time-keeper-pro/src/lib/services/store.ts#L89-L99) is used when the backend validates credentials (LDAP/local) and the UI only needs to mark the session as authenticated.

### Server-State

- React Query is configured globally, but most data fetching in this codebase is performed through explicit `fetch(...)` calls inside service modules and pages/components.

## API Client Layer

### URL Construction

Source: [buildApiUrl](file:///c:/Scripts/Projects/time-keeper-pro/src/lib/config/api.ts#L8-L14)

- Default: relative `/api/*` requests (works behind Vite proxy and when frontend and backend are on the same origin).
- Optional: absolute backend origin via `VITE_BACKEND_URL`.

### Service Modules

- Attendance:
  - [fetchAttendanceReport](file:///c:/Scripts/Projects/time-keeper-pro/src/lib/services/attendanceApi.ts#L13-L28)
  - Endpoint: `GET /api/attendance/report`
- Scheduling:
  - [fetchSchedulingEmployees](file:///c:/Scripts/Projects/time-keeper-pro/src/lib/services/schedulingApi.ts#L22-L38)
  - [fetchScheduleCombos](file:///c:/Scripts/Projects/time-keeper-pro/src/lib/services/schedulingApi.ts#L49-L58)
  - [fetchScheduleHistory](file:///c:/Scripts/Projects/time-keeper-pro/src/lib/services/schedulingApi.ts#L101-L120)
  - [fetchScheduleAsOf](file:///c:/Scripts/Projects/time-keeper-pro/src/lib/services/schedulingApi.ts#L122-L134)
  - [fetchScheduleLocks](file:///c:/Scripts/Projects/time-keeper-pro/src/lib/services/schedulingApi.ts#L136-L155)
- Users, controllers, auth, sync:
  - [src/lib/services](file:///c:/Scripts/Projects/time-keeper-pro/src/lib/services)

## Pages (Feature-Level Responsibilities)

### Public Pages

- [Dashboard](file:///c:/Scripts/Projects/time-keeper-pro/src/pages/Dashboard.tsx)
  - KPI-style view built from attendance data; uses Recharts.
- [TimeScheduling](file:///c:/Scripts/Projects/time-keeper-pro/src/pages/TimeScheduling.tsx)
  - Schedule table + filtering and historical “as-of” lookup.
- [AttendanceRecords](file:///c:/Scripts/Projects/time-keeper-pro/src/pages/AttendanceRecords.tsx)
  - Attendance table backed by DB report endpoint; includes export actions via [exportService](file:///c:/Scripts/Projects/time-keeper-pro/src/lib/services/exportService.ts).

### Admin Pages

Source folder: [pages/admin](file:///c:/Scripts/Projects/time-keeper-pro/src/pages/admin)

- [AdminLogin](file:///c:/Scripts/Projects/time-keeper-pro/src/pages/admin/AdminLogin.tsx)
  - Calls backend login endpoints and then calls `useAppStore().loginExternal`.
- [AdminSync](file:///c:/Scripts/Projects/time-keeper-pro/src/pages/admin/AdminSync.tsx)
  - Reads `/api/sync/status` and `/api/sync/logs`, can trigger `/api/sync/run`, updates `/api/sync/config`.
- [AdminUsers](file:///c:/Scripts/Projects/time-keeper-pro/src/pages/admin/AdminUsers.tsx)
  - User CRUD backed by `/api/users/*` endpoints.

Other admin pages (Employees/Schedules/Assignments/Rules/Audit) primarily operate on the local store’s persisted collections; they are structured so they could be migrated to backend-backed data if needed.

## Key Reusable Components

- DB-backed tables (TanStack Table + remote data):
  - [AttendanceDBTable](file:///c:/Scripts/Projects/time-keeper-pro/src/components/tables/AttendanceDBTable.tsx)
  - [SchedulingDBTable](file:///c:/Scripts/Projects/time-keeper-pro/src/components/tables/SchedulingDBTable.tsx)
- Layout:
  - [MainLayout](file:///c:/Scripts/Projects/time-keeper-pro/src/components/layout/MainLayout.tsx)
  - [ProtectedRoute](file:///c:/Scripts/Projects/time-keeper-pro/src/components/layout/ProtectedRoute.tsx)
- UI kit:
  - [components/ui](file:///c:/Scripts/Projects/time-keeper-pro/src/components/ui)

