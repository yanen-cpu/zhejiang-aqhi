export const CITIES = [
  "杭州", "宁波", "温州", "嘉兴", "湖州",
  "绍兴", "金华", "衢州", "舟山", "台州", "丽水",
] as const;

export type City = typeof CITIES[number];

export const TZ_OFFSET_MINUTES = 8 * 60; // Asia/Shanghai (no DST)

export function shanghaiNow(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + TZ_OFFSET_MINUTES * 60000);
}

export function floorToHour(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), 0, 0, 0);
}

export function hourEpoch(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}
