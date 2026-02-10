import { useEffect, useMemo, useState, Fragment } from "react";
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
import { ScheduleBadge } from "@/components/ScheduleBadge";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUpDown, Search } from "lucide-react";
import { fetchSchedulingEmployees, SchedulingEmployee } from "@/lib/services/schedulingApi";
import { useLocation } from "react-router-dom";

function normalizeTime(s: string): string {
  if (!s) return "";
  const iso = s.match(/T(\d{2}):(\d{2})/);
  if (iso) return `${iso[1]}:${iso[2]}`;
  const plain = s.match(/^(\d{1,2}):(\d{2})/);
  if (plain) return `${plain[1].padStart(2, "0")}:${plain[2]}`;
  return s;
}

export const SchedulingDBTable = () => {
  const [data, setData] = useState<SchedulingEmployee[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState<string>("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [divisionFilter, setDivisionFilter] = useState<string>("all");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [dayTypeFilter, setDayTypeFilter] = useState<string>("all");
  const [timeInFilter, setTimeInFilter] = useState<string>("");
  const [timeOutFilter, setTimeOutFilter] = useState<string>("");
  const [nextDayFilter, setNextDayFilter] = useState<string>("");

  const location = useLocation();
  useEffect(() => {
    const qs = new URLSearchParams(location.search);
    const descriptionParam = qs.get("description") || "";
    const timeInParam = qs.get("timeIn") || "";
    const timeOutParam = qs.get("timeOut") || "";
    const nextDayParam = qs.get("nextDay") || "";
    if (descriptionParam) setDayTypeFilter(descriptionParam);
    if (timeInParam) setTimeInFilter(timeInParam);
    if (timeOutParam) setTimeOutFilter(timeOutParam);
    if (nextDayParam) setNextDayFilter(nextDayParam);
  }, [location.search]);

  useEffect(() => {
    setLoading(true);
    const param = dayTypeFilter !== "all" ? { description: dayTypeFilter } : undefined;
    fetchSchedulingEmployees(param)
      .then((rows) => {
        const mapped = rows.map((r) => ({
          ...r,
          timeIn: normalizeTime(r.timeIn),
          timeOut: normalizeTime(r.timeOut),
        }));
        setData(mapped);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Unknown error"))
      .finally(() => setLoading(false));
  }, [dayTypeFilter]);

  const departments = useMemo(() => Array.from(new Set(data.map((e) => e.department))).filter(Boolean).sort(), [data]);
  const divisions = useMemo(() => Array.from(new Set(data.map((e) => e.division))).filter(Boolean).sort(), [data]);
  const sections = useMemo(() => Array.from(new Set(data.map((e) => e.section))).filter(Boolean).sort(), [data]);
  const dayTypes = useMemo(() => Array.from(new Set(data.map((e) => e.description))).filter(Boolean).sort(), [data]);
  const timesIn = useMemo(() => Array.from(new Set(data.map((e) => e.timeIn))).filter(Boolean).sort(), [data]);
  const timesOut = useMemo(() => Array.from(new Set(data.map((e) => e.timeOut))).filter(Boolean).sort(), [data]);

  function renderColumnFilter(columnId: string) {
    const col = table.getColumn(columnId);
    if (!col || !col.getCanFilter()) return null;
    if (columnId === "employeeId" || columnId === "name") {
      const valRaw = col.getFilterValue() as unknown;
      const val = typeof valRaw === "string" ? valRaw : "";
      return (
        <Input
          placeholder={columnId === "employeeId" ? "ID…" : "Name…"}
          value={val}
          onChange={(e) => col.setFilterValue(e.target.value)}
          className="h-8"
        />
      );
    }
    if (columnId === "department") {
      const valRaw = col.getFilterValue() as unknown;
      const val = typeof valRaw === "string" ? valRaw : "";
      return (
        <Select value={val || "all"} onValueChange={(v) => col.setFilterValue(v === "all" ? undefined : v)}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {departments.map((dept) => (
              <SelectItem key={dept} value={dept}>{dept}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (columnId === "division") {
      const valRaw = col.getFilterValue() as unknown;
      const val = typeof valRaw === "string" ? valRaw : "";
      return (
        <Select value={val || "all"} onValueChange={(v) => col.setFilterValue(v === "all" ? undefined : v)}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {divisions.map((div) => (
              <SelectItem key={div} value={div}>{div}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (columnId === "section") {
      const valRaw = col.getFilterValue() as unknown;
      const val = typeof valRaw === "string" ? valRaw : "";
      return (
        <Select value={val || "all"} onValueChange={(v) => col.setFilterValue(v === "all" ? undefined : v)}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {sections.map((sec) => (
              <SelectItem key={sec} value={sec}>{sec}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (columnId === "dayType") {
      const valRaw = col.getFilterValue() as unknown;
      const val = typeof valRaw === "string" ? valRaw : "";
      return (
        <Select value={val || "all"} onValueChange={(v) => col.setFilterValue(v === "all" ? undefined : v)}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {dayTypes.map((dt) => (
              <SelectItem key={dt} value={dt}>{dt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (columnId === "timeIn") {
      const valRaw = col.getFilterValue() as unknown;
      const val = typeof valRaw === "string" ? valRaw : "";
      return (
        <Select value={val || "all"} onValueChange={(v) => col.setFilterValue(v === "all" ? undefined : v)}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {timesIn.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (columnId === "timeOut") {
      const valRaw = col.getFilterValue() as unknown;
      const val = typeof valRaw === "string" ? valRaw : "";
      return (
        <Select value={val || "all"} onValueChange={(v) => col.setFilterValue(v === "all" ? undefined : v)}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {timesOut.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (columnId === "schedule") {
      const valRaw = col.getFilterValue() as unknown;
      const val = typeof valRaw === "string" ? valRaw : "";
      return (
        <Select value={val || "all"} onValueChange={(v) => col.setFilterValue(v === "all" ? undefined : v)}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="overnight">Overnight</SelectItem>
            <SelectItem value="day">Day Only</SelectItem>
          </SelectContent>
        </Select>
      );
    }
    return null;
  }

  const filteredData = useMemo(() => {
    return data.filter((emp) => {
      const matchesDepartment = departmentFilter === "all" || emp.department === departmentFilter;
      const matchesDivision = divisionFilter === "all" || emp.division === divisionFilter;
      const matchesSection = sectionFilter === "all" || emp.section === sectionFilter;
      const matchesDayType = dayTypeFilter === "all" || emp.description === dayTypeFilter;
      const matchesTimeIn = !timeInFilter || emp.timeIn === normalizeTime(timeInFilter);
      const matchesTimeOut = !timeOutFilter || emp.timeOut === normalizeTime(timeOutFilter);
      const matchesNextDay = !nextDayFilter || emp.nextDay === (nextDayFilter === "true" || nextDayFilter === "1");
      const matchesSearch =
        globalFilter === "" ||
        emp.name.toLowerCase().includes(globalFilter.toLowerCase()) ||
        emp.employeeId.toLowerCase().includes(globalFilter.toLowerCase());

      return matchesDepartment && matchesDivision && matchesSection && matchesDayType && matchesTimeIn && matchesTimeOut && matchesNextDay && matchesSearch;
    });
  }, [data, departmentFilter, divisionFilter, sectionFilter, dayTypeFilter, timeInFilter, timeOutFilter, nextDayFilter, globalFilter]);

  const columns: ColumnDef<SchedulingEmployee>[] = [
    {
      accessorKey: "employeeId",
      header: "Employee ID",
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.employeeId}</span>,
    },
    {
      accessorKey: "name",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="p-0 hover:bg-transparent">
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.name}</div>
          <div className="text-xs text-muted-foreground">{row.original.positionTitle}</div>
        </div>
      ),
    },
    { accessorKey: "department", header: "Department" },
    { accessorKey: "division", header: "Division" },
    { accessorKey: "section", header: "Section" },
    {
      id: "dayType",
      header: "Day Type",
      cell: ({ row }) => <span className="text-sm">{row.original.description || "—"}</span>,
    },
    {
      id: "timeIn",
      header: "Time In",
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.timeIn || "—"}</span>,
    },
    {
      id: "timeOut",
      header: "Time Out",
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.timeOut || "—"}</span>,
    },
    {
      id: "schedule",
      header: "Schedule",
      filterFn: (row, _id, value) => {
        if (!value) return true;
        if (value === "overnight") return row.original.nextDay === true;
        if (value === "day") return row.original.nextDay === false;
        return true;
      },
      cell: ({ row }) => (
        row.original.timeIn || row.original.timeOut ? (
          <ScheduleBadge timeIn={row.original.timeIn} timeOut={row.original.timeOut} isOvernight={row.original.nextDay} label={row.original.description} />
        ) : (
          <span className="text-muted-foreground">Not Assigned</span>
        )
      ),
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
    return <div className="p-4 text-muted-foreground">Loading scheduling data…</div>;
  }
  if (error) {
    return <div className="p-4 text-destructive">Error: {error}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="filter-bar rounded-t-lg">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or ID…" value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} className="pl-10" />
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

        <Select value={divisionFilter} onValueChange={setDivisionFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Divisions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Divisions</SelectItem>
            {divisions.map((div) => (
              <SelectItem key={div} value={div}>{div}</SelectItem>
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
              <SelectItem key={sec} value={sec}>{sec}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={dayTypeFilter} onValueChange={setDayTypeFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Day Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Day Types</SelectItem>
            {dayTypes.map((dt) => (
              <SelectItem key={dt} value={dt}>{dt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="data-table-container">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <Fragment key={headerGroup.id}>
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="whitespace-nowrap">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
                <TableRow>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={`${header.id}-filter`}>
                      {renderColumnFilter(header.column.id)}
                    </TableHead>
                  ))}
                </TableRow>
              </Fragment>
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
