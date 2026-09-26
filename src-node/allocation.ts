import { UserCategory, SpaceType, SpaceStatus, ParkingSpace } from './types.js';
import { db } from './data.js';

const SUBSTITUTION_RULES: Record<SpaceType, SpaceType[]> = {
  [SpaceType.VIP]: [SpaceType.VIP, SpaceType.ABONNE, SpaceType.STANDARD],
  [SpaceType.PMR]: [SpaceType.PMR, SpaceType.STANDARD],
  [SpaceType.ABONNE]: [SpaceType.ABONNE, SpaceType.STANDARD],
  [SpaceType.STANDARD]: [SpaceType.STANDARD],
};

const CATEGORY_PREFERRED_SPACE: Record<UserCategory, SpaceType> = {
  [UserCategory.VIP]: SpaceType.VIP,
  [UserCategory.PMR]: SpaceType.PMR,
  [UserCategory.ABONNE]: SpaceType.ABONNE,
  [UserCategory.STANDARD]: SpaceType.STANDARD,
};

export function allocateSpace(category: UserCategory = UserCategory.STANDARD, preferredZone?: string): ParkingSpace {
  const preferredType = CATEGORY_PREFERRED_SPACE[category] || SpaceType.STANDARD;
  const preferences = SUBSTITUTION_RULES[preferredType] || [preferredType, SpaceType.STANDARD];

  const zone = preferredZone && preferredZone.trim().length > 0 ? preferredZone.trim().toUpperCase() : null;

  // 1. Check preferred zone first
  if (zone) {
    for (const type of preferences) {
      const candidate = db.spaces.find(
        s => s.zone.toUpperCase() === zone && s.type === type && s.status === SpaceStatus.LIBRE
      );
      if (candidate) {
        return candidate;
      }
    }
  }

  // 2. Check throughout parking
  for (const type of preferences) {
    const candidate = db.spaces.find(
      s => s.type === type && s.status === SpaceStatus.LIBRE
    );
    if (candidate) {
      return candidate;
    }
  }

  throw new Error(`Aucune place compatible disponible pour la catégorie ${category}${zone ? ` (zone ${zone})` : ''}`);
}
