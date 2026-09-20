export function calculateEventDuration(startTime: string, endTime: string): number | null {
  if (!startTime || !endTime) return null;
  const [startHour, startMinute] = startTime.slice(0, 5).split(":").map(Number);
  const [endHour, endMinute] = endTime.slice(0, 5).split(":").map(Number);
  if ([startHour, startMinute, endHour, endMinute].some(Number.isNaN)) return null;
  const minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (minutes <= 0) return null;
  return Math.round((minutes / 60) * 100) / 100;
}

export function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(2).replace(/0$/, "");
}