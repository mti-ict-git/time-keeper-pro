import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ScheduleBadgeProps {
  timeIn: string;
  timeOut: string;
  isOvernight?: boolean;
}

export const ScheduleBadge = ({ timeIn, timeOut, isOvernight }: ScheduleBadgeProps) => {
  return (
    <Badge
      variant="outline"
      className={cn(
        'font-mono text-xs',
        isOvernight
          ? 'bg-accent/10 text-accent border-accent/20'
          : 'bg-primary/5 text-primary border-primary/20'
      )}
    >
      {timeIn} - {timeOut}
    </Badge>
  );
};
