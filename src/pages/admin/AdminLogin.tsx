import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { useAppStore } from '@/lib/services/store';
import { loginLdap, loginLocal } from '@/lib/services/authApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Shield, Lock, User, Eye, EyeOff, Clock, Sun, Moon, Monitor, Activity, Users, CalendarCheck } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const AdminLogin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loginExternal, auth } = useAppStore();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [method, setMethod] = useState<'ad' | 'local'>('ad');
  const [showPassword, setShowPassword] = useState(false);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/admin';

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Redirect if already authenticated
  if (auth.isAuthenticated) {
    navigate(from, { replace: true });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (method === 'ad') {
        const result = await loginLdap(username, password);
        if (result.success) {
          loginExternal(username);
          toast({ title: 'Welcome back!', description: 'You have successfully signed in to the admin portal.' });
          navigate(from, { replace: true });
        }
      } else {
        const result = await loginLocal(username, password);
        if (result.success) {
          loginExternal(username);
          toast({ title: 'Signed in (Local)', description: 'You are signed in using local authentication.' });
          navigate(from, { replace: true });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication error';
      toast({ title: 'Authentication Failed', description: message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const ThemeToggle = () => (
    mounted ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="outline" 
            size="icon" 
            className="h-10 w-10 rounded-xl border-border/50 bg-card shadow-sm"
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
    ) : <div className="h-10 w-10" />
  );

  const stats = [
    { label: 'Active Employees', value: '248', icon: Users, color: 'bg-primary/10 text-primary' },
    { label: 'Today\'s Check-ins', value: '186', icon: CalendarCheck, color: 'bg-accent/10 text-accent' },
    { label: 'Attendance Rate', value: '94.2%', icon: Activity, color: 'bg-success/10 text-success' },
  ];

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Theme Toggle - Fixed Position */}
      <div className="fixed top-6 right-6 z-50">
        <ThemeToggle />
      </div>

      <div className="min-h-screen flex flex-col lg:flex-row">
        {/* Left Panel - Login Form */}
        <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-md space-y-8">
            {/* Logo & Branding */}
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25">
                  <Clock className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-foreground">AttendanceMS</h1>
                  <p className="text-xs text-muted-foreground">Enterprise Edition</p>
                </div>
              </div>
              
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tight text-foreground">
                  Welcome back! 👋
                </h2>
                <p className="text-muted-foreground">
                  Sign in to access your administration dashboard
                </p>
              </div>
            </div>

            {/* Login Card */}
            <Card className="border-0 shadow-xl shadow-primary/5 bg-card">
              <CardContent className="pt-6 pb-8 px-6">
                <form onSubmit={handleSubmit} className="space-y-5">
                  <Tabs value={method} onValueChange={(v) => setMethod(v as 'ad' | 'local')}>
                    <TabsList>
                      <TabsTrigger value="ad">Active Directory</TabsTrigger>
                      <TabsTrigger value="local">Local</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <div className="space-y-2">
                    <Label htmlFor="username" className="text-sm font-medium">
                      Username
                    </Label>
                    <div className="relative">
                      <div className="absolute left-0 top-0 bottom-0 w-12 flex items-center justify-center">
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                          <User className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                      <Input
                        id="username"
                        type="text"
                        placeholder="Enter your username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="pl-14 h-12 bg-muted/50 border-0 focus:bg-background focus:ring-2 focus:ring-primary/20 transition-all"
                        required
                        autoComplete="username"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium">
                      Password
                    </Label>
                    <div className="relative">
                      <div className="absolute left-0 top-0 bottom-0 w-12 flex items-center justify-center">
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                          <Lock className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-14 pr-12 h-12 bg-muted/50 border-0 focus:bg-background focus:ring-2 focus:ring-primary/20 transition-all"
                        required
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-12 text-base font-semibold rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all" 
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Signing in...
                      </span>
                    ) : (
                      method === 'ad' ? 'Sign In (AD)' : 'Sign In (Local)'
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Security Notice */}
            <div className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border/50">
              <div className="shrink-0">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Secure Access</p>
                <p className="text-xs text-muted-foreground">
                  Protected by enterprise-grade security
                </p>
              </div>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              © 2025 AttendanceMS. All rights reserved.
            </p>
          </div>
        </div>

        {/* Right Panel - Dashboard Preview */}
        <div className="hidden lg:flex lg:w-[55%] bg-gradient-to-br from-primary/5 via-background to-accent/5 p-12 items-center justify-center">
          <div className="w-full max-w-lg space-y-6">
            {/* Preview Header */}
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-foreground mb-2">
                Workforce Management Dashboard
              </h3>
              <p className="text-muted-foreground">
                Real-time insights into your organization's attendance
              </p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-4">
              {stats.map((stat, index) => (
                <Card key={index} className="border-0 shadow-lg shadow-primary/5 bg-card">
                  <CardContent className="p-4 text-center">
                    <div className={`w-10 h-10 rounded-xl ${stat.color} flex items-center justify-center mx-auto mb-3`}>
                      <stat.icon className="h-5 w-5" />
                    </div>
                    <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Chart Preview */}
            <Card className="border-0 shadow-lg shadow-primary/5 bg-card">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="font-semibold text-foreground">Weekly Overview</h4>
                    <p className="text-xs text-muted-foreground">Attendance trends</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary">+12.5%</p>
                    <p className="text-xs text-muted-foreground">vs last week</p>
                  </div>
                </div>
                
                {/* Fake Chart Bars */}
                <div className="flex items-end justify-between gap-2 h-32 pt-4">
                  {[65, 45, 80, 55, 90, 70, 85].map((height, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2">
                      <div 
                        className="w-full rounded-t-lg bg-gradient-to-t from-primary to-primary/60 transition-all duration-500"
                        style={{ height: `${height}%` }}
                      />
                      <span className="text-xs text-muted-foreground">
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Activity Preview */}
            <Card className="border-0 shadow-lg shadow-primary/5 bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-semibold">
                    ET
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-foreground">Hello, Admin!</p>
                    <p className="text-sm text-muted-foreground">Check your activities in this dashboard.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
