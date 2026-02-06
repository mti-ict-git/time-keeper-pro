import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { MainLayout, ProtectedRoute } from "@/components/layout";

// Public Pages
import Dashboard from "./pages/Dashboard";
import TimeScheduling from "./pages/TimeScheduling";
import AttendanceRecords from "./pages/AttendanceRecords";

// Admin Pages
import {
  AdminLogin,
  AdminOverview,
  AdminEmployees,
  AdminSchedules,
  AdminControllers,
  AdminAssignments,
  AdminRules,
  AdminAuditLog,
  AdminSync,
  AdminUsers,
} from "./pages/admin";

import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <MainLayout>
          <Routes>
            {/* Redirect root to dashboard */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {/* Public Routes */}
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/scheduling" element={<TimeScheduling />} />
            <Route path="/attendance" element={<AttendanceRecords />} />

            {/* Admin Login (public) */}
            <Route path="/admin/login" element={<AdminLogin />} />

            {/* Protected Admin Routes */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminOverview />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/employees"
              element={
                <ProtectedRoute>
                  <AdminEmployees />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/schedules"
              element={
                <ProtectedRoute>
                  <AdminSchedules />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/assignments"
              element={
                <ProtectedRoute>
                  <AdminAssignments />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/controllers"
              element={
                <ProtectedRoute>
                  <AdminControllers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute>
                  <AdminUsers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/rules"
              element={
                <ProtectedRoute>
                  <AdminRules />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/sync"
              element={
                <ProtectedRoute>
                  <AdminSync />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/audit"
              element={
                <ProtectedRoute>
                  <AdminAuditLog />
                </ProtectedRoute>
              }
            />

            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </MainLayout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
