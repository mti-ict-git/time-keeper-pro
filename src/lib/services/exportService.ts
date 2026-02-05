import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ProcessedAttendanceRecord } from '../models';
import { format } from 'date-fns';

// Export to CSV
export const exportToCSV = (
  records: ProcessedAttendanceRecord[],
  filename: string = 'attendance_records'
): void => {
  const headers = [
    'Name',
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
    'Validity',
  ];

  const rows = records.map((record) => [
    record.employeeName,
    record.department,
    record.position,
    format(new Date(record.date), 'yyyy-MM-dd'),
    record.scheduleName,
    record.scheduledIn,
    record.scheduledOut,
    record.actualIn || 'N/A',
    record.actualOut || 'N/A',
    record.controllerName || 'N/A',
    record.statusIn,
    record.statusOut,
    record.validity,
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
  records: ProcessedAttendanceRecord[],
  filename: string = 'attendance_records'
): void => {
  const data = records.map((record) => ({
    Name: record.employeeName,
    Department: record.department,
    Position: record.position,
    Date: format(new Date(record.date), 'yyyy-MM-dd'),
    Schedule: record.scheduleName,
    'Scheduled In': record.scheduledIn,
    'Scheduled Out': record.scheduledOut,
    'Actual In': record.actualIn || 'N/A',
    'Actual Out': record.actualOut || 'N/A',
    Controller: record.controllerName || 'N/A',
    'Status In': record.statusIn,
    'Status Out': record.statusOut,
    Validity: record.validity,
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Records');

  // Set column widths
  const colWidths = [
    { wch: 20 }, // Name
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
    { wch: 10 }, // Validity
  ];
  worksheet['!cols'] = colWidths;

  XLSX.writeFile(workbook, `${filename}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
};

// Export to PDF
export const exportToPDF = (
  records: ProcessedAttendanceRecord[],
  filename: string = 'attendance_records'
): void => {
  const doc = new jsPDF('l', 'mm', 'a4');

  // Title
  doc.setFontSize(16);
  doc.text('Attendance Records Report', 14, 15);
  doc.setFontSize(10);
  doc.text(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 14, 22);

  const tableData = records.map((record) => [
    record.employeeName,
    record.department,
    format(new Date(record.date), 'yyyy-MM-dd'),
    record.scheduleName,
    record.scheduledIn,
    record.scheduledOut,
    record.actualIn || 'N/A',
    record.actualOut || 'N/A',
    record.statusIn,
    record.statusOut,
    record.validity,
  ]);

  autoTable(doc, {
    head: [
      [
        'Name',
        'Department',
        'Date',
        'Schedule',
        'Sched In',
        'Sched Out',
        'Actual In',
        'Actual Out',
        'Status In',
        'Status Out',
        'Validity',
      ],
    ],
    body: tableData,
    startY: 28,
    styles: {
      fontSize: 8,
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
        const statusColumns = [8, 9]; // Status In and Status Out columns
        if (statusColumns.includes(data.column.index)) {
          const value = data.cell.text[0]?.toLowerCase();
          if (value === 'early') {
            data.cell.styles.textColor = [217, 119, 6]; // Warning yellow
          } else if (value === 'ontime') {
            data.cell.styles.textColor = [22, 163, 74]; // Success green
          } else if (value === 'late') {
            data.cell.styles.textColor = [220, 38, 38]; // Destructive red
          } else if (value === 'missing') {
            data.cell.styles.textColor = [107, 114, 128]; // Muted gray
          }
        }
        // Validity column
        if (data.column.index === 10) {
          const value = data.cell.text[0]?.toLowerCase();
          if (value === 'valid') {
            data.cell.styles.textColor = [22, 163, 74];
          } else {
            data.cell.styles.textColor = [220, 38, 38];
          }
        }
      }
    },
  });

  doc.save(`${filename}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
};
