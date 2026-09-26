export enum Role {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  OPERATOR = 'OPERATOR',
  USER = 'USER'
}

export enum UserCategory {
  STANDARD = 'STANDARD',
  PMR = 'PMR',
  VIP = 'VIP',
  ABONNE = 'ABONNE'
}

export enum SpaceType {
  STANDARD = 'STANDARD',
  PMR = 'PMR',
  VIP = 'VIP',
  ABONNE = 'ABONNE'
}

export enum SpaceStatus {
  LIBRE = 'LIBRE',
  RESERVEE = 'RESERVEE',
  OCCUPEE = 'OCCUPEE',
  HORS_SERVICE = 'HORS_SERVICE'
}

export enum VehicleType {
  MOTO = 'MOTO',
  VOITURE = 'VOITURE',
  UTILITAIRE = 'UTILITAIRE',
  CAMION = 'CAMION',
  ELECTRIQUE = 'ELECTRIQUE'
}

export const VEHICLE_COEFFICIENTS: Record<VehicleType, number> = {
  [VehicleType.MOTO]: 0.60,
  [VehicleType.VOITURE]: 1.00,
  [VehicleType.UTILITAIRE]: 1.40,
  [VehicleType.CAMION]: 2.00,
  [VehicleType.ELECTRIQUE]: 0.90,
};

export const VEHICLE_LABELS: Record<VehicleType, string> = {
  [VehicleType.MOTO]: 'Moto',
  [VehicleType.VOITURE]: 'Voiture',
  [VehicleType.UTILITAIRE]: 'Utilitaire',
  [VehicleType.CAMION]: 'Camion',
  [VehicleType.ELECTRIQUE]: 'Électrique',
};

export const SPACE_TYPE_LABELS: Record<SpaceType, string> = {
  [SpaceType.STANDARD]: 'Standard',
  [SpaceType.PMR]: 'PMR',
  [SpaceType.VIP]: 'VIP',
  [SpaceType.ABONNE]: 'Abonné',
};

export const SPACE_STATUS_LABELS: Record<SpaceStatus, string> = {
  [SpaceStatus.LIBRE]: 'Libre',
  [SpaceStatus.RESERVEE]: 'Réservée',
  [SpaceStatus.OCCUPEE]: 'Occupée',
  [SpaceStatus.HORS_SERVICE]: 'Hors service',
};

export enum ReservationStatus {
  CONFIRMEE = 'CONFIRMEE',
  EN_COURS = 'EN_COURS',
  TERMINEE = 'TERMINEE',
  ANNULEE = 'ANNULEE',
  EXPIREE = 'EXPIREE'
}

export enum SessionStatus {
  EN_COURS = 'EN_COURS',
  TERMINEE = 'TERMINEE'
}

export enum InvoiceStatus {
  EN_ATTENTE = 'EN_ATTENTE',
  PAYEE = 'PAYEE',
  ANNULEE = 'ANNULEE'
}

export enum SubscriptionType {
  JOURNALIER = 'JOURNALIER',
  HEBDOMADAIRE = 'HEBDOMADAIRE',
  MENSUEL = 'MENSUEL',
  ANNUEL = 'ANNUEL'
}

export enum SubscriptionStatus {
  ACTIF = 'ACTIF',
  EXPIRE = 'EXPIRE',
  SUSPENDU = 'SUSPENDU',
  ANNULE = 'ANNULE'
}

export interface User {
  id: number;
  username: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: Role;
  category: UserCategory;
  createdAt: string;
}

export interface Vehicle {
  id: number;
  plateNumber: string;
  brand: string;
  model: string;
  color?: string;
  type: VehicleType;
  ownerId: number;
  createdAt: string;
}

export interface ParkingSpace {
  id: number;
  number: string;
  zone: string;
  level: number;
  type: SpaceType;
  status: SpaceStatus;
  outOfServiceReason?: string;
}

export interface Reservation {
  id: number;
  reference: string;
  userId: number;
  vehicleId: number;
  spaceId: number;
  expectedArrival: string;
  expectedDeparture: string;
  status: ReservationStatus;
  cancellationReason?: string;
  createdAt: string;
}

export interface ParkingSession {
  id: number;
  reference: string;
  userId: number;
  vehicleId: number;
  spaceId: number;
  reservationId?: number;
  subscriptionId?: number;
  entryTime: string;
  exitTime?: string;
  status: SessionStatus;
  entryOperator?: string;
  exitOperator?: string;
}

export interface Invoice {
  id: number;
  reference: string;
  sessionId: number;
  userId: number;
  actualDurationMinutes: number;
  billedMinutes: number;
  baseAmount: number;
  overstayAmount: number;
  discountAmount: number;
  totalAmount: number;
  currency: string;
  status: InvoiceStatus;
  tariffName: string;
  details: string;
  issuedAt: string;
  paidAt?: string;
}

export interface Subscription {
  id: number;
  reference: string;
  userId: number;
  vehicleId: number;
  type: SubscriptionType;
  startDate: string;
  endDate: string;
  price: number;
  status: SubscriptionStatus;
  createdAt: string;
}

export interface TariffRule {
  id: number;
  name: string;
  zone?: string;
  spaceType?: SpaceType;
  vehicleType?: VehicleType;
  userCategory?: UserCategory;
  hourlyRate: number;
  minimumFee: number;
  dailyCap?: number;
  freeMinutes: number;
  overstayMultiplier: number;
  subscriberDiscountPercent: number;
  priority: number;
  active: boolean;
}
