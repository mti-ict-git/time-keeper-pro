import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { fetchSchedulingEmployees, SchedulingEmployee } from '@/lib/services/schedulingApi';
import { StatsCard } from '@/components/StatsCard';
import { SchedulingDBTable } from '@/components/tables/SchedulingDBTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LayoutDashboard, FileText, CheckCircle, XCircle, Users, Building2 } from 'lucide-react';

const TimeScheduling = () => {
  const [employees, setEmployees] = useState<SchedulingEmployee[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const location = useLocation();
  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams(location.search);
    const description = qs.get("description") || undefined;
    const timeIn = qs.get("timeIn") || undefined;
    const timeOut = qs.get("timeOut") || undefined;
    const nextDayParam = qs.get("nextDay");
    const nextDay = nextDayParam === null ? undefined : nextDayParam === "true" || nextDayParam === "1";
    fetchSchedulingEmployees({ description, timeIn, timeOut, nextDay })
      .then((rows) => setEmployees(rows))
      .catch((e) => setError(e instanceof Error ? e.message : "Unknown error"))
      .finally(() => setLoading(false));
  }, [location.search]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalEmployees = employees.length;
    const timeInAvailable = employees.filter((e) => e.timeIn && e.timeIn.length > 0).length;
    const timeOutAvailable = employees.filter((e) => e.timeOut && e.timeOut.length > 0).length;
    const timeInNA = totalEmployees - timeInAvailable;
    const timeOutNA = totalEmployees - timeOutAvailable;
    return { timeInAvailable, timeInNA, timeOutAvailable, timeOutNA };
  }, [employees]);

  // Organization breakdown
  const orgBreakdown = useMemo(() => {
    const deptMap = new Map<string, number>();
    employees.forEach((emp) => {
      const key = emp.department || "";
      const count = deptMap.get(key) || 0;
      deptMap.set(key, count + 1);
    });
    return Array.from(deptMap.entries())
      .filter(([dept]) => dept && dept.length > 0)
      .map(([dept, count]) => ({ department: dept, count }));
  }, [employees]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Time Scheduling</h1>
            <p className="text-muted-foreground">Manage employee schedules and time assignments</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to="/dashboard">
            <Button variant="outline" className="rounded-xl shadow-sm">
              <LayoutDashboard className="w-4 h-4 mr-2" />
              Dashboard
            </Button>
          </Link>
          <Link to="/attendance">
            <Button className="rounded-xl shadow-lg shadow-primary/25">
              <FileText className="w-4 h-4 mr-2" />
              View Attendance
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      {loading && (
        <div className="p-4 text-muted-foreground">Loading scheduling overview…</div>
      )}
      {error && (
        <div className="p-4 text-destructive">Error: {error}</div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Time In Available"
          value={stats.timeInAvailable}
          icon={CheckCircle}
          variant="success"
        />
        <StatsCard
          title="Time In N/A"
          value={stats.timeInNA}
          icon={XCircle}
          variant="destructive"
        />
        <StatsCard
          title="Time Out Available"
          value={stats.timeOutAvailable}
          icon={CheckCircle}
          variant="success"
        />
        <StatsCard
          title="Time Out N/A"
          value={stats.timeOutNA}
          icon={XCircle}
          variant="destructive"
        />
      </div>

      {/* Organization Breakdown */}
      <Card className="border-0 shadow-lg shadow-primary/5">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Organization Breakdown</h3>
              <p className="text-sm text-muted-foreground">Employees by department</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {orgBreakdown.map(({ department, count }) => (
              <div
                key={department}
                className="bg-muted/50 rounded-xl p-4 text-center hover:bg-muted transition-colors"
              >
                <p className="text-2xl font-bold text-foreground">{count}</p>
                <p className="text-xs text-muted-foreground truncate mt-1">{department}</p>
              </div>
            ))}
            <div className="bg-primary/10 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-primary">{employees.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Total Employees</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Employee Schedule Table */}
      <Card className="border-0 shadow-lg shadow-primary/5">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Employee Schedules</h3>
              <p className="text-sm text-muted-foreground">View and manage all employee time schedules</p>
            </div>
          </div>
          <SchedulingDBTable />
        </CardContent>
      </Card>
    </div>
  );
};

export default TimeScheduling;
