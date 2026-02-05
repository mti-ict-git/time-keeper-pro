import { Link } from 'react-router-dom';
import { useAppStore } from '@/lib/services/store';
import { AttendanceTable } from '@/components/tables/AttendanceTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { exportToCSV, exportToXLSX, exportToPDF } from '@/lib/services/exportService';
import { toast } from '@/hooks/use-toast';
import { LayoutDashboard, Calendar, FileDown, FileSpreadsheet, FileType, ClipboardList } from 'lucide-react';

const AttendanceRecords = () => {
  const { attendanceRecords } = useAppStore();

  const handleExportCSV = () => {
    exportToCSV(attendanceRecords);
    toast({
      title: 'Export Successful',
      description: 'Attendance records exported to CSV',
    });
  };

  const handleExportXLSX = () => {
    exportToXLSX(attendanceRecords);
    toast({
      title: 'Export Successful',
      description: 'Attendance records exported to Excel',
    });
  };

  const handleExportPDF = () => {
    exportToPDF(attendanceRecords);
    toast({
      title: 'Export Successful',
      description: 'Attendance records exported to PDF',
    });
  };

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

      {/* Export Actions */}
      <Card className="border-0 shadow-lg shadow-primary/5">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <FileDown className="h-5 w-5 text-accent" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Export Data</h3>
                <p className="text-sm text-muted-foreground">Download attendance records in your preferred format</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={handleExportCSV}
                className="rounded-xl"
              >
                <FileDown className="w-4 h-4 mr-2" />
                CSV
              </Button>
              <Button 
                variant="outline" 
                onClick={handleExportPDF}
                className="rounded-xl"
              >
                <FileType className="w-4 h-4 mr-2" />
                PDF
              </Button>
              <Button 
                variant="outline" 
                onClick={handleExportXLSX}
                className="rounded-xl"
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                XLSX
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attendance Table */}
      <Card className="border-0 shadow-lg shadow-primary/5">
        <CardContent className="p-5">
          <AttendanceTable data={attendanceRecords} />
        </CardContent>
      </Card>
    </div>
  );
};

export default AttendanceRecords;