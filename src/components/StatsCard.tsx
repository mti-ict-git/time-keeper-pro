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
  default: 'bg-slate-900/[0.04] text-foreground',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
  info: 'bg-info/10 text-info',
};

const accentStyles = {
  default: 'before:bg-foreground/25',
  primary: 'before:bg-primary',
  success: 'before:bg-success',
  warning: 'before:bg-warning',
  destructive: 'before:bg-destructive',
  info: 'before:bg-info',
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
      'relative overflow-hidden border border-border/80 bg-card/95 shadow-[0_20px_45px_-32px_rgba(15,23,42,0.45)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_28px_55px_-34px_rgba(15,23,42,0.55)] before:absolute before:inset-x-0 before:top-0 before:h-1',
      accentStyles[variant],
      className
    )}>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          {Icon && (
            <div className={cn(
              'shrink-0 flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60',
              iconContainerStyles[variant]
            )}>
              <Icon className="h-6 w-6" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/90">{title}</p>
            <div className="flex items-baseline gap-2 mt-1">
              <p className="text-3xl font-semibold tracking-[-0.04em] text-foreground">{value}</p>
              {trend && (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-semibold',
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
              <p className="mt-2 text-sm leading-5 text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
