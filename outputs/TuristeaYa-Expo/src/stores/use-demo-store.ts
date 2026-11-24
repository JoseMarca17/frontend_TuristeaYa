import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { BackendPlannedRoute } from '@/features/turista/data/backend-routes';
import type { CatalogRow } from '@/services/catalog';
import { safeStorage } from './storage';

let demoSeq = 0;

export function createDemoId(prefix: string) {
  demoSeq += 1;
  return `${prefix}-${Date.now()}-${demoSeq}`;
}

export type DemoReview = {
  id: string;
  place_id: string;
  user_id: string;
  author: string;
  rating: number;
  body: string;
  hidden: boolean;
  created_at: string;
  photos: string[];
};

export type DemoReply = {
  id: string;
  review_id: string;
  business_id: string;
  body: string;
  created_at: string;
};

export type DemoReservation = {
  id: string;
  experience_id: string;
  title: string;
  participants: number;
  total: number;
  status: string;
  created_at: string;
};

export type DemoVisit = {
  id: string;
  place_id: string;
  place_name: string;
  visited_at: string;
};

type DemoStoreState = {
  profileName: string;
  profilePhone: string;
  interests: string[];
  routes: BackendPlannedRoute[];
  savedRouteIds: string[];
  visitedRouteIds: string[];
  visits: DemoVisit[];
  reservations: DemoReservation[];
  reviews: DemoReview[];
  reviewReplies: DemoReply[];
  tickets: CatalogRow[];
  ticketMessages: CatalogRow[];
  notifications: CatalogRow[];
  businesses: CatalogRow[];
  places: CatalogRow[];
  promotions: CatalogRow[];
  experiences: CatalogRow[];
  campaigns: CatalogRow[];
  verifications: CatalogRow[];
  userAccess: CatalogRow[];
  moderationActions: CatalogRow[];

  updateProfile: (fullName: string, phone: string) => void;
  toggleInterest: (categoryId: string) => void;

  createRoute: (route: BackendPlannedRoute) => void;
  updateRoute: (id: string, patch: Partial<BackendPlannedRoute>) => void;
  deleteRoute: (id: string) => void;
  toggleSavedRoute: (routeId: string) => boolean;
  toggleVisitedRoute: (routeId: string) => void;

  addVisit: (placeId: string, placeName: string) => void;
  addReservation: (res: DemoReservation) => void;

  addReview: (rev: DemoReview) => void;
  updateReview: (id: string, patch: Partial<DemoReview>) => void;
  deleteReview: (id: string) => void;
  addReviewReply: (reply: DemoReply) => void;
  updateReviewReply: (id: string, body: string) => void;
  deleteReviewReply: (id: string) => void;

  addTicket: (ticket: CatalogRow) => void;
  updateTicket: (id: string, patch: Record<string, unknown>) => void;
  deleteTicket: (id: string) => void;
  addTicketMessage: (msg: CatalogRow) => void;
  updateTicketMessage: (id: string, body: string) => void;
  deleteTicketMessage: (id: string) => void;

  addNotification: (notif: CatalogRow) => void;
  markNotificationRead: (id: string) => void;
  deleteNotification: (id: string) => void;

  upsertEntityRow: (entity: 'businesses' | 'places' | 'promotions' | 'experiences' | 'campaigns' | 'verifications', row: CatalogRow) => void;
  deleteEntityRow: (entity: 'businesses' | 'places' | 'promotions' | 'experiences' | 'campaigns' | 'verifications', id: string) => void;

  updateUserAccess: (id: string, patch: Record<string, unknown>) => void;
  addModerationAction: (action: CatalogRow) => void;
};

const nowIso = () => new Date().toISOString();
const futureIso = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

const initialTickets: CatalogRow[] = [
  {
    id: 'demo-tk-1',
    user_id: 'demo-tourist',
    kind: 'coupon',
    priority: 'high',
    status: 'pending',
    subject: 'Validación de cupón en restaurante aliado',
    description: 'El comercio solicitó confirmar la vigencia del código PACENO2026.',
    redemption_id: 'demo-red-1',
    created_at: nowIso(),
  },
  {
    id: 'demo-tk-2',
    user_id: 'demo-advertiser',
    kind: 'other',
    priority: 'medium',
    status: 'in_progress',
    subject: 'Horario actualizado de atención',
    description: 'Se solicitó actualizar horario de fin de semana en ficha pública.',
    created_at: nowIso(),
  },
];

const initialMessages: CatalogRow[] = [
  {
    id: 'demo-tmsg-1',
    ticket_id: 'demo-tk-1',
    sender_id: 'demo-tourist',
    body: 'Mostré el QR de descuento en caja y quisiera confirmar el registro.',
    created_at: nowIso(),
  },
];

