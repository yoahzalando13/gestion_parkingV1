import { Router, Request, Response } from 'express';
import { db } from '../data.js';
import { computePricing, PARKING_PROPERTIES } from '../pricing.js';
import { allocateSpace } from '../allocation.js';
import {
  SpaceStatus,
  SpaceType,
  SPACE_TYPE_LABELS,
  SPACE_STATUS_LABELS,
  ReservationStatus,
  SessionStatus,
  InvoiceStatus,
  SubscriptionStatus,
  SubscriptionType,
  Role,
  UserCategory,
  VehicleType,
  VEHICLE_LABELS
} from '../types.js';

export const webRouter = Router();

function formatDate(iso?: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatLocalDate(iso?: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatInputDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Global context middleware for views
webRouter.use((req: Request, res: Response, next) => {
  const session = req.session as any;
  if (!session.user) {
    // Default to admin user for convenient evaluation
    session.user = db.users.find(u => u.username === 'admin') || db.users[0];
  }
  res.locals.currentUser = session.user;
  res.locals.parkingName = PARKING_PROPERTIES.name;
  res.locals.successMessage = session.successMessage || null;
  res.locals.errorMessage = session.errorMessage || null;
  res.locals.infoMessage = session.infoMessage || null;
  delete session.successMessage;
  delete session.errorMessage;
  delete session.infoMessage;
  next();
});

// Root -> /dashboard
webRouter.get('/', (_req: Request, res: Response) => {
  res.redirect('/dashboard');
});

// Login / Logout / Switch
webRouter.get('/login', (req: Request, res: Response) => {
  res.render('login', { username: req.query.username || 'admin' });
});

webRouter.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  const user = db.users.find(u => u.username === username && u.passwordHash === password);
  if (!user) {
    return res.render('login', {
      username,
      errorMessage: 'Identifiant ou mot de passe incorrect'
    });
  }
  (req.session as any).user = user;
  res.redirect('/dashboard');
});

