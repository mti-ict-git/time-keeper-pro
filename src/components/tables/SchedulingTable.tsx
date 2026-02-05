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
import { Employee, EmployeeScheduleAssignment, Schedule } from '@/lib/models';
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
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUpDown, Search } from 'lucide-react';

interface EmployeeWithSchedule extends Employee {
  schedule: Schedule | null;
  assignment: EmployeeScheduleAssignment | null;
}

export const SchedulingTable = () => {
  const { employees, schedules, assignments } = useAppStore();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [divisionFilter, setDivisionFilter] = useState<string>('all');
  const [sectionFilter, setSectionFilter] = useState<string>('all');

  // Build data with schedule info
  const data: EmployeeWithSchedule[] = useMemo(() => {
    return employees.map((emp) => {
      const assignment = assignments.find((a) => a.employeeId === emp.id);
      const schedule = assignment ? schedules.find((s) => s.id === assignment.scheduleId) || null : null;
      return { ...emp, schedule, assignment };
    });
  }, [employees, schedules, assignments]);

  // Get unique departments, divisions, sections
  const departments = useMemo(() => Array.from(new Set(data.map((e) => e.department))).sort(), [data]);
  const divisions = useMemo(() => Array.from(new Set(data.map((e) => e.division))).filter(Boolean).sort(), [data]);
  const sections = useMemo(() => Array.from(new Set(data.map((e) => e.section))).filter(Boolean).sort(), [data]);

  // Filter data
  const filteredData = useMemo(() => {
    return data.filter((emp) => {
      const matchesDepartment = departmentFilter === 'all' || emp.department === departmentFilter;
      const matchesDivision = divisionFilter === 'all' || emp.division === divisionFilter;
      const matchesSection = sectionFilter === 'all' || emp.section === sectionFilter;
      const matchesSearch =
        globalFilter === '' ||
        emp.name.toLowerCase().includes(globalFilter.toLowerCase()) ||
        emp.employeeId.toLowerCase().includes(globalFilter.toLowerCase());

      return matchesDepartment && matchesDivision && matchesSection && matchesSearch;
    });
  }, [data, departmentFilter, divisionFilter, sectionFilter, globalFilter]);

  const columns: ColumnDef<EmployeeWithSchedule>[] = [
    {
      accessorKey: 'employeeId',
      header: 'Employee ID',
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.employeeId}</span>,
    },
    {
      accessorKey: 'name',
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
          <div className="font-medium">{row.original.name}</div>
          <div className="text-xs text-muted-foreground">{row.original.position}</div>
        </div>
      ),
    },
    {
      accessorKey: 'department',
      header: 'Department',
    },
    {
      accessorKey: 'division',
      header: 'Division',
    },
    {
      accessorKey: 'section',
      header: 'Section',
    },
    {
      accessorKey: 'schedule',
      header: 'Day Type',
      cell: ({ row }) => {
        const schedule = row.original.schedule;
        if (!schedule) {
          return <span className="text-muted-foreground">Not Assigned</span>;
        }
        return (
          <ScheduleBadge
            timeIn={schedule.timeIn}
            timeOut={schedule.timeOut}
            isOvernight={schedule.isOvernight}
          />
        );
      },
    },
    {
      id: 'timeIn',
      header: 'Time In',
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.schedule?.timeIn || '—'}</span>
      ),
    },
    {
      id: 'timeOut',
      header: 'Time Out',
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.schedule?.timeOut || '—'}</span>
      ),
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
            placeholder="Search by name or ID..."
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

        <Select value={divisionFilter} onValueChange={setDivisionFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Divisions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Divisions</SelectItem>
            {divisions.map((div) => (
              <SelectItem key={div} value={div}>
                {div}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sectionFilter} onValueChange={setSectionFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Sections" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sections</SelectItem>
            {sections.map((sec) => (
              <SelectItem key={sec} value={sec}>
                {sec}
              </SelectItem>
            ))}
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
                  No employees found.
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
          of {filteredData.length} employees
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