const initialNotifications: CatalogRow[] = [
  {
    id: 'demo-notif-1',
    user_id: 'demo-tourist',
    title: 'Bienvenido a la Vista Demo',
    body: 'Puedes explorar rutas, canjear cupones, publicar reseñas y gestionar cualquier vista.',
    read_at: null,
    created_at: nowIso(),
  },
];

const initialBusinesses: CatalogRow[] = [
  {
    id: 'demo-biz-1',
    owner_id: 'demo-advertiser',
    name: 'Sabores del Illimani',
    contact_email: 'contacto@saboresillimani.example',
    phone: '70011223',
  },
];

const initialPlaces: CatalogRow[] = [
  {
    id: 'demo-place-1',
    business_id: 'demo-biz-1',
    zone_id: '2589d156-5215-4835-a24e-60df473188a1',
    name: 'Café Altura Sopocachi',
    description: 'Cafetería de especialidad con terraza y repostería artesanal paceña.',
    address: 'Calle Rosendo Gutiérrez, Sopocachi',
    latitude: -16.5092,
    longitude: -68.1268,
    estimated_cost: 35,
    visit_minutes: 45,
    services: ['Wi-Fi', 'Pago QR', 'Reservas'],
    published: true,
  },
];

const initialExperiences: CatalogRow[] = [
  {
    id: 'demo-exp-1',
    business_id: 'demo-biz-1',
    place_id: 'demo-place-1',
    title: 'Cata privada de café de los Yungas',
    description: 'Recorrido guiado por métodos de extracción con degustación incluida.',
    starts_at: futureIso(5),
    price_per_person: 65,
    capacity: 10,
    vip_only: true,
    published: true,
  },
  {
    id: 'demo-exp-2',
    business_id: 'demo-biz-1',
    place_id: 'demo-place-1',
    title: 'Tarde de maridaje paceño',
    description: 'Degustación tradicional abierta a todo turista.',
    starts_at: futureIso(7),
    price_per_person: 45,
    capacity: 14,
    vip_only: false,
    published: true,
  },
];

const initialPromotions: CatalogRow[] = [
  {
    id: 'demo-promo-1',
    business_id: 'demo-biz-1',
    place_id: 'demo-place-1',
    title: '20% en desayuno artesanal',
    code: 'ALTURA20',
    discount_percent: 20,
    starts_at: nowIso(),
    ends_at: futureIso(30),
    max_redemptions: 50,
    per_user_limit: 2,
    conditions: 'Válido en consumo presencial',
    status: 'active',
  },
];

const initialCampaigns: CatalogRow[] = [
  {
    id: 'demo-camp-1',
    business_id: 'demo-biz-1',
    title: 'Temporada Cafeterías La Paz',
    ad_text: 'Descubre café de altura en Sopocachi con beneficios especiales.',
    placement: 'home',
    budget: 240,
    starts_at: nowIso(),
    ends_at: futureIso(30),
    radius_meters: 3000,
    status: 'active',
  },
];

const initialVerifications: CatalogRow[] = [
  {
    id: 'demo-ver-1',
    business_id: 'demo-biz-1',
    responsible_name: 'Lucía Morales',
    contact_email: 'contacto@saboresillimani.example',
    document_path: 'documentos/licencia-sopocachi.pdf',
    status: 'pending',
    review_notes: 'Solicitud lista para revisión.',
  },
];

const initialUserAccess: CatalogRow[] = [
  { id: 'demo-ua-1', user_id: 'demo-tourist-1', display_name: 'María Rojas (Turista)', role: 'tourist', status: 'active' },
  { id: 'demo-ua-2', user_id: 'demo-advertiser-1', display_name: 'Lucía Morales (Comercio)', role: 'advertiser', status: 'active' },
  { id: 'demo-ua-3', user_id: 'demo-support-1', display_name: 'Ana Quispe (Soporte)', role: 'support', status: 'active' },
];

export const useDemoStore = create<DemoStoreState>()(
  persist(
    (set, get) => ({
      profileName: 'Usuario Demo',
      profilePhone: '70012345',
      interests: [],
      routes: [],
      savedRouteIds: [],
      visitedRouteIds: [],
      visits: [],
      reservations: [],
      reviews: [],
      reviewReplies: [],
      tickets: initialTickets,
      ticketMessages: initialMessages,
      notifications: initialNotifications,
      businesses: initialBusinesses,
      places: initialPlaces,
      promotions: initialPromotions,
      experiences: initialExperiences,
      campaigns: initialCampaigns,
      verifications: initialVerifications,
      userAccess: initialUserAccess,
      moderationActions: [],

      updateProfile: (profileName, profilePhone) => set({ profileName, profilePhone }),
      toggleInterest: (categoryId) =>
        set((state) => ({
          interests: state.interests.includes(categoryId)
            ? state.interests.filter((id) => id !== categoryId)
            : [...state.interests, categoryId],
        })),

      createRoute: (route) =>
        set((state) => ({
          routes: [route, ...state.routes.filter((r) => r.id !== route.id)],
        })),
      updateRoute: (id, patch) =>
        set((state) => ({
          routes: state.routes.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        })),
      deleteRoute: (id) =>
        set((state) => ({
          routes: state.routes.filter((r) => r.id !== id),
          savedRouteIds: state.savedRouteIds.filter((rid) => rid !== id),
        })),
      toggleSavedRoute: (routeId) => {
        const exists = get().savedRouteIds.includes(routeId);
        set((state) => ({
          savedRouteIds: exists
            ? state.savedRouteIds.filter((id) => id !== routeId)
            : [routeId, ...state.savedRouteIds],
        }));
        return !exists;
      },
      toggleVisitedRoute: (routeId) =>
        set((state) => ({
          visitedRouteIds: state.visitedRouteIds.includes(routeId)
            ? state.visitedRouteIds.filter((id) => id !== routeId)
            : [...state.visitedRouteIds, routeId],
        })),

      addVisit: (placeId, placeName) =>
        set((state) => ({
          visits: [
            { id: `demo-visit-${Date.now()}`, place_id: placeId, place_name: placeName, visited_at: nowIso() },
            ...state.visits,
          ].slice(0, 30),
        })),
      addReservation: (res) =>
        set((state) => ({
          reservations: [res, ...state.reservations],
        })),

      addReview: (rev) => set((state) => ({ reviews: [rev, ...state.reviews] })),
      updateReview: (id, patch) =>
        set((state) => ({ reviews: state.reviews.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
      deleteReview: (id) =>
        set((state) => ({ reviews: state.reviews.filter((r) => r.id !== id) })),
      addReviewReply: (reply) => set((state) => ({ reviewReplies: [reply, ...state.reviewReplies] })),
      updateReviewReply: (id, body) =>
        set((state) => ({ reviewReplies: state.reviewReplies.map((r) => (r.id === id ? { ...r, body } : r)) })),
      deleteReviewReply: (id) =>
        set((state) => ({ reviewReplies: state.reviewReplies.filter((r) => r.id !== id) })),

      addTicket: (ticket) => set((state) => ({ tickets: [ticket, ...state.tickets] })),
      updateTicket: (id, patch) =>
        set((state) => ({ tickets: state.tickets.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
      deleteTicket: (id) =>
        set((state) => ({ tickets: state.tickets.filter((t) => t.id !== id) })),
      addTicketMessage: (msg) =>
        set((state) => ({ ticketMessages: [...state.ticketMessages, msg] })),
      updateTicketMessage: (id, body) =>
        set((state) => ({ ticketMessages: state.ticketMessages.map((m) => (m.id === id ? { ...m, body } : m)) })),
      deleteTicketMessage: (id) =>
        set((state) => ({ ticketMessages: state.ticketMessages.filter((m) => m.id !== id) })),

      addNotification: (notif) =>
        set((state) => ({ notifications: [notif, ...state.notifications] })),
      markNotificationRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) => (n.id === id ? { ...n, read_at: nowIso() } : n)),
        })),
      deleteNotification: (id) =>
        set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) })),

      upsertEntityRow: (entity, row) =>
        set((state) => {
          const current = state[entity];
          const exists = current.some((item) => item.id === row.id);
          return {
            [entity]: exists ? current.map((item) => (item.id === row.id ? { ...item, ...row } : item)) : [row, ...current],
          } as Partial<DemoStoreState>;
        }),
      deleteEntityRow: (entity, id) =>
        set((state) => ({
          [entity]: state[entity].filter((item) => item.id !== id),
        }) as Partial<DemoStoreState>),

      updateUserAccess: (id, patch) =>
        set((state) => ({
          userAccess: state.userAccess.map((u) => (u.id === id ? { ...u, ...patch } : u)),
        })),
      addModerationAction: (action) =>
        set((state) => ({ moderationActions: [action, ...state.moderationActions] })),
    }),
    {
      name: 'turisteaya.demo_workspace.v1',
      storage: createJSONStorage(() => safeStorage),
    },
  ),
);
