import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '@/lib/services/store';
import { StatsCard } from '@/components/StatsCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  AreaChart,
  Area,
} from 'recharts';
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter } from 'date-fns';
import { FileText, Calendar, BarChart3, CheckCircle, XCircle, Clock, TrendingUp } from 'lucide-react';

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
  const { attendanceRecords, controllers, employees } = useAppStore();
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
      const dateKey = format(new Date(record.date), 'MMM dd');
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

  const validPercent = stats.total > 0 ? ((stats.valid / stats.total) * 100).toFixed(1) : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-bold text-lg shadow-lg shadow-primary/25">
            {employees.length > 0 ? employees[0].name.charAt(0) : 'A'}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Welcome back! 👋</h1>
            <p className="text-muted-foreground">Check your attendance activities in this dashboard.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to="/scheduling">
            <Button variant="outline" className="rounded-xl shadow-sm">
              <Calendar className="w-4 h-4 mr-2" />
              Schedule
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
          title="Total Records"
          value={stats.total}
          icon={BarChart3}
          variant="primary"
          trend={{ value: 10.8, isPositive: true }}
        />
        <StatsCard
          title="Clock Ins"
          value={stats.clockIns}
          icon={Clock}
          variant="info"
          trend={{ value: 5.8, isPositive: true }}
        />
        <StatsCard
          title="Valid Records"
          value={stats.valid}
          icon={CheckCircle}
          variant="success"
          trend={{ value: 10.8, isPositive: true }}
        />
        <StatsCard
          title="Invalid Records"
          value={stats.invalid}
          icon={XCircle}
          variant="destructive"
          trend={{ value: 2.3, isPositive: false }}
        />
      </div>

      {/* Date Range Tabs & Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <Card className="lg:col-span-2 border-0 shadow-lg shadow-primary/5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold">Attendance Overview</CardTitle>
                <p className="text-sm text-muted-foreground">Clock in vs Clock out trends</p>
              </div>
              <Tabs value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
                <TabsList className="bg-muted/50">
                  <TabsTrigger value="day" className="text-xs">Day</TabsTrigger>
                  <TabsTrigger value="week" className="text-xs">Week</TabsTrigger>
                  <TabsTrigger value="month" className="text-xs">Month</TabsTrigger>
                  <TabsTrigger value="quarter" className="text-xs">Quarter</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={attendanceByDate}>
                  <defs>
                    <linearGradient id="colorClockIn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorClockOut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.accent} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={COLORS.accent} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12 }} 
                    tickLine={false}
                    axisLine={false}
                    className="text-muted-foreground" 
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }} 
                    tickLine={false}
                    axisLine={false}
                    className="text-muted-foreground" 
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: 'none',
                      borderRadius: '12px',
                      boxShadow: '0 10px 40px -10px rgba(0,0,0,0.2)',
                    }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="clockIn"
                    name="Clock In"
                    stroke={COLORS.primary}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorClockIn)"
                  />
                  <Area
                    type="monotone"
                    dataKey="clockOut"
                    name="Clock Out"
                    stroke={COLORS.accent}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorClockOut)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card className="border-0 shadow-lg shadow-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold">Status Chart</CardTitle>
            <p className="text-sm text-muted-foreground">Valid vs Invalid distribution</p>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {statusDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: 'none',
                      borderRadius: '12px',
                      boxShadow: '0 10px 40px -10px rgba(0,0,0,0.2)',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Center text */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">{validPercent}%</p>
                  <p className="text-xs text-muted-foreground">Valid</p>
                </div>
              </div>
            </div>
            {/* Legend */}
            <div className="flex justify-center gap-6 mt-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-success" />
                <span className="text-sm text-muted-foreground">Valid</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-destructive" />
                <span className="text-sm text-muted-foreground">Invalid</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Attendance by Controller */}
      <Card className="border-0 shadow-lg shadow-primary/5">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">Attendance by Controller</CardTitle>
              <p className="text-sm text-muted-foreground">Device-wise attendance breakdown</p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <TrendingUp className="w-4 h-4 text-success" />
              <span className="font-medium text-success">+12.5%</span>
              <span className="text-muted-foreground">vs last period</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={attendanceByController} layout="vertical" barGap={8}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={true} vertical={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis 
                  dataKey="controller" 
                  type="category" 
                  tick={{ fontSize: 12 }} 
                  width={120} 
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: 'none',
                    borderRadius: '12px',
                    boxShadow: '0 10px 40px -10px rgba(0,0,0,0.2)',
                  }}
                />
                <Legend />
                <Bar dataKey="valid" name="Valid" fill={COLORS.success} radius={[0, 6, 6, 0]} barSize={20} />
                <Bar dataKey="invalid" name="Invalid" fill={COLORS.destructive} radius={[0, 6, 6, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;