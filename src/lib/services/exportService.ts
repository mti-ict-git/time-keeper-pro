import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import type { ProcessedAttendanceRecord } from '../models';
import type { SchedulingEmployee } from './schedulingApi';

type AttendanceExportSource = ProcessedAttendanceRecord | Record<string, unknown>;

type AttendanceExportRow = {
  employeeId: string;
  employeeName: string;
  company: string;
  department: string;
  position: string;
  date: string;
  schedule: string;
  scheduledIn: string;
  scheduledOut: string;
  actualIn: string;
  actualOut: string;
  controller: string;
  statusIn: string;
  statusOut: string;
  sourceIssue: string;
};

function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function pickRecordValue(record: AttendanceExportSource, keys: string[]): string {
  const data = record as Record<string, unknown>;
  for (const key of keys) {
    const value = data[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

function formatDateValue(value: unknown): string {
  if (!value) return '';
  if (value instanceof Date) return format(value, 'yyyy-MM-dd');
  const raw = String(value).trim();
  if (!raw) return '';
  const normalized = raw.length <= 10 ? `${raw}T00:00:00` : raw;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return raw.slice(0, 10);
  return format(parsed, 'yyyy-MM-dd');
}

// Only contractor rows carry a company, so the column is added just for them
// and MTI exports keep their existing shape.
function hasCompanyColumn(rows: AttendanceExportRow[]): boolean {
  return rows.some((r) => r.company !== '');
}

function normalizeAttendanceExportRows(records: AttendanceExportSource[]): AttendanceExportRow[] {
  return records.map((record) => {
    const controllerIn = pickRecordValue(record, ['controller_in']);
    const controllerOut = pickRecordValue(record, ['controller_out']);
    const controller =
      controllerIn && controllerOut && controllerIn !== controllerOut
        ? `${controllerIn} | ${controllerOut}`
        : controllerIn || controllerOut || pickRecordValue(record, ['controllerName', 'controller_name']) || 'N/A';

    const actualIn = pickRecordValue(record, ['actual_in', 'actualIn']) || 'N/A';
    const actualOut = pickRecordValue(record, ['actual_out', 'actualOut']) || 'N/A';
    const statusIn = pickRecordValue(record, ['status_in', 'statusIn', 'statusin']) || 'N/A';
    const statusOut = pickRecordValue(record, ['status_out', 'statusOut', 'statusout']) || 'N/A';
    const sourceIssue = pickRecordValue(record, ['source_issue']);

    return {
      employeeId: pickRecordValue(record, ['employee_id', 'employeeId', 'employeeid', 'StaffNo', 'EmpID', 'emp_id', 'empid']),
      employeeName: pickRecordValue(record, ['employee_name', 'employeeName', 'name']),
      company: pickRecordValue(record, ['company', 'Company']),
      department: pickRecordValue(record, ['department', 'dept']),
      position: pickRecordValue(record, ['position_title', 'position', 'Title']),
      date: formatDateValue((record as Record<string, unknown>).date ?? (record as Record<string, unknown>).attendance_date ?? (record as Record<string, unknown>).record_date),
      schedule: pickRecordValue(record, ['schedule_label', 'scheduleName']),
      scheduledIn: pickRecordValue(record, ['scheduled_in', 'scheduledIn']) || 'N/A',
      scheduledOut: pickRecordValue(record, ['scheduled_out', 'scheduledOut']) || 'N/A',
      actualIn,
      actualOut,
      controller,
      statusIn,
      statusOut,
      sourceIssue: sourceIssue || 'N/A',
    };
  });
}

// Export to CSV
export const exportToCSV = (
  records: AttendanceExportSource[],
  filename: string = 'attendance_records'
): void => {
  const normalized = normalizeAttendanceExportRows(records);
  const withCompany = hasCompanyColumn(normalized);
  const headers = [
    'Employee ID',
    'Name',
    ...(withCompany ? ['Company'] : []),
    'Department',
    'Position',
    'Date',
    'Schedule',
    'Scheduled In',
    'Scheduled Out',
    'Actual In',
    'Actual Out',
    'Controller',
    'Status In',
    'Status Out',
    'Source Issue',
  ];

  const rows = normalized.map((record) => [
    record.employeeId,
    record.employeeName,
    ...(withCompany ? [record.company] : []),
    record.department,
    record.position,
    record.date,
    record.schedule,
    record.scheduledIn,
    record.scheduledOut,
    record.actualIn,
    record.actualOut,
    record.controller,
    record.statusIn,
    record.statusOut,
    record.sourceIssue,
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
};

// Export to XLSX
export const exportToXLSX = (
  records: AttendanceExportSource[],
  filename: string = 'attendance_records'
): void => {
  const normalized = normalizeAttendanceExportRows(records);
  const withCompany = hasCompanyColumn(normalized);
  const data = normalized.map((record) => ({
    'Employee ID': record.employeeId,
    Name: record.employeeName,
    ...(withCompany ? { Company: record.company } : {}),
    Department: record.department,
    Position: record.position,
    Date: record.date,
    Schedule: record.schedule,
    'Scheduled In': record.scheduledIn,
    'Scheduled Out': record.scheduledOut,
    'Actual In': record.actualIn,
    'Actual Out': record.actualOut,
    Controller: record.controller,
    'Status In': record.statusIn,
    'Status Out': record.statusOut,
    'Source Issue': record.sourceIssue,
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Records');

  // Set column widths
  const colWidths = [
    { wch: 14 }, // Employee ID
    { wch: 20 }, // Name
    ...(withCompany ? [{ wch: 28 }] : []), // Company
    { wch: 15 }, // Department
    { wch: 15 }, // Position
    { wch: 12 }, // Date
    { wch: 15 }, // Schedule
    { wch: 12 }, // Scheduled In
    { wch: 12 }, // Scheduled Out
    { wch: 12 }, // Actual In
    { wch: 12 }, // Actual Out
    { wch: 15 }, // Controller
    { wch: 10 }, // Status In
    { wch: 10 }, // Status Out
    { wch: 18 }, // Source Issue
  ];
  worksheet['!cols'] = colWidths;

  XLSX.writeFile(workbook, `${filename}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
};

export const exportSchedulingEmployeesToXLSX = (
  employees: SchedulingEmployee[],
  filename: string = 'employee_schedules'
): void => {
  const data = employees.map((emp) => ({
    'Employee ID': emp.employeeId,
    Name: emp.name,
    Gender: emp.gender,
    Division: emp.division,
    Department: emp.department,
    Section: emp.section,
    'Supervisor ID': emp.supervisorId,
    'Supervisor Name': emp.supervisorName,
    'Position Title': emp.positionTitle,
    'Grade Interval': emp.gradeInterval,
    Phone: emp.phone,
    'Day Type': emp.dayType,
    Description: emp.description,
    'Time In': emp.timeIn,
    'Time Out': emp.timeOut,
    'Next Day': emp.nextDay ? 'Yes' : 'No',
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Employee Schedules');

  worksheet['!cols'] = [
    { wch: 14 },
    { wch: 22 },
    { wch: 10 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 14 },
    { wch: 22 },
    { wch: 20 },
    { wch: 14 },
    { wch: 16 },
    { wch: 14 },
    { wch: 28 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
  ];

  XLSX.writeFile(workbook, `${filename}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
};

// Export to PDF
export const exportToPDF = (
  records: AttendanceExportSource[],
  filename: string = 'attendance_records'
): void => {
  const doc = new jsPDF('l', 'mm', 'a4');
  const normalized = normalizeAttendanceExportRows(records);

  // Title
  doc.setFontSize(16);
  doc.text('Attendance Records Report', 14, 15);
  doc.setFontSize(10);
  doc.text(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 14, 22);

  const withCompany = hasCompanyColumn(normalized);
  // Headers and body are built from the same conditional shape; they used to
  // drift apart (the body carried Employee ID but the header row did not),
  // which shifted every column label one place to the left.
  const headers = [
    'Employee ID',
    'Name',
    ...(withCompany ? ['Company'] : []),
    'Department',
    'Date',
    'Schedule',
    'Actual In',
    'Actual Out',
    'Controller',
    'Status In',
    'Status Out',
    'Source Issue',
  ];

  const tableData = normalized.map((record) => [
    record.employeeId,
    record.employeeName,
    ...(withCompany ? [record.company] : []),
    record.department,
    record.date,
    record.schedule,
    record.actualIn,
    record.actualOut,
    record.controller,
    record.statusIn,
    record.statusOut,
    record.sourceIssue,
  ]);

  const statusColumns = [headers.indexOf('Status In'), headers.indexOf('Status Out')];
  const sourceIssueColumn = headers.indexOf('Source Issue');

  autoTable(doc, {
    head: [headers],
    body: tableData,
    startY: 28,
    styles: {
      fontSize: 7,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [30, 64, 175],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 247, 250],
    },
    didParseCell: (data) => {
      // Color status cells
      if (data.section === 'body') {
        if (statusColumns.includes(data.column.index)) {
          const value = data.cell.text[0]?.toLowerCase();
          if (value.includes('early')) {
            data.cell.styles.textColor = [217, 119, 6];
          } else if (value.includes('on time') || value.includes('ontime')) {
            data.cell.styles.textColor = [22, 163, 74];
          } else if (value.includes('late')) {
            data.cell.styles.textColor = [220, 38, 38];
          } else if (value.includes('missing') || value.includes('source issue')) {
            data.cell.styles.textColor = [107, 114, 128];
          }
        }
        if (data.column.index === sourceIssueColumn) {
          const value = data.cell.text[0]?.toLowerCase();
          if (value && value !== 'n/a') {
            data.cell.styles.textColor = [220, 38, 38];
          }
        }
      }
    },
  });

  doc.save(`${filename}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
};
