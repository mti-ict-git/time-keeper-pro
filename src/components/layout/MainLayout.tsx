import { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/lib/services/store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LayoutDashboard,
  Calendar,
  FileText,
  Users,
  Clock,
  Settings,
  LogOut,
  Shield,
  Activity,
  Cpu,
  ClipboardList,
  Menu,
  X,
  Sun,
  Moon,
  Monitor,
  RefreshCcw,
} from 'lucide-react';

interface MainLayoutProps {
  children: ReactNode;
}

const publicNavItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/scheduling', label: 'Time Scheduling', icon: Calendar },
  { path: '/attendance', label: 'Attendance Records', icon: FileText },
];

const adminNavItems = [
  { path: '/admin', label: 'Admin Overview', icon: Shield },
  { path: '/admin/employees', label: 'Employees', icon: Users },
  { path: '/admin/schedules', label: 'Schedules', icon: Clock },
  { path: '/admin/assignments', label: 'Assignments', icon: ClipboardList },
  { path: '/admin/controllers', label: 'Controllers', icon: Cpu },
  { path: '/admin/rules', label: 'Attendance Rules', icon: Settings },
  { path: '/admin/audit', label: 'Audit Log', icon: Activity },
  { path: '/admin/sync', label: 'Sync', icon: RefreshCcw },
];

export const MainLayout = ({ children }: MainLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { auth, logout } = useAppStore();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isAdminRoute = location.pathname.startsWith('/admin');

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/dashboard');
  };

  const ThemeToggle = () => (
    mounted ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-9 w-9 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          >
            {theme === 'dark' ? (
              <Moon className="h-4 w-4" />
            ) : theme === 'light' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Monitor className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem onClick={() => setTheme('light')} className="gap-2 cursor-pointer">
            <Sun className="h-4 w-4" />
            Light
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme('dark')} className="gap-2 cursor-pointer">
            <Moon className="h-4 w-4" />
            Dark
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme('system')} className="gap-2 cursor-pointer">
            <Monitor className="h-4 w-4" />
            System
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : <div className="h-9 w-9" />
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-sidebar text-sidebar-foreground border-b border-sidebar-border">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Clock className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-lg">AttendanceHub</span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {publicNavItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                    location.pathname === item.path
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              ))}
              
              {auth.isAuthenticated && (
                <div className="ml-4 pl-4 border-l border-sidebar-border flex items-center gap-1">
                  <Link
                    to="/admin"
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                      isAdminRoute
                        ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                        : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                    )}
                  >
                    <Shield className="w-4 h-4" />
                    Admin
                  </Link>
                </div>
              )}
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-2">
              {/* Theme Toggle */}
              <ThemeToggle />

              {auth.isAuthenticated ? (
                <>
                  <Badge variant="outline" className="bg-primary/20 text-primary-foreground border-primary/30">
                    <Shield className="w-3 h-3 mr-1" />
                    Superadmin
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLogout}
                    className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </Button>
                </>
              ) : (
                <Link to="/admin/login">
                  <Button variant="ghost" size="sm" className="text-sidebar-foreground/70 hover:text-sidebar-foreground">
                    <Shield className="w-4 h-4 mr-2" />
                    Admin Login
                  </Button>
                </Link>
              )}

              {/* Mobile menu button */}
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden text-sidebar-foreground"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-sidebar-border">
            <nav className="container mx-auto px-4 py-4 flex flex-col gap-1">
              {publicNavItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-3 rounded-md text-sm font-medium transition-colors',
                    location.pathname === item.path
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              ))}
              {auth.isAuthenticated && (
                <>
                  <div className="my-2 border-t border-sidebar-border" />
                  {adminNavItems.map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        'flex items-center gap-2 px-4 py-3 rounded-md text-sm font-medium transition-colors',
                        location.pathname === item.path
                          ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                          : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                      )}
                    >
                      <item.icon className="w-4 h-4" />
                      {item.label}
                    </Link>
                  ))}
                </>
              )}
            </nav>
          </div>
        )}
      </header>

      {/* Admin Sidebar (desktop only) */}
      {auth.isAuthenticated && isAdminRoute && (
        <aside className="fixed left-0 top-16 bottom-0 w-64 bg-card border-r hidden lg:block overflow-y-auto">
          <nav className="p-4 flex flex-col gap-1">
            <p className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Administration
            </p>
            {adminNavItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                  location.pathname === item.path
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-muted'
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
      )}

      {/* Main Content */}
      <main
        className={cn(
          'container mx-auto px-4 py-6',
          auth.isAuthenticated && isAdminRoute && 'lg:ml-64 lg:max-w-[calc(100%-16rem)]'
        )}
      >
        {children}
      </main>
    </div>
  );
};
