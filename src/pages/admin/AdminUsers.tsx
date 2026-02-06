import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Search, Users, Plus } from "lucide-react";
import { listUsers, addUser, searchAdUsers, importAdUser, type UserRow } from "@/lib/services/usersApi";

const AdminUsers = () => {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("local");
  const [localForm, setLocalForm] = useState({ username: "", password: "", name: "", email: "", department: "" });
  const [adQuery, setAdQuery] = useState("");
  const [adResults, setAdResults] = useState<Array<{ dn: string; username: string; name: string; email: string }>>([]);
  const [adLoading, setAdLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    listUsers()
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  function pick(row: UserRow, keys: string[]): string {
    for (const k of keys) {
      const v = row[k];
      if (v !== undefined && v !== null) return String(v);
    }
    return "";
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const name = pick(r, ["name", "FullName", "UserName"]).toLowerCase();
      const id = pick(r, ["id", "UserID", "EmployeeID", "username", "UserName"]).toLowerCase();
      const dept = pick(r, ["department", "Department"]).toLowerCase();
      return name.includes(q) || id.includes(q) || dept.includes(q);
    });
  }, [rows, search]);

  async function refresh(): Promise<void> {
    setLoading(true);
    listUsers()
      .then(setRows)
      .finally(() => setLoading(false));
  }

  async function submitLocal(): Promise<void> {
    await addUser({ ...localForm, authType: "local" });
    setOpen(false);
    await refresh();
  }

  async function doAdSearch(): Promise<void> {
    setAdLoading(true);
    searchAdUsers(adQuery)
      .then(setAdResults)
      .finally(() => setAdLoading(false));
  }

  async function importAd(u: { dn: string; username: string; name: string; email: string }): Promise<void> {
    await importAdUser(u);
    setOpen(false);
    await refresh();
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">User Management</h1>
            <p className="text-sm text-muted-foreground">View and search system users</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add User
          </Button>
          <Button variant="outline" onClick={refresh} disabled={loading}>{loading ? "Loading..." : "Refresh"}</Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search users" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      <Card className="border-0 shadow-lg shadow-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="data-table-container">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{pick(r, ["UserID", "id", "EmployeeID", "username", "UserName"]) || ""}</TableCell>
                    <TableCell className="font-medium">{pick(r, ["name", "FullName", "UserName"]) || ""}</TableCell>
                    <TableCell>{pick(r, ["department", "Department"]) || ""}</TableCell>
                    <TableCell>{pick(r, ["email", "Email"]) || ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
          </DialogHeader>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="local">Local</TabsTrigger>
              <TabsTrigger value="ad">Active Directory</TabsTrigger>
            </TabsList>
            <TabsContent value="local" className="space-y-4">
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 md:col-span-6 space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input id="username" value={localForm.username} onChange={(e) => setLocalForm({ ...localForm, username: e.target.value })} />
                </div>
                <div className="col-span-12 md:col-span-6 space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" value={localForm.password} onChange={(e) => setLocalForm({ ...localForm, password: e.target.value })} />
                </div>
                <div className="col-span-12 md:col-span-6 space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={localForm.name} onChange={(e) => setLocalForm({ ...localForm, name: e.target.value })} />
                </div>
                <div className="col-span-12 md:col-span-6 space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={localForm.email} onChange={(e) => setLocalForm({ ...localForm, email: e.target.value })} />
                </div>
                <div className="col-span-12 md:col-span-6 space-y-2">
                  <Label htmlFor="department">Department</Label>
                  <Input id="department" value={localForm.department} onChange={(e) => setLocalForm({ ...localForm, department: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={submitLocal}>Add Local User</Button>
              </div>
            </TabsContent>
            <TabsContent value="ad" className="space-y-4">
              <div className="flex gap-2">
                <Input placeholder="Search AD users" value={adQuery} onChange={(e) => setAdQuery(e.target.value)} />
                <Button onClick={doAdSearch} disabled={adLoading}>{adLoading ? "Searching..." : "Search"}</Button>
              </div>
              <div className="data-table-container">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Username</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="w-[120px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adResults.map((u, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{u.username}</TableCell>
                        <TableCell>{u.name}</TableCell>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => importAd(u)}>Add</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsers;
