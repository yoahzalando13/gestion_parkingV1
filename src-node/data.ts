import {
  User,
  Vehicle,
  ParkingSpace,
  Reservation,
  ParkingSession,
  Invoice,
  Subscription,
  TariffRule,
  Role,
  UserCategory,
  SpaceType,
  SpaceStatus,
  VehicleType,
  ReservationStatus,
  SessionStatus,
  InvoiceStatus,
  SubscriptionType,
  SubscriptionStatus
} from './types.js';

export class DataStore {
  users: User[] = [];
  vehicles: Vehicle[] = [];
  spaces: ParkingSpace[] = [];
  reservations: Reservation[] = [];
  sessions: ParkingSession[] = [];
  invoices: Invoice[] = [];
  subscriptions: Subscription[] = [];
  tariffs: TariffRule[] = [];

  private nextUserId = 1;
  private nextVehicleId = 1;
  private nextSpaceId = 1;
  private nextReservationId = 1;
  private nextSessionId = 1;
  private nextInvoiceId = 1;
  private nextSubscriptionId = 1;
  private nextTariffId = 1;

  constructor() {
    this.seed();
  }

  seed() {
    // 1. Users
    const uAdmin = this.addUser({
      username: 'admin',
      passwordHash: 'admin123',
      firstName: 'Alice',
      lastName: 'Rakoto',
      email: 'admin@parking.local',
      phone: '+261 34 00 000 00',
      role: Role.ADMIN,
      category: UserCategory.STANDARD,
      createdAt: new Date().toISOString()
    });

    const uManager = this.addUser({
      username: 'manager',
      passwordHash: 'manager123',
      firstName: 'Bruno',
      lastName: 'Randria',
      email: 'manager@parking.local',
      phone: '+261 34 00 000 01',
      role: Role.MANAGER,
      category: UserCategory.STANDARD,
      createdAt: new Date().toISOString()
    });

    const uOperator = this.addUser({
      username: 'operator',
      passwordHash: 'operator123',
      firstName: 'Chloé',
      lastName: 'Rasoa',
      email: 'operator@parking.local',
      phone: '+261 34 00 000 02',
      role: Role.OPERATOR,
      category: UserCategory.STANDARD,
      createdAt: new Date().toISOString()
    });

    const uClient = this.addUser({
      username: 'client',
      passwordHash: 'client123',
      firstName: 'David',
      lastName: 'Andria',
      email: 'client@parking.local',
      phone: '+261 34 00 000 03',
      role: Role.USER,
      category: UserCategory.STANDARD,
      createdAt: new Date().toISOString()
    });

    const uVip = this.addUser({
      username: 'vip',
      passwordHash: 'vip123',
      firstName: 'Élodie',
      lastName: 'Ravalo',
      email: 'vip@parking.local',
      phone: '+261 34 00 000 04',
      role: Role.USER,
      category: UserCategory.VIP,
      createdAt: new Date().toISOString()
    });

    const uPmr = this.addUser({
      username: 'pmr',
      passwordHash: 'pmr123',
      firstName: 'Fabrice',
      lastName: 'Rabe',
      email: 'pmr@parking.local',
      phone: '+261 34 00 000 05',
      role: Role.USER,
      category: UserCategory.PMR,
      createdAt: new Date().toISOString()
    });

    // 2. Vehicles
    const v1 = this.addVehicle({
      plateNumber: '1234TAA',
      brand: 'Toyota',
      model: 'Yaris',
      color: 'Blanc',
      type: VehicleType.VOITURE,
      ownerId: uClient.id,
      createdAt: new Date().toISOString()
    });

    const v2 = this.addVehicle({
      plateNumber: '5678TBB',
      brand: 'Renault',
      model: 'Kangoo',
      color: 'Gris',
      type: VehicleType.UTILITAIRE,
      ownerId: uClient.id,
      createdAt: new Date().toISOString()
    });

    const v3 = this.addVehicle({
      plateNumber: '9012TCC',
      brand: 'Mercedes',
      model: 'Classe C',
      color: 'Noir',
      type: VehicleType.VOITURE,
      ownerId: uVip.id,
      createdAt: new Date().toISOString()
    });

    const v4 = this.addVehicle({
      plateNumber: '3456TDD',
      brand: 'Peugeot',
      model: '208',
      color: 'Bleu',
      type: VehicleType.VOITURE,
      ownerId: uPmr.id,
      createdAt: new Date().toISOString()
    });

    const v5 = this.addVehicle({
      plateNumber: '7890TEE',
      brand: 'Yamaha',
      model: 'MT-07',
      color: 'Rouge',
      type: VehicleType.MOTO,
      ownerId: uClient.id,
      createdAt: new Date().toISOString()
    });

    const v6 = this.addVehicle({
      plateNumber: '2468TFF',
      brand: 'Tesla',
      model: 'Model 3',
      color: 'Blanc',
      type: VehicleType.ELECTRIQUE,
      ownerId: uManager.id,
      createdAt: new Date().toISOString()
    });

    // 3. Spaces (46 places)
    // Zone A : RDC, Standard & PMR
    for (let i = 1; i <= 12; i++) {
      const num = `A${String(i).padStart(2, '0')}`;
      this.addSpace({
        number: num,
        zone: 'A',
        level: 0,
        type: SpaceType.STANDARD,
        status: SpaceStatus.LIBRE
      });
    }
    for (let i = 1; i <= 4; i++) {
      const num = `AP${String(i).padStart(2, '0')}`;
      this.addSpace({
        number: num,
        zone: 'A',
        level: 0,
        type: SpaceType.PMR,
        status: SpaceStatus.LIBRE
      });
    }

    // Zone B : Level 1, Standard & Abonne
    for (let i = 1; i <= 10; i++) {
      const num = `B${String(i).padStart(2, '0')}`;
      this.addSpace({
        number: num,
        zone: 'B',
        level: 1,
        type: SpaceType.STANDARD,
        status: SpaceStatus.LIBRE
      });
    }
    for (let i = 1; i <= 6; i++) {
      const num = `BA${String(i).padStart(2, '0')}`;
      this.addSpace({
        number: num,
        zone: 'B',
        level: 1,
        type: SpaceType.ABONNE,
        status: SpaceStatus.LIBRE
      });
    }

    // Zone C : Level 2, VIP & Standard
    for (let i = 1; i <= 6; i++) {
      const num = `C${String(i).padStart(2, '0')}`;
      this.addSpace({
        number: num,
        zone: 'C',
        level: 2,
        type: SpaceType.VIP,
        status: SpaceStatus.LIBRE
      });
    }
    for (let i = 1; i <= 8; i++) {
      const num = `CS${String(i).padStart(2, '0')}`;
      this.addSpace({
        number: num,
        zone: 'C',
        level: 2,
        type: SpaceType.STANDARD,
        status: SpaceStatus.LIBRE
      });
    }

    // 4. Tariff Rules (5 default rules)
    this.addTariff({
      name: 'Tarif général',
      hourlyRate: 2000.0,
      minimumFee: 1000.0,
      dailyCap: 20000.0,
      overstayMultiplier: 1.5,
      subscriberDiscountPercent: 20.0,
      freeMinutes: 15,
      priority: 0,
      active: true
    });

    this.addTariff({
      name: 'Zone C - places VIP',
      zone: 'C',
      spaceType: SpaceType.VIP,
      hourlyRate: 4000.0,
      minimumFee: 4000.0,
      dailyCap: 40000.0,
      overstayMultiplier: 1.75,
      subscriberDiscountPercent: 25.0,
      freeMinutes: 15,
      priority: 20,
      active: true
    });

    this.addTariff({
      name: 'Places PMR - tarif réduit',
      spaceType: SpaceType.PMR,
      hourlyRate: 1000.0,
      minimumFee: 500.0,
      dailyCap: 8000.0,
      overstayMultiplier: 1.2,
      subscriberDiscountPercent: 30.0,
      freeMinutes: 30,
      priority: 20,
      active: true
    });

    this.addTariff({
      name: 'Deux-roues',
      vehicleType: VehicleType.MOTO,
      hourlyRate: 1200.0,
      minimumFee: 600.0,
      dailyCap: 8000.0,
      overstayMultiplier: 1.3,
      subscriberDiscountPercent: 20.0,
      freeMinutes: 20,
      priority: 10,
      active: true
    });

    this.addTariff({
      name: 'Abonnés - places dédiées',
      spaceType: SpaceType.ABONNE,
      userCategory: UserCategory.ABONNE,
      hourlyRate: 1500.0,
      minimumFee: 0,
      dailyCap: 10000.0,
      overstayMultiplier: 1.25,
      subscriberDiscountPercent: 50.0,
      freeMinutes: 60,
      priority: 30,
      active: true
    });

    // 5. Add one active subscription for David (uClient, vehicle v1)
    const now = new Date();
    const subStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const subEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    this.addSubscription({
      reference: 'SUB-' + Math.floor(100000 + Math.random() * 900000),
      userId: uClient.id,
      vehicleId: v1.id,
      type: SubscriptionType.MENSUEL,
      startDate: subStart,
      endDate: subEnd,
      price: 250000.0,
      status: SubscriptionStatus.ACTIF,
      createdAt: new Date().toISOString()
    });

    // 6. Add one active session for demo: vehicle v3 on space C01
    const spaceC01 = this.spaces.find(s => s.number === 'C01');
    if (spaceC01) {
      spaceC01.status = SpaceStatus.OCCUPEE;
      const entryTime = new Date(Date.now() - 75 * 60 * 1000).toISOString();
      this.addSession({
        reference: 'SES-' + Math.floor(100000 + Math.random() * 900000),
        userId: uVip.id,
        vehicleId: v3.id,
        spaceId: spaceC01.id,
        entryTime,
        status: SessionStatus.EN_COURS,
        entryOperator: 'operator'
      });
    }

    // 7. Add one confirmed reservation for vehicle v4 on space AP01
    const spaceAP01 = this.spaces.find(s => s.number === 'AP01');
    if (spaceAP01) {
      spaceAP01.status = SpaceStatus.RESERVEE;
      const resStart = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const resEnd = new Date(Date.now() + 180 * 60 * 1000).toISOString();
      this.addReservation({
        reference: 'RES-' + Math.floor(100000 + Math.random() * 900000),
        userId: uPmr.id,
        vehicleId: v4.id,
        spaceId: spaceAP01.id,
        expectedArrival: resStart,
        expectedDeparture: resEnd,
        status: ReservationStatus.CONFIRMEE,
        createdAt: new Date().toISOString()
      });
    }

    // 8. One completed session with invoice for stats
    const spaceA02 = this.spaces.find(s => s.number === 'A02');
    if (spaceA02) {
      const pastEntry = new Date(Date.now() - 240 * 60 * 1000).toISOString();
      const pastExit = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const pastSession = this.addSession({
        reference: 'SES-001099',
        userId: uClient.id,
        vehicleId: v2.id,
        spaceId: spaceA02.id,
        entryTime: pastEntry,
        exitTime: pastExit,
        status: SessionStatus.TERMINEE,
        entryOperator: 'operator',
        exitOperator: 'operator'
      });

      this.addInvoice({
        reference: 'FAC-001099',
        sessionId: pastSession.id,
        userId: uClient.id,
        actualDurationMinutes: 180,
        billedMinutes: 165,
        baseAmount: 7700.0,
        overstayAmount: 0,
        discountAmount: 1540.0,
        totalAmount: 6160.0,
        currency: 'MGA',
        status: InvoiceStatus.PAYEE,
        tariffName: 'Tarif général',
        details: 'Durée réelle : 3 h | Franchise : 15 min | Tarif horaire : 2000 x coefficient 1.4',
        issuedAt: pastExit,
        paidAt: pastExit
      });
    }
  }

