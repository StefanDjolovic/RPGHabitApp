import type { HabitAttribute } from '@/src/database/habit-repository';

export const ATTRIBUTE_BASE_XP = 10;
export const ATTRIBUTE_XP_STEP = 5;

export type AttributeProgression = {
  naturalPoints: number;
  totalXp: number;
  xpIntoPoint: number;
  xpForNextPoint: number;
  progressRatio: number;
};

export function xpRequiredForNextAttributePoint(naturalPoints: number) {
  const safePoints = Number.isFinite(naturalPoints)
    ? Math.max(0, Math.floor(naturalPoints))
    : 0;
  return ATTRIBUTE_BASE_XP + safePoints * ATTRIBUTE_XP_STEP;
}

export function getAttributeProgression(totalXp: number): AttributeProgression {
  const safeTotalXp = Number.isFinite(totalXp) ? Math.max(0, Math.floor(totalXp)) : 0;
  let naturalPoints = 0;
  let xpIntoPoint = safeTotalXp;
  let xpForNextPoint = xpRequiredForNextAttributePoint(naturalPoints);

  while (xpIntoPoint >= xpForNextPoint) {
    xpIntoPoint -= xpForNextPoint;
    naturalPoints += 1;
    xpForNextPoint = xpRequiredForNextAttributePoint(naturalPoints);
  }

  return {
    naturalPoints,
    totalXp: safeTotalXp,
    xpIntoPoint,
    xpForNextPoint,
    progressRatio: xpForNextPoint > 0 ? xpIntoPoint / xpForNextPoint : 0,
  };
}

export function getAttributeProgressionMap(
  attributeXp: Record<HabitAttribute, number>,
): Record<HabitAttribute, AttributeProgression> {
  return {
    strength: getAttributeProgression(attributeXp.strength),
    intelligence: getAttributeProgression(attributeXp.intelligence),
    discipline: getAttributeProgression(attributeXp.discipline),
    vitality: getAttributeProgression(attributeXp.vitality),
    creativity: getAttributeProgression(attributeXp.creativity),
  };
}
