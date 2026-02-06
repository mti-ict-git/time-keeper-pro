import { useEffect, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ScheduleCombo, SchedulingEmployee } from '@/lib/services/schedulingApi';
import { fetchScheduleCombos, fetchSchedulingEmployees } from '@/lib/services/schedulingApi';

const AdminSchedules = () => {
  const [combos, setCombos] = useState<ScheduleCombo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCombo, setSelectedCombo] = useState<ScheduleCombo | null>(null);
  const [users, setUsers] = useState<SchedulingEmployee[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');

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
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Schedules</h1>
          <p className="text-muted-foreground">Available schedule combinations from MTIUsers</p>
        </div>
      </div>

      {/* Table */}
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

export default AdminSchedules;
