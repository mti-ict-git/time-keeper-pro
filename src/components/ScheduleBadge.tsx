import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { scheduleClass } from '@/lib/utils/scheduleColors';

interface ScheduleBadgeProps {
  timeIn: string;
  timeOut: string;
  isOvernight?: boolean;
  label?: string;
}

export const ScheduleBadge = ({ timeIn, timeOut, isOvernight, label }: ScheduleBadgeProps) => {
  const cls = scheduleClass(label, timeIn, timeOut, isOvernight);
  const raw = (label || '').trim();
  const normalized = raw.replace(/[–—−]/g, '-');
  const m = normalized.match(/^\s*\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\s*(.*)$/);
  const textLabel = m ? m[1].trim() : raw;
  const text = textLabel || `${timeIn}${timeIn && timeOut ? ' - ' : ''}${timeOut}`;
  return (
    <Badge variant="outline" className={cn(textLabel ? 'text-xs' : 'font-mono text-xs', cls)}>
      {text}
    </Badge>
  );
};
