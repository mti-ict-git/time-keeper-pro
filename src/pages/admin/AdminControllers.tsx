import { useState } from 'react';
import { useAppStore } from '@/lib/services/store';
import { Controller } from '@/lib/models';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';

const statusColors = {
  active: 'bg-success/10 text-success border-success/20',
  inactive: 'bg-muted text-muted-foreground',
  maintenance: 'bg-warning/10 text-warning border-warning/20',
};

const AdminControllers = () => {
  const { controllers, addController, updateController, deleteController } = useAppStore();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingController, setEditingController] = useState<Controller | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    location: '',
    ipAddress: '',
    status: 'active' as 'active' | 'inactive' | 'maintenance',
  });

  const handleOpenDialog = (controller?: Controller) => {
    if (controller) {
      setEditingController(controller);
      setFormData({
        name: controller.name,
        location: controller.location,
        ipAddress: controller.ipAddress,
        status: controller.status,
      });
    } else {
      setEditingController(null);
      setFormData({
        name: '',
        location: '',
        ipAddress: '',
        status: 'active',
      });
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (editingController) {
      updateController(editingController.id, formData);
      toast({ title: 'Controller Updated', description: `${formData.name} has been updated.` });
    } else {
      addController(formData);
      toast({ title: 'Controller Added', description: `${formData.name} has been added.` });
    }

    setIsDialogOpen(false);
  };

  const handleDelete = () => {
    if (deleteId) {
      const ctrl = controllers.find((c) => c.id === deleteId);
      deleteController(deleteId);
      toast({ title: 'Controller Deleted', description: `${ctrl?.name} has been removed.` });
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Controllers</h1>
          <p className="text-muted-foreground">Manage attendance devices and controllers</p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="w-4 h-4 mr-2" />
          Add Controller
        </Button>
      </div>

      {/* Table */}
      <div className="data-table-container">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>IP Address</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {controllers.map((controller) => (
              <TableRow key={controller.id}>
                <TableCell className="font-medium">{controller.name}</TableCell>
                <TableCell>{controller.location}</TableCell>
                <TableCell className="font-mono">{controller.ipAddress}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusColors[controller.status]}>
                    {controller.status.charAt(0).toUpperCase() + controller.status.slice(1)}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(controller.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleOpenDialog(controller)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteId(controller.id)}
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
                {editingController ? 'Edit Controller' : 'Add Controller'}
              </DialogTitle>
              <DialogDescription>
                {editingController
                  ? 'Update controller configuration'
                  : 'Add a new attendance device'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Controller Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Main Entrance"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g., Building A, Floor 1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ipAddress">IP Address</Label>
                <Input
                  id="ipAddress"
                  value={formData.ipAddress}
                  onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })}
                  placeholder="e.g., 192.168.1.100"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: 'active' | 'inactive' | 'maintenance') =>
                    setFormData({ ...formData, status: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingController ? 'Save Changes' : 'Add Controller'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Controller</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this controller?
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

export default AdminControllers;
