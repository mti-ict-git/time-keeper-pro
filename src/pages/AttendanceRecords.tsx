import { Link } from 'react-router-dom';
import { useAppStore } from '@/lib/services/store';
import { AttendanceDBTable } from '@/components/tables/AttendanceDBTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { exportToCSV, exportToXLSX, exportToPDF } from '@/lib/services/exportService';
import { toast } from '@/hooks/use-toast';
import {
  ArrowRight,
  Calendar,
  ClipboardList,
  FileDown,
  FileSpreadsheet,
  FileText,
  FileType,
  LayoutDashboard,
  Search,
  ShieldCheck,
  TableProperties,
} from 'lucide-react';

const AttendanceRecords = () => {
  const { attendanceRecords } = useAppStore();
  const exportFormats = 3;
  const localRows = attendanceRecords.length;

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
    <div className="space-y-8 animate-fade-in">
      <Card className="relative overflow-hidden rounded-[32px] border-0 bg-[linear-gradient(135deg,hsl(221_52%_12%)_0%,hsl(217_69%_31%)_55%,hsl(193_63%_30%)_100%)] text-white shadow-[0_30px_80px_-40px_rgba(15,23,42,0.85)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.10),transparent_34%)]" />
        <CardContent className="relative p-6 sm:p-8 lg:p-10">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl space-y-5">
              <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.22em] text-white/68">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-white">Attendance Operations</span>
                <span>Search, review, and export workforce records</span>
              </div>

              <div className="space-y-3">
                <h1 className="max-w-3xl text-3xl font-semibold tracking-[-0.045em] sm:text-4xl lg:text-5xl">
                  Attendance review workspace for search, validation, and reporting.
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-white/74 sm:text-base">
                  Review employee attendance data, isolate records by date and department, then export clean reports for operational follow-up or audit distribution.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <div className="rounded-2xl border border-white/15 bg-white/8 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/62">Current Workspace</p>
                  <p className="mt-1 text-sm font-medium text-white">Attendance Records</p>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/8 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/62">Available Exports</p>
                  <p className="mt-1 text-sm font-medium text-white">{exportFormats} formats</p>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/8 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/62">Local Export Cache</p>
                  <p className="mt-1 text-sm font-medium text-white">{localRows} rows</p>
                </div>
              </div>

              <div className="rounded-3xl border border-white/15 bg-white/8 p-4 backdrop-blur-sm">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-300" />
                  <div className="space-y-1 text-sm leading-6 text-white/78">
                    <p className="font-medium text-white">Attendance workspace is ready for daily operational use.</p>
                    <p>Use the table below for live filtering, review exception patterns by employee or date range, then export the result in the format your team needs.</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-1">
                <Link to="/dashboard">
                  <Button className="h-11 rounded-2xl bg-white px-5 text-sm font-semibold text-slate-950 hover:bg-white/92">
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    Open Dashboard
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/scheduling">
                  <Button variant="outline" className="h-11 rounded-2xl border-white/20 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10 hover:text-white">
                    <Calendar className="mr-2 h-4 w-4" />
                    Review Scheduling
                  </Button>
                </Link>
              </div>
            </div>

            <div className="grid w-full max-w-xl grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-[28px] border border-white/14 bg-white/10 p-5 backdrop-blur-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65">Export Ready</p>
                <p className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-white">{exportFormats}</p>
                <p className="mt-2 text-sm leading-6 text-white/70">CSV, PDF, and XLSX outputs are available from this workspace.</p>
              </div>
              <div className="rounded-[28px] border border-white/14 bg-white/10 p-5 backdrop-blur-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65">Filter Coverage</p>
                <p className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-white">4</p>
                <p className="mt-2 text-sm leading-6 text-white/70">Search, date range, department, and column filters support detailed review.</p>
              </div>
              <div className="rounded-[28px] border border-white/14 bg-white/10 p-5 backdrop-blur-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65">Primary Use</p>
                <p className="mt-4 text-2xl font-semibold tracking-[-0.05em] text-white">Operational Review</p>
                <p className="mt-2 text-sm leading-6 text-white/70">Best used for investigating attendance records before reporting or escalation.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border border-border/70 bg-card/95 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.50)]">
        <CardHeader className="space-y-4 pb-2">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
                Export Center
              </div>
              <CardTitle className="text-2xl font-semibold tracking-[-0.035em] text-foreground">Distribute attendance reports in the required format</CardTitle>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                Use exports after review to share attendance data with operations, payroll, audit, or supervisors in the format that best fits downstream processing.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button variant="outline" onClick={handleExportCSV} className="h-11 rounded-2xl px-5 text-sm font-semibold">
                <FileDown className="mr-2 h-4 w-4" />
                CSV
              </Button>
              <Button variant="outline" onClick={handleExportPDF} className="h-11 rounded-2xl px-5 text-sm font-semibold">
                <FileType className="mr-2 h-4 w-4" />
                PDF
              </Button>
              <Button variant="outline" onClick={handleExportXLSX} className="h-11 rounded-2xl px-5 text-sm font-semibold">
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                XLSX
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-[24px] border border-border/70 bg-slate-950/[0.03] p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-accent/10 text-accent">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Structured Reporting</p>
                  <p className="text-sm text-muted-foreground">Prepare attendance files for stakeholders with different reporting needs.</p>
                </div>
              </div>
            </div>
            <div className="rounded-[24px] border border-border/70 bg-slate-950/[0.03] p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-primary/10 text-primary">
                  <Search className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Review Before Export</p>
                  <p className="text-sm text-muted-foreground">Apply table filters first so exported files reflect the exact operational scope.</p>
                </div>
              </div>
            </div>
            <div className="rounded-[24px] border border-border/70 bg-slate-950/[0.03] p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-success/10 text-success">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Operational Handoff</p>
                  <p className="text-sm text-muted-foreground">Supports audit sharing, payroll follow-up, and frontline attendance review.</p>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card className="rounded-[28px] border border-border/70 bg-card/95 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.50)]">
        <CardHeader className="pb-2">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
              Attendance Dataset
            </div>
            <CardTitle className="text-2xl font-semibold tracking-[-0.035em] text-foreground">Live attendance review table</CardTitle>
            <p className="text-sm leading-6 text-muted-foreground">
              Search by employee, narrow the reporting range, apply department filters, and inspect attendance details before exporting or escalating a record.
            </p>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-[24px] border border-border/70 bg-slate-950/[0.03] p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-primary/10 text-primary">
                  <Search className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Search and Filter</p>
                  <p className="text-sm text-muted-foreground">Quickly isolate employees, departments, and reporting periods.</p>
                </div>
              </div>
            </div>
            <div className="rounded-[24px] border border-border/70 bg-slate-950/[0.03] p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-accent/10 text-accent">
                  <TableProperties className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Detailed Inspection</p>
                  <p className="text-sm text-muted-foreground">Review schedules, actual clock values, controllers, and status indicators together.</p>
                </div>
              </div>
            </div>
            <div className="rounded-[24px] border border-border/70 bg-slate-950/[0.03] p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-success/10 text-success">
                  <FileDown className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Reporting Output</p>
                  <p className="text-sm text-muted-foreground">Move directly from review into export once the dataset is scoped correctly.</p>
                </div>
              </div>
            </div>
          </div>
          <AttendanceDBTable />
        </CardContent>
      </Card>
    </div>
  );
};

export default AttendanceRecords;
