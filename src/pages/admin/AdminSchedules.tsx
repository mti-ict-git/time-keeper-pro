import { useEffect, useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ScheduleAsOfResult, ScheduleCombo, ScheduleHistoryItem, ScheduleLockItem, SchedulingEmployee } from '@/lib/services/schedulingApi';
import { fetchScheduleAsOf, fetchScheduleCombos, fetchScheduleHistory, fetchScheduleLocks, fetchSchedulingEmployees } from '@/lib/services/schedulingApi';

const AdminSchedules = () => {
  const [combos, setCombos] = useState<ScheduleCombo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCombo, setSelectedCombo] = useState<ScheduleCombo | null>(null);
  const [users, setUsers] = useState<SchedulingEmployee[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [asOfAt, setAsOfAt] = useState(() => toDatetimeLocalValue(new Date()));
  const [historyFrom, setHistoryFrom] = useState(() => toDateInputValue(new Date(Date.now() - (1000 * 60 * 60 * 24 * 30))));
  const [historyTo, setHistoryTo] = useState(() => toDateInputValue(new Date()));
  const [history, setHistory] = useState<ScheduleHistoryItem[]>([]);
  const [locks, setLocks] = useState<ScheduleLockItem[]>([]);
  const [asOfData, setAsOfData] = useState<ScheduleAsOfResult | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [historyIndex, setHistoryIndex] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetchScheduleCombos()
      .then((rows) => setCombos(rows))
      .catch((e) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false));
  }, []);

  const openEmployeesModal = (combo: ScheduleCombo) => {
    setSelectedCombo(combo);
    setIsDialogOpen(true);
    setUsersLoading(true);
    setUsersError('');
    fetchSchedulingEmployees({ description: combo.label || '', dayType: combo.dayType || '', timeIn: combo.timeIn || '', timeOut: combo.timeOut || '', nextDay: combo.nextDay })
      .then((rows) => setUsers(rows))
      .catch((e) => setUsersError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setUsersLoading(false));
  };

  const exportUsersCsv = () => {
    const combo = selectedCombo;
    const namePart = (combo?.label || 'schedule').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '');
    const fileName = `employees_${namePart}_${combo?.timeIn || 'NA'}-${combo?.timeOut || 'NA'}_${combo?.nextDay ? 'overnight' : 'day'}.csv`;
    const headers = [
      'employeeId','name','gender','division','department','section','supervisorId','supervisorName','positionTitle','gradeInterval','phone','description','timeIn','timeOut','nextDay'
    ];
    const lines = users.map((u) => [
      u.employeeId,
      u.name,
      u.gender,
      u.division,
      u.department,
      u.section,
      u.supervisorId,
      u.supervisorName,
      u.positionTitle,
      u.gradeInterval,
      u.phone,
      u.description,
      u.timeIn,
      u.timeOut,
      u.nextDay ? 'true' : 'false',
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const selectedHistoryItem = useMemo(() => {
    if (history.length === 0) return null;
    const clampedIndex = Math.max(0, Math.min(historyIndex, history.length - 1));
    return history[clampedIndex];
  }, [history, historyIndex]);

  const handleLookup = async () => {
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

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title">Schedules</h1>
            <p className="text-muted-foreground">Loading schedule combinations…</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title">Schedules</h1>
            <p className="text-destructive">Error: {error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Schedules</h1>
          <p className="text-muted-foreground">Schedule combinations and back-in-time employee schedule inspection</p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12">
          <Card className="border-0 shadow-lg shadow-primary/5">
            <CardHeader>
              <CardTitle className="text-lg">Back in Time</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 md:col-span-3 space-y-2">
                  <Label htmlFor="employee-id">Employee ID</Label>
                  <Input
                    id="employee-id"
                    placeholder="e.g. 101234"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                  />
                </div>
                <div className="col-span-12 md:col-span-3 space-y-2">
                  <Label htmlFor="as-of-at">As Of Date Time</Label>
                  <Input
                    id="as-of-at"
                    type="datetime-local"
                    value={asOfAt}
                    onChange={(e) => setAsOfAt(e.target.value)}
                  />
                </div>
                <div className="col-span-12 md:col-span-2 space-y-2">
                  <Label htmlFor="history-from">History From</Label>
                  <Input
                    id="history-from"
                    type="date"
                    value={historyFrom}
                    onChange={(e) => setHistoryFrom(e.target.value)}
                  />
                </div>
                <div className="col-span-12 md:col-span-2 space-y-2">
                  <Label htmlFor="history-to">History To</Label>
                  <Input
                    id="history-to"
                    type="date"
                    value={historyTo}
                    onChange={(e) => setHistoryTo(e.target.value)}
                  />
                </div>
                <div className="col-span-12 md:col-span-2 flex items-end">
                  <Button onClick={handleLookup} disabled={lookupLoading} className="w-full">
                    {lookupLoading ? 'Loading…' : 'Lookup'}
                  </Button>
                </div>
              </div>
              {lookupError && (
                <p className="text-sm text-destructive">{lookupError}</p>
              )}
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 md:col-span-4">
                  <div className="rounded-lg border p-4 space-y-2">
                    <p className="text-xs text-muted-foreground">Effective Schedule At</p>
                    <p className="font-mono text-sm">{asOfData?.at ? new Date(asOfData.at).toLocaleString() : '—'}</p>
                    <p className="text-sm">
                      {asOfData ? `${asOfData.timeIn || '—'}–${asOfData.timeOut || '—'}` : '—'}
                    </p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{asOfData?.source || 'none'}</Badge>
                      <Badge variant="outline" className={asOfData?.nextDay ? 'bg-accent/10 text-accent' : ''}>
                        {asOfData?.nextDay ? 'Overnight' : 'Day'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Last change: {asOfData?.changedAt ? new Date(asOfData.changedAt).toLocaleString() : 'No historical change before selected time'}
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
                          <p className="font-mono">{new Date(selectedHistoryItem.changedAt).toLocaleString()}</p>
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
                <div className="col-span-12">
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
                            <TableCell className="font-mono text-sm">{new Date(row.changedAt).toLocaleString()}</TableCell>
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
                <div className="col-span-12">
                  <div className="data-table-container overflow-auto max-h-[220px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Shift Date</TableHead>
                          <TableHead>Scheduled In</TableHead>
                          <TableHead>Scheduled Out</TableHead>
                          <TableHead>Overnight</TableHead>
                          <TableHead>Locked At</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {locks.map((lock) => (
                          <TableRow key={`${lock.employeeId}-${lock.shiftDate}`}>
                            <TableCell>{lock.shiftDate}</TableCell>
                            <TableCell className="font-mono text-sm">{lock.scheduledIn || '—'}</TableCell>
                            <TableCell className="font-mono text-sm">{lock.scheduledOut || '—'}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={lock.nextDay ? 'bg-accent/10 text-accent' : ''}>
                                {lock.nextDay ? 'Yes' : 'No'}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{lock.lockedAt ? new Date(lock.lockedAt).toLocaleString() : '—'}</TableCell>
                          </TableRow>
                        ))}
                        {locks.length === 0 && !lookupLoading && (
                          <TableRow>
                            <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">No lock records</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="data-table-container">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Day Type</TableHead>
              <TableHead>Time In</TableHead>
              <TableHead>Time Out</TableHead>
              <TableHead>Overnight</TableHead>
              <TableHead>Employees</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {combos.map((combo, idx) => (
              <TableRow key={`${combo.label}-${combo.dayType}-${combo.timeIn}-${combo.timeOut}-${combo.nextDay}-${idx}`}>
                <TableCell className="font-medium">{combo.label || '—'}</TableCell>
                <TableCell className="text-sm">{combo.dayType || '—'}</TableCell>
                <TableCell className="font-mono">{combo.timeIn || '—'}</TableCell>
                <TableCell className="font-mono">{combo.timeOut || '—'}</TableCell>
                <TableCell>
                  {combo.nextDay ? (
                    <Badge variant="outline" className="bg-accent/10 text-accent">Yes</Badge>
                  ) : (
                    <Badge variant="outline">No</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Button variant="link" className="text-muted-foreground hover:text-primary p-0" onClick={() => openEmployeesModal(combo)}>
                    {combo.count}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogContent className="max-w-3xl sm:max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Employees</DialogTitle>
          <DialogDescription>
            {selectedCombo ? `${selectedCombo.label || '—'} • ${selectedCombo.timeIn || '—'}–${selectedCombo.timeOut || '—'} • ${selectedCombo.nextDay ? 'Overnight' : 'Day Only'}` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-muted-foreground">
            {usersLoading ? 'Loading…' : usersError ? `Error: ${usersError}` : `${users.length} employees`}
          </div>
          <Button onClick={exportUsersCsv} disabled={usersLoading || users.length === 0}>Export CSV</Button>
        </div>
        <div className="data-table-container overflow-auto max-h-[60vh]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Division</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Schedule</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={`${u.employeeId}-${u.timeIn}-${u.timeOut}`}>
                  <TableCell className="font-mono text-sm">{u.employeeId}</TableCell>
                  <TableCell>
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.positionTitle}</div>
                  </TableCell>
                  <TableCell>{u.department}</TableCell>
                  <TableCell>{u.division}</TableCell>
                  <TableCell>{u.section}</TableCell>
                  <TableCell className="font-mono text-sm">{u.timeIn || '—'}–{u.timeOut || '—'}</TableCell>
                </TableRow>
              ))}
              {users.length === 0 && !usersLoading && !usersError && (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No employees found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
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

export default AdminSchedules;
