import { Link } from 'react-router-dom';
import { AttendanceDBTable } from '@/components/tables/AttendanceDBTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LayoutDashboard, Calendar, ClipboardList } from 'lucide-react';

const AttendanceRecords = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <ClipboardList className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Attendance Records</h1>
            <p className="text-muted-foreground">View and export employee attendance data</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/dashboard">
            <Button variant="outline" className="rounded-xl shadow-sm">
              <LayoutDashboard className="w-4 h-4 mr-2" />
              Dashboard
            </Button>
          </Link>
          <Link to="/scheduling">
            <Button variant="outline" className="rounded-xl shadow-sm">
              <Calendar className="w-4 h-4 mr-2" />
              Schedule
            </Button>
          </Link>
        </div>
      </div>

      {/* Attendance Report (DB) */}
      <Card className="border-0 shadow-lg shadow-primary/5">
        <CardContent className="p-5">
          <AttendanceDBTable />
        </CardContent>
      </Card>
    </div>
  );
};

export default AttendanceRecords;
