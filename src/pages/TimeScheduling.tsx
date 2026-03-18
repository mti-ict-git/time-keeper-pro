import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { fetchScheduleAsOf, fetchScheduleHistory, fetchScheduleLocks, fetchSchedulingEmployees, ScheduleAsOfResult, ScheduleHistoryItem, ScheduleLockItem, SchedulingEmployee } from '@/lib/services/schedulingApi';
import { StatsCard } from '@/components/StatsCard';
import { SchedulingDBTable } from '@/components/tables/SchedulingDBTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LayoutDashboard, FileText, CheckCircle, XCircle, Users, Building2 } from 'lucide-react';

const targetUtcOffsetMinutes = 480;

const TimeScheduling = () => {
  const [employees, setEmployees] = useState<SchedulingEmployee[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
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

      <Card className="border-0 shadow-lg shadow-primary/5">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Historical Schedule Lookup</h3>
              <p className="text-sm text-muted-foreground">Find schedule changes by employee ID across time</p>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 md:col-span-3 space-y-2">
              <Label htmlFor="public-history-employee-id">Employee ID</Label>
              <Input
                id="public-history-employee-id"
                placeholder="e.g. 101234"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
              />
            </div>
            <div className="col-span-12 md:col-span-3 space-y-2">
              <Label htmlFor="public-history-as-of">As Of Date Time</Label>
              <Input
                id="public-history-as-of"
                type="datetime-local"
                value={asOfAt}
                onChange={(e) => setAsOfAt(e.target.value)}
              />
            </div>
            <div className="col-span-12 md:col-span-2 space-y-2">
              <Label htmlFor="public-history-from">History From</Label>
              <Input
                id="public-history-from"
                type="date"
                value={historyFrom}
                onChange={(e) => setHistoryFrom(e.target.value)}
              />
            </div>
            <div className="col-span-12 md:col-span-2 space-y-2">
              <Label htmlFor="public-history-to">History To</Label>
              <Input
                id="public-history-to"
                type="date"
                value={historyTo}
                onChange={(e) => setHistoryTo(e.target.value)}
              />
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
                  Last change: {asOfData?.changedAtLocal ? formatLocalSourceToTarget(asOfData.changedAtLocal, asOfData.sourceUtcOffsetMinutes, targetUtcOffsetMinutes) : 'No historical change before selected time'}
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
                        {formatLocalSourceToTarget(
                          selectedHistoryItem.changedAtLocal,
                          selectedHistoryItem.sourceUtcOffsetMinutes,
                          targetUtcOffsetMinutes
                        )}
                      </p>
                      <p>{selectedHistoryItem.timeIn || '—'}–{selectedHistoryItem.timeOut || '—'}</p>
                      <p className="text-xs text-muted-foreground">
                        {selectedHistoryItem.nextDay ? 'Overnight' : 'Day shift'}
                      </p>
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
                        <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">No history records</TableCell>
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
                      <TableHead>Schedule</TableHead>
                      <TableHead>Locked At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {locks.map((lock) => (
                      <TableRow key={`${lock.employeeId}-${lock.shiftDate}`}>
                        <TableCell>{lock.shiftDate}</TableCell>
                        <TableCell className="font-mono text-sm">{lock.scheduledIn || '—'}–{lock.scheduledOut || '—'}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {lock.lockedAtLocal
                            ? formatLocalSourceToTarget(lock.lockedAtLocal, lock.sourceUtcOffsetMinutes, targetUtcOffsetMinutes)
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                    {locks.length === 0 && !lookupLoading && (
                      <TableRow>
                        <TableCell colSpan={3} className="h-20 text-center text-muted-foreground">No lock records</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
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

export default TimeScheduling;
