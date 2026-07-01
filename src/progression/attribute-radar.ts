import type { HabitAttribute } from '@/src/database/habit-repository';

export const RADAR_ATTRIBUTES: HabitAttribute[] = [
  'strength',
  'intelligence',
  'discipline',
  'vitality',
  'creativity',
];

export type RadarPoint = { x: number; y: number };

export function getRadarPoints(
  values: number[],
  radius: number,
  center: number,
  maximum = Math.max(1, ...values),
): RadarPoint[] {
  if (values.length === 0) return [];

  return values.map((value, index) => {
    const ratio = Math.min(1, Math.max(0, value / Math.max(1, maximum)));
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / values.length;

    return {
      x: center + Math.cos(angle) * radius * ratio,
      y: center + Math.sin(angle) * radius * ratio,
    };
  });
}
