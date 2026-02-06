import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '@/lib/services/store';
import { StatsCard } from '@/components/StatsCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Clock, Cpu, ClipboardList, Activity, Settings, ArrowRight, Shield } from 'lucide-react';

const AdminOverview = () => {
  const { employees, schedules, controllers, assignments, auditLogs } = useAppStore();

  const recentLogs = useMemo(() => {
    return auditLogs.slice(0, 5);
  }, [auditLogs]);

  const quickLinks = [
    { path: '/admin/employees', label: 'Manage Employees', icon: Users, count: employees.length, color: 'bg-primary/10 text-primary' },
    { path: '/admin/schedules', label: 'Manage Schedules', icon: Clock, count: schedules.length, color: 'bg-info/10 text-info' },
    { path: '/admin/controllers', label: 'Manage Controllers', icon: Cpu, count: controllers.length, color: 'bg-accent/10 text-accent' },
    { path: '/admin/rules', label: 'Attendance Rules', icon: Settings, color: 'bg-warning/10 text-warning' },
    { path: '/admin/audit', label: 'Audit Log', icon: Activity, count: auditLogs.length, color: 'bg-destructive/10 text-destructive' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Shield className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Admin Overview</h1>
          <p className="text-muted-foreground">Manage system configuration and view activity</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Employees" value={employees.length} icon={Users} variant="primary" />
        <StatsCard title="Schedules" value={schedules.length} icon={Clock} variant="info" />
        <StatsCard title="Controllers" value={controllers.length} icon={Cpu} variant="info" />
        <StatsCard title="Audit Entries" value={auditLogs.length} icon={Activity} variant="warning" />
      </div>

      {/* Quick Links */}
      <Card className="border-0 shadow-lg shadow-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">Quick Actions</CardTitle>
          <p className="text-sm text-muted-foreground">Navigate to management sections</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {quickLinks.map((link) => (
              <Link key={link.path} to={link.path}>
                <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 hover:bg-muted transition-all cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${link.color}`}>
                      <link.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{link.label}</p>
                      {link.count !== undefined && (
                        <p className="text-sm text-muted-foreground">{link.count} items</p>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card className="border-0 shadow-lg shadow-primary/5">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
            <p className="text-sm text-muted-foreground">Latest system changes and actions</p>
          </div>
          <Link to="/admin/audit">
            <Button variant="ghost" size="sm" className="rounded-lg">
              View All <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {recentLogs.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                <Activity className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">No recent activity</p>
              <p className="text-sm text-muted-foreground mt-1">Actions will appear here as they occur</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        log.action === 'create'
                          ? 'bg-success/10 text-success'
                          : log.action === 'delete'
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-warning/10 text-warning'
                      }`}
                    >
                      <Activity className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">
                        {log.action.charAt(0).toUpperCase() + log.action.slice(1)} {log.entityType}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        by {log.userId} • {new Date(log.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                      log.action === 'create'
                        ? 'bg-success/10 text-success'
                        : log.action === 'delete'
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-warning/10 text-warning'
                    }`}
                  >
                    {log.action}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminOverview;