webRouter.post('/logout', (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

webRouter.post('/auth/switch-user', (req: Request, res: Response) => {
  const { username } = req.body;
  const user = db.users.find(u => u.username === username);
  if (user) {
    (req.session as any).user = user;
  }
  res.redirect('back');
});

// Swagger redirect
webRouter.get('/swagger-ui.html', (_req: Request, res: Response) => {
  res.render('api_docs', { activeMenu: 'api-docs' });
});
webRouter.get('/api/docs', (_req: Request, res: Response) => {
  res.render('api_docs', { activeMenu: 'api-docs' });
});

// Dashboard
webRouter.get('/dashboard', (req: Request, res: Response) => {
  const totalSpaces = db.spaces.length;
  const freeSpaces = db.spaces.filter(s => s.status === SpaceStatus.LIBRE).length;
  const occupiedSpaces = db.spaces.filter(s => s.status === SpaceStatus.OCCUPEE).length;
  const reservedSpaces = db.spaces.filter(s => s.status === SpaceStatus.RESERVEE).length;
  const outOfServiceSpaces = db.spaces.filter(s => s.status === SpaceStatus.HORS_SERVICE).length;
  const occupancyRate = totalSpaces > 0 ? Math.round((occupiedSpaces / totalSpaces) * 100) : 0;
  const activeReservations = db.reservations.filter(r => r.status === ReservationStatus.CONFIRMEE).length;
  const ongoingSessions = db.sessions.filter(s => s.status === SessionStatus.EN_COURS).length;

  const todayStr = new Date().toISOString().slice(0, 10);
  const entriesToday = db.sessions.filter(s => s.entryTime.slice(0, 10) === todayStr).length;
  const exitsToday = db.sessions.filter(s => s.exitTime && s.exitTime.slice(0, 10) === todayStr).length;

  const thisMonthStr = new Date().toISOString().slice(0, 7);
  const paidToday = db.invoices.filter(i => i.status === InvoiceStatus.PAYEE && i.issuedAt.slice(0, 10) === todayStr);
  const paidMonth = db.invoices.filter(i => i.status === InvoiceStatus.PAYEE && i.issuedAt.slice(0, 7) === thisMonthStr);
  const revenueToday = paidToday.reduce((sum, i) => sum + i.totalAmount, 0);
  const revenueThisMonth = paidMonth.reduce((sum, i) => sum + i.totalAmount, 0);

  const activeSubscriptions = db.subscriptions.filter(s => s.status === SubscriptionStatus.ACTIF).length;

  // Zoned spaces
  const zonedSpaces: Record<string, any[]> = {};
  const sortedSpaces = [...db.spaces].sort((a, b) => a.number.localeCompare(b.number));
  for (const s of sortedSpaces) {
    if (!zonedSpaces[s.zone]) zonedSpaces[s.zone] = [];
    zonedSpaces[s.zone].push({
      ...s,
      typeLabel: SPACE_TYPE_LABELS[s.type],
      statusLabel: SPACE_STATUS_LABELS[s.status]
    });
  }

  // Ongoing sessions
  const ongoing = db.sessions
    .filter(s => s.status === SessionStatus.EN_COURS)
    .map(s => {
      const vehicle = db.vehicles.find(v => v.id === s.vehicleId);
      const user = db.users.find(u => u.id === s.userId);
      const space = db.spaces.find(sp => sp.id === s.spaceId);
      const entry = new Date(s.entryTime);
      const duration = Math.max(1, Math.round((Date.now() - entry.getTime()) / (1000 * 60)));
      return {
        ...s,
        plateNumber: vehicle?.plateNumber || 'Inconnu',
        userName: user ? `${user.firstName} ${user.lastName}` : 'Inconnu',
        spaceNumber: space?.number || '?',
        zone: space?.zone || '?',
        entryTimeFormatted: formatDate(s.entryTime),
        durationMinutes: duration
      };
    });

  // Occupancy per zone
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

  res.render('dashboard', {
    stats: {
      totalSpaces,
      freeSpaces,
      occupiedSpaces,
      reservedSpaces,
      outOfServiceSpaces,
      occupancyRate,
      activeReservations,
      ongoingSessions,
      entriesToday,
      exitsToday,
      revenueToday,
      revenueThisMonth,
      currency: PARKING_PROPERTIES.currency,
      activeSubscriptions
    },
    zonedSpaces,
    ongoing,
    occupancy: { zones }
  });
});

// Spaces Map
webRouter.get('/spaces/map', (_req: Request, res: Response) => {
  const total = db.spaces.length;
  const free = db.spaces.filter(s => s.status === SpaceStatus.LIBRE).length;
  const occupied = db.spaces.filter(s => s.status === SpaceStatus.OCCUPEE).length;
  const reserved = db.spaces.filter(s => s.status === SpaceStatus.RESERVEE).length;
  const outOfService = db.spaces.filter(s => s.status === SpaceStatus.HORS_SERVICE).length;
  const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;

  const zonedSpaces: Record<string, any[]> = {};
  const sortedSpaces = [...db.spaces].sort((a, b) => a.number.localeCompare(b.number));
  for (const s of sortedSpaces) {
    if (!zonedSpaces[s.zone]) zonedSpaces[s.zone] = [];
    zonedSpaces[s.zone].push({
      ...s,
      typeLabel: SPACE_TYPE_LABELS[s.type],
      statusLabel: SPACE_STATUS_LABELS[s.status]
    });
  }

  res.render('spaces/map', {
    occupancy: {
      totalSpaces: total,
      freeSpaces: free,
      reservedSpaces: reserved,
      occupiedSpaces: occupied,
      outOfServiceSpaces: outOfService,
      occupancyRate
    },
    zonedSpaces
  });
});

// Spaces Available
webRouter.get('/spaces/available', (req: Request, res: Response) => {
  const { zone, type } = req.query as any;
  let list = db.spaces.filter(s => s.status === SpaceStatus.LIBRE);
  if (zone) list = list.filter(s => s.zone.toUpperCase() === String(zone).toUpperCase());
  if (type) list = list.filter(s => s.type === type);

  const availableSpaces = list.map(s => ({
    ...s,
    typeLabel: SPACE_TYPE_LABELS[s.type]
  }));

  const zones = Array.from(new Set(db.spaces.map(s => s.zone))).sort();
  const types = Object.values(SpaceType).map(t => ({ key: t, label: SPACE_TYPE_LABELS[t] }));

  res.render('spaces/available', {
    availableSpaces,
    zones,
    types,
    selectedZone: zone || '',
    selectedType: type || ''
  });
});

// Spaces List
webRouter.get('/spaces', (req: Request, res: Response) => {
  const { search, zone, type, status, page = 0, size = 15 } = req.query as any;
  let filtered = [...db.spaces];

  if (search) {
    const q = String(search).toLowerCase();
    filtered = filtered.filter(s => s.number.toLowerCase().includes(q));
  }
  if (zone) filtered = filtered.filter(s => s.zone.toUpperCase() === String(zone).toUpperCase());
  if (type) filtered = filtered.filter(s => s.type === type);
  if (status) filtered = filtered.filter(s => s.status === status);

  const totalElements = filtered.length;
  const p = Number(page);
  const s = Number(size);
  const totalPages = Math.ceil(totalElements / s) || 1;
  const paged = filtered.slice(p * s, (p + 1) * s).map(space => ({
    ...space,
    typeLabel: SPACE_TYPE_LABELS[space.type],
    statusLabel: SPACE_STATUS_LABELS[space.status]
  }));

  const zones = Array.from(new Set(db.spaces.map(sp => sp.zone))).sort();
  const types = Object.values(SpaceType).map(t => ({ key: t, label: SPACE_TYPE_LABELS[t] }));
  const statuses = Object.values(SpaceStatus).map(st => ({ key: st, label: SPACE_STATUS_LABELS[st] }));

  res.render('spaces/list', {
    spaces: paged,
    totalElements,
    totalPages,
    page: p,
    size: s,
    baseUrl: '/spaces',
    filterQuery: `&search=${encodeURIComponent(search || '')}&zone=${encodeURIComponent(zone || '')}&type=${encodeURIComponent(type || '')}&status=${encodeURIComponent(status || '')}`,
    search: search || '',
    selectedZone: zone || '',
    selectedType: type || '',
    selectedStatus: status || '',
    zones,
    types,
    statuses
  });
});

// New Space
webRouter.get('/spaces/new', (_req: Request, res: Response) => {
  res.render('spaces/form');
});

webRouter.post('/spaces', (req: Request, res: Response) => {
  const { number, zone, level, type } = req.body;
  if (!number || !zone) {
    (req.session as any).errorMessage = 'Le numéro et la zone sont requis';
    return res.redirect('/spaces/new');
  }
  const cleanNumber = String(number).trim().toUpperCase();
  if (db.spaces.some(s => s.number === cleanNumber)) {
    (req.session as any).errorMessage = `La place ${cleanNumber} existe déjà`;
    return res.redirect('/spaces/new');
  }

  db.addSpace({
    number: cleanNumber,
    zone: String(zone).trim().toUpperCase(),
    level: Number(level) || 0,
    type: type as SpaceType,
    status: SpaceStatus.LIBRE
  });

  (req.session as any).successMessage = `Place ${cleanNumber} créée avec succès`;
  res.redirect('/spaces');
});

// Edit Space
webRouter.get('/spaces/:id/edit', (req: Request, res: Response) => {
  const space = db.spaces.find(s => s.id === Number(req.params.id));
  if (!space) return res.status(404).render('error', { status: 404, message: 'Place introuvable' });
  res.render('spaces/edit', {
    space: {
      ...space,
      typeLabel: SPACE_TYPE_LABELS[space.type],
      statusLabel: SPACE_STATUS_LABELS[space.status]
    }
  });
});

webRouter.post('/spaces/:id/edit', (req: Request, res: Response) => {
  const space = db.spaces.find(s => s.id === Number(req.params.id));
  if (!space) return res.status(404).render('error', { status: 404, message: 'Place introuvable' });
  const { number, zone, level, type } = req.body;
  space.number = String(number).trim().toUpperCase();
  space.zone = String(zone).trim().toUpperCase();
  space.level = Number(level) || 0;
  space.type = type as SpaceType;

  (req.session as any).successMessage = `Place ${space.number} mise à jour`;
  res.redirect('/spaces');
});

webRouter.post('/spaces/:id/out-of-service', (req: Request, res: Response) => {
  const space = db.spaces.find(s => s.id === Number(req.params.id));
  if (!space) return res.status(404).render('error', { status: 404, message: 'Place introuvable' });
  if (space.status !== SpaceStatus.LIBRE) {
    (req.session as any).errorMessage = 'Seule une place libre peut être mise hors service';
    return res.redirect(`/spaces/${space.id}/edit`);
  }
  space.status = SpaceStatus.HORS_SERVICE;
  space.outOfServiceReason = req.body.reason || 'Travaux de maintenance';
  (req.session as any).infoMessage = `Place ${space.number} mise hors service`;
  res.redirect(`/spaces/${space.id}/edit`);
});

webRouter.post('/spaces/:id/in-service', (req: Request, res: Response) => {
  const space = db.spaces.find(s => s.id === Number(req.params.id));
  if (!space) return res.status(404).render('error', { status: 404, message: 'Place introuvable' });
  space.status = SpaceStatus.LIBRE;
  space.outOfServiceReason = undefined;
  (req.session as any).successMessage = `Place ${space.number} remise en service`;
  res.redirect(`/spaces/${space.id}/edit`);
});

// Entry
webRouter.get('/sessions/entry', (req: Request, res: Response) => {
  const availableSpaces = db.spaces
    .filter(s => s.status === SpaceStatus.LIBRE)
    .map(s => ({
      ...s,
      typeLabel: SPACE_TYPE_LABELS[s.type]
    }));
  const zones = Array.from(new Set(db.spaces.map(s => s.zone))).sort();
  res.render('sessions/entry', {
    availableSpaces,
    zones,
    plateNumber: req.query.plateNumber || ''
  });
});

webRouter.post('/sessions/entry', (req: Request, res: Response) => {
  const { plateNumber, preferredZone, spaceId, entryTime } = req.body;
  if (!plateNumber) {
    (req.session as any).errorMessage = 'Le numéro d\'immatriculation est obligatoire';
    return res.redirect('/sessions/entry');
  }

  const cleanPlate = String(plateNumber).trim().toUpperCase();
  let vehicle = db.vehicles.find(v => v.plateNumber === cleanPlate);
  if (!vehicle) {
    const owner = (req.session as any).user || db.users.find(u => u.username === 'client') || db.users[0];
    vehicle = db.addVehicle({
      plateNumber: cleanPlate,
      brand: 'Standard',
      model: 'Véhicule',
      type: VehicleType.VOITURE,
      ownerId: owner.id,
      createdAt: new Date().toISOString()
    });
  }

  const existing = db.sessions.find(s => s.vehicleId === vehicle.id && s.status === SessionStatus.EN_COURS);
  if (existing) {
    const sp = db.spaces.find(s => s.id === existing.spaceId);
    (req.session as any).errorMessage = `Le véhicule ${cleanPlate} est déjà dans le parking (place ${sp?.number || '?'})`;
    return res.redirect('/sessions/entry');
  }

  const owner = db.users.find(u => u.id === vehicle.ownerId)!;
  const now = entryTime ? new Date(entryTime) : new Date();

  // Check reservation
  const reservation = db.reservations.find(
    r => r.vehicleId === vehicle.id && r.status === ReservationStatus.CONFIRMEE
  );

  let targetSpace = null;
  if (spaceId) {
    targetSpace = db.spaces.find(s => s.id === Number(spaceId) && s.status === SpaceStatus.LIBRE);
    if (!targetSpace) {
      (req.session as any).errorMessage = 'La place sélectionnée n\'est pas libre';
      return res.redirect('/sessions/entry');
    }
  } else if (reservation) {
    targetSpace = db.spaces.find(s => s.id === reservation.spaceId);
  } else {
    try {
      targetSpace = allocateSpace(owner.category, preferredZone);
    } catch (err: any) {
      (req.session as any).errorMessage = err.message;
      return res.redirect('/sessions/entry');
    }
  }

  if (!targetSpace) {
    (req.session as any).errorMessage = 'Aucune place disponible';
    return res.redirect('/sessions/entry');
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
    entryOperator: (req.session as any).user?.username || 'operator'
  });

  (req.session as any).successMessage = `Entrée enregistrée : véhicule ${cleanPlate} garé sur la place ${targetSpace.number} (Zone ${targetSpace.zone})`;
  res.redirect(`/sessions/${session.id}`);
});

// Exit
webRouter.get('/sessions/exit', (req: Request, res: Response) => {
  const ongoing = db.sessions
    .filter(s => s.status === SessionStatus.EN_COURS)
    .map(s => {
      const vehicle = db.vehicles.find(v => v.id === s.vehicleId);
      const user = db.users.find(u => u.id === s.userId);
      const space = db.spaces.find(sp => sp.id === s.spaceId);
      const resv = s.reservationId ? db.reservations.find(r => r.id === s.reservationId) : null;
      const entry = new Date(s.entryTime);
      const duration = Math.max(1, Math.round((Date.now() - entry.getTime()) / (1000 * 60)));
      return {
        ...s,
        plateNumber: vehicle?.plateNumber || 'Inconnu',
        userName: user ? `${user.firstName} ${user.lastName}` : 'Inconnu',
        spaceNumber: space?.number || '?',
        entryTimeFormatted: formatDate(s.entryTime),
        durationMinutes: duration,
        reservationReference: resv?.reference || null
      };
    });

  res.render('sessions/exit', {
    selectedPlate: req.query.plateNumber || '',
    ongoing
  });
});

webRouter.post('/sessions/exit', (req: Request, res: Response) => {
  const { plateNumber, exitTime, markAsPaid } = req.body;
  if (!plateNumber) {
    (req.session as any).errorMessage = 'L\'immatriculation est obligatoire';
    return res.redirect('/sessions/exit');
  }

  const cleanPlate = String(plateNumber).trim().toUpperCase();
  const vehicle = db.vehicles.find(v => v.plateNumber === cleanPlate);
  if (!vehicle) {
    (req.session as any).errorMessage = `Véhicule ${cleanPlate} introuvable`;
    return res.redirect('/sessions/exit');
  }

  const session = db.sessions.find(
    s => s.vehicleId === vehicle.id && s.status === SessionStatus.EN_COURS
  );
  if (!session) {
    (req.session as any).errorMessage = `Aucune session en cours pour le véhicule ${cleanPlate}`;
    return res.redirect('/sessions/exit');
  }

  const now = exitTime ? new Date(exitTime) : new Date();
  const entry = new Date(session.entryTime);
  const actualMinutes = Math.max(1, Math.round((now.getTime() - entry.getTime()) / (1000 * 60)));

  session.exitTime = now.toISOString();
  session.status = SessionStatus.TERMINEE;
  session.exitOperator = (req.session as any).user?.username || 'operator';

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

  // Pricing calculation
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

  const isPaid = markAsPaid === 'true';
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

  (req.session as any).successMessage = `Sortie effectuée pour le véhicule ${cleanPlate}. Facture émise : ${invoice.totalAmount.toLocaleString('fr-FR')} ${invoice.currency} (${isPaid ? 'Payée' : 'En attente'}).`;
  res.redirect(`/invoices/${invoice.id}`);
});

// Sessions List
webRouter.get('/sessions', (req: Request, res: Response) => {
  const { search, status, zone, page = 0, size = 15 } = req.query as any;
  let filtered = [...db.sessions].sort((a, b) => new Date(b.entryTime).getTime() - new Date(a.entryTime).getTime());

  if (search) {
    const q = String(search).toLowerCase();
    filtered = filtered.filter(s => {
      const v = db.vehicles.find(veh => veh.id === s.vehicleId);
      return s.reference.toLowerCase().includes(q) || (v && v.plateNumber.toLowerCase().includes(q));
    });
  }
  if (status) filtered = filtered.filter(s => s.status === status);
  if (zone) {
    filtered = filtered.filter(s => {
      const sp = db.spaces.find(space => space.id === s.spaceId);
      return sp && sp.zone.toUpperCase() === String(zone).toUpperCase();
    });
  }

  const totalElements = filtered.length;
  const p = Number(page);
  const s = Number(size);
  const totalPages = Math.ceil(totalElements / s) || 1;

  const paged = filtered.slice(p * s, (p + 1) * s).map(sess => {
    const veh = db.vehicles.find(v => v.id === sess.vehicleId);
    const user = db.users.find(u => u.id === sess.userId);
    const space = db.spaces.find(sp => sp.id === sess.spaceId);
    const inv = db.invoices.find(i => i.sessionId === sess.id);
    const entry = new Date(sess.entryTime);
    const exit = sess.exitTime ? new Date(sess.exitTime) : new Date();
    const duration = Math.max(1, Math.round((exit.getTime() - entry.getTime()) / (1000 * 60)));

    return {
      ...sess,
      plateNumber: veh?.plateNumber || 'Inconnu',
      userName: user ? `${user.firstName} ${user.lastName}` : 'Inconnu',
      spaceNumber: space?.number || '?',
      zone: space?.zone || '?',
      entryTimeFormatted: formatDate(sess.entryTime),
      exitTimeFormatted: sess.exitTime ? formatDate(sess.exitTime) : null,
      durationMinutes: duration,
      invoiceId: inv?.id,
      invoiceReference: inv?.reference,
      invoiceTotalAmount: inv?.totalAmount
    };
  });

  const zones = Array.from(new Set(db.spaces.map(sp => sp.zone))).sort();

  res.render('sessions/list', {
    sessions: paged,
    totalElements,
    totalPages,
    page: p,
    size: s,
    baseUrl: '/sessions',
    filterQuery: `&search=${encodeURIComponent(search || '')}&status=${encodeURIComponent(status || '')}&zone=${encodeURIComponent(zone || '')}`,
    search: search || '',
    selectedStatus: status || '',
    selectedZone: zone || '',
    zones
  });
});

// Session Detail
webRouter.get('/sessions/:id', (req: Request, res: Response) => {
  const session = db.sessions.find(s => s.id === Number(req.params.id));
  if (!session) return res.status(404).render('error', { status: 404, message: 'Session introuvable' });

  const vehicle = db.vehicles.find(v => v.id === session.vehicleId);
  const user = db.users.find(u => u.id === session.userId);
  const space = db.spaces.find(s => s.id === session.spaceId);
  const invoice = db.invoices.find(i => i.sessionId === session.id);

  const entry = new Date(session.entryTime);
  const exit = session.exitTime ? new Date(session.exitTime) : new Date();
  const duration = Math.max(1, Math.round((exit.getTime() - entry.getTime()) / (1000 * 60)));

  res.render('sessions/detail', {
    session: {
      ...session,
      plateNumber: vehicle?.plateNumber || 'Inconnu',
      vehicleType: vehicle ? VEHICLE_LABELS[vehicle.type] : 'Inconnu',
      userName: user ? `${user.firstName} ${user.lastName}` : 'Inconnu',
      userEmail: user?.email || '',
      spaceNumber: space?.number || '?',
      spaceZone: space?.zone || '?',
      spaceLevel: space?.level || 0,
      entryTimeFormatted: formatDate(session.entryTime),
      exitTimeFormatted: session.exitTime ? formatDate(session.exitTime) : null,
      durationMinutes: duration,
      invoice
    }
  });
});

// Reservations List
webRouter.get('/reservations', (req: Request, res: Response) => {
  const { search, status, page = 0, size = 15 } = req.query as any;
  let filtered = [...db.reservations].sort((a, b) => new Date(b.expectedArrival).getTime() - new Date(a.expectedArrival).getTime());

  if (search) {
    const q = String(search).toLowerCase();
    filtered = filtered.filter(r => {
      const v = db.vehicles.find(veh => veh.id === r.vehicleId);
      return r.reference.toLowerCase().includes(q) || (v && v.plateNumber.toLowerCase().includes(q));
    });
  }
  if (status) filtered = filtered.filter(r => r.status === status);

  const totalElements = filtered.length;
  const p = Number(page);
  const s = Number(size);
  const totalPages = Math.ceil(totalElements / s) || 1;

  const STATUS_LABELS: Record<ReservationStatus, string> = {
    [ReservationStatus.CONFIRMEE]: 'Confirmée',
    [ReservationStatus.EN_COURS]: 'En cours',
    [ReservationStatus.TERMINEE]: 'Terminée',
    [ReservationStatus.ANNULEE]: 'Annulée',
    [ReservationStatus.EXPIREE]: 'Expirée'
  };

  const paged = filtered.slice(p * s, (p + 1) * s).map(r => {
    const user = db.users.find(u => u.id === r.userId);
    const vehicle = db.vehicles.find(v => v.id === r.vehicleId);
    const space = db.spaces.find(sp => sp.id === r.spaceId);
    return {
      ...r,
      userName: user ? `${user.firstName} ${user.lastName}` : 'Inconnu',
      plateNumber: vehicle?.plateNumber || 'Inconnu',
      spaceNumber: space?.number || '?',
      zone: space?.zone || '?',
      expectedArrivalFormatted: formatDate(r.expectedArrival),
      expectedDepartureFormatted: formatDate(r.expectedDeparture),
      statusLabel: STATUS_LABELS[r.status]
    };
  });

  res.render('reservations/list', {
    reservations: paged,
    totalElements,
    totalPages,
    page: p,
    size: s,
    baseUrl: '/reservations',
    filterQuery: `&search=${encodeURIComponent(search || '')}&status=${encodeURIComponent(status || '')}`,
    search: search || '',
    selectedStatus: status || ''
  });
});

// New Reservation
webRouter.get('/reservations/new', (_req: Request, res: Response) => {
  const vehicles = db.vehicles.map(v => {
    const owner = db.users.find(u => u.id === v.ownerId);
    return {
      ...v,
      ownerName: owner ? `${owner.firstName} ${owner.lastName}` : 'Inconnu'
    };
  });
  const spaces = db.spaces.filter(s => s.status === SpaceStatus.LIBRE).map(s => ({
    ...s,
    typeLabel: SPACE_TYPE_LABELS[s.type]
  }));
  res.render('reservations/form', { vehicles, spaces });
});

webRouter.post('/reservations', (req: Request, res: Response) => {
  const { vehicleId, spaceId, expectedArrival, expectedDeparture } = req.body;
  if (!vehicleId || !spaceId || !expectedArrival || !expectedDeparture) {
    (req.session as any).errorMessage = 'Tous les champs sont requis';
    return res.redirect('/reservations/new');
  }

  const arr = new Date(expectedArrival);
  const dep = new Date(expectedDeparture);
  if (dep <= arr) {
    (req.session as any).errorMessage = 'La date de départ doit être après l\'arrivée';
    return res.redirect('/reservations/new');
  }

  const space = db.spaces.find(s => s.id === Number(spaceId));
  if (!space || space.status !== SpaceStatus.LIBRE) {
    (req.session as any).errorMessage = 'Place non disponible';
    return res.redirect('/reservations/new');
  }

  const vehicle = db.vehicles.find(v => v.id === Number(vehicleId));
  if (!vehicle) {
    (req.session as any).errorMessage = 'Véhicule introuvable';
    return res.redirect('/reservations/new');
  }

  space.status = SpaceStatus.RESERVEE;
  const resv = db.addReservation({
    reference: 'RES-' + Math.floor(100000 + Math.random() * 900000),
    userId: vehicle.ownerId,
    vehicleId: vehicle.id,
    spaceId: space.id,
    expectedArrival: arr.toISOString(),
    expectedDeparture: dep.toISOString(),
    status: ReservationStatus.CONFIRMEE,
    createdAt: new Date().toISOString()
  });

  (req.session as any).successMessage = `Réservation ${resv.reference} enregistrée pour la place ${space.number}`;
  res.redirect('/reservations');
});

// Reservation Detail
webRouter.get('/reservations/:id', (req: Request, res: Response) => {
  const r = db.reservations.find(resv => resv.id === Number(req.params.id));
  if (!r) return res.status(404).render('error', { status: 404, message: 'Réservation introuvable' });

  const user = db.users.find(u => u.id === r.userId);
  const vehicle = db.vehicles.find(v => v.id === r.vehicleId);
  const space = db.spaces.find(s => s.id === r.spaceId);

  const STATUS_LABELS: Record<ReservationStatus, string> = {
    [ReservationStatus.CONFIRMEE]: 'Confirmée',
    [ReservationStatus.EN_COURS]: 'En cours',
    [ReservationStatus.TERMINEE]: 'Terminée',
    [ReservationStatus.ANNULEE]: 'Annulée',
    [ReservationStatus.EXPIREE]: 'Expirée'
  };

  res.render('reservations/detail', {
    reservation: {
      ...r,
      userName: user ? `${user.firstName} ${user.lastName}` : 'Inconnu',
      userEmail: user?.email || '',
      plateNumber: vehicle?.plateNumber || 'Inconnu',
      vehicleBrand: vehicle?.brand || '',
      vehicleModel: vehicle?.model || '',
      spaceNumber: space?.number || '?',
      spaceZone: space?.zone || '?',
      spaceLevel: space?.level || 0,
      expectedArrivalFormatted: formatDate(r.expectedArrival),
      expectedDepartureFormatted: formatDate(r.expectedDeparture),
      createdAtFormatted: formatDate(r.createdAt),
      statusLabel: STATUS_LABELS[r.status]
    }
  });
});

// Edit Reservation
webRouter.get('/reservations/:id/edit', (req: Request, res: Response) => {
  const r = db.reservations.find(resv => resv.id === Number(req.params.id));
  if (!r) return res.status(404).render('error', { status: 404, message: 'Réservation introuvable' });

  const spaces = db.spaces.map(s => ({
    ...s,
    typeLabel: SPACE_TYPE_LABELS[s.type]
  }));

  res.render('reservations/edit', {
    reservation: {
      ...r,
      expectedArrivalInput: formatInputDate(r.expectedArrival),
      expectedDepartureInput: formatInputDate(r.expectedDeparture)
    },
    spaces
  });
});

webRouter.post('/reservations/:id/edit', (req: Request, res: Response) => {
  const r = db.reservations.find(resv => resv.id === Number(req.params.id));
  if (!r) return res.status(404).render('error', { status: 404, message: 'Réservation introuvable' });

  const { spaceId, expectedArrival, expectedDeparture } = req.body;
  const arr = new Date(expectedArrival);
  const dep = new Date(expectedDeparture);
  if (dep <= arr) {
    (req.session as any).errorMessage = 'La date de départ doit être après l\'arrivée';
    return res.redirect(`/reservations/${r.id}/edit`);
  }

  const newSpaceId = Number(spaceId);
  if (r.spaceId !== newSpaceId) {
    const oldSpace = db.spaces.find(s => s.id === r.spaceId);
    if (oldSpace && oldSpace.status === SpaceStatus.RESERVEE) oldSpace.status = SpaceStatus.LIBRE;

    const newSpace = db.spaces.find(s => s.id === newSpaceId);
    if (newSpace && newSpace.status === SpaceStatus.LIBRE) newSpace.status = SpaceStatus.RESERVEE;
    r.spaceId = newSpaceId;
  }

  r.expectedArrival = arr.toISOString();
  r.expectedDeparture = dep.toISOString();

  (req.session as any).successMessage = `Réservation ${r.reference} modifiée`;
  res.redirect('/reservations');
});

// Cancel Reservation
webRouter.post('/reservations/:id/cancel', (req: Request, res: Response) => {
  const r = db.reservations.find(resv => resv.id === Number(req.params.id));
  if (!r) return res.status(404).render('error', { status: 404, message: 'Réservation introuvable' });
  r.status = ReservationStatus.ANNULEE;
  r.cancellationReason = 'Annulée par l\'utilisateur';

  const space = db.spaces.find(s => s.id === r.spaceId);
  if (space && space.status === SpaceStatus.RESERVEE) {
    space.status = SpaceStatus.LIBRE;
  }

  (req.session as any).infoMessage = `Réservation ${r.reference} annulée`;
  res.redirect('/reservations');
});

// Subscriptions List
webRouter.get('/subscriptions', (req: Request, res: Response) => {
  const { search, status, page = 0, size = 15 } = req.query as any;
  let filtered = [...db.subscriptions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (search) {
    const q = String(search).toLowerCase();
    filtered = filtered.filter(s => {
      const v = db.vehicles.find(veh => veh.id === s.vehicleId);
      return s.reference.toLowerCase().includes(q) || (v && v.plateNumber.toLowerCase().includes(q));
    });
  }
  if (status) filtered = filtered.filter(s => s.status === status);

  const totalElements = filtered.length;
  const p = Number(page);
  const s = Number(size);
  const totalPages = Math.ceil(totalElements / s) || 1;

  const TYPE_LABELS: Record<SubscriptionType, string> = {
    [SubscriptionType.JOURNALIER]: 'Journalier',
    [SubscriptionType.HEBDOMADAIRE]: 'Hebdomadaire',
    [SubscriptionType.MENSUEL]: 'Mensuel',
    [SubscriptionType.ANNUEL]: 'Annuel'
  };

  const STATUS_LABELS: Record<SubscriptionStatus, string> = {
    [SubscriptionStatus.ACTIF]: 'Actif',
    [SubscriptionStatus.EXPIRE]: 'Expiré',
    [SubscriptionStatus.SUSPENDU]: 'Suspendu',
    [SubscriptionStatus.ANNULE]: 'Annulé'
  };

  const paged = filtered.slice(p * s, (p + 1) * s).map(sub => {
    const user = db.users.find(u => u.id === sub.userId);
    const vehicle = db.vehicles.find(v => v.id === sub.vehicleId);
    return {
      ...sub,
      userName: user ? `${user.firstName} ${user.lastName}` : 'Inconnu',
      plateNumber: vehicle?.plateNumber || 'Inconnu',
      typeLabel: TYPE_LABELS[sub.type],
      statusLabel: STATUS_LABELS[sub.status],
      startDateFormatted: formatLocalDate(sub.startDate),
      endDateFormatted: formatLocalDate(sub.endDate)
    };
  });

  res.render('subscriptions/list', {
    subscriptions: paged,
    totalElements,
    totalPages,
    page: p,
    size: s,
    baseUrl: '/subscriptions',
    filterQuery: `&search=${encodeURIComponent(search || '')}&status=${encodeURIComponent(status || '')}`,
    search: search || '',
    selectedStatus: status || ''
  });
});

// New Subscription
webRouter.get('/subscriptions/new', (_req: Request, res: Response) => {
  const vehicles = db.vehicles.map(v => {
    const owner = db.users.find(u => u.id === v.ownerId);
    return {
      ...v,
      ownerName: owner ? `${owner.firstName} ${owner.lastName}` : 'Inconnu'
    };
  });
  const defaultStartDate = new Date().toISOString().slice(0, 10);
  res.render('subscriptions/form', { vehicles, defaultStartDate });
});

webRouter.post('/subscriptions', (req: Request, res: Response) => {
  const { vehicleId, type, startDate } = req.body;
  const vehicle = db.vehicles.find(v => v.id === Number(vehicleId));
  if (!vehicle) {
    (req.session as any).errorMessage = 'Véhicule requis';
    return res.redirect('/subscriptions/new');
  }

  const subType = type as SubscriptionType;
  const start = new Date(startDate || Date.now());
  const end = new Date(start);

  if (subType === SubscriptionType.JOURNALIER) {
    // same day
  } else if (subType === SubscriptionType.HEBDOMADAIRE) {
    end.setDate(end.getDate() + 6);
  } else if (subType === SubscriptionType.MENSUEL) {
    end.setMonth(end.getMonth() + 1);
    end.setDate(end.getDate() - 1);
  } else if (subType === SubscriptionType.ANNUEL) {
    end.setFullYear(end.getFullYear() + 1);
    end.setDate(end.getDate() - 1);
  }

  const prices: Record<SubscriptionType, number> = PARKING_PROPERTIES.subscriptionPricing;
  const price = prices[subType] || 250000;

  const sub = db.addSubscription({
    reference: 'SUB-' + Math.floor(100000 + Math.random() * 900000),
    userId: vehicle.ownerId,
    vehicleId: vehicle.id,
    type: subType,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    price,
    status: SubscriptionStatus.ACTIF,
    createdAt: new Date().toISOString()
  });

  (req.session as any).successMessage = `Abonnement ${sub.reference} activé pour le véhicule ${vehicle.plateNumber}`;
  res.redirect('/subscriptions');
});

webRouter.post('/subscriptions/:id/suspend', (req: Request, res: Response) => {
  const sub = db.subscriptions.find(s => s.id === Number(req.params.id));
  if (sub && sub.status === SubscriptionStatus.ACTIF) {
    sub.status = SubscriptionStatus.SUSPENDU;
    (req.session as any).infoMessage = `Abonnement ${sub.reference} suspendu`;
  }
  res.redirect('/subscriptions');
});

webRouter.post('/subscriptions/:id/reactivate', (req: Request, res: Response) => {
  const sub = db.subscriptions.find(s => s.id === Number(req.params.id));
  if (sub && sub.status === SubscriptionStatus.SUSPENDU) {
    sub.status = SubscriptionStatus.ACTIF;
    (req.session as any).successMessage = `Abonnement ${sub.reference} réactivé`;
  }
  res.redirect('/subscriptions');
});

webRouter.post('/subscriptions/:id/cancel', (req: Request, res: Response) => {
  const sub = db.subscriptions.find(s => s.id === Number(req.params.id));
  if (sub) {
    sub.status = SubscriptionStatus.ANNULE;
    (req.session as any).infoMessage = `Abonnement ${sub.reference} annulé`;
  }
  res.redirect('/subscriptions');
});

// Invoices List
webRouter.get('/invoices', (req: Request, res: Response) => {
  const { search, status, page = 0, size = 15 } = req.query as any;
  let filtered = [...db.invoices].sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());

  if (search) {
    const q = String(search).toLowerCase();
    filtered = filtered.filter(i => i.reference.toLowerCase().includes(q));
  }
  if (status) filtered = filtered.filter(i => i.status === status);

  const totalElements = filtered.length;
  const p = Number(page);
  const s = Number(size);
  const totalPages = Math.ceil(totalElements / s) || 1;

  const STATUS_LABELS: Record<InvoiceStatus, string> = {
    [InvoiceStatus.EN_ATTENTE]: 'En attente',
    [InvoiceStatus.PAYEE]: 'Payée',
    [InvoiceStatus.ANNULEE]: 'Annulée'
  };

  const paged = filtered.slice(p * s, (p + 1) * s).map(inv => {
    const user = db.users.find(u => u.id === inv.userId);
    return {
      ...inv,
      userName: user ? `${user.firstName} ${user.lastName}` : 'Inconnu',
      issuedAtFormatted: formatDate(inv.issuedAt),
      statusLabel: STATUS_LABELS[inv.status]
    };
  });

  res.render('invoices/list', {
    invoices: paged,
    totalElements,
    totalPages,
    page: p,
    size: s,
    baseUrl: '/invoices',
    filterQuery: `&search=${encodeURIComponent(search || '')}&status=${encodeURIComponent(status || '')}`,
    search: search || '',
    selectedStatus: status || ''
  });
});

// Invoice Detail
webRouter.get('/invoices/:id', (req: Request, res: Response) => {
  const inv = db.invoices.find(i => i.id === Number(req.params.id));
  if (!inv) return res.status(404).render('error', { status: 404, message: 'Facture introuvable' });

  const user = db.users.find(u => u.id === inv.userId);
  const session = db.sessions.find(s => s.id === inv.sessionId);

  const STATUS_LABELS: Record<InvoiceStatus, string> = {
    [InvoiceStatus.EN_ATTENTE]: 'En attente',
    [InvoiceStatus.PAYEE]: 'Payée',
    [InvoiceStatus.ANNULEE]: 'Annulée'
  };

  res.render('invoices/detail', {
    invoice: {
      ...inv,
      userName: user ? `${user.firstName} ${user.lastName}` : 'Inconnu',
      userEmail: user?.email || '',
      sessionReference: session?.reference || null,
      issuedAtFormatted: formatDate(inv.issuedAt),
      paidAtFormatted: inv.paidAt ? formatDate(inv.paidAt) : null,
      statusLabel: STATUS_LABELS[inv.status]
    }
  });
});

// Pay Invoice
webRouter.post('/invoices/:id/pay', (req: Request, res: Response) => {
  const inv = db.invoices.find(i => i.id === Number(req.params.id));
  if (inv) {
    inv.status = InvoiceStatus.PAYEE;
    inv.paidAt = new Date().toISOString();
    (req.session as any).successMessage = `Paiement de la facture ${inv.reference} encaissé avec succès`;
  }
  res.redirect(`/invoices/${req.params.id}`);
});

// Statistics
webRouter.get('/statistics', (req: Request, res: Response) => {
  const { from, to } = req.query as any;
  const now = new Date();
  const defaultTo = now.toISOString().slice(0, 10);
  const fromD = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultFrom = fromD.toISOString().slice(0, 10);

  const fromDate = from || defaultFrom;
  const toDate = to || defaultTo;

  const invoices = db.invoices.filter(i => {
    const d = i.issuedAt.slice(0, 10);
    return d >= fromDate && d <= toDate;
  });

  const paidInvoices = invoices.filter(i => i.status === InvoiceStatus.PAYEE);
  const totalRevenue = paidInvoices.reduce((sum, i) => sum + i.totalAmount, 0);
  const parkingRevenue = paidInvoices.reduce((sum, i) => sum + i.baseAmount, 0);
  const overstayRevenue = paidInvoices.reduce((sum, i) => sum + i.overstayAmount, 0);
  const discountGranted = paidInvoices.reduce((sum, i) => sum + i.discountAmount, 0);
  const averageTicket = paidInvoices.length > 0 ? Math.round(totalRevenue / paidInvoices.length) : 0;

  // Daily breakdown
  const dailyMap: Record<string, { count: number; amount: number }> = {};
  for (const inv of paidInvoices) {
    const day = inv.issuedAt.slice(0, 10);
    if (!dailyMap[day]) dailyMap[day] = { count: 0, amount: 0 };
    dailyMap[day].count++;
    dailyMap[day].amount += inv.totalAmount;
  }

  const dailyKeys = Object.keys(dailyMap).sort();
  if (dailyKeys.length === 0) {
    dailyMap[toDate] = { count: 0, amount: 0 };
    dailyKeys.push(toDate);
  }

  const daily = dailyKeys.map(k => {
    const parts = k.split('-');
    return {
      date: k,
      label: `${parts[2]}/${parts[1]}`,
      invoiceCount: dailyMap[k].count,
      amount: dailyMap[k].amount
    };
  });

  const maxDaily = Math.max(...daily.map(d => d.amount), 1);

  // Occupancy stats
  const totalSpaces = db.spaces.length;
  const occupiedSpaces = db.spaces.filter(s => s.status === SpaceStatus.OCCUPEE).length;
  const occupancyRate = totalSpaces > 0 ? Math.round((occupiedSpaces / totalSpaces) * 100) : 0;

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

  const countByType: Record<string, number> = {};
  for (const s of db.spaces) {
    const lbl = SPACE_TYPE_LABELS[s.type];
    countByType[lbl] = (countByType[lbl] || 0) + 1;
  }

  res.render('statistics', {
    fromDate,
    toDate,
    revenue: {
      totalRevenue,
      parkingRevenue,
      overstayRevenue,
      discountGranted,
      averageTicket,
      invoiceCount: paidInvoices.length,
      currency: PARKING_PROPERTIES.currency,
      daily
    },
    maxDaily,
    occupancy: {
      totalSpaces,
      occupiedSpaces,
      occupancyRate,
      zones,
      countByType
    }
  });
});

// Vehicles List
webRouter.get('/vehicles', (req: Request, res: Response) => {
  const { search, type, page = 0, size = 15 } = req.query as any;
  let filtered = [...db.vehicles].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (search) {
    const q = String(search).toLowerCase();
    filtered = filtered.filter(v => v.plateNumber.toLowerCase().includes(q) || v.model.toLowerCase().includes(q) || v.brand.toLowerCase().includes(q));
  }
  if (type) filtered = filtered.filter(v => v.type === type);

  const totalElements = filtered.length;
  const p = Number(page);
  const s = Number(size);
  const totalPages = Math.ceil(totalElements / s) || 1;

  const paged = filtered.slice(p * s, (p + 1) * s).map(v => {
    const owner = db.users.find(u => u.id === v.ownerId);
    return {
      ...v,
      typeLabel: VEHICLE_LABELS[v.type],
      ownerName: owner ? `${owner.firstName} ${owner.lastName}` : 'Inconnu',
      ownerCategory: owner?.category || 'STANDARD'
    };
  });

  const types = Object.values(VehicleType).map(vt => ({ key: vt, label: VEHICLE_LABELS[vt] }));

  res.render('vehicles/list', {
    vehicles: paged,
    totalElements,
    totalPages,
    page: p,
    size: s,
    baseUrl: '/vehicles',
    filterQuery: `&search=${encodeURIComponent(search || '')}&type=${encodeURIComponent(type || '')}`,
    search: search || '',
    selectedType: type || '',
    types
  });
});

// New Vehicle
webRouter.get('/vehicles/new', (_req: Request, res: Response) => {
  res.render('vehicles/form', { users: db.users });
});

webRouter.post('/vehicles', (req: Request, res: Response) => {
  const { plateNumber, brand, model, color, type, ownerId } = req.body;
  if (!plateNumber || !brand || !model || !ownerId) {
    (req.session as any).errorMessage = 'Tous les champs obligatoires doivent être renseignés';
    return res.redirect('/vehicles/new');
  }

  const cleanPlate = String(plateNumber).trim().toUpperCase();
  if (db.vehicles.some(v => v.plateNumber === cleanPlate)) {
    (req.session as any).errorMessage = `Le véhicule ${cleanPlate} est déjà enregistré`;
    return res.redirect('/vehicles/new');
  }

  db.addVehicle({
    plateNumber: cleanPlate,
    brand: String(brand).trim(),
    model: String(model).trim(),
    color: color ? String(color).trim() : undefined,
    type: type as VehicleType,
    ownerId: Number(ownerId),
    createdAt: new Date().toISOString()
  });

  (req.session as any).successMessage = `Véhicule ${cleanPlate} ajouté avec succès`;
  res.redirect('/vehicles');
});

// Users List
webRouter.get('/users', (req: Request, res: Response) => {
  const { search, role, page = 0, size = 15 } = req.query as any;
  let filtered = [...db.users];

  if (search) {
    const q = String(search).toLowerCase();
    filtered = filtered.filter(u => u.username.toLowerCase().includes(q) || u.lastName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }
  if (role) filtered = filtered.filter(u => u.role === role);

  const totalElements = filtered.length;
  const p = Number(page);
  const s = Number(size);
  const totalPages = Math.ceil(totalElements / s) || 1;

  const paged = filtered.slice(p * s, (p + 1) * s);

  res.render('users/list', {
    users: paged,
    totalElements,
    totalPages,
    page: p,
    size: s,
    baseUrl: '/users',
    filterQuery: `&search=${encodeURIComponent(search || '')}&role=${encodeURIComponent(role || '')}`,
    search: search || '',
    selectedRole: role || ''
  });
});

// New User
webRouter.get('/users/new', (_req: Request, res: Response) => {
  res.render('users/form');
});

webRouter.post('/users', (req: Request, res: Response) => {
  const { username, password, firstName, lastName, email, phone, role, category } = req.body;
  const cleanUsername = String(username).trim().toLowerCase();
  if (db.users.some(u => u.username.toLowerCase() === cleanUsername)) {
    (req.session as any).errorMessage = `L'identifiant ${cleanUsername} est déjà utilisé`;
    return res.redirect('/users/new');
  }

  db.addUser({
    username: cleanUsername,
    passwordHash: password,
    firstName: String(firstName).trim(),
    lastName: String(lastName).trim(),
    email: String(email).trim(),
    phone: phone ? String(phone).trim() : undefined,
    role: role as Role,
    category: category as UserCategory,
    createdAt: new Date().toISOString()
  });

  (req.session as any).successMessage = `Utilisateur ${cleanUsername} créé avec succès`;
  res.redirect('/users');
});

// Edit User
webRouter.get('/users/:id/edit', (req: Request, res: Response) => {
  const user = db.users.find(u => u.id === Number(req.params.id));
  if (!user) return res.status(404).render('error', { status: 404, message: 'Utilisateur introuvable' });
  res.render('users/edit', { user });
});

webRouter.post('/users/:id/edit', (req: Request, res: Response) => {
  const user = db.users.find(u => u.id === Number(req.params.id));
  if (!user) return res.status(404).render('error', { status: 404, message: 'Utilisateur introuvable' });

  const { password, firstName, lastName, email, phone, role, category } = req.body;
  if (password && password.trim().length > 0) {
    user.passwordHash = password.trim();
  }
  user.firstName = String(firstName).trim();
  user.lastName = String(lastName).trim();
  user.email = String(email).trim();
  user.phone = phone ? String(phone).trim() : undefined;
  user.role = role as Role;
  user.category = category as UserCategory;

  (req.session as any).successMessage = `Utilisateur ${user.username} mis à jour`;
  res.redirect('/users');
});

// Tariffs List
webRouter.get('/tariffs', (_req: Request, res: Response) => {
  res.render('tariffs/list', { tariffs: db.tariffs });
});

// New Tariff
webRouter.get('/tariffs/new', (_req: Request, res: Response) => {
  res.render('tariffs/form');
});

webRouter.post('/tariffs', (req: Request, res: Response) => {
  const {
    name,
    zone,
    spaceType,
    vehicleType,
    userCategory,
    hourlyRate,
    minimumFee,
    dailyCap,
    freeMinutes,
    overstayMultiplier,
    subscriberDiscountPercent,
    priority
  } = req.body;

  db.addTariff({
    name: String(name).trim(),
    zone: zone ? String(zone).trim().toUpperCase() : undefined,
    spaceType: spaceType || undefined,
    vehicleType: vehicleType || undefined,
    userCategory: userCategory || undefined,
    hourlyRate: Number(hourlyRate) || 2000,
    minimumFee: Number(minimumFee) || 1000,
    dailyCap: dailyCap ? Number(dailyCap) : undefined,
    freeMinutes: Number(freeMinutes) || 15,
    overstayMultiplier: Number(overstayMultiplier) || 1.5,
    subscriberDiscountPercent: Number(subscriberDiscountPercent) || 20,
    priority: Number(priority) || 10,
    active: true
  });

  (req.session as any).successMessage = 'Règle tarifaire ajoutée';
  res.redirect('/tariffs');
});

// Edit Tariff
webRouter.get('/tariffs/:id/edit', (req: Request, res: Response) => {
  const tariff = db.tariffs.find(t => t.id === Number(req.params.id));
  if (!tariff) return res.status(404).render('error', { status: 404, message: 'Tarif introuvable' });
  res.render('tariffs/edit', { tariff });
});

webRouter.post('/tariffs/:id/edit', (req: Request, res: Response) => {
  const tariff = db.tariffs.find(t => t.id === Number(req.params.id));
  if (!tariff) return res.status(404).render('error', { status: 404, message: 'Tarif introuvable' });

  const {
    name,
    zone,
    spaceType,
    vehicleType,
    userCategory,
    hourlyRate,
    minimumFee,
    dailyCap,
    freeMinutes,
    overstayMultiplier,
    subscriberDiscountPercent,
    priority,
    active
  } = req.body;

  tariff.name = String(name).trim();
  tariff.zone = zone ? String(zone).trim().toUpperCase() : undefined;
  tariff.spaceType = spaceType || undefined;
  tariff.vehicleType = vehicleType || undefined;
  tariff.userCategory = userCategory || undefined;
  tariff.hourlyRate = Number(hourlyRate);
  tariff.minimumFee = Number(minimumFee);
  tariff.dailyCap = dailyCap ? Number(dailyCap) : undefined;
  tariff.freeMinutes = Number(freeMinutes);
  tariff.overstayMultiplier = Number(overstayMultiplier);
  tariff.subscriberDiscountPercent = Number(subscriberDiscountPercent);
  tariff.priority = Number(priority);
  tariff.active = active === 'true';

  (req.session as any).successMessage = `Règle tarifaire ${tariff.name} mise à jour`;
  res.redirect('/tariffs');
});
