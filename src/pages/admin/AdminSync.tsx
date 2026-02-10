import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { fetchSyncStatus, runSync, updateSyncConfig, fetchSyncLogs, SyncLog, SyncStatus, SyncLogPage } from '@/lib/services/syncApi';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RefreshCcw, Clock, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';

const AdminSync = () => {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [logPage, setLogPage] = useState<number>(1);
  const [logPageSize] = useState<number>(20);
  const [logTotal, setLogTotal] = useState<number>(0);
  const [logTotalPages, setLogTotalPages] = useState<number>(1);
  const [withChangesOnly, setWithChangesOnly] = useState<boolean>(false);
  const [interval, setInterval] = useState<number>(5);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [enabled, setEnabled] = useState<boolean>(true);
  const [changesOpen, setChangesOpen] = useState(false);
  const [selectedRun, setSelectedRun] = useState<{ timestamp: string } | null>(null);

  const load = useCallback(
    async (page: number = 1, pageSize: number = logPageSize, filterWithChangesOnly: boolean = withChangesOnly) => {
      try {
        const st = await fetchSyncStatus();
        setStatus(st);
        setInterval(st.intervalMinutes);
        setEnabled(st.enabled);
        const lg: SyncLogPage = await fetchSyncLogs({ page, pageSize, withChangesOnly: filterWithChangesOnly });
        setLogs(lg.logs);
        setLogPage(lg.page);
        setLogTotal(lg.total);
        setLogTotalPages(lg.totalPages);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      }
    },
    [logPageSize, withChangesOnly]
  );

  useEffect(() => {
    void load(1, logPageSize, withChangesOnly);
  }, [load, logPageSize, withChangesOnly]);

  const handleRun = async () => {
    setLoading(true);
    try {
      await runSync();
      await load(logPage, logPageSize, withChangesOnly);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSyncConfig(interval, enabled);
      await load(logPage, logPageSize, withChangesOnly);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const handleViewChanges = (log: SyncLog) => {
    setSelectedRun({ timestamp: log.timestamp });
    setChangesOpen(true);
  };

  const lastRun = status?.lastRun || null;
  const nextRunAt = status?.nextRunAt ? new Date(status.nextRunAt) : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sync</h1>
          <p className="text-muted-foreground">Synchronize schedules and employee data from Orange DB</p>
        </div>
        <Button onClick={handleRun} disabled={loading || status?.running} className="rounded-xl">
          <RefreshCcw className="w-4 h-4 mr-2" />
          {status?.running ? 'Running…' : 'Run Now'}
        </Button>
      </div>

      {error && (
        <div className="text-destructive">Error: {error}</div>
      )}

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 md:col-span-6">
          <Card className="border-0 shadow-lg shadow-primary/5">
            <CardHeader>
              <CardTitle className="text-lg">Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Interval</span>
                <Input type="number" min={1} value={interval} onChange={(e) => setInterval(Number(e.target.value))} className="w-[100px] ml-auto" />
              <Button size="sm" onClick={handleSave} disabled={saving}>Save</Button>
              </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Enabled</span>
              <div className="ml-auto flex items-center gap-2">
                <Switch checked={enabled} onCheckedChange={setEnabled} />
                <Badge variant="outline" className={enabled ? 'bg-success/10 text-success' : 'bg-muted'}>{enabled ? 'On' : 'Off'}</Badge>
              </div>
            </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Next Run</span>
                <span className="ml-auto font-mono text-sm">{nextRunAt ? nextRunAt.toLocaleString() : '—'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Last Run</span>
                <span className="ml-auto font-mono text-sm">{lastRun ? new Date(lastRun.timestamp).toLocaleString() : '—'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">State</span>
                {status?.running ? (
                  <Badge variant="outline" className="bg-info/10 text-info">Running</Badge>
                ) : status?.retrying ? (
                  <Badge variant="outline" className="bg-warning/10 text-warning">Retrying (Attempt {status.retryCount})</Badge>
                ) : (
                  <Badge variant="outline">Idle</Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 md:col-span-6">
          <Card className="border-0 shadow-lg shadow-primary/5">
            <CardHeader>
              <CardTitle className="text-lg">Last Result</CardTitle>
            </CardHeader>
            <CardContent>
              {!lastRun ? (
                <div className="text-muted-foreground">No sync executed yet.</div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground">Total</div>
                    <div className="text-lg font-semibold">{lastRun.total}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground">Updated</div>
                    <div className="text-lg font-semibold flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-success" />{lastRun.updated}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground">Inserted</div>
                    <div className="text-lg font-semibold flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-success" />{lastRun.inserted}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground">Unchanged</div>
                    <div className="text-lg font-semibold">{lastRun.unchanged}</div>
                  </div>
                  <div className="col-span-2">
                    {lastRun.success ? (
                      <Badge variant="outline" className="bg-success/10 text-success">Success</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-destructive/10 text-destructive flex items-center gap-1"><AlertCircle className="w-4 h-4" />Failed</Badge>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-0 shadow-lg shadow-primary/5">
        <CardHeader>
          <CardTitle className="text-lg">Sync Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-3 gap-3">
            <div className="text-xs text-muted-foreground">
              Page {logPage} of {logTotalPages} · {logTotal} runs
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-3 w-3 rounded border-muted-foreground/40"
                  checked={withChangesOnly}
                  onChange={async (e) => {
                    const next = e.target.checked;
                    setWithChangesOnly(next);
                    await load(1, logPageSize, next);
                  }}
                />
                Show only runs with changes
              </label>
            </div>
          </div>
          <div className="data-table-container">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Inserted</TableHead>
                  <TableHead>Unchanged</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="w-[140px]">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">No logs</TableCell>
                  </TableRow>
                ) : (
                  logs.map((log, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-sm">{new Date(log.timestamp).toLocaleString()}</TableCell>
                      <TableCell>{log.total}</TableCell>
                      <TableCell className="text-success">{log.updated}</TableCell>
                      <TableCell className="text-success">{log.inserted}</TableCell>
                      <TableCell className="text-muted-foreground">{log.unchanged}</TableCell>
                      <TableCell>
                        {log.success ? (
                          <Badge variant="outline" className="bg-success/10 text-success">Success</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-destructive/10 text-destructive">Failed</Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[320px] truncate text-muted-foreground">
                        {!log.success && log.error ? log.error : ''}
                      </TableCell>
                      <TableCell>
                        {log.updated + log.inserted > 0 ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-xl text-xs"
                            onClick={() => handleViewChanges(log)}
                          >
                            View details
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">No changes</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
              <div>
                Showing {logs.length} of {logTotal} runs
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 rounded-full"
                  disabled={logPage <= 1}
                  onClick={async () => {
                    const nextPage = Math.max(1, logPage - 1);
                    await load(nextPage, logPageSize, withChangesOnly);
                  }}
                >
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <span>
                  Page {logPage} / {logTotalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 rounded-full"
                  disabled={logPage >= logTotalPages}
                  onClick={async () => {
                    const nextPage = Math.min(logTotalPages, logPage + 1);
                    await load(nextPage, logPageSize, withChangesOnly);
                  }}
                >
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={changesOpen} onOpenChange={setChangesOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Run Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mb-4">
            <div className="text-sm text-muted-foreground">
              {selectedRun ? (
                <>
                  Run at <span className="font-mono">{new Date(selectedRun.timestamp).toLocaleString()}</span>
                </>
              ) : (
                'Run details not available.'
              )}
            </div>
          </div>
          <div className="data-table-container">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  const log = selectedRun
                    ? logs.find((l) => l.timestamp === selectedRun.timestamp) ?? null
                    : null;
                  const updatedDetails = log?.detailsUpdated ?? [];
                  const insertedDetails = log?.detailsInserted ?? [];
                  if (updatedDetails.length === 0 && insertedDetails.length === 0) {
                    return (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-muted-foreground">
                          No row-level details recorded for this run.
                        </TableCell>
                      </TableRow>
                    );
                  }
                  return (
                    <>
                      {updatedDetails.map((text, idx) => (
                        <TableRow key={`u-${idx}`}>
                          <TableCell className="text-xs text-success">Updated</TableCell>
                          <TableCell className="text-xs font-mono">{text}</TableCell>
                        </TableRow>
                      ))}
                      {insertedDetails.map((text, idx) => (
                        <TableRow key={`i-${idx}`}>
                          <TableCell className="text-xs text-success">Inserted</TableCell>
                          <TableCell className="text-xs font-mono">{text}</TableCell>
                        </TableRow>
                      ))}
                    </>
                  );
                })()}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminSync;
