import { TariffRule, SpaceType, VehicleType, UserCategory, VEHICLE_COEFFICIENTS } from './types.js';

export interface PricingResult {
  actualMinutes: number;
  billedMinutes: number;
  expectedMinutes: number;
  overstayMinutes: number;
  baseAmount: number;
  overstayAmount: number;
  discountAmount: number;
  total: number;
  tariffName: string;
  details: string;
}

export const PARKING_PROPERTIES = {
  name: 'Parking Central',
  currency: 'MGA',
  pricing: {
    defaultHourlyRate: 2000.0,
    minimumFee: 1000.0,
    dailyCap: 20000.0,
    freeMinutes: 15,
    billingIncrementMinutes: 15,
    overstayMultiplier: 1.5,
    subscriberDiscountPercent: 20.0,
    vipSurchargePercent: 25.0
  },
  subscriptionPricing: {
    JOURNALIER: 15000.0,
    HEBDOMADAIRE: 80000.0,
    MENSUEL: 250000.0,
    ANNUEL: 2400000.0
  }
};

function roundUp(value: number, increment: number): number {
  if (value <= 0) return 0;
  return Math.ceil(value / increment) * increment;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function computePricing(
  actualMinutes: number,
  expectedMinutes: number,
  rule: TariffRule | null,
  spaceType: SpaceType,
  vehicleType: VehicleType,
  category: UserCategory,
  subscriberValid: boolean
): PricingResult {
  const defaults = PARKING_PROPERTIES.pricing;
  const safeActual = Math.max(0, actualMinutes);
  const safeExpected = Math.max(0, expectedMinutes);

  const freeMinutes = rule?.freeMinutes ?? defaults.freeMinutes;
  const hourlyRate = rule?.hourlyRate ?? defaults.defaultHourlyRate;
  const minimumFee = rule?.minimumFee ?? defaults.minimumFee;
  const dailyCap = rule?.dailyCap ?? defaults.dailyCap;
  const overstayMultiplier = rule?.overstayMultiplier ?? defaults.overstayMultiplier;
  const discountPercent = rule?.subscriberDiscountPercent ?? defaults.subscriberDiscountPercent;
  const tariffName = rule?.name ?? 'Tarif général';

  const detailsArr: string[] = [];
  detailsArr.push(`Durée réelle : ${formatDuration(safeActual)}`);

  // 1. Gratuité
  if (safeActual <= freeMinutes) {
    detailsArr.push(`Durée inférieure à la franchise de ${freeMinutes} min : gratuit`);
    return {
      actualMinutes: safeActual,
      billedMinutes: 0,
      expectedMinutes: safeExpected,
      overstayMinutes: 0,
      baseAmount: 0,
      overstayAmount: 0,
      discountAmount: 0,
      total: 0,
      tariffName,
      details: detailsArr.join(' | ')
    };
  }

  // 2. Arrondi
  const chargeable = safeActual - freeMinutes;
  const increment = Math.max(1, defaults.billingIncrementMinutes);
  const billedMinutes = roundUp(chargeable, increment);
  detailsArr.push(`Franchise : ${freeMinutes} min`);
  detailsArr.push(`Durée facturée : ${formatDuration(billedMinutes)}`);

  // 3. Normal vs dépassement
  let normalMinutes = billedMinutes;
  let overstayMinutes = 0;
  if (safeExpected > 0 && safeActual > safeExpected) {
    const expectedChargeable = Math.max(0, safeExpected - freeMinutes);
    normalMinutes = Math.min(billedMinutes, roundUp(expectedChargeable, increment));
    overstayMinutes = billedMinutes - normalMinutes;
    detailsArr.push(`Durée prévue : ${formatDuration(safeExpected)}`);
    detailsArr.push(`Dépassement : ${formatDuration(overstayMinutes)}`);
  }

  // 4. Rate per minute weighted by vehicle coefficient
  const vehicleCoefficient = VEHICLE_COEFFICIENTS[vehicleType] ?? 1.0;
  const ratePerMinute = (hourlyRate * vehicleCoefficient) / 60.0;
  detailsArr.push(`Tarif horaire : ${hourlyRate} x coefficient ${vehicleCoefficient}`);

  let baseAmount = ratePerMinute * normalMinutes;

  // 5. VIP surcharge
  if (spaceType === SpaceType.VIP && defaults.vipSurchargePercent > 0) {
    const surcharge = (baseAmount * defaults.vipSurchargePercent) / 100.0;
    baseAmount += surcharge;
    detailsArr.push(`Majoration place VIP : ${defaults.vipSurchargePercent} %`);
  }

  // 6. Forfait journalier
  if (dailyCap && dailyCap > 0) {
    const days = Math.max(1, Math.ceil(roundUp(normalMinutes, 1440) / 1440));
    const cap = dailyCap * days;
    if (baseAmount > cap) {
      baseAmount = cap;
      detailsArr.push(`Forfait journalier appliqué : ${cap}`);
    }
  }

  // 7. Dépassement majoré
  const overstayAmount = ratePerMinute * overstayMinutes * overstayMultiplier;
  if (overstayMinutes > 0) {
    detailsArr.push(`Coefficient de dépassement : x${overstayMultiplier}`);
  }

  let subtotal = Math.round((baseAmount + overstayAmount) * 100) / 100;

  // 8. Tarif minimum
  if (minimumFee && subtotal < minimumFee) {
    subtotal = minimumFee;
    detailsArr.push(`Tarif minimum appliqué : ${minimumFee}`);
  }

  // 9. Réduction abonné
  let discountAmount = 0;
  if (subscriberValid && discountPercent > 0) {
    discountAmount = Math.round(((subtotal * discountPercent) / 100.0) * 100) / 100;
    detailsArr.push(`Réduction abonné : ${discountPercent} %`);
  } else if (category === UserCategory.ABONNE && discountPercent > 0) {
    discountAmount = Math.round(((subtotal * discountPercent) / 100.0) * 100) / 100;
    detailsArr.push(`Réduction catégorie abonné : ${discountPercent} %`);
  }

  const total = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);

  return {
    actualMinutes: safeActual,
    billedMinutes,
    expectedMinutes: safeExpected,
    overstayMinutes,
    baseAmount: Math.round(baseAmount * 100) / 100,
    overstayAmount: Math.round(overstayAmount * 100) / 100,
    discountAmount,
    total,
    tariffName,
    details: detailsArr.join(' | ')
  };
}
