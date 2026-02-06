import { useEffect, useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  ColumnDef,
  SortingState,
  flexRender,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUpDown, Search, Calendar } from "lucide-react";
import { AttendanceReportRow, fetchAttendanceReport } from "@/lib/services/attendanceApi";
import { Badge } from "@/components/ui/badge";
import { ScheduleBadge } from "@/components/ScheduleBadge";
import { format as formatDate } from "date-fns";

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function pick(row: AttendanceReportRow, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null) return asText(v);
  }
  return "";
}

export const AttendanceDBTable = () => {
  const [data, setData] = useState<AttendanceReportRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(globalFilter), 300);
    return () => clearTimeout(handle);
  }, [globalFilter]);

  useEffect(() => {
    const q = debouncedSearch.trim();
    const staffPattern = /^MTI\d{6}$/;
    const employeeIdParam = staffPattern.test(q) ? q : undefined;
    const searchParam = q.length >= 3 && !employeeIdParam ? q : undefined;
    setLoading(true);
    fetchAttendanceReport({
      from: dateFrom || undefined,
      to: dateTo || undefined,
      search: searchParam,
      employeeId: employeeIdParam,
      department: departmentFilter !== "all" ? departmentFilter : undefined,
      limit: searchParam || employeeIdParam ? 500 : undefined,
    })
      .then((rows) => setData(rows))
      .catch((e) => setError(e instanceof Error ? e.message : "Unknown error"))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo, debouncedSearch, departmentFilter]);

  const departments = useMemo(() => Array.from(new Set(data.map((r) => pick(r, ["department", "dept"])))).filter(Boolean).sort(), [data]);

  const filteredData = useMemo(() => {
    return data.filter((row) => {
      const department = pick(row, ["department", "dept"]);
      const matchesDepartment = departmentFilter === "all" || department === departmentFilter;
      return matchesDepartment;
    });
  }, [data, departmentFilter]);

  const columns: ColumnDef<AttendanceReportRow>[] = [
    {
      id: "employeeId",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="p-0 hover:bg-transparent">
          Employee ID
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="font-mono text-xs">
          {pick(row.original, ["employee_id", "employeeid", "StaffNo", "EmpID", "emp_id", "empid"]) || "—"}
        </span>
      ),
    },
    {
      id: "employeeName",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="p-0 hover:bg-transparent">
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <span className="text-sm font-medium break-words whitespace-normal">{pick(row.original, ["employee_name", "name"]) || "—"}</span>,
    },
    { id: "department", header: "Department", cell: ({ row }) => <span className="text-xs break-words whitespace-normal">{pick(row.original, ["department", "dept"]) || "—"}</span> },
    { id: "position", header: "Position", cell: ({ row }) => <span className="text-xs break-words whitespace-normal">{pick(row.original, ["position_title", "position", "Title"]) || "N/A"}</span> },
    {
      id: "date",
      header: "Date",
      cell: ({ row }) => {
        const d = pick(row.original, ["date", "attendance_date", "record_date"]);
        return <span className="font-mono text-xs">{d ? formatDate(new Date(`${d}T00:00:00`), "dd MMM yyyy") : "—"}</span>;
      },
    },
    {
      id: "schedule",
      header: "Schedule",
      cell: ({ row }) => {
        const label = pick(row.original, ["schedule_label"]);
        const ti = pick(row.original, ["scheduled_in"]);
        const to = pick(row.original, ["scheduled_out"]);
        if (!ti && !to && !label) return <span className="text-muted-foreground">N/A</span>;
        return (
          <div className="inline-block w-fit whitespace-nowrap">
            <ScheduleBadge timeIn={ti || ""} timeOut={to || ""} label={label || undefined} />
          </div>
        );
      },
    },
    { id: "scheduled_in", header: "C IN (Schedule)", cell: ({ row }) => <span className="font-mono text-xs">{pick(row.original, ["scheduled_in"]) || "N/A"}</span> },
    { id: "scheduled_out", header: "C OUT (Schedule)", cell: ({ row }) => <span className="font-mono text-xs">{pick(row.original, ["scheduled_out"]) || "N/A"}</span> },
    { id: "actual_in", header: "Actual C IN", cell: ({ row }) => <span className="font-mono text-xs">{pick(row.original, ["actual_in"]) || "N/A"}</span> },
    { id: "actual_out", header: "Actual C OUT", cell: ({ row }) => <span className="font-mono text-xs">{pick(row.original, ["actual_out"]) || "N/A"}</span> },
    {
      id: "controller",
      header: "Controller",
      cell: ({ row }) => {
        const ctrlIn = pick(row.original, ["controller_in"]);
        const ctrlOut = pick(row.original, ["controller_out"]);
        if (ctrlIn && ctrlOut && ctrlIn !== ctrlOut) {
          return (
            <div className="text-sm">
              <div>{ctrlIn}</div>
              <div>{ctrlOut}</div>
            </div>
          );
        }
        const value = ctrlIn || ctrlOut;
        return <span className="text-xs break-words whitespace-normal max-w-[180px]">{value || "—"}</span>;
      },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => {
        const sin = pick(row.original, ["status_in", "statusin"]);
        const sout = pick(row.original, ["status_out", "statusout"]);
        const style = (s: string) => {
          const v = s.toLowerCase();
          if (v.includes("missing")) return "bg-warning/10 text-warning";
          if (v.includes("late")) return "bg-destructive/10 text-destructive";
          if (v.includes("early")) return "bg-success/10 text-success";
          if (v.includes("on time") || v.includes("ontime")) return "bg-info/10 text-info";
          return "bg-muted/50";
        };
        return (
          <div className="space-y-1">
            <Badge variant="outline" className={`text-xs ${style(sin)}`}>{sin ? `IN: ${sin}` : "IN: N/A"}</Badge>
            <Badge variant="outline" className={`text-xs ${style(sout)}`}>{sout ? `OUT: ${sout}` : "OUT: N/A"}</Badge>
          </div>
        );
      },
    },
  ];

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  if (loading) {
    return <div className="p-4 text-muted-foreground">Loading attendance report…</div>;
  }
  if (error) {
    return <div className="p-4 text-destructive">Error: {error}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="filter-bar rounded-t-lg">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or ID…"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setDebouncedSearch(globalFilter);
              }}
              className="pl-10"
            />
          </div>
          <Button onClick={() => setDebouncedSearch(globalFilter)}>Search</Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[160px]" />
            <span className="text-sm text-muted-foreground">to</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[160px]" />
          </div>

          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map((dept) => (
                <SelectItem key={dept} value={dept}>{dept}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="data-table-container">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="text-xs">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
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
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end gap-2 px-4 pb-4">
        <div className="text-sm text-muted-foreground">
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
