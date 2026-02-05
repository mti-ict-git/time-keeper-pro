import { useState } from 'react';
import { useAppStore } from '@/lib/services/store';
import { Schedule } from '@/lib/models';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';

const AdminSchedules = () => {
  const { schedules, addSchedule, updateSchedule, deleteSchedule } = useAppStore();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    timeIn: '08:00',
    timeOut: '16:00',
    isOvernight: false,
  });

  const handleOpenDialog = (schedule?: Schedule) => {
    if (schedule) {
      setEditingSchedule(schedule);
      setFormData({
        name: schedule.name,
        timeIn: schedule.timeIn,
        timeOut: schedule.timeOut,
        isOvernight: schedule.isOvernight,
      });
    } else {
      setEditingSchedule(null);
      setFormData({
        name: '',
        timeIn: '08:00',
        timeOut: '16:00',
        isOvernight: false,
      });
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (editingSchedule) {
      updateSchedule(editingSchedule.id, formData);
      toast({ title: 'Schedule Updated', description: `${formData.name} has been updated.` });
    } else {
      addSchedule(formData);
      toast({ title: 'Schedule Added', description: `${formData.name} has been added.` });
    }

    setIsDialogOpen(false);
  };

  const handleDelete = () => {
    if (deleteId) {
      const sched = schedules.find((s) => s.id === deleteId);
      deleteSchedule(deleteId);
      toast({ title: 'Schedule Deleted', description: `${sched?.name} has been removed.` });
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Schedules</h1>
          <p className="text-muted-foreground">Manage work schedules</p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="w-4 h-4 mr-2" />
          Add Schedule
        </Button>
      </div>

      {/* Table */}
      <div className="data-table-container">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Time In</TableHead>
              <TableHead>Time Out</TableHead>
              <TableHead>Overnight</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedules.map((schedule) => (
              <TableRow key={schedule.id}>
                <TableCell className="font-medium">{schedule.name}</TableCell>
                <TableCell className="font-mono">{schedule.timeIn}</TableCell>
                <TableCell className="font-mono">{schedule.timeOut}</TableCell>
                <TableCell>
                  {schedule.isOvernight ? (
                    <Badge variant="outline" className="bg-accent/10 text-accent">Yes</Badge>
                  ) : (
                    <Badge variant="outline">No</Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(schedule.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleOpenDialog(schedule)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteId(schedule.id)}
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
                {editingSchedule ? 'Edit Schedule' : 'Add Schedule'}
              </DialogTitle>
              <DialogDescription>
                {editingSchedule
                  ? 'Update schedule configuration'
                  : 'Create a new work schedule'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Schedule Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Morning Shift"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="timeIn">Time In</Label>
                  <Input
                    id="timeIn"
                    type="time"
                    value={formData.timeIn}
                    onChange={(e) => setFormData({ ...formData, timeIn: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timeOut">Time Out</Label>
                  <Input
                    id="timeOut"
                    type="time"
                    value={formData.timeOut}
                    onChange={(e) => setFormData({ ...formData, timeOut: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="overnight">Overnight Shift</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable if time out is the next day
                  </p>
                </div>
                <Switch
                  id="overnight"
                  checked={formData.isOvernight}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, isOvernight: checked })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingSchedule ? 'Save Changes' : 'Add Schedule'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Schedule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this schedule? This may affect employee assignments.
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

export default AdminSchedules;
