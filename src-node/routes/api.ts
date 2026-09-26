import { Router, Request, Response } from 'express';
import { db } from '../data.js';
import { computePricing, PARKING_PROPERTIES } from '../pricing.js';
import { allocateSpace } from '../allocation.js';
import {
  SpaceStatus,
  SpaceType,
  ReservationStatus,
  SessionStatus,
  InvoiceStatus,
  SubscriptionStatus,
  SubscriptionType,
  Role,
  UserCategory,
  VehicleType
} from '../types.js';

export const apiRouter = Router();

// Basic Auth helper for /api/**
apiRouter.use((req: Request, res: Response, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    // If not authenticated via header, check session or default to admin in dev/demo
    if ((req.session as any)?.user) {
      return next();
    }
    // Allow basic auth parsing
    return next();
  }
  const [type, credentials] = authHeader.split(' ');
  if (type === 'Basic' && credentials) {
    const decoded = Buffer.from(credentials, 'base64').toString('utf-8');
    const [username, password] = decoded.split(':');
    const user = db.users.find(u => u.username === username && u.passwordHash === password);
    if (user) {
      (req as any).apiUser = user;
    }
  }
  next();
});

// Spaces
apiRouter.get('/parking/spaces', (req: Request, res: Response) => {
  const { zone, type, status, search } = req.query as any;
  let result = [...db.spaces];
  if (zone) result = result.filter(s => s.zone.toUpperCase() === String(zone).toUpperCase());
  if (type) result = result.filter(s => s.type === type);
  if (status) result = result.filter(s => s.status === status);
  if (search) result = result.filter(s => s.number.toLowerCase().includes(String(search).toLowerCase()));
  res.json({ content: result, totalElements: result.length });
});

apiRouter.get('/parking/spaces/available', (req: Request, res: Response) => {
  const { zone, type } = req.query as any;
  let result = db.spaces.filter(s => s.status === SpaceStatus.LIBRE);
  if (zone) result = result.filter(s => s.zone.toUpperCase() === String(zone).toUpperCase());
  if (type) result = result.filter(s => s.type === type);
  res.json(result);
});

apiRouter.get('/parking/spaces/:id', (req: Request, res: Response) => {
  const space = db.spaces.find(s => s.id === Number(req.params.id));
  if (!space) return res.status(404).json({ error: 'Place introuvable' });
  res.json(space);
});

apiRouter.post('/parking/spaces', (req: Request, res: Response) => {
  const { number, zone, level, type } = req.body;
  if (!number || !zone) return res.status(400).json({ error: 'Numéro et zone obligatoires' });
  const existing = db.spaces.find(s => s.number.toUpperCase() === String(number).trim().toUpperCase());
  if (existing) return res.status(409).json({ error: 'Une place avec ce numéro existe déjà' });

  const space = db.addSpace({
    number: String(number).trim().toUpperCase(),
    zone: String(zone).trim().toUpperCase(),
    level: Number(level) || 0,
    type: type || SpaceType.STANDARD,
    status: SpaceStatus.LIBRE
  });
  res.status(201).json(space);
});

apiRouter.put('/parking/spaces/:id', (req: Request, res: Response) => {
  const space = db.spaces.find(s => s.id === Number(req.params.id));
  if (!space) return res.status(404).json({ error: 'Place introuvable' });
  const { number, zone, level, type } = req.body;
  if (number) space.number = String(number).trim().toUpperCase();
  if (zone) space.zone = String(zone).trim().toUpperCase();
  if (level !== undefined) space.level = Number(level);
  if (type) space.type = type;
  res.json(space);
});

apiRouter.post('/parking/spaces/:id/out-of-service', (req: Request, res: Response) => {
  const space = db.spaces.find(s => s.id === Number(req.params.id));
  if (!space) return res.status(404).json({ error: 'Place introuvable' });
  if (space.status !== SpaceStatus.LIBRE) {
    return res.status(422).json({ error: 'Seule une place libre peut être mise hors service' });
  }
  space.status = SpaceStatus.HORS_SERVICE;
  space.outOfServiceReason = req.body.reason || 'Maintenance';
  res.json(space);
});

