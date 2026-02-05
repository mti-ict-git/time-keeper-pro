import { AttendanceStatus, RecordValidity } from '@/lib/models';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: AttendanceStatus | RecordValidity;
  type?: 'status' | 'validity';
}

const statusConfig = {
  early: {
    label: 'Early',
    className: 'bg-warning/10 text-warning border-warning/20 hover:bg-warning/20',
  },
  ontime: {
    label: 'On Time',
    className: 'bg-success/10 text-success border-success/20 hover:bg-success/20',
  },
  late: {
    label: 'Late',
    className: 'bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20',
  },
  missing: {
    label: 'Missing',
    className: 'bg-muted text-muted-foreground border-muted-foreground/20 hover:bg-muted/80',
  },
  valid: {
    label: 'Valid',
    className: 'bg-success/10 text-success border-success/20 hover:bg-success/20',
  },
  invalid: {
    label: 'Invalid',
    className: 'bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20',
  },
};

export const StatusBadge = ({ status, type = 'status' }: StatusBadgeProps) => {
  const config = statusConfig[status];
  
  if (!config) return null;

  return (
    <Badge
      variant="outline"
      className={cn('font-medium capitalize', config.className)}
    >
      {config.label}
    </Badge>
  );
};
