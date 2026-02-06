import { useEffect, useState } from 'react';
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
import { fetchControllers } from '@/lib/services/controllersApi';

const statusColors = {
  active: 'bg-success/10 text-success border-success/20',
  inactive: 'bg-muted text-muted-foreground',
  maintenance: 'bg-warning/10 text-warning border-warning/20',
};

const AdminControllers = () => {
  const [controllers, setControllers] = useState<Controller[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchControllers()
      .then((data) => setControllers(data))
      .catch((e) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false));
  }, []);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingController, setEditingController] = useState<Controller | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    location: '',
    ipAddress: '',
    status: 'active' as 'active' | 'inactive' | 'maintenance',
  });

  const handleOpenDialog = () => {
    toast({ title: 'Read-only', description: 'Controllers are sourced from attendance data.' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast({ title: 'Read-only', description: 'Editing controllers is not available for real data.' });
    setIsDialogOpen(false);
  };

  const handleDelete = () => {
    toast({ title: 'Read-only', description: 'Deleting controllers is not available for real data.' });
    setDeleteId(null);
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
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">Loading controllers…</TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-destructive">Error: {error}</TableCell>
              </TableRow>
            ) : controllers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">No controllers found</TableCell>
              </TableRow>
            ) : controllers.map((controller) => (
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
                      onClick={handleOpenDialog}
                      disabled
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteId(controller.id)}
                      disabled
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
