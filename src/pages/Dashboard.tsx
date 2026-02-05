import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '@/lib/services/store';
import { StatsCard } from '@/components/StatsCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter } from 'date-fns';
import { FileText, Calendar, BarChart3, CheckCircle, XCircle, Clock, Users } from 'lucide-react';

const COLORS = {
  primary: 'hsl(221, 83%, 53%)',
  accent: 'hsl(173, 58%, 39%)',
  success: 'hsl(142, 76%, 36%)',
  destructive: 'hsl(0, 84%, 60%)',
  warning: 'hsl(38, 92%, 50%)',
  muted: 'hsl(215, 16%, 47%)',
};

type DateRange = 'day' | 'week' | 'month' | 'quarter';

const Dashboard = () => {
  const { attendanceRecords, controllers } = useAppStore();
  const [dateRange, setDateRange] = useState<DateRange>('week');

  // Filter records by date range
  const filteredRecords = useMemo(() => {
    const today = new Date();
    let startDate: Date;
    let endDate: Date = today;

    switch (dateRange) {
      case 'day':
        startDate = today;
        break;
      case 'week':
        startDate = startOfWeek(today, { weekStartsOn: 1 });
        endDate = endOfWeek(today, { weekStartsOn: 1 });
        break;
      case 'month':
        startDate = startOfMonth(today);
        endDate = endOfMonth(today);
        break;
      case 'quarter':
        startDate = startOfQuarter(today);
        endDate = endOfQuarter(today);
        break;
      default:
        startDate = subDays(today, 7);
    }

    return attendanceRecords.filter((record) => {
      const recordDate = new Date(record.date);
      return recordDate >= startDate && recordDate <= endDate;
    });
  }, [attendanceRecords, dateRange]);

  // Calculate stats
  const stats = useMemo(() => {
    const total = filteredRecords.length;
    const clockIns = filteredRecords.filter((r) => r.actualIn).length;
    const valid = filteredRecords.filter((r) => r.validity === 'valid').length;
    const invalid = filteredRecords.filter((r) => r.validity === 'invalid').length;

    return { total, clockIns, valid, invalid };
  }, [filteredRecords]);

  // Attendance by Date chart data
  const attendanceByDate = useMemo(() => {
    const dateMap = new Map<string, { clockIn: number; clockOut: number }>();

    filteredRecords.forEach((record) => {
      const dateKey = format(new Date(record.date), 'MM/dd');
      const existing = dateMap.get(dateKey) || { clockIn: 0, clockOut: 0 };

      if (record.actualIn) existing.clockIn++;
      if (record.actualOut) existing.clockOut++;

      dateMap.set(dateKey, existing);
    });

    return Array.from(dateMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredRecords]);

  // Status Distribution pie data
  const statusDistribution = useMemo(() => {
    const valid = filteredRecords.filter((r) => r.validity === 'valid').length;
    const invalid = filteredRecords.filter((r) => r.validity === 'invalid').length;

    return [
      { name: 'Valid', value: valid, fill: COLORS.success },
      { name: 'Invalid', value: invalid, fill: COLORS.destructive },
    ];
  }, [filteredRecords]);

  // Attendance by Controller
  const attendanceByController = useMemo(() => {
    const controllerMap = new Map<string, { valid: number; invalid: number }>();

    controllers.forEach((c) => {
      controllerMap.set(c.name, { valid: 0, invalid: 0 });
    });

    filteredRecords.forEach((record) => {
      if (record.controllerName) {
        const existing = controllerMap.get(record.controllerName) || { valid: 0, invalid: 0 };
        if (record.validity === 'valid') existing.valid++;
        else existing.invalid++;
        controllerMap.set(record.controllerName, existing);
      }
    });

    return Array.from(controllerMap.entries()).map(([controller, data]) => ({
      controller,
      ...data,
    }));
  }, [filteredRecords, controllers]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance Dashboard</h1>
          <p className="text-muted-foreground">Overview of attendance metrics and analytics</p>
        </div>
        <div className="flex gap-2">
          <Link to="/scheduling">
            <Button variant="outline">
              <Calendar className="w-4 h-4 mr-2" />
              Schedule
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

      {/* Date Range Tabs */}
      <Tabs value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
        <TabsList>
          <TabsTrigger value="day">Day</TabsTrigger>
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="month">Month</TabsTrigger>
          <TabsTrigger value="quarter">Quarter</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Records"
          value={stats.total}
          icon={BarChart3}
          variant="default"
        />
        <StatsCard
          title="Clock Ins"
          value={stats.clockIns}
          icon={Clock}
          variant="info"
        />
        <StatsCard
          title="Valid Records"
          value={stats.valid}
          icon={CheckCircle}
          variant="success"
        />
        <StatsCard
          title="Invalid Records"
          value={stats.invalid}
          icon={XCircle}
          variant="destructive"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attendance by Date */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Attendance by Date</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={attendanceByDate}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="clockIn"
                    name="Clock In"
                    stroke={COLORS.primary}
                    strokeWidth={2}
                    dot={{ fill: COLORS.primary }}
                  />
                  <Line
                    type="monotone"
                    dataKey="clockOut"
                    name="Clock Out"
                    stroke={COLORS.accent}
                    strokeWidth={2}
                    dot={{ fill: COLORS.accent }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {statusDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Attendance by Controller */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Attendance by Controller</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={attendanceByController} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                  <YAxis dataKey="controller" type="category" tick={{ fontSize: 12 }} width={100} className="text-muted-foreground" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="valid" name="Valid" fill={COLORS.success} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="invalid" name="Invalid" fill={COLORS.destructive} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
