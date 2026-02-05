import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: number | string;
  description?: string;
  icon?: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'destructive' | 'info';
  className?: string;
}

const iconContainerStyles = {
  default: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
  info: 'bg-info/10 text-info',
};

export const StatsCard = ({
  title,
  value,
  description,
  icon: Icon,
  trend,
  variant = 'default',
  className,
}: StatsCardProps) => {
  return (
    <Card className={cn(
      'border-0 shadow-lg shadow-primary/5 bg-card transition-all hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-0.5',
      className
    )}>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          {Icon && (
            <div className={cn(
              'shrink-0 w-12 h-12 rounded-xl flex items-center justify-center',
              iconContainerStyles[variant]
            )}>
              <Icon className="h-6 w-6" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-muted-foreground truncate">{title}</p>
            <div className="flex items-baseline gap-2 mt-1">
              <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
              {trend && (
                <span
                  className={cn(
                    'text-xs font-semibold px-1.5 py-0.5 rounded',
                    trend.isPositive 
                      ? 'bg-success/10 text-success' 
                      : 'bg-destructive/10 text-destructive'
                  )}
                >
                  {trend.isPositive ? '+' : ''}{trend.value}%
                </span>
              )}
            </div>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};