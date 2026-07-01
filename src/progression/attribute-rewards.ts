export const SECONDARY_ATTRIBUTE_XP_RATIO = 0.5;

export function getSecondaryAttributeXp(primaryStatXp: number) {
  const safeXp = Number.isFinite(primaryStatXp) ? Math.max(0, Math.floor(primaryStatXp)) : 0;
  if (safeXp === 0) return 0;
  return Math.max(1, Math.floor(safeXp * SECONDARY_ATTRIBUTE_XP_RATIO));
}
