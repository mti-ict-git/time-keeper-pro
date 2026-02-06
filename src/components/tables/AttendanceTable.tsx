import { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  ColumnDef,
  SortingState,
  flexRender,
} from '@tanstack/react-table';
import { useAppStore } from '@/lib/services/store';
import { ProcessedAttendanceRecord } from '@/lib/models';
import { StatusBadge } from '@/components/StatusBadge';
import { ScheduleBadge } from '@/components/ScheduleBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUpDown, Search } from 'lucide-react';

interface AttendanceTableProps {
  data: ProcessedAttendanceRecord[];
}

export const AttendanceTable = ({ data }: AttendanceTableProps) => {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [statusInFilter, setStatusInFilter] = useState<string>('all');
  const [statusOutFilter, setStatusOutFilter] = useState<string>('all');

  const { schedules } = useAppStore();

  // Get unique departments
  const departments = useMemo(() => {
    const depts = new Set(data.map((r) => r.department));
    return Array.from(depts).sort();
  }, [data]);

  // Filter data
  const filteredData = useMemo(() => {
    return data.filter((record) => {
      const matchesDepartment = departmentFilter === 'all' || record.department === departmentFilter;
      const matchesStatusIn = statusInFilter === 'all' || record.statusIn === statusInFilter;
      const matchesStatusOut = statusOutFilter === 'all' || record.statusOut === statusOutFilter;
      const matchesSearch =
        globalFilter === '' ||
        record.employeeName.toLowerCase().includes(globalFilter.toLowerCase()) ||
        record.department.toLowerCase().includes(globalFilter.toLowerCase());

      return matchesDepartment && matchesStatusIn && matchesStatusOut && matchesSearch;
    });
  }, [data, departmentFilter, statusInFilter, statusOutFilter, globalFilter]);

  const columns: ColumnDef<ProcessedAttendanceRecord>[] = [
    {
      accessorKey: 'employeeName',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="p-0 hover:bg-transparent"
        >
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.employeeName}</div>
          <div className="text-xs text-muted-foreground">{row.original.position}</div>
        </div>
      ),
    },
    {
      accessorKey: 'department',
      header: 'Department',
    },
    {
      accessorKey: 'date',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="p-0 hover:bg-transparent"
        >
          Date
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => format(new Date(row.original.date), 'yyyy-MM-dd'),
    },
    {
      accessorKey: 'scheduleName',
      header: 'Schedule',
      cell: ({ row }) => {
        const schedule = schedules.find((s) => s.id === row.original.scheduleId);
        return (
          <ScheduleBadge
            timeIn={row.original.scheduledIn}
            timeOut={row.original.scheduledOut}
            isOvernight={schedule?.isOvernight}
            label={row.original.scheduleName}
          />
        );
      },
    },
    {
      accessorKey: 'scheduledIn',
      header: 'C IN (Sched)',
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.scheduledIn}</span>,
    },
    {
      accessorKey: 'scheduledOut',
      header: 'C OUT (Sched)',
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.scheduledOut}</span>,
    },
    {
      accessorKey: 'actualIn',
      header: 'Actual C IN',
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.actualIn || '—'}</span>
      ),
    },
    {
      accessorKey: 'actualOut',
      header: 'Actual C OUT',
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.actualOut || '—'}</span>
      ),
    },
    {
      accessorKey: 'controllerName',
      header: 'Controller',
      cell: ({ row }) => row.original.controllerName || '—',
    },
    {
      accessorKey: 'statusIn',
      header: 'Status IN',
      cell: ({ row }) => <StatusBadge status={row.original.statusIn} />,
    },
    {
      accessorKey: 'statusOut',
      header: 'Status OUT',
      cell: ({ row }) => <StatusBadge status={row.original.statusOut} />,
    },
  ];

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="filter-bar rounded-t-lg">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map((dept) => (
              <SelectItem key={dept} value={dept}>
                {dept}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusInFilter} onValueChange={setStatusInFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status IN" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status IN</SelectItem>
            <SelectItem value="early">Early</SelectItem>
            <SelectItem value="ontime">On Time</SelectItem>
            <SelectItem value="late">Late</SelectItem>
            <SelectItem value="missing">Missing</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusOutFilter} onValueChange={setStatusOutFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status OUT" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status OUT</SelectItem>
            <SelectItem value="early">Early</SelectItem>
            <SelectItem value="ontime">On Time</SelectItem>
            <SelectItem value="late">Late</SelectItem>
            <SelectItem value="missing">Missing</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="data-table-container">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="whitespace-nowrap">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No records found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4">
        <div className="text-sm text-muted-foreground">
          Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to{' '}
          {Math.min(
            (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
            filteredData.length
          )}{' '}
          of {filteredData.length} records
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={String(table.getState().pagination.pageSize)}
            onValueChange={(value) => table.setPageSize(Number(value))}
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 / page</SelectItem>
              <SelectItem value="20">20 / page</SelectItem>
              <SelectItem value="50">50 / page</SelectItem>
              <SelectItem value="100">100 / page</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm px-3">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
