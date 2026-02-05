import { useEffect, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { ScheduleCombo } from '@/lib/services/schedulingApi';
import { fetchScheduleCombos } from '@/lib/services/schedulingApi';

const AdminSchedules = () => {
  const [combos, setCombos] = useState<ScheduleCombo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchScheduleCombos()
      .then((rows) => setCombos(rows))
      .catch((e) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false));
  }, []);

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
                <TableCell className="text-muted-foreground">{combo.count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default AdminSchedules;
