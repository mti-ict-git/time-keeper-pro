export type ScheduleColor = 'primary' | 'accent' | 'success' | 'info' | 'warning' | 'destructive' | 'secondary';

function parseTime(v: string | undefined): number | null {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(mm)) return null;
  return h * 60 + mm;
}

export function scheduleColor(label?: string, timeIn?: string, timeOut?: string, nextDay?: boolean): ScheduleColor {
  const l = (label || '').toLowerCase();
  const ti = parseTime(timeIn);
  const to = parseTime(timeOut);
  const overnight = Boolean(nextDay) || (ti !== null && to !== null && to <= ti) || l.includes('malam') || l.includes('night');
  if (overnight) return 'accent';
  if (l.includes('morning') || l.includes('pagi')) return 'success';
  if (l.includes('afternoon') || l.includes('siang')) return 'info';
  if (l.includes('normal')) {
    if (ti !== null) {
      if (ti < 540) return 'success';
      if (ti < 960) return 'info';
      return 'primary';
    }
    return 'primary';
  }
  if (ti !== null) {
    if (ti < 540) return 'success';
    if (ti < 960) return 'info';
    return 'primary';
  }
  return 'secondary';
}

export function scheduleClass(label?: string, timeIn?: string, timeOut?: string, nextDay?: boolean): string {
  const color = scheduleColor(label, timeIn, timeOut, nextDay);
  const MAP: Record<ScheduleColor, string> = {
    accent: 'bg-accent/10 text-accent border-accent/20',
    success: 'bg-success/10 text-success border-success/20',
    info: 'bg-info/10 text-info border-info/20',
    primary: 'bg-primary/10 text-primary border-primary/20',
    destructive: 'bg-destructive/10 text-destructive border-destructive/20',
    warning: 'bg-warning/10 text-warning border-warning/20',
    secondary: 'bg-muted/50 text-muted-foreground',
  };
  return MAP[color];
}

