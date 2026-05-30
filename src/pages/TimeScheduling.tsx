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
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LayoutDashboard, FileText, CheckCircle, XCircle, Users, FileSpreadsheet, Loader2, CalendarDays, RefreshCw, Play } from 'lucide-react';
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
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Time Scheduling</h1>
            <p className="text-muted-foreground">Truth by-date, snapshot, and audit views</p>
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

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'truth' | 'snapshot' | 'history')} className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="truth">By Date (Truth)</TabsTrigger>
            <TabsTrigger value="snapshot">Snapshot</TabsTrigger>
            <TabsTrigger value="history">History / As-Of</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <Badge variant={prefetchBadge.variant}>{prefetchBadge.label}</Badge>
            {prefetchStatus?.lastRun?.success === false && prefetchStatus?.lastRun?.error ? (
              <Badge variant="destructive" className="hidden md:inline-flex max-w-[420px] truncate">
                {prefetchStatus.lastRun.error}
              </Badge>
            ) : null}
          </div>
        </div>

        <TabsContent value="truth" className="space-y-4">
          <Card className="border-0 shadow-lg shadow-primary/5">
            <CardContent className="p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <CalendarDays className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">By Date (Truth)</h3>
                      <p className="text-sm text-muted-foreground">Reads from OrangeScheduleDaily (anti-latency)</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">ShiftDate currently keyed as WIB (+7). Times are stored as site-local time values.</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleTruthRefresh} disabled={truthLoading} className="rounded-xl">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                  </Button>
                  <Button onClick={handleTruthPrefetchRun} disabled={prefetchLoading} className="rounded-xl">
                    {prefetchLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                    Trigger Prefetch
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="truth-date">Shift Date</Label>
                  <Input id="truth-date" type="date" value={truthDate} onChange={(e) => setTruthDate(e.target.value)} />
                </div>
                <div className="md:col-span-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <StatsCard title="Employees" value={truthStats.totalEmployees} icon={Users} variant="default" />
                  <StatsCard title="Time In OK" value={truthStats.timeInAvailable} icon={CheckCircle} variant="success" />
                  <StatsCard title="Time In N/A" value={truthStats.timeInNA} icon={XCircle} variant="destructive" />
                  <StatsCard title="Overnight" value={truthStats.overnightCount} icon={CheckCircle} variant="default" />
                </div>
              </div>

              {truthError ? <div className="text-sm text-destructive">{truthError}</div> : null}

              {!truthLoading && truthRows.length === 0 ? (
                <div className="rounded-xl border bg-muted/30 p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">No snapshot data for this date</p>
                      <p className="text-sm text-muted-foreground">Trigger prefetch to fill OrangeScheduleDaily for the selected date range.</p>
                    </div>
                    <Button onClick={handleTruthPrefetchRun} disabled={prefetchLoading} className="rounded-xl">
                      {prefetchLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                      Trigger Prefetch
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg shadow-primary/5">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Schedules for {truthDate}</h3>
                  <p className="text-sm text-muted-foreground">Local filtering only</p>
                </div>
              </div>
              <SchedulingDBTable data={truthRows} loading={truthLoading} error={truthError} disableUrlFilters />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="snapshot" className="space-y-4">
          <Card className="border-0 shadow-lg shadow-primary/5">
            <CardContent className="p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Current Snapshot (MTIUsers)</h3>
                    <p className="text-sm text-muted-foreground">Operational snapshot; can differ from by-date truth</p>
                  </div>
                </div>
                <Button variant="outline" onClick={handleExportXLSX} disabled={exportLoading} className="rounded-xl">
                  {exportLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
                  Export XLSX
                </Button>
              </div>
              <SchedulingDBTable />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card className="border-0 shadow-lg shadow-primary/5">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">History / As-Of Lookup</h3>
                  <p className="text-sm text-muted-foreground">Audit schedule changes by employee ID</p>
                </div>
              </div>

              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 md:col-span-3 space-y-2">
                  <Label htmlFor="public-history-employee-id">Employee ID</Label>
                  <Input id="public-history-employee-id" placeholder="e.g. MTI210009" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} />
                </div>
                <div className="col-span-12 md:col-span-3 space-y-2">
                  <Label htmlFor="public-history-as-of">As Of Date Time</Label>
                  <Input id="public-history-as-of" type="datetime-local" value={asOfAt} onChange={(e) => setAsOfAt(e.target.value)} />
                </div>
                <div className="col-span-12 md:col-span-2 space-y-2">
                  <Label htmlFor="public-history-from">History From</Label>
                  <Input id="public-history-from" type="date" value={historyFrom} onChange={(e) => setHistoryFrom(e.target.value)} />
                </div>
                <div className="col-span-12 md:col-span-2 space-y-2">
                  <Label htmlFor="public-history-to">History To</Label>
                  <Input id="public-history-to" type="date" value={historyTo} onChange={(e) => setHistoryTo(e.target.value)} />
                </div>
                <div className="col-span-12 md:col-span-2 flex items-end">
                  <Button onClick={handleHistoryLookup} disabled={lookupLoading} className="w-full">
                    {lookupLoading ? 'Loading…' : 'Lookup'}
                  </Button>
                </div>
              </div>

              {lookupError && <p className="text-sm text-destructive">{lookupError}</p>}
              <p className="text-xs text-muted-foreground">Datetime display uses UTC+8 converted from source UTC+7.</p>

              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 md:col-span-4">
                  <div className="rounded-lg border p-4 space-y-2">
                    <p className="text-xs text-muted-foreground">Effective Schedule At</p>
                    <p className="font-mono text-sm">
                      {asOfData?.at ? formatAsTargetOffset(asOfData.at, asOfData.sourceUtcOffsetMinutes, targetUtcOffsetMinutes) : '—'}
                    </p>
                    <p className="text-sm">{asOfData ? `${asOfData.timeIn || '—'}–${asOfData.timeOut || '—'}` : '—'}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{asOfData?.source || 'none'}</Badge>
                      <Badge variant="outline" className={asOfData?.nextDay ? 'bg-accent/10 text-accent' : ''}>
                        {asOfData?.nextDay ? 'Overnight' : 'Day'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Last change:{' '}
                      {asOfData?.changedAtLocal
                        ? formatLocalSourceToTarget(asOfData.changedAtLocal, asOfData.sourceUtcOffsetMinutes, targetUtcOffsetMinutes)
                        : 'No historical change before selected time'}
                    </p>
                  </div>
                </div>

                <div className="col-span-12 md:col-span-8">
                  <div className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">Timeline</p>
                      <p className="text-xs text-muted-foreground">{history.length} changes</p>
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
                    <div className="text-sm">
                      {selectedHistoryItem ? (
                        <div className="space-y-1">
                          <p className="font-mono">
                            {formatLocalSourceToTarget(selectedHistoryItem.changedAtLocal, selectedHistoryItem.sourceUtcOffsetMinutes, targetUtcOffsetMinutes)}
                          </p>
                          <p>
                            {selectedHistoryItem.timeIn || '—'}–{selectedHistoryItem.timeOut || '—'}
                          </p>
                          <p className="text-xs text-muted-foreground">{selectedHistoryItem.nextDay ? 'Overnight' : 'Day shift'}</p>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">No change history in selected range</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 md:col-span-7">
                  <div className="data-table-container overflow-auto max-h-[260px]">
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
                              <Badge variant="outline" className={row.nextDay ? 'bg-accent/10 text-accent' : ''}>
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
                </div>

                <div className="col-span-12 md:col-span-5">
                  <div className="data-table-container overflow-auto max-h-[260px]">
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
                </div>
              </div>
            </CardContent>
          </Card>
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
