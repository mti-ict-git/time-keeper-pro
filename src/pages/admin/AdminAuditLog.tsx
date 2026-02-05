import { useState, useMemo } from 'react';
import { useAppStore } from '@/lib/services/store';
import { AuditLog } from '@/lib/models';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Search, Trash2, Eye } from 'lucide-react';

const actionColors = {
  create: 'bg-success/10 text-success border-success/20',
  update: 'bg-warning/10 text-warning border-warning/20',
  delete: 'bg-destructive/10 text-destructive border-destructive/20',
  login: 'bg-info/10 text-info border-info/20',
  logout: 'bg-muted text-muted-foreground',
};

const AdminAuditLog = () => {
  const { auditLogs, clearAuditLogs } = useAppStore();
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Get unique entity types
  const entityTypes = useMemo(() => {
    const types = new Set(auditLogs.map((l) => l.entityType));
    return Array.from(types).sort();
  }, [auditLogs]);

  // Filter logs
  const filteredLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      const matchesAction = actionFilter === 'all' || log.action === actionFilter;
      const matchesEntity = entityFilter === 'all' || log.entityType === entityFilter;
      const matchesSearch =
        search === '' ||
        log.userId.toLowerCase().includes(search.toLowerCase()) ||
        log.entityType.toLowerCase().includes(search.toLowerCase()) ||
        log.entityId.toLowerCase().includes(search.toLowerCase());

      return matchesAction && matchesEntity && matchesSearch;
    });
  }, [auditLogs, actionFilter, entityFilter, search]);

  const handleClear = () => {
    clearAuditLogs();
    toast({ title: 'Audit Log Cleared', description: 'All audit entries have been removed.' });
    setShowClearConfirm(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Log</h1>
          <p className="text-muted-foreground">Track all system changes and user actions</p>
        </div>
        <Button variant="outline" onClick={() => setShowClearConfirm(true)} disabled={auditLogs.length === 0}>
          <Trash2 className="w-4 h-4 mr-2" />
          Clear All
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            <SelectItem value="create">Create</SelectItem>
            <SelectItem value="update">Update</SelectItem>
            <SelectItem value="delete">Delete</SelectItem>
            <SelectItem value="login">Login</SelectItem>
            <SelectItem value="logout">Logout</SelectItem>
          </SelectContent>
        </Select>

        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Entities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Entities</SelectItem>
            {entityTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="data-table-container">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Entity ID</TableHead>
              <TableHead className="w-[80px]">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No audit logs found
                </TableCell>
              </TableRow>
            ) : (
              filteredLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-mono text-sm">
                    {format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss')}
                  </TableCell>
                  <TableCell className="font-medium">{log.userId}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={actionColors[log.action]}>
                      {log.action.charAt(0).toUpperCase() + log.action.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell>{log.entityType}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {log.entityId.substring(0, 12)}...
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setSelectedLog(log)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Details Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Audit Log Details</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Timestamp</p>
                  <p className="font-mono">{format(new Date(selectedLog.timestamp), 'yyyy-MM-dd HH:mm:ss')}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">User</p>
                  <p className="font-medium">{selectedLog.userId}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Action</p>
                  <Badge variant="outline" className={actionColors[selectedLog.action]}>
                    {selectedLog.action}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Entity</p>
                  <p>{selectedLog.entityType} ({selectedLog.entityId})</p>
                </div>
              </div>

              {selectedLog.before && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Before</p>
                  <pre className="p-3 bg-muted rounded-lg text-xs overflow-auto max-h-40">
                    {JSON.stringify(selectedLog.before, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.after && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">After</p>
                  <pre className="p-3 bg-muted rounded-lg text-xs overflow-auto max-h-40">
                    {JSON.stringify(selectedLog.after, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Clear Confirmation */}
      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Audit Log</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to clear all audit log entries? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClear} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminAuditLog;
