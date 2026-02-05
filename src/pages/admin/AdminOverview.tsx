import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '@/lib/services/store';
import { StatsCard } from '@/components/StatsCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Clock, Cpu, ClipboardList, Activity, Settings, ArrowRight } from 'lucide-react';

const AdminOverview = () => {
  const { employees, schedules, controllers, assignments, auditLogs } = useAppStore();

  const recentLogs = useMemo(() => {
    return auditLogs.slice(0, 5);
  }, [auditLogs]);

  const quickLinks = [
    { path: '/admin/employees', label: 'Manage Employees', icon: Users, count: employees.length },
    { path: '/admin/schedules', label: 'Manage Schedules', icon: Clock, count: schedules.length },
    { path: '/admin/controllers', label: 'Manage Controllers', icon: Cpu, count: controllers.length },
    { path: '/admin/assignments', label: 'Manage Assignments', icon: ClipboardList, count: assignments.length },
    { path: '/admin/rules', label: 'Attendance Rules', icon: Settings },
    { path: '/admin/audit', label: 'Audit Log', icon: Activity, count: auditLogs.length },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Overview</h1>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {quickLinks.map((link) => (
          <Link key={link.path} to={link.path}>
            <Card className="transition-all hover:shadow-md hover:border-primary/30 cursor-pointer group">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      <link.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">{link.label}</p>
                      {link.count !== undefined && (
                        <p className="text-sm text-muted-foreground">{link.count} items</p>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Recent Activity</CardTitle>
          <Link to="/admin/audit">
            <Button variant="ghost" size="sm">
              View All <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {recentLogs.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No recent activity</p>
          ) : (
            <div className="space-y-3">
              {recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        log.action === 'create'
                          ? 'bg-success'
                          : log.action === 'delete'
                          ? 'bg-destructive'
                          : 'bg-warning'
                      }`}
                    />
                    <div>
                      <p className="text-sm font-medium">
                        {log.action.charAt(0).toUpperCase() + log.action.slice(1)} {log.entityType}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        by {log.userId} • {new Date(log.timestamp).toLocaleString()}
                      </p>
                    </div>
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
