import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '@/lib/services/store';
import { AttendanceTable } from '@/components/tables/AttendanceTable';
import { Button } from '@/components/ui/button';
import { exportToCSV, exportToXLSX, exportToPDF } from '@/lib/services/exportService';
import { toast } from '@/hooks/use-toast';
import { LayoutDashboard, Calendar, FileDown, FileSpreadsheet, FileType } from 'lucide-react';

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
      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance Records</h1>
          <p className="text-muted-foreground">View and export employee attendance data</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/dashboard">
            <Button variant="outline">
              <LayoutDashboard className="w-4 h-4 mr-2" />
              Dashboard
            </Button>
          </Link>
          <Link to="/scheduling">
            <Button variant="outline">
              <Calendar className="w-4 h-4 mr-2" />
              Schedule
            </Button>
          </Link>
          <div className="flex gap-1 ml-2">
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <FileDown className="w-4 h-4 mr-1" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPDF}>
              <FileType className="w-4 h-4 mr-1" />
              PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportXLSX}>
              <FileSpreadsheet className="w-4 h-4 mr-1" />
              XLSX
            </Button>
          </div>
        </div>
      </div>

      {/* Attendance Table */}
      <AttendanceTable data={attendanceRecords} />
    </div>
  );
};

export default AttendanceRecords;
