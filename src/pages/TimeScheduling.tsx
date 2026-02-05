import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '@/lib/services/store';
import { StatsCard } from '@/components/StatsCard';
import { SchedulingTable } from '@/components/tables/SchedulingTable';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, FileText, Clock, CheckCircle, XCircle, Users } from 'lucide-react';

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
      <div className="page-header">
        <div>
          <h1 className="page-title">Time Scheduling</h1>
          <p className="text-muted-foreground">Manage employee schedules and time assignments</p>
        </div>
        <div className="flex gap-2">
          <Link to="/dashboard">
            <Button variant="outline">
              <LayoutDashboard className="w-4 h-4 mr-2" />
              Dashboard
            </Button>
          </Link>
          <Link to="/attendance">
            <Button>
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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {orgBreakdown.map(({ department, count }) => (
          <div
            key={department}
            className="bg-card border rounded-lg p-3 text-center"
          >
            <p className="text-2xl font-bold">{count}</p>
            <p className="text-xs text-muted-foreground truncate">{department}</p>
          </div>
        ))}
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-primary">{employees.length}</p>
          <p className="text-xs text-muted-foreground">Total Employees</p>
        </div>
      </div>

      {/* Employee Schedule Table */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Employee Schedules</h2>
        <SchedulingTable />
      </div>
    </div>
  );
};

export default TimeScheduling;
