import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { fetchSyncStatus, runSync, updateSyncConfig, fetchSyncLogs, fetchSyncChanges, SyncLog, SyncStatus, SyncChange } from '@/lib/services/syncApi';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCcw, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

const AdminSync = () => {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [interval, setInterval] = useState<number>(5);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [enabled, setEnabled] = useState<boolean>(true);
  const [tab, setTab] = useState<'logs' | 'changes'>('logs');
  const [changesOpen, setChangesOpen] = useState(false);
  const [changesLoading, setChangesLoading] = useState(false);
  const [changesError, setChangesError] = useState('');
  const [changes, setChanges] = useState<SyncChange[]>([]);
  const [selectedRun, setSelectedRun] = useState<{ timestamp: string; runId?: string } | null>(null);
  const [allChanges, setAllChanges] = useState<SyncChange[]>([]);

  const load = async () => {
    try {
      const st = await fetchSyncStatus();
      setStatus(st);
      setInterval(st.intervalMinutes);
      setEnabled(st.enabled);
      const lg = await fetchSyncLogs();
      setLogs(lg);
      const cg = await fetchSyncChanges({ limit: 200 });
      setAllChanges(cg);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRun = async () => {
    setLoading(true);
    try {
      const lr = await runSync();
      if (lr) setLogs([lr]);
      await load();
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
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const handleViewChanges = async (log: SyncLog) => {
    if (!log.runId || log.runId.trim().length === 0) {
      setSelectedRun({ timestamp: log.timestamp, runId: '' });
      setChanges([]);
      setChangesError('This run was recorded before field-level tracking was enabled. Only summary counts are available.');
      setChangesOpen(true);
      return;
    }
    setSelectedRun({ timestamp: log.timestamp, runId: log.runId });
    setChangesOpen(true);
    setChangesLoading(true);
    setChangesError('');
    try {
      const rows = await fetchSyncChanges({ runId: log.runId, limit: 200 });
      setChanges(rows);
      if (rows.length === 0) {
        setChangesError('No field-level changes recorded for this run.');
      }
    } catch (e) {
      setChanges([]);
      setChangesError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setChangesLoading(false);
    }
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
          <Tabs value={tab} onValueChange={(value) => setTab(value as 'logs' | 'changes')} className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="logs">Logs</TabsTrigger>
              <TabsTrigger value="changes">Changes</TabsTrigger>
            </TabsList>
            <TabsContent value="logs">
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
                      <TableHead className="w-[120px]">Changes</TableHead>
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
                              log.runId && log.runId.trim().length > 0 ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="rounded-xl text-xs"
                                  onClick={() => handleViewChanges(log)}
                                >
                                  View changes
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">Not tracked</span>
                              )
                            ) : (
                              <span className="text-xs text-muted-foreground">No changes</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
            <TabsContent value="changes">
              <div className="data-table-container">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Employee ID</TableHead>
                      <TableHead>Field</TableHead>
                      <TableHead>Old Value</TableHead>
                      <TableHead>New Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allChanges.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No field-level changes recorded.
                        </TableCell>
                      </TableRow>
                    ) : (
                      allChanges.map((change) => (
                        <TableRow key={change.id}>
                          <TableCell className="font-mono text-xs">
                            {new Date(change.updatedAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{change.employeeId}</TableCell>
                          <TableCell className="text-sm">{change.fieldName}</TableCell>
                          <TableCell
                            className="text-xs text-muted-foreground max-w-[200px] truncate"
                            title={change.oldValue ?? ''}
                          >
                            {change.oldValue ?? '—'}
                          </TableCell>
                          <TableCell
                            className="text-xs max-w-[200px] truncate"
                            title={change.newValue ?? ''}
                          >
                            {change.newValue ?? '—'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={changesOpen} onOpenChange={setChangesOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Field Changes</DialogTitle>
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
            {changesLoading && (
              <div className="text-sm text-muted-foreground">Loading changes…</div>
            )}
            {changesError && !changesLoading && (
              <div className="text-sm text-destructive">{changesError}</div>
            )}
          </div>
          <div className="data-table-container">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>Old Value</TableHead>
                  <TableHead>New Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!changesLoading && changes.length === 0 && !changesError) && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No field-level changes recorded.
                    </TableCell>
                  </TableRow>
                )}
                {changes.map((change) => (
                  <TableRow key={change.id}>
                    <TableCell className="font-mono text-xs">
                      {new Date(change.updatedAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{change.employeeId}</TableCell>
                    <TableCell className="text-sm">{change.fieldName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={change.oldValue ?? ''}>
                      {change.oldValue ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate" title={change.newValue ?? ''}>
                      {change.newValue ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminSync;
