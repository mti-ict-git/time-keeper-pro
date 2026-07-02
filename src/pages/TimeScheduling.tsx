import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchScheduleAsOf,
  fetchScheduleHistory,
  fetchScheduleLocks,
  fetchSchedulingByDate,
  fetchSchedulingByDatePrefetchStatus,
  fetchSchedulingEmployees,
  runSchedulingByDatePrefetch,
  OrangePrefetchStatus,
  ScheduleAsOfResult,
  ScheduleHistoryItem,
  ScheduleLockItem,
  SchedulingEmployee,
} from '@/lib/services/schedulingApi';
import { StatsCard } from '@/components/StatsCard';
import { SchedulingDBTable } from '@/components/tables/SchedulingDBTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowRight,
  CalendarDays,
  CalendarRange,
  CheckCircle,
  Clock3,
  Database,
  FileSpreadsheet,
  FileText,
  History,
  LayoutDashboard,
  Loader2,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { exportSchedulingEmployeesToXLSX } from '@/lib/services/exportService';
import { toast } from '@/hooks/use-toast';

const targetUtcOffsetMinutes = 480;

const TimeScheduling = () => {
  const [activeTab, setActiveTab] = useState<'truth' | 'snapshot' | 'history'>('truth');
  const [employeeId, setEmployeeId] = useState('');
  const [asOfAt, setAsOfAt] = useState(() => toDatetimeLocalValue(new Date()));
  const [historyFrom, setHistoryFrom] = useState(() => toDateInputValue(new Date(Date.now() - (1000 * 60 * 60 * 24 * 30))));
  const [historyTo, setHistoryTo] = useState(() => toDateInputValue(new Date()));
  const [history, setHistory] = useState<ScheduleHistoryItem[]>([]);
  const [locks, setLocks] = useState<ScheduleLockItem[]>([]);
  const [asOfData, setAsOfData] = useState<ScheduleAsOfResult | null>(null);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [exportLoading, setExportLoading] = useState(false);

  const [truthDate, setTruthDate] = useState(() => todayIsoInTz('Asia/Jakarta'));
  const [truthRows, setTruthRows] = useState<SchedulingEmployee[]>([]);
  const [truthLoading, setTruthLoading] = useState(false);
  const [truthError, setTruthError] = useState('');
  const [prefetchStatus, setPrefetchStatus] = useState<OrangePrefetchStatus | null>(null);
  const [prefetchLoading, setPrefetchLoading] = useState(false);

  useEffect(() => {
    void refreshPrefetchStatus();
  }, []);

  useEffect(() => {
    void loadTruthData(truthDate);
  }, [truthDate]);

  async function refreshPrefetchStatus(): Promise<void> {
    try {
      const status = await fetchSchedulingByDatePrefetchStatus();
      setPrefetchStatus(status);
    } catch {
      setPrefetchStatus(null);
    }
  }

  async function loadTruthData(date: string): Promise<void> {
    setTruthLoading(true);
    setTruthError('');
    try {
      const [status, scheduleRows, snapshotEmployees] = await Promise.all([
        fetchSchedulingByDatePrefetchStatus(),
        fetchSchedulingByDate(date),
        fetchSchedulingEmployees(),
      ]);
      setPrefetchStatus(status);
      const byId = new Map<string, SchedulingEmployee>();
      snapshotEmployees.forEach((e) => byId.set(e.employeeId, e));
      const merged = scheduleRows.map((r) => {
        const base = byId.get(r.employeeId);
        return {
          employeeId: r.employeeId,
          name: base?.name ?? '',
          gender: base?.gender ?? '',
          division: base?.division ?? '',
          department: base?.department ?? '',
          section: base?.section ?? '',
          supervisorId: base?.supervisorId ?? '',
          supervisorName: base?.supervisorName ?? '',
          positionTitle: base?.positionTitle ?? '',
          gradeInterval: base?.gradeInterval ?? '',
          phone: base?.phone ?? '',
          dayType: r.dayType,
          description: r.description,
          timeIn: r.timeIn,
          timeOut: r.timeOut,
          nextDay: r.nextDay,
        };
      });
      setTruthRows(merged);
    } catch (e) {
      setTruthError(e instanceof Error ? e.message : 'Unknown error');
      setTruthRows([]);
    } finally {
      setTruthLoading(false);
    }
  }

  async function handleTruthRefresh(): Promise<void> {
    await loadTruthData(truthDate);
  }

  async function handleTruthPrefetchRun(): Promise<void> {
    setPrefetchLoading(true);
    try {
      await runSchedulingByDatePrefetch();
      await Promise.all([refreshPrefetchStatus(), loadTruthData(truthDate)]);
      toast({ title: 'Prefetch Completed', description: 'OrangeScheduleDaily updated and loaded' });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      toast({ title: 'Prefetch Failed', description: message, variant: 'destructive' });
    } finally {
      setPrefetchLoading(false);
    }
  }

  const truthStats = useMemo(() => {
    const totalEmployees = truthRows.length;
    const timeInAvailable = truthRows.filter((e) => e.timeIn && e.timeIn.length > 0).length;
    const timeOutAvailable = truthRows.filter((e) => e.timeOut && e.timeOut.length > 0).length;
    const timeInNA = totalEmployees - timeInAvailable;
    const timeOutNA = totalEmployees - timeOutAvailable;
    const overnightCount = truthRows.filter((e) => e.nextDay).length;
    return { totalEmployees, timeInAvailable, timeInNA, timeOutAvailable, timeOutNA, overnightCount };
  }, [truthRows]);

  const prefetchBadge = useMemo(() => {
    const last = prefetchStatus?.lastRun ?? null;
    if (!last) return { label: 'Prefetch: none', variant: 'outline' as const };
    if (last.success) return { label: `Prefetch OK: ${formatIsoShort(last.timestamp)}`, variant: 'outline' as const };
    return { label: `Prefetch FAIL: ${formatIsoShort(last.timestamp)}`, variant: 'destructive' as const };
  }, [prefetchStatus]);

  const selectedHistoryItem = useMemo(() => {
    if (history.length === 0) return null;
    const clampedIndex = Math.max(0, Math.min(historyIndex, history.length - 1));
    return history[clampedIndex];
  }, [history, historyIndex]);

  const handleHistoryLookup = async () => {
    const trimmedEmployeeId = employeeId.trim();
    if (!trimmedEmployeeId) {
      setLookupError('Employee ID is required');
      return;
    }
    const parsedAsOf = fromDatetimeLocal(asOfAt);
    if (!parsedAsOf) {
      setLookupError('As-of date and time is invalid');
      return;
    }
    setLookupError('');
    setLookupLoading(true);
    try {
      const [historyRows, asOfResult, lockRows] = await Promise.all([
        fetchScheduleHistory({
          employeeId: trimmedEmployeeId,
          from: historyFrom ? `${historyFrom}T00:00:00.000Z` : undefined,
          to: historyTo ? `${historyTo}T23:59:59.999Z` : undefined,
          limit: 400,
        }),
        fetchScheduleAsOf(trimmedEmployeeId, parsedAsOf.toISOString()),
        fetchScheduleLocks({
          employeeId: trimmedEmployeeId,
          fromDate: historyFrom || undefined,
          toDate: historyTo || undefined,
          limit: 180,
        }),
      ]);
      setHistory(historyRows);
      setAsOfData(asOfResult);
      setLocks(lockRows);
      setHistoryIndex(0);
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleExportXLSX = async () => {
    setExportLoading(true);
    try {
      const rows = await fetchSchedulingEmployees();
      exportSchedulingEmployeesToXLSX(rows);
      toast({
        title: 'Export Successful',
        description: 'Employee schedules exported to Excel',
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      toast({
        title: 'Export Failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <Card className="relative overflow-hidden rounded-[32px] border-0 bg-[linear-gradient(135deg,hsl(221_52%_12%)_0%,hsl(217_69%_31%)_55%,hsl(193_63%_30%)_100%)] text-white shadow-[0_30px_80px_-40px_rgba(15,23,42,0.85)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.10),transparent_34%)]" />
        <CardContent className="relative p-6 sm:p-8 lg:p-10">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl space-y-5">
              <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.22em] text-white/68">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-white">Scheduling Operations</span>
                <span>Truth, Snapshot, and Audit Workspace</span>
              </div>

              <div className="space-y-3">
                <h1 className="max-w-3xl text-3xl font-semibold tracking-[-0.045em] sm:text-4xl lg:text-5xl">
                  Corporate scheduling control for live shifts, snapshots, and audit trails.
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-white/74 sm:text-base">
                  Review published schedules, monitor prefetch health, and audit historical changes without leaving the operational workspace.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <div className="rounded-2xl border border-white/15 bg-white/8 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/62">Current Workspace</p>
                  <p className="mt-1 text-sm font-medium text-white">
                    {activeTab === 'truth' ? 'By Date Truth' : activeTab === 'snapshot' ? 'Current Snapshot' : 'History / As-Of'}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/8 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/62">Shift Date</p>
                  <p className="mt-1 text-sm font-medium text-white">{truthDate}</p>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/8 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/62">Prefetch Health</p>
                  <p className="mt-1 text-sm font-medium text-white">{prefetchBadge.label}</p>
                </div>
              </div>

              <div className="rounded-3xl border border-white/15 bg-white/8 p-4 backdrop-blur-sm">
                <div className="flex items-start gap-3">
                  {prefetchStatus?.lastRun?.success === false ? (
                    <XCircle className="mt-0.5 h-5 w-5 text-amber-300" />
                  ) : (
                    <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-300" />
                  )}
                  <div className="space-y-1 text-sm leading-6 text-white/78">
                    <p className="font-medium text-white">
                      {prefetchStatus?.lastRun?.success === false ? 'Prefetch requires review before operational use.' : 'Scheduling workspace is ready for operational review.'}
                    </p>
                    <p>
                      {prefetchStatus?.lastRun?.success === false && prefetchStatus.lastRun.error
                        ? prefetchStatus.lastRun.error
                        : 'Use the truth view for authoritative by-date schedules, snapshot view for current operational data, and history for audit lookup.'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-1">
                <Link to="/dashboard">
                  <Button className="h-11 rounded-2xl bg-white px-5 text-sm font-semibold text-slate-950 hover:bg-white/92">
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    Open Dashboard
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/attendance">
                  <Button variant="outline" className="h-11 rounded-2xl border-white/20 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10 hover:text-white">
                    <FileText className="mr-2 h-4 w-4" />
                    Review Attendance
                  </Button>
                </Link>
              </div>
            </div>

            <div className="grid w-full max-w-xl grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-[28px] border border-white/14 bg-white/10 p-5 backdrop-blur-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65">Employees in Truth View</p>
                <p className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-white">{truthStats.totalEmployees}</p>
                <p className="mt-2 text-sm leading-6 text-white/70">Published schedule rows for the selected shift date.</p>
              </div>
              <div className="rounded-[28px] border border-white/14 bg-white/10 p-5 backdrop-blur-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65">Time In Available</p>
                <p className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-white">{truthStats.timeInAvailable}</p>
                <p className="mt-2 text-sm leading-6 text-white/70">Rows with a resolved inbound schedule in the truth dataset.</p>
              </div>
              <div className="rounded-[28px] border border-white/14 bg-white/10 p-5 backdrop-blur-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65">Overnight Shifts</p>
                <p className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-white">{truthStats.overnightCount}</p>
                <p className="mt-2 text-sm leading-6 text-white/70">Shifts that continue into the following day.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'truth' | 'snapshot' | 'history')} className="space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <TabsList className="h-auto w-full flex-col gap-2 rounded-[24px] border border-border/70 bg-card/90 p-2 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.35)] sm:w-auto sm:flex-row">
            <TabsTrigger value="truth" className="min-w-[170px] rounded-2xl px-4 py-3 text-sm font-semibold">By Date Truth</TabsTrigger>
            <TabsTrigger value="snapshot" className="min-w-[170px] rounded-2xl px-4 py-3 text-sm font-semibold">Current Snapshot</TabsTrigger>
            <TabsTrigger value="history" className="min-w-[170px] rounded-2xl px-4 py-3 text-sm font-semibold">History / As-Of</TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={prefetchBadge.variant} className="rounded-full px-3 py-1.5 text-xs font-semibold">
              {prefetchBadge.label}
            </Badge>
            {prefetchStatus?.lastRun?.success === false && prefetchStatus?.lastRun?.error ? (
              <Badge variant="destructive" className="max-w-full rounded-full px-3 py-1.5 text-xs font-semibold md:max-w-[420px] truncate">
                {prefetchStatus.lastRun.error}
              </Badge>
            ) : null}
          </div>
        </div>

        <TabsContent value="truth" className="space-y-6">
          <Card className="rounded-[28px] border border-border/70 bg-card/95 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.50)]">
            <CardHeader className="space-y-4 pb-2">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    <span className="inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                    Published Truth View
                  </div>
                  <CardTitle className="text-2xl font-semibold tracking-[-0.035em] text-foreground">Authoritative schedule by shift date</CardTitle>
                  <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                    Reads from `OrangeScheduleDaily` to give the operational team a low-latency source of truth for scheduled shifts and resolved time values.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={handleTruthRefresh} disabled={truthLoading} className="h-11 rounded-2xl px-5 text-sm font-semibold">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh Truth View
                  </Button>
                  <Button onClick={handleTruthPrefetchRun} disabled={prefetchLoading} className="h-11 rounded-2xl px-5 text-sm font-semibold">
                    {prefetchLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                    Trigger Prefetch
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 pt-4">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.4fr)]">
                <div className="rounded-[24px] border border-border/70 bg-slate-950/[0.03] p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-primary/10 text-primary">
                      <CalendarRange className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Shift Date Selector</p>
                      <p className="text-sm text-muted-foreground">ShiftDate is currently keyed in WIB (+7).</p>
                    </div>
                  </div>
                  <div className="mt-5 space-y-2">
                    <Label htmlFor="truth-date" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Shift Date</Label>
                    <Input
                      id="truth-date"
                      type="date"
                      value={truthDate}
                      onChange={(e) => setTruthDate(e.target.value)}
                      className="h-11 rounded-2xl border-border/70 bg-background/80"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
                  <StatsCard title="Employees" value={truthStats.totalEmployees} description="Rows loaded from the truth dataset for the selected date." icon={Users} variant="default" />
                  <StatsCard title="Time In OK" value={truthStats.timeInAvailable} description="Schedules with a resolved inbound time." icon={CheckCircle} variant="success" />
                  <StatsCard title="Time In N/A" value={truthStats.timeInNA} description="Rows that still require a usable inbound time." icon={XCircle} variant="destructive" />
                  <StatsCard title="Overnight" value={truthStats.overnightCount} description="Shifts that cross into the following calendar day." icon={Clock3} variant="info" />
                </div>
              </div>

              {truthError ? (
                <div className="rounded-[22px] border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {truthError}
                </div>
              ) : null}

              {!truthLoading && truthRows.length === 0 ? (
                <div className="rounded-[24px] border border-border/70 bg-muted/30 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-foreground">No truth snapshot is available for this date.</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Run prefetch to populate `OrangeScheduleDaily` before the team reviews schedule coverage or exceptions.
                      </p>
                    </div>
                    <Button onClick={handleTruthPrefetchRun} disabled={prefetchLoading} className="h-11 rounded-2xl px-5 text-sm font-semibold">
                      {prefetchLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                      Trigger Prefetch
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border border-border/70 bg-card/95 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.50)]">
            <CardHeader className="pb-2">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  <span className="inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                  Truth Dataset
                </div>
                <CardTitle className="text-2xl font-semibold tracking-[-0.035em] text-foreground">Schedules for {truthDate}</CardTitle>
                <p className="text-sm leading-6 text-muted-foreground">
                  Operational filtering is available below. This table remains the primary working area for published schedules by date.
                </p>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <SchedulingDBTable data={truthRows} loading={truthLoading} error={truthError} disableUrlFilters />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="snapshot" className="space-y-6">
          <Card className="rounded-[28px] border border-border/70 bg-card/95 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.50)]">
            <CardHeader className="space-y-4 pb-2">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    <span className="inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
                    Current Snapshot
                  </div>
                  <CardTitle className="text-2xl font-semibold tracking-[-0.035em] text-foreground">Operational snapshot from MTIUsers</CardTitle>
                  <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                    Use this view for current operational reference. Snapshot data may diverge from the by-date truth when adjustments or refresh timing differ.
                  </p>
                </div>
                <Button variant="outline" onClick={handleExportXLSX} disabled={exportLoading} className="h-11 rounded-2xl px-5 text-sm font-semibold">
                  {exportLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
                  Export XLSX
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-[24px] border border-border/70 bg-slate-950/[0.03] p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-primary/10 text-primary">
                      <Database className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Live Snapshot</p>
                      <p className="text-sm text-muted-foreground">Pulled from the operational user schedule source.</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-[24px] border border-border/70 bg-slate-950/[0.03] p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-accent/10 text-accent">
                      <RefreshCw className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Operational Use</p>
                      <p className="text-sm text-muted-foreground">Best for quick checks and frontline schedule reference.</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-[24px] border border-border/70 bg-slate-950/[0.03] p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-success/10 text-success">
                      <FileSpreadsheet className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Excel Export</p>
                      <p className="text-sm text-muted-foreground">Export current snapshot rows directly for offline review.</p>
                    </div>
                  </div>
                </div>
              </div>
              <SchedulingDBTable />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <Card className="rounded-[28px] border border-border/70 bg-card/95 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.50)]">
            <CardHeader className="space-y-4 pb-2">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  <span className="inline-flex h-2.5 w-2.5 rounded-full bg-warning" />
                  Audit Lookup
                </div>
                <CardTitle className="text-2xl font-semibold tracking-[-0.035em] text-foreground">History and as-of investigation</CardTitle>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  Audit schedule changes by employee ID, inspect the effective schedule at a point in time, and review related legacy lock records in one workspace.
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 pt-4">
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 md:col-span-3 space-y-2">
                  <Label htmlFor="public-history-employee-id" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Employee ID</Label>
                  <Input id="public-history-employee-id" placeholder="e.g. MTI210009" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="h-11 rounded-2xl border-border/70 bg-background/80" />
                </div>
                <div className="col-span-12 md:col-span-3 space-y-2">
                  <Label htmlFor="public-history-as-of" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">As Of Date Time</Label>
                  <Input id="public-history-as-of" type="datetime-local" value={asOfAt} onChange={(e) => setAsOfAt(e.target.value)} className="h-11 rounded-2xl border-border/70 bg-background/80" />
                </div>
                <div className="col-span-12 md:col-span-2 space-y-2">
                  <Label htmlFor="public-history-from" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">History From</Label>
                  <Input id="public-history-from" type="date" value={historyFrom} onChange={(e) => setHistoryFrom(e.target.value)} className="h-11 rounded-2xl border-border/70 bg-background/80" />
                </div>
                <div className="col-span-12 md:col-span-2 space-y-2">
                  <Label htmlFor="public-history-to" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">History To</Label>
                  <Input id="public-history-to" type="date" value={historyTo} onChange={(e) => setHistoryTo(e.target.value)} className="h-11 rounded-2xl border-border/70 bg-background/80" />
                </div>
                <div className="col-span-12 md:col-span-2 flex items-end">
                  <Button onClick={handleHistoryLookup} disabled={lookupLoading} className="h-11 w-full rounded-2xl text-sm font-semibold">
                    {lookupLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                    {lookupLoading ? 'Loading' : 'Lookup'}
                  </Button>
                </div>
              </div>

              {lookupError ? (
                <div className="rounded-[22px] border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {lookupError}
                </div>
              ) : null}

              <p className="text-xs leading-6 text-muted-foreground">Datetime display uses UTC+8 converted from source UTC+7.</p>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.35fr)]">
                <div className="rounded-[24px] border border-border/70 bg-slate-950/[0.03] p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-primary/10 text-primary">
                      <Clock3 className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Effective Schedule</p>
                      <p className="text-sm text-muted-foreground">Point-in-time result at the selected as-of datetime.</p>
                    </div>
                  </div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Effective At</p>
                  <p className="font-mono text-sm text-foreground">
                    {asOfData?.at ? formatAsTargetOffset(asOfData.at, asOfData.sourceUtcOffsetMinutes, targetUtcOffsetMinutes) : '—'}
                  </p>
                  <p className="text-2xl font-semibold tracking-[-0.04em] text-foreground">{asOfData ? `${asOfData.timeIn || '—'}–${asOfData.timeOut || '—'}` : '—'}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="rounded-full">{asOfData?.source || 'none'}</Badge>
                    <Badge variant="outline" className={asOfData?.nextDay ? 'rounded-full bg-accent/10 text-accent' : 'rounded-full'}>
                      {asOfData?.nextDay ? 'Overnight' : 'Day'}
                    </Badge>
                  </div>
                  <p className="text-xs leading-6 text-muted-foreground">
                    Last change:{' '}
                    {asOfData?.changedAtLocal
                      ? formatLocalSourceToTarget(asOfData.changedAtLocal, asOfData.sourceUtcOffsetMinutes, targetUtcOffsetMinutes)
                      : 'No historical change before selected time'}
                  </p>
                </div>

                <div className="rounded-[24px] border border-border/70 bg-slate-950/[0.03] p-5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-warning/10 text-warning">
                        <History className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Timeline Navigator</p>
                        <p className="text-sm text-muted-foreground">Browse through change history for the selected employee and date range.</p>
                      </div>
                    </div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{history.length} changes</p>
                  </div>
                  <Input
                    type="range"
                    min={0}
                    max={Math.max(0, history.length - 1)}
                    step={1}
                    value={history.length > 0 ? historyIndex : 0}
                    disabled={history.length === 0}
                    onChange={(e) => setHistoryIndex(Number(e.target.value))}
                  />
                  <div className="rounded-2xl border border-border/70 bg-background/80 p-4 text-sm">
                    {selectedHistoryItem ? (
                      <div className="space-y-1">
                        <p className="font-mono text-foreground">
                          {formatLocalSourceToTarget(selectedHistoryItem.changedAtLocal, selectedHistoryItem.sourceUtcOffsetMinutes, targetUtcOffsetMinutes)}
                        </p>
                        <p className="font-medium text-foreground">
                          {selectedHistoryItem.timeIn || '—'}–{selectedHistoryItem.timeOut || '—'}
                        </p>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          {selectedHistoryItem.nextDay ? 'Overnight shift' : 'Day shift'}
                        </p>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">No change history in the selected range.</p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.9fr)]">
            <Card className="rounded-[28px] border border-border/70 bg-card/95 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.50)]">
              <CardHeader className="pb-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    <span className="inline-flex h-2.5 w-2.5 rounded-full bg-warning" />
                    Change Log
                  </div>
                  <CardTitle className="text-2xl font-semibold tracking-[-0.035em] text-foreground">Schedule history records</CardTitle>
                  <p className="text-sm leading-6 text-muted-foreground">Detailed schedule change events returned for the current lookup.</p>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="data-table-container overflow-auto rounded-[22px] border border-border/70 shadow-none max-h-[320px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Changed At</TableHead>
                        <TableHead>Time In</TableHead>
                        <TableHead>Time Out</TableHead>
                        <TableHead>Overnight</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((row) => (
                        <TableRow key={row.changeId}>
                          <TableCell className="font-mono text-sm">
                            {formatLocalSourceToTarget(row.changedAtLocal, row.sourceUtcOffsetMinutes, targetUtcOffsetMinutes)}
                          </TableCell>
                          <TableCell className="font-mono text-sm">{row.timeIn || '—'}</TableCell>
                          <TableCell className="font-mono text-sm">{row.timeOut || '—'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={row.nextDay ? 'rounded-full bg-accent/10 text-accent' : 'rounded-full'}>
                              {row.nextDay ? 'Yes' : 'No'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                      {history.length === 0 && !lookupLoading && (
                        <TableRow>
                          <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                            No history records
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border border-border/70 bg-card/95 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.50)]">
              <CardHeader className="pb-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    <span className="inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
                    Legacy Locks
                  </div>
                  <CardTitle className="text-2xl font-semibold tracking-[-0.035em] text-foreground">Schedule lock records</CardTitle>
                  <p className="text-sm leading-6 text-muted-foreground">Reference legacy schedule locks relevant to the current employee lookup.</p>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="data-table-container overflow-auto rounded-[22px] border border-border/70 shadow-none max-h-[320px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Shift Date</TableHead>
                        <TableHead>Schedule Lock (Legacy)</TableHead>
                        <TableHead>Locked At</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {locks.map((lock) => (
                        <TableRow key={`${lock.employeeId}-${lock.shiftDate}`}>
                          <TableCell>{lock.shiftDate}</TableCell>
                          <TableCell className="font-mono text-sm">
                            {lock.scheduledIn || '—'}–{lock.scheduledOut || '—'}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {lock.lockedAtLocal
                              ? formatLocalSourceToTarget(lock.lockedAtLocal, lock.sourceUtcOffsetMinutes, targetUtcOffsetMinutes)
                              : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                      {locks.length === 0 && !lookupLoading && (
                        <TableRow>
                          <TableCell colSpan={3} className="h-20 text-center text-muted-foreground">
                            No lock records
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

function toDateInputValue(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toDatetimeLocalValue(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function fromDatetimeLocal(value: string): Date | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatAsTargetOffset(isoValue: string, sourceOffsetMinutes: number, targetOffsetMinutes: number): string {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return isoValue;
  const sourceMs = date.getTime() + sourceOffsetMinutes * 60 * 1000;
  const local = formatUtcMsAtOffset(sourceMs, sourceOffsetMinutes);
  return formatLocalSourceToTarget(local, sourceOffsetMinutes, targetOffsetMinutes);
}

function formatLocalSourceToTarget(localValue: string, sourceOffsetMinutes: number, targetOffsetMinutes: number): string {
  const parsed = parseLocalDateTime(localValue);
  if (!parsed) return localValue;
  const utcMs = Date.UTC(parsed.year, parsed.month - 1, parsed.day, parsed.hours, parsed.minutes, parsed.seconds) - sourceOffsetMinutes * 60 * 1000;
  return formatUtcMsAtOffset(utcMs, targetOffsetMinutes);
}

function parseLocalDateTime(localValue: string): {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
} | null {
  const m = localValue.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hours: Number(m[4]),
    minutes: Number(m[5]),
    seconds: Number(m[6] || "0"),
  };
}

function formatUtcMsAtOffset(utcMs: number, offsetMinutes: number): string {
  const shifted = new Date(utcMs + offsetMinutes * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  const hours = String(shifted.getUTCHours()).padStart(2, '0');
  const minutes = String(shifted.getUTCMinutes()).padStart(2, '0');
  const seconds = String(shifted.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function todayIsoInTz(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function formatIsoShort(isoValue: string): string {
  const d = new Date(isoValue);
  if (Number.isNaN(d.getTime())) return isoValue;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export default TimeScheduling;
