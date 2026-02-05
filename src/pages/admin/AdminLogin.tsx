import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppStore } from '@/lib/services/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Shield, Lock, User, Eye, EyeOff, Clock, Users, Building2 } from 'lucide-react';

const AdminLogin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, auth } = useAppStore();
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/admin';

  // Redirect if already authenticated
  if (auth.isAuthenticated) {
    navigate(from, { replace: true });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    const success = login(username, password);

    if (success) {
      toast({
        title: 'Welcome back!',
        description: 'You have successfully signed in to the admin portal.',
      });
      navigate(from, { replace: true });
    } else {
      toast({
        title: 'Authentication Failed',
        description: 'The credentials you entered are incorrect. Please try again.',
        variant: 'destructive',
      });
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary via-primary/90 to-primary/80 relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-0 w-96 h-96 bg-white/5 rounded-full -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-white/5 rounded-full translate-x-1/3 translate-y-1/3" />
          <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-white/5 rounded-full -translate-x-1/2 -translate-y-1/2" />
        </div>
        
        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-white/10 rounded-xl backdrop-blur-sm">
                <Clock className="h-8 w-8" />
              </div>
              <span className="text-2xl font-bold tracking-tight">AttendanceMS</span>
            </div>
            <p className="text-white/70 text-sm">Enterprise Workforce Management</p>
          </div>
          
          <div className="space-y-8">
            <div>
              <h1 className="text-4xl font-bold leading-tight mb-4">
                Streamline Your<br />
                Workforce Management
              </h1>
              <p className="text-white/80 text-lg max-w-md">
                A comprehensive solution for tracking attendance, managing schedules, 
                and ensuring operational excellence across your organization.
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-white/10 rounded-lg">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold">Employee Tracking</p>
                  <p className="text-sm text-white/60">Real-time attendance monitoring</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-white/10 rounded-lg">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold">Multi-Location</p>
                  <p className="text-sm text-white/60">Centralized control center</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="text-sm text-white/50">
            © 2025 AttendanceMS. Enterprise Edition v2.0
          </div>
        </div>
      </div>
      
      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-background">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-2">
              <div className="p-2 bg-primary/10 rounded-xl">
                <Clock className="h-6 w-6 text-primary" />
              </div>
              <span className="text-xl font-bold text-foreground">AttendanceMS</span>
            </div>
          </div>
          
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center justify-center lg:justify-start w-14 h-14 rounded-2xl bg-primary/10 mb-6">
              <Shield className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              Administrator Portal
            </h2>
            <p className="mt-2 text-muted-foreground">
              Enter your credentials to access the management console
            </p>
          </div>

          <Card className="border-0 shadow-xl bg-card/50 backdrop-blur-sm">
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-sm font-medium">
                    Username
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="username"
                      type="text"
                      placeholder="Enter your username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="pl-10 h-12 bg-background border-border/50 focus:border-primary transition-colors"
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
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10 h-12 bg-background border-border/50 focus:border-primary transition-colors"
                      required
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
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
                  className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all" 
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Authenticating...
                    </span>
                  ) : (
                    'Sign In'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border/50"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Security Notice
                </span>
              </div>
            </div>
            
            <div className="bg-muted/50 rounded-xl p-4 border border-border/50">
              <div className="flex gap-3">
                <div className="shrink-0 mt-0.5">
                  <div className="p-1.5 bg-destructive/10 rounded-lg">
                    <Shield className="h-4 w-4 text-destructive" />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Authorized Personnel Only
                  </p>
                  <p className="text-xs text-muted-foreground">
                    This system is for authorized administrators. All access attempts are logged and monitored.
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <p className="text-center text-xs text-muted-foreground lg:hidden">
            © 2025 AttendanceMS. Enterprise Edition
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
