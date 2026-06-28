import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, subDays, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfWeek, endOfWeek } from 'date-fns';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarRange,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileText,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { StatsCard } from '@/components/StatsCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchAttendanceReport, AttendanceReportRow } from '@/lib/services/attendanceApi';

const COLORS = {
  primary: 'hsl(217, 69%, 31%)',
  accent: 'hsl(193, 63%, 30%)',
  success: 'hsl(142, 76%, 36%)',
  destructive: 'hsl(0, 84%, 60%)',
  warning: 'hsl(38, 92%, 50%)',
};

type DateRange = 'day' | 'week' | 'month' | 'quarter';

const Dashboard = () => {
  const [dateRange, setDateRange] = useState<DateRange>('week');
  const [rows, setRows] = useState<AttendanceReportRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  function pick(row: AttendanceReportRow, keys: string[]): string {
    for (const k of keys) {
      const v = row[k];
      if (v !== undefined && v !== null) return String(v);
    }
    return '';
  }

  useEffect(() => {
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

    const from = format(startDate, 'yyyy-MM-dd');
    const to = format(endDate, 'yyyy-MM-dd');

    setLoading(true);
    setError('');
    fetchAttendanceReport({ from, to, limit: 2000 })
      .then((data) => setRows(data))
      .catch((e) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false));
  }, [dateRange]);

  const filteredRecords = rows;

  const stats = useMemo(() => {
    const total = filteredRecords.length;
    const clockIns = filteredRecords.filter((r) => Boolean(pick(r, ['actual_in', 'actualin']))).length;
    const clockOuts = filteredRecords.filter((r) => Boolean(pick(r, ['actual_out', 'actualout']))).length;
    const valid = filteredRecords.filter((r) => Boolean(pick(r, ['actual_in', 'actualin'])) || Boolean(pick(r, ['actual_out', 'actualout']))).length;
    const invalid = total - valid;
    return { total, clockIns, clockOuts, valid, invalid };
  }, [filteredRecords]);

  const attendanceByDate = useMemo(() => {
    const dateMap = new Map<string, { clockIn: number; clockOut: number; ts: number; label: string }>();

    filteredRecords.forEach((record) => {
      const rawDate = pick(record, ['date', 'attendance_date', 'record_date']);
      if (!rawDate) return;

      const parsedDate = new Date(`${rawDate}T00:00:00`);
      if (Number.isNaN(parsedDate.getTime())) return;

      const key = format(parsedDate, 'yyyy-MM-dd');
      const existing = dateMap.get(key) || {
        clockIn: 0,
        clockOut: 0,
        ts: parsedDate.getTime(),
        label: format(parsedDate, dateRange === 'quarter' ? 'dd MMM' : 'dd MMM'),
      };

      if (pick(record, ['actual_in', 'actualin'])) existing.clockIn += 1;
      if (pick(record, ['actual_out', 'actualout'])) existing.clockOut += 1;

      dateMap.set(key, existing);
    });

    return Array.from(dateMap.values())
      .sort((a, b) => a.ts - b.ts)
      .map(({ clockIn, clockOut, label }) => ({ date: label, clockIn, clockOut }));
  }, [filteredRecords, dateRange]);

  const statusDistribution = useMemo(() => {
    const valid = filteredRecords.filter((r) => Boolean(pick(r, ['actual_in', 'actualin'])) || Boolean(pick(r, ['actual_out', 'actualout']))).length;
    const invalid = filteredRecords.length - valid;
    return [
      { name: 'Valid', value: valid, fill: COLORS.success },
      { name: 'Invalid', value: invalid, fill: COLORS.destructive },
    ];
  }, [filteredRecords]);

  const attendanceByController = useMemo(() => {
    const controllerMap = new Map<string, { valid: number; invalid: number }>();

    filteredRecords.forEach((record) => {
      const ctrl = pick(record, ['controller_out', 'controller_in']);
      if (!ctrl) return;

      const existing = controllerMap.get(ctrl) || { valid: 0, invalid: 0 };
      const isValid = Boolean(pick(record, ['actual_in', 'actualin'])) || Boolean(pick(record, ['actual_out', 'actualout']));

      if (isValid) existing.valid += 1;
      else existing.invalid += 1;

      controllerMap.set(ctrl, existing);
    });

    return Array.from(controllerMap.entries())
      .map(([controller, data]) => ({ controller, ...data }))
      .sort((a, b) => b.valid + b.invalid - (a.valid + a.invalid));
  }, [filteredRecords]);

  const attendanceByPosition = useMemo(() => {
    function normalizePosition(v: string): string {
      const s = v.trim().toLowerCase();
      if (!s) return 'N/A';
      if (s.includes('non') && s.includes('staff')) return 'Non Staff';
      if (s === 'staff' || s.includes('staff')) return 'Staff';
      return v.trim();
    }

    const map = new Map<string, { valid: number; invalid: number }>();

    filteredRecords.forEach((record) => {
      const raw = pick(record, ['position_title', 'position', 'Title']);
      const pos = normalizePosition(raw);
      const existing = map.get(pos) || { valid: 0, invalid: 0 };
      const isValid = Boolean(pick(record, ['actual_in', 'actualin'])) || Boolean(pick(record, ['actual_out', 'actualout']));

      if (isValid) existing.valid += 1;
      else existing.invalid += 1;

      map.set(pos, existing);
    });

    return Array.from(map.entries())
      .map(([position, data]) => ({ position, ...data }))
      .sort((a, b) => b.valid + b.invalid - (a.valid + a.invalid));
  }, [filteredRecords]);

  const periodLabel = useMemo(() => {
    const labels: Record<DateRange, string> = {
      day: 'Today',
      week: 'Current Week',
      month: 'Current Month',
      quarter: 'Current Quarter',
    };
    return labels[dateRange];
  }, [dateRange]);

  const validPercent = stats.total > 0 ? ((stats.valid / stats.total) * 100).toFixed(1) : '0.0';
  const invalidPercent = stats.total > 0 ? ((stats.invalid / stats.total) * 100).toFixed(1) : '0.0';
  const topController = attendanceByController[0];
  const topPosition = attendanceByPosition[0];
  const todayLabel = format(new Date(), 'EEEE, dd MMMM yyyy');

  return (
    <div className="space-y-8 animate-fade-in">
      <Card className="relative overflow-hidden rounded-[32px] border-0 bg-[linear-gradient(135deg,hsl(221_52%_12%)_0%,hsl(217_69%_31%)_52%,hsl(193_63%_30%)_100%)] text-white shadow-[0_30px_80px_-40px_rgba(15,23,42,0.85)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.10),transparent_34%)]" />
        <CardContent className="relative p-6 sm:p-8 lg:p-10">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl space-y-5">
              <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.22em] text-white/68">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-white">Attendance Command Center</span>
                <span>{todayLabel}</span>
              </div>

              <div className="space-y-3">
                <h1 className="max-w-3xl text-3xl font-semibold tracking-[-0.045em] sm:text-4xl lg:text-5xl">
                  Daily attendance visibility for disciplined workforce operations.
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-white/74 sm:text-base">
                  Monitor clock activity, review record integrity, and detect operational exceptions before they affect payroll, supervision,
                  or daily workforce reporting.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <div className="rounded-2xl border border-white/15 bg-white/8 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/62">Reporting Period</p>
                  <p className="mt-1 text-sm font-medium text-white">{periodLabel}</p>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/8 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/62">Records in Scope</p>
                  <p className="mt-1 text-sm font-medium text-white">{stats.total.toLocaleString()} entries</p>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/8 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/62">Data Status</p>
                  <p className="mt-1 text-sm font-medium text-white">{loading ? 'Synchronizing report' : error ? 'Review required' : 'Operationally ready'}</p>
                </div>
              </div>

              <div className="rounded-3xl border border-white/15 bg-white/8 p-4 backdrop-blur-sm">
                <div className="flex items-start gap-3">
                  {error ? <CircleAlert className="mt-0.5 h-5 w-5 text-amber-300" /> : <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-300" />}
                  <div className="space-y-1 text-sm leading-6 text-white/78">
                    <p className="font-medium text-white">{error ? 'Dashboard requires attention before review.' : 'Operational snapshot is ready for review.'}</p>
                    <p>{error ? error : loading ? 'Attendance report is being refreshed from the live source.' : 'All headline metrics and charts reflect the selected reporting period.'}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-1">
                <Link to="/attendance">
                  <Button className="h-11 rounded-2xl bg-white px-5 text-sm font-semibold text-slate-950 hover:bg-white/92">
                    <FileText className="mr-2 h-4 w-4" />
                    Open Attendance Records
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/scheduling">
                  <Button variant="outline" className="h-11 rounded-2xl border-white/20 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10 hover:text-white">
                    <CalendarRange className="mr-2 h-4 w-4" />
                    Review Scheduling
                  </Button>
                </Link>
              </div>
            </div>

            <div className="grid w-full max-w-xl grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-[28px] border border-white/14 bg-white/10 p-5 backdrop-blur-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65">Compliance Rate</p>
                <p className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-white">{validPercent}%</p>
                <p className="mt-2 text-sm leading-6 text-white/70">{stats.valid.toLocaleString()} validated records across the selected period.</p>
              </div>
              <div className="rounded-[28px] border border-white/14 bg-white/10 p-5 backdrop-blur-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65">Controllers Tracked</p>
                <p className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-white">{attendanceByController.length}</p>
                <p className="mt-2 text-sm leading-6 text-white/70">{topController ? `${topController.controller} leads overall activity volume.` : 'Controller breakdown will appear once data is loaded.'}</p>
              </div>
              <div className="rounded-[28px] border border-white/14 bg-white/10 p-5 backdrop-blur-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65">Workforce Coverage</p>
                <p className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-white">{attendanceByPosition.length}</p>
                <p className="mt-2 text-sm leading-6 text-white/70">{topPosition ? `${topPosition.position} is the largest represented group.` : 'Position coverage will appear once data is loaded.'}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          title="Total Records"
          value={stats.total.toLocaleString()}
          description={`${attendanceByDate.length || 0} reporting dates captured in the selected period.`}
          icon={BarChart3}
          variant="primary"
        />
        <StatsCard
          title="Clock Ins Recorded"
          value={stats.clockIns.toLocaleString()}
          description={`${Math.max(stats.total - stats.clockIns, 0).toLocaleString()} entries do not yet contain a clock-in value.`}
          icon={Clock3}
          variant="info"
        />
        <StatsCard
          title="Valid Records"
          value={stats.valid.toLocaleString()}
          description={`${validPercent}% of the attendance file is currently compliant.`}
          icon={CheckCircle2}
          variant="success"
        />
        <StatsCard
          title="Exception Queue"
          value={stats.invalid.toLocaleString()}
          description={stats.invalid > 0 ? `${invalidPercent}% of records require review before downstream use.` : 'No exception records are currently detected.'}
          icon={XCircle}
          variant="destructive"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.95fr)]">
        <Card className="rounded-[28px] border border-border/70 bg-card/95 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.50)]">
          <CardHeader className="space-y-4 pb-1">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  <span className="inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                  Trend Overview
                </div>
                <CardTitle className="text-2xl font-semibold tracking-[-0.035em] text-foreground">Clock activity across the selected period</CardTitle>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  Compare inbound and outbound clock activity to surface drop-offs, incomplete logging, and operational anomalies over time.
                </p>
              </div>
              <Tabs value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
                <TabsList className="h-11 rounded-2xl border border-border/70 bg-muted/55 p-1">
                  <TabsTrigger value="day" className="rounded-xl px-4 text-xs font-semibold">Day</TabsTrigger>
                  <TabsTrigger value="week" className="rounded-xl px-4 text-xs font-semibold">Week</TabsTrigger>
                  <TabsTrigger value="month" className="rounded-xl px-4 text-xs font-semibold">Month</TabsTrigger>
                  <TabsTrigger value="quarter" className="rounded-xl px-4 text-xs font-semibold">Quarter</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={attendanceByDate}>
                  <defs>
                    <linearGradient id="colorClockIn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.32} />
                      <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="colorClockOut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.accent} stopOpacity={0.22} />
                      <stop offset="95%" stopColor={COLORS.accent} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(100, 116, 139, 0.16)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'rgba(71, 85, 105, 0.92)' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: 'rgba(71, 85, 105, 0.92)' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '18px',
                      boxShadow: '0 24px 50px -28px rgba(15, 23, 42, 0.38)',
                    }}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="clockIn" name="Clock In" stroke={COLORS.primary} strokeWidth={2.6} fillOpacity={1} fill="url(#colorClockIn)" />
                  <Area type="monotone" dataKey="clockOut" name="Clock Out" stroke={COLORS.accent} strokeWidth={2.4} fillOpacity={1} fill="url(#colorClockOut)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border border-border/70 bg-card/95 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.50)]">
          <CardHeader className="space-y-2 pb-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
              Integrity View
            </div>
            <CardTitle className="text-2xl font-semibold tracking-[-0.035em] text-foreground">Operational integrity snapshot</CardTitle>
            <p className="text-sm leading-6 text-muted-foreground">
              Validate record quality and understand where the current period needs operational review.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="relative h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusDistribution} cx="50%" cy="50%" innerRadius={66} outerRadius={92} paddingAngle={4} dataKey="value">
                    {statusDistribution.map((entry, index) => (
                      <Cell key={`status-cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '18px',
                      boxShadow: '0 24px 50px -28px rgba(15, 23, 42, 0.38)',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-4xl font-semibold tracking-[-0.05em] text-foreground">{validPercent}%</p>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Valid Records</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border/70 bg-muted/35 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Valid</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">{stats.valid.toLocaleString()}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/35 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Exceptions</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">{stats.invalid.toLocaleString()}</p>
              </div>
            </div>

            <div className="space-y-3 rounded-[24px] border border-border/70 bg-slate-950/[0.03] p-5">
              <div className="flex items-start gap-3">
                <Building2 className="mt-0.5 h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">Top Controller</p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {topController ? `${topController.controller} leads with ${(topController.valid + topController.invalid).toLocaleString()} tracked records.` : 'Controller activity becomes visible after the report finishes loading.'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <BriefcaseBusiness className="mt-0.5 h-4 w-4 text-accent" />
                <div>
                  <p className="text-sm font-medium text-foreground">Workforce Mix</p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {topPosition ? `${topPosition.position} remains the largest represented position group in the current view.` : 'Position segmentation will appear after attendance data is available.'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 h-4 w-4 text-warning" />
                <div>
                  <p className="text-sm font-medium text-foreground">Review Focus</p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {stats.invalid > 0 ? `${stats.invalid.toLocaleString()} exception records should be reviewed before operational close-out.` : 'No immediate exception queue is detected for this reporting period.'}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
        <Card className="rounded-[28px] border border-border/70 bg-card/95 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.50)]">
          <CardHeader className="pb-2">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-success" />
                Controller Breakdown
              </div>
              <CardTitle className="text-2xl font-semibold tracking-[-0.035em] text-foreground">Attendance by controller</CardTitle>
              <p className="text-sm leading-6 text-muted-foreground">
                Understand which devices handle the largest attendance volume and where invalid records are concentrated.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={attendanceByController.slice(0, 8)} layout="vertical" barGap={10}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(100, 116, 139, 0.16)" horizontal vertical={false} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: 'rgba(71, 85, 105, 0.92)' }} tickLine={false} axisLine={false} />
                  <YAxis
                    dataKey="controller"
                    type="category"
                    tick={{ fontSize: 12, fill: 'rgba(15, 23, 42, 0.88)' }}
                    width={128}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '18px',
                      boxShadow: '0 24px 50px -28px rgba(15, 23, 42, 0.38)',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="valid" name="Valid" fill={COLORS.success} radius={[0, 8, 8, 0]} barSize={18} />
                  <Bar dataKey="invalid" name="Invalid" fill={COLORS.destructive} radius={[0, 8, 8, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border border-border/70 bg-card/95 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.50)]">
          <CardHeader className="pb-2">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                Workforce Segmentation
              </div>
              <CardTitle className="text-2xl font-semibold tracking-[-0.035em] text-foreground">Attendance by position</CardTitle>
              <p className="text-sm leading-6 text-muted-foreground">
                Compare validated and exception records across the workforce structure to identify vulnerable segments quickly.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={attendanceByPosition.slice(0, 8)} layout="vertical" barGap={10}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(100, 116, 139, 0.16)" horizontal vertical={false} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: 'rgba(71, 85, 105, 0.92)' }} tickLine={false} axisLine={false} />
                  <YAxis
                    dataKey="position"
                    type="category"
                    tick={{ fontSize: 12, fill: 'rgba(15, 23, 42, 0.88)' }}
                    width={128}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '18px',
                      boxShadow: '0 24px 50px -28px rgba(15, 23, 42, 0.38)',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="valid" name="Valid" fill={COLORS.primary} radius={[0, 8, 8, 0]} barSize={18} />
                  <Bar dataKey="invalid" name="Invalid" fill={COLORS.warning} radius={[0, 8, 8, 0]} barSize={18} />
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