  // --- CRUD helpers ---
  addUser(u: Omit<User, 'id'>): User {
    const user = { ...u, id: this.nextUserId++ };
    this.users.push(user);
    return user;
  }

  addVehicle(v: Omit<Vehicle, 'id'>): Vehicle {
    const vehicle = { ...v, id: this.nextVehicleId++ };
    this.vehicles.push(vehicle);
    return vehicle;
  }

  addSpace(s: Omit<ParkingSpace, 'id'>): ParkingSpace {
    const space = { ...s, id: this.nextSpaceId++ };
    this.spaces.push(space);
    return space;
  }

  addReservation(r: Omit<Reservation, 'id'>): Reservation {
    const res = { ...r, id: this.nextReservationId++ };
    this.reservations.push(res);
    return res;
  }

  addSession(s: Omit<ParkingSession, 'id'>): ParkingSession {
    const session = { ...s, id: this.nextSessionId++ };
    this.sessions.push(session);
    return session;
  }

  addInvoice(i: Omit<Invoice, 'id'>): Invoice {
    const invoice = { ...i, id: this.nextInvoiceId++ };
    this.invoices.push(invoice);
    return invoice;
  }

  addSubscription(s: Omit<Subscription, 'id'>): Subscription {
    const sub = { ...s, id: this.nextSubscriptionId++ };
    this.subscriptions.push(sub);
    return sub;
  }

  addTariff(t: Omit<TariffRule, 'id'>): TariffRule {
    const rule = { ...t, id: this.nextTariffId++ };
    this.tariffs.push(rule);
    return rule;
  }

  findTariffRule(zone?: string, spaceType?: SpaceType, vehicleType?: VehicleType, userCategory?: UserCategory): TariffRule | null {
    const active = this.tariffs.filter(t => t.active);
    // Sort by priority descending
    active.sort((a, b) => b.priority - a.priority);

    for (const rule of active) {
      if (rule.zone && rule.zone.toUpperCase() !== (zone || '').toUpperCase()) continue;
      if (rule.spaceType && rule.spaceType !== spaceType) continue;
      if (rule.vehicleType && rule.vehicleType !== vehicleType) continue;
      if (rule.userCategory && rule.userCategory !== userCategory) continue;
      return rule;
    }

    return active.find(t => t.priority === 0) || active[0] || null;
  }
}

export const db = new DataStore();