apiRouter.post('/parking/spaces/:id/in-service', (req: Request, res: Response) => {
  const space = db.spaces.find(s => s.id === Number(req.params.id));
  if (!space) return res.status(404).json({ error: 'Place introuvable' });
  space.status = SpaceStatus.LIBRE;
  space.outOfServiceReason = undefined;
  res.json(space);
});

// Entries
apiRouter.post('/parking/entries', (req: Request, res: Response) => {
  const { plateNumber, preferredZone, spaceId, entryTime } = req.body;
  if (!plateNumber) return res.status(400).json({ error: 'Immatriculation requise' });

  const cleanPlate = String(plateNumber).trim().toUpperCase();
  let vehicle = db.vehicles.find(v => v.plateNumber === cleanPlate);
  if (!vehicle) {
    // Auto-create or find first user
    const defaultUser = db.users.find(u => u.username === 'client') || db.users[0];
    vehicle = db.addVehicle({
      plateNumber: cleanPlate,
      brand: 'Standard',
      model: 'Véhicule',
      type: VehicleType.VOITURE,
      ownerId: defaultUser.id,
      createdAt: new Date().toISOString()
    });
  }

  // Check if vehicle already ongoing
  const existingSession = db.sessions.find(
    s => s.vehicleId === vehicle.id && s.status === SessionStatus.EN_COURS
  );
  if (existingSession) {
    const sp = db.spaces.find(s => s.id === existingSession.spaceId);
    return res.status(409).json({
      error: `Le véhicule ${cleanPlate} est déjà dans le parking (place ${sp?.number || '?'})`
    });
  }

  // Check reservation
  const owner = db.users.find(u => u.id === vehicle.ownerId)!;
  const now = entryTime ? new Date(entryTime) : new Date();
  const reservation = db.reservations.find(
    r => r.vehicleId === vehicle.id && r.status === ReservationStatus.CONFIRMEE
  );

  let targetSpace = null;
  if (spaceId) {
    targetSpace = db.spaces.find(s => s.id === Number(spaceId) && s.status === SpaceStatus.LIBRE);
    if (!targetSpace) return res.status(409).json({ error: 'Place imposée non disponible' });
  } else if (reservation) {
    targetSpace = db.spaces.find(s => s.id === reservation.spaceId);
  } else {
    try {
      targetSpace = allocateSpace(owner.category, preferredZone);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  }

  targetSpace.status = SpaceStatus.OCCUPEE;
  if (reservation) {
    reservation.status = ReservationStatus.EN_COURS;
  }

  const sub = db.subscriptions.find(
    s => s.vehicleId === vehicle.id && s.status === SubscriptionStatus.ACTIF
  );

  const session = db.addSession({
    reference: 'SES-' + Math.floor(100000 + Math.random() * 900000),
    userId: owner.id,
    vehicleId: vehicle.id,
    spaceId: targetSpace.id,
    reservationId: reservation?.id,
    subscriptionId: sub?.id,
    entryTime: now.toISOString(),
    status: SessionStatus.EN_COURS,
    entryOperator: 'api'
  });

  res.status(201).json(session);
});

// Exits
apiRouter.post('/parking/exits', (req: Request, res: Response) => {
  const { plateNumber, exitTime, markAsPaid } = req.body;
  if (!plateNumber) return res.status(400).json({ error: 'Immatriculation requise' });

  const cleanPlate = String(plateNumber).trim().toUpperCase();
  const vehicle = db.vehicles.find(v => v.plateNumber === cleanPlate);
  if (!vehicle) return res.status(404).json({ error: 'Véhicule introuvable' });

  const session = db.sessions.find(
    s => s.vehicleId === vehicle.id && s.status === SessionStatus.EN_COURS
  );
  if (!session) {
    return res.status(400).json({ error: `Aucune session en cours pour le véhicule ${cleanPlate}` });
  }

  const now = exitTime ? new Date(exitTime) : new Date();
  const entry = new Date(session.entryTime);
  const actualMinutes = Math.max(1, Math.round((now.getTime() - entry.getTime()) / (1000 * 60)));

  session.exitTime = now.toISOString();
  session.status = SessionStatus.TERMINEE;
  session.exitOperator = 'api';

  // Free space
  const space = db.spaces.find(s => s.id === session.spaceId);
  if (space) space.status = SpaceStatus.LIBRE;

  // Complete reservation
  if (session.reservationId) {
    const resv = db.reservations.find(r => r.id === session.reservationId);
    if (resv && resv.status === ReservationStatus.EN_COURS) {
      resv.status = ReservationStatus.TERMINEE;
    }
  }

  // Calculate pricing
  const user = db.users.find(u => u.id === session.userId)!;
  const reservation = session.reservationId ? db.reservations.find(r => r.id === session.reservationId) : null;
  let expectedMinutes = 0;
  if (reservation) {
    const arr = new Date(reservation.expectedArrival);
    const dep = new Date(reservation.expectedDeparture);
    expectedMinutes = Math.max(0, Math.round((dep.getTime() - arr.getTime()) / (1000 * 60)));
  }

  const hasSub = db.subscriptions.some(
    s => s.vehicleId === vehicle.id && s.status === SubscriptionStatus.ACTIF
  );

  const tariff = db.findTariffRule(space?.zone, space?.type, vehicle.type, user.category);
  const pricing = computePricing(
    actualMinutes,
    expectedMinutes,
    tariff,
    space?.type || SpaceType.STANDARD,
    vehicle.type,
    user.category,
    hasSub
  );

  const isPaid = markAsPaid === true || markAsPaid === 'true';
  const invoice = db.addInvoice({
    reference: 'FAC-' + Math.floor(100000 + Math.random() * 900000),
    sessionId: session.id,
    userId: user.id,
    actualDurationMinutes: pricing.actualMinutes,
    billedMinutes: pricing.billedMinutes,
    baseAmount: pricing.baseAmount,
    overstayAmount: pricing.overstayAmount,
    discountAmount: pricing.discountAmount,
    totalAmount: pricing.total,
    currency: PARKING_PROPERTIES.currency,
    status: isPaid ? InvoiceStatus.PAYEE : InvoiceStatus.EN_ATTENTE,
    tariffName: pricing.tariffName,
    details: pricing.details,
    issuedAt: now.toISOString(),
    paidAt: isPaid ? now.toISOString() : undefined
  });

  res.json({ session, invoice });
});

// Ongoing sessions
apiRouter.get('/parking/sessions/ongoing', (_req: Request, res: Response) => {
  const ongoing = db.sessions.filter(s => s.status === SessionStatus.EN_COURS);
  res.json(ongoing);
});

// Occupancy
apiRouter.get('/parking/occupancy', (_req: Request, res: Response) => {
  const total = db.spaces.length;
  const free = db.spaces.filter(s => s.status === SpaceStatus.LIBRE).length;
  const occupied = db.spaces.filter(s => s.status === SpaceStatus.OCCUPEE).length;
  const reserved = db.spaces.filter(s => s.status === SpaceStatus.RESERVEE).length;
  const outOfService = db.spaces.filter(s => s.status === SpaceStatus.HORS_SERVICE).length;

  const zonesList = Array.from(new Set(db.spaces.map(s => s.zone))).sort();
  const zones = zonesList.map(z => {
    const sp = db.spaces.filter(s => s.zone === z);
    const zTot = sp.length;
    const zFree = sp.filter(s => s.status === SpaceStatus.LIBRE).length;
    const zOcc = sp.filter(s => s.status === SpaceStatus.OCCUPEE).length;
    return {
      zone: z,
      total: zTot,
      free: zFree,
      occupied: zOcc,
      occupancyRate: zTot > 0 ? Math.round((zOcc / zTot) * 100) : 0
    };
  });

  res.json({
    totalSpaces: total,
    freeSpaces: free,
    occupiedSpaces: occupied,
    reservedSpaces: reserved,
    outOfServiceSpaces: outOfService,
    occupancyRate: total > 0 ? Math.round((occupied / total) * 100) : 0,
    zones
  });
});

// Revenue
apiRouter.get('/parking/revenue', (req: Request, res: Response) => {
  const paidInvoices = db.invoices.filter(i => i.status === InvoiceStatus.PAYEE);
  const totalRev = paidInvoices.reduce((sum, i) => sum + i.totalAmount, 0);
  res.json({
    totalRevenue: totalRev,
    currency: PARKING_PROPERTIES.currency,
    invoiceCount: paidInvoices.length
  });
});

// Reservations
apiRouter.get('/reservations', (req: Request, res: Response) => {
  const { status, userId } = req.query as any;
  let result = [...db.reservations];
  if (status) result = result.filter(r => r.status === status);
  if (userId) result = result.filter(r => r.userId === Number(userId));
  res.json({ content: result, totalElements: result.length });
});

apiRouter.post('/reservations', (req: Request, res: Response) => {
  const { vehicleId, spaceId, expectedArrival, expectedDeparture } = req.body;
  if (!vehicleId || !spaceId || !expectedArrival || !expectedDeparture) {
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  }

  const arr = new Date(expectedArrival);
  const dep = new Date(expectedDeparture);
  if (dep <= arr) {
    return res.status(400).json({ error: 'La date de départ doit être postérieure à la date d\'arrivée' });
  }

  const space = db.spaces.find(s => s.id === Number(spaceId));
  if (!space) return res.status(404).json({ error: 'Place introuvable' });
  if (space.status !== SpaceStatus.LIBRE) {
    return res.status(409).json({ error: `La place ${space.number} n'est pas libre` });
  }

  const vehicle = db.vehicles.find(v => v.id === Number(vehicleId));
  if (!vehicle) return res.status(404).json({ error: 'Véhicule introuvable' });

  space.status = SpaceStatus.RESERVEE;
  const reservation = db.addReservation({
    reference: 'RES-' + Math.floor(100000 + Math.random() * 900000),
    userId: vehicle.ownerId,
    vehicleId: vehicle.id,
    spaceId: space.id,
    expectedArrival: arr.toISOString(),
    expectedDeparture: dep.toISOString(),
    status: ReservationStatus.CONFIRMEE,
    createdAt: new Date().toISOString()
  });

  res.status(201).json(reservation);
});

apiRouter.delete('/reservations/:id', (req: Request, res: Response) => {
  const resv = db.reservations.find(r => r.id === Number(req.params.id));
  if (!resv) return res.status(404).json({ error: 'Réservation introuvable' });
  if (resv.status !== ReservationStatus.CONFIRMEE) {
    return res.status(422).json({ error: 'Seule une réservation confirmée peut être annulée' });
  }
  resv.status = ReservationStatus.ANNULEE;
  resv.cancellationReason = (req.query.reason as string) || 'Annulation usager';
  const space = db.spaces.find(s => s.id === resv.spaceId);
  if (space && space.status === SpaceStatus.RESERVEE) {
    space.status = SpaceStatus.LIBRE;
  }
  res.json(resv);
});

// Invoices
apiRouter.get('/invoices', (_req: Request, res: Response) => {
  res.json({ content: db.invoices, totalElements: db.invoices.length });
});

apiRouter.get('/invoices/:id', (req: Request, res: Response) => {
  const inv = db.invoices.find(i => i.id === Number(req.params.id));
  if (!inv) return res.status(404).json({ error: 'Facture introuvable' });
  res.json(inv);
});

apiRouter.post('/invoices/:id/pay', (req: Request, res: Response) => {
  const inv = db.invoices.find(i => i.id === Number(req.params.id));
  if (!inv) return res.status(404).json({ error: 'Facture introuvable' });
  inv.status = InvoiceStatus.PAYEE;
  inv.paidAt = new Date().toISOString();
  res.json(inv);
});

// Subscriptions
apiRouter.get('/subscriptions', (_req: Request, res: Response) => {
  res.json({ content: db.subscriptions, totalElements: db.subscriptions.length });
});

// Tariffs
apiRouter.get('/tariffs', (_req: Request, res: Response) => {
  res.json(db.tariffs);
});

// Users
apiRouter.get('/users', (_req: Request, res: Response) => {
  res.json(db.users.map(({ passwordHash, ...u }) => u));
});

// Vehicles
apiRouter.get('/vehicles', (_req: Request, res: Response) => {
  res.json(db.vehicles);
});
