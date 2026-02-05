import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '@/lib/services/store';
import { StatsCard } from '@/components/StatsCard';
import { SchedulingTable } from '@/components/tables/SchedulingTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LayoutDashboard, FileText, CheckCircle, XCircle, Users, Building2 } from 'lucide-react';

const TimeScheduling = () => {
  const { employees, assignments, schedules } = useAppStore();

  // Calculate stats
  const stats = useMemo(() => {
    const totalEmployees = employees.length;
    const assignedEmployees = assignments.filter((a) => {
      const hasSchedule = schedules.some((s) => s.id === a.scheduleId);
      return hasSchedule;
    }).length;

    const timeInAvailable = assignedEmployees;
    const timeInNA = totalEmployees - assignedEmployees;
    const timeOutAvailable = assignedEmployees;
    const timeOutNA = totalEmployees - assignedEmployees;

    return { timeInAvailable, timeInNA, timeOutAvailable, timeOutNA };
  }, [employees, assignments, schedules]);

  // Organization breakdown
  const orgBreakdown = useMemo(() => {
    const deptMap = new Map<string, number>();
    employees.forEach((emp) => {
      const count = deptMap.get(emp.department) || 0;
      deptMap.set(emp.department, count + 1);
    });
    return Array.from(deptMap.entries()).map(([dept, count]) => ({ department: dept, count }));
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
          <SchedulingTable />
        </CardContent>
      </Card>
    </div>
  );
};

export default TimeScheduling;