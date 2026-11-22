import type {
  AppNotification,
  AuditEntry,
  BenefitHistoryEntry,
  BusinessNotification,
  BusinessProfile,
  BusinessStats,
  Campaign,
  Coupon,
  ManagedUser,
  OfflineRoute,
  Place,
  PlatformStats,
  Promotion,
  RelatedActivity,
  ReportedReview,
  Review,
  SecurityAlert,
  Ticket,
  TourRoute,
  User,
  UserHistoryEntry,
  VerificationRequest,
  VipExperience,
} from '@/types';
import { getRecord, listRecords, profile, type CatalogRow } from './catalog';
import { ApiError } from './http';

/**
 * Interfaz de datos de la aplicación respaldada por la API de Render.
 *
 * Las pantallas nuevas deberían preferir los servicios especializados
 * (`catalog`, `management` y `transactions`). Esta fachada se mantiene para
 * las pantallas heredadas y ya no devuelve datos simulados.
 */
export interface ApiService {
  getPlaces(): Promise<Place[]>;
  getPlace(id: string): Promise<Place | undefined>;
  getReviews(placeId: string): Promise<Review[]>;
  getRoutes(): Promise<TourRoute[]>;
  getRoute(id: string): Promise<TourRoute | undefined>;
  getCoupons(): Promise<Coupon[]>;
  getCoupon(id: string): Promise<Coupon | undefined>;
  getNotifications(): Promise<AppNotification[]>;
  getUser(): Promise<User>;
  getOfflineRoutes(): Promise<OfflineRoute[]>;
  getVipExperience(): Promise<VipExperience>;
  getBenefitHistory(): Promise<BenefitHistoryEntry[]>;
  getBusinessProfile(): Promise<BusinessProfile>;
  getBusinessStats(): Promise<BusinessStats>;
  getPromotions(): Promise<Promotion[]>;
  getBusinessCampaigns(): Promise<Campaign[]>;
  getBusinessNotifications(): Promise<BusinessNotification[]>;
  getTickets(): Promise<Ticket[]>;
  getTicket(id: string): Promise<Ticket | undefined>;
  getUserHistory(): Promise<UserHistoryEntry[]>;
  getRelatedActivity(): Promise<RelatedActivity[]>;
  getPlatformStats(): Promise<PlatformStats>;
  getManagedUsers(): Promise<ManagedUser[]>;
  getVerificationRequest(): Promise<VerificationRequest>;
  getReportedReview(): Promise<ReportedReview>;
  getSecurityAlerts(): Promise<SecurityAlert[]>;
  getAuditEntries(): Promise<AuditEntry[]>;
}

const rows = <T>(entity: string, privateResource = false) =>
  listRecords<CatalogRow>(entity, { private: privateResource }) as Promise<T[]>;

const row = <T>(entity: string, id: string, privateResource = false) =>
  getRecord<CatalogRow>(entity, id, { private: privateResource })
    .then((value) => value as unknown as T)
    .catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) return undefined as T;
      throw error;
    });

export const api: ApiService = {
  getPlaces: () => rows<Place>('places'),
  getPlace: async (id) => row<Place>('places', id),
  getReviews: (placeId) => listRecords<CatalogRow>('reviews', { filters: { place_id: placeId } }) as unknown as Promise<Review[]>,
  getRoutes: () => rows<TourRoute>('routes'),
  getRoute: async (id) => row<TourRoute>('routes', id),
  getCoupons: () => rows<Coupon>('promotions'),
  getCoupon: async (id) => row<Coupon>('promotions', id),
  getNotifications: () => rows<AppNotification>('notifications', true),
  getUser: async () => {
    const current = await profile();
    return {
      name: current.full_name,
      email: '',
      accountType: 'turista',
      interests: [],
    };
  },
  getOfflineRoutes: () => rows<OfflineRoute>('offline-downloads', true),
  getVipExperience: async () => ({ } as VipExperience),
  getBenefitHistory: () => rows<BenefitHistoryEntry>('coupon-redemptions', true),
  getBusinessProfile: async () => { throw new Error('Usa el servicio de negocios para cargar el perfil del negocio.'); },
  getBusinessStats: async () => ({ } as BusinessStats),
  getPromotions: () => rows<Promotion>('promotions'),
  getBusinessCampaigns: () => rows<Campaign>('campaigns', true),
  getBusinessNotifications: () => rows<BusinessNotification>('notifications', true),
  getTickets: () => rows<Ticket>('tickets', true),
  getTicket: async (id) => row<Ticket>('tickets', id, true),
  getUserHistory: () => rows<UserHistoryEntry>('place-visits', true),
  getRelatedActivity: () => rows<RelatedActivity>('notifications', true),
  getPlatformStats: async () => ({ } as PlatformStats),
  getManagedUsers: () => rows<ManagedUser>('profiles', true),
  getVerificationRequest: async () => { throw new Error('La API requiere el ID de la solicitud de verificación.'); },
  getReportedReview: async () => { throw new Error('La API requiere el ID de la reseña reportada.'); },
  getSecurityAlerts: () => rows<SecurityAlert>('audit-logs', true),
  getAuditEntries: () => rows<AuditEntry>('audit-logs', true),
};
