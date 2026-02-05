import { useState, useMemo } from 'react';
import { useAppStore } from '@/lib/services/store';
import { EmployeeScheduleAssignment } from '@/lib/models';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { ScheduleBadge } from '@/components/ScheduleBadge';
import { toast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

const AdminAssignments = () => {
  const { employees, schedules, assignments, addAssignment, updateAssignment, deleteAssignment } = useAppStore();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<EmployeeScheduleAssignment | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    employeeId: '',
    scheduleId: '',
  });

  // Enrich assignments with employee and schedule names
  const enrichedAssignments = useMemo(() => {
    return assignments.map((a) => {
      const employee = employees.find((e) => e.id === a.employeeId);
      const schedule = schedules.find((s) => s.id === a.scheduleId);
      return { ...a, employee, schedule };
    });
  }, [assignments, employees, schedules]);

  // Get unassigned employees
  const unassignedEmployees = useMemo(() => {
    const assignedIds = new Set(assignments.map((a) => a.employeeId));
    return employees.filter((e) => !assignedIds.has(e.id));
  }, [employees, assignments]);

  const handleOpenDialog = (assignment?: EmployeeScheduleAssignment) => {
    if (assignment) {
      setEditingAssignment(assignment);
      setFormData({
        employeeId: assignment.employeeId,
        scheduleId: assignment.scheduleId,
      });
    } else {
      setEditingAssignment(null);
      setFormData({
        employeeId: '',
        scheduleId: '',
      });
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (editingAssignment) {
      updateAssignment(editingAssignment.id, {
        scheduleId: formData.scheduleId,
      });
      toast({ title: 'Assignment Updated', description: 'Schedule assignment has been updated.' });
    } else {
      addAssignment({
        employeeId: formData.employeeId,
        scheduleId: formData.scheduleId,
        effectiveFrom: new Date(),
        effectiveTo: null,
      });
      toast({ title: 'Assignment Created', description: 'Employee has been assigned to schedule.' });
    }

    setIsDialogOpen(false);
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteAssignment(deleteId);
      toast({ title: 'Assignment Deleted', description: 'Schedule assignment has been removed.' });
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Schedule Assignments</h1>
          <p className="text-muted-foreground">Assign employees to work schedules</p>
        </div>
        <Button onClick={() => handleOpenDialog()} disabled={unassignedEmployees.length === 0}>
          <Plus className="w-4 h-4 mr-2" />
          Add Assignment
        </Button>
      </div>

      {unassignedEmployees.length > 0 && (
        <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg text-sm">
          <span className="font-medium">{unassignedEmployees.length}</span> employees without schedule assignment
        </div>
      )}

      {/* Table */}
      <div className="data-table-container">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Effective From</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {enrichedAssignments.map((assignment) => (
              <TableRow key={assignment.id}>
                <TableCell>
                  <div>
                    <div className="font-medium">{assignment.employee?.name || 'Unknown'}</div>
                    <div className="text-xs text-muted-foreground">
                      {assignment.employee?.employeeId}
                    </div>
                  </div>
                </TableCell>
                <TableCell>{assignment.employee?.department || '—'}</TableCell>
                <TableCell className="font-medium">
                  {assignment.schedule?.name || 'Unknown'}
                </TableCell>
                <TableCell>
                  {assignment.schedule && (
                    <ScheduleBadge
                      timeIn={assignment.schedule.timeIn}
                      timeOut={assignment.schedule.timeOut}
                      isOvernight={assignment.schedule.isOvernight}
                    />
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(assignment.effectiveFrom), 'yyyy-MM-dd')}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleOpenDialog(assignment)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteId(assignment.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editingAssignment ? 'Edit Assignment' : 'New Assignment'}
              </DialogTitle>
              <DialogDescription>
                {editingAssignment
                  ? 'Change the schedule for this employee'
                  : 'Assign an employee to a work schedule'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {!editingAssignment && (
                <div className="space-y-2">
                  <Label htmlFor="employee">Employee</Label>
                  <Select
                    value={formData.employeeId}
                    onValueChange={(value) => setFormData({ ...formData, employeeId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {unassignedEmployees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.name} ({emp.employeeId})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="schedule">Schedule</Label>
                <Select
                  value={formData.scheduleId}
                  onValueChange={(value) => setFormData({ ...formData, scheduleId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select schedule" />
                  </SelectTrigger>
                  <SelectContent>
                    {schedules.map((sched) => (
                      <SelectItem key={sched.id} value={sched.id}>
                        {sched.name} ({sched.timeIn} - {sched.timeOut})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!formData.scheduleId || (!editingAssignment && !formData.employeeId)}>
                {editingAssignment ? 'Save Changes' : 'Create Assignment'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Assignment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this schedule assignment?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminAssignments;
