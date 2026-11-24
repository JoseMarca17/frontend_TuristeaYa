export type DemoRoleKey = 'tourist' | 'vip' | 'advertiser' | 'support' | 'admin';

export type DemoAccount = {
  key: DemoRoleKey;
  title: string;
  roleLabel: string;
  backendRole: string;
  badge: string;
  email: string;
  password: string;
  fullName: string;
  routeTarget: string;
  canAutoRegisterOnRender: boolean;
  summary: string;
  differences: string[];
  renderOperations: string[];
};

export const DEMO_PASSWORD = 'TuristeaDemo2026!';

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    key: 'tourist',
    title: 'Turista',
    roleLabel: 'Rol: tourist',
    backendRole: 'tourist',
    badge: 'Acceso estándar',
    email: 'turista.demo@turisteaya.org',
    password: DEMO_PASSWORD,
    fullName: 'María Turista Demo',
    routeTarget: '/turista',
    canAutoRegisterOnRender: true,
    summary: 'Explora rutas públicas, crea y edita sus propias rutas, guarda favoritos, escribe reseñas, canjea cupones y reserva experiencias.',
    differences: [
      'Ve el catálogo público de rutas, lugares, reseñas y cupones activos.',
      'Solo puede editar/eliminar sus propias rutas, reseñas, intereses y mensajes.',
      'No accede a experiencias exclusivas VIP ni a paneles de soporte/admin.',
    ],
    renderOperations: [
      'POST/PATCH/DELETE: routes, route-stops, saved-routes, reviews, user-interests, ticket-messages',
      'POST: promotions/{id}/redeem, experiences/{id}/reserve, place-visits, tickets, media/reviews/{id}',
      'PATCH: profiles/{id}, notifications/{id} (read_at)',
    ],
  },
  {
    key: 'vip',
    title: 'Turista VIP',
    roleLabel: 'Rol: tourist + VIP activo',
    backendRole: 'tourist (con suscripción)',
    badge: 'Beneficios VIP',
    email: 'vip.demo@turisteaya.org',
    password: DEMO_PASSWORD,
    fullName: 'Carlos VIP Demo',
    routeTarget: '/vip',
    canAutoRegisterOnRender: false,
    summary: 'Cuenta turista con suscripción VIP activa en Render: desbloquea experiencias exclusivas VIP y descargas offline de rutas.',
    differences: [
      'Incluye todas las operaciones CRUD del rol Turista.',
      'Desbloquea reservas en experiencias marcadas como vip_only = true.',
      'Puede registrar y eliminar descargas de rutas sin conexión (offline-downloads).',
    ],
    renderOperations: [
      'Todo lo de Turista + experiencias VIP (experiences/{id}/reserve)',
      'POST/DELETE: offline-downloads (requiere suscripción activa en Supabase)',
      'GET: subscriptions, subscription-plans, coupon-redemptions, reservations',
    ],
  },
  {
    key: 'advertiser',
    title: 'Negocio / Anunciante',
    roleLabel: 'Rol: advertiser (dueño)',
    backendRole: 'advertiser',
    badge: 'Gestión comercial',
    email: 'negocio.demo@turisteaya.org',
    password: DEMO_PASSWORD,
    fullName: 'Lucía Negocio Demo',
    routeTarget: '/RamaNegocio',
    canAutoRegisterOnRender: true,
    summary: 'Administra establecimientos, lugares, horarios, fotos, promociones/cupones, experiencias, campañas y respuestas a reseñas.',
    differences: [
      'Gestiona únicamente negocios propios (owner_id = su usuario) y sus recursos.',
      'Crea y pausa/activa promociones, experiencias y campañas publicitarias.',
      'Responde reseñas de sus lugares y solicita verificación comercial.',
    ],
    renderOperations: [
      'POST/PATCH/DELETE: businesses, places, opening-hours, place-categories, promotions, experiences, campaigns, review-replies',
      'POST: media/places/{id}, business-verifications',
      'PATCH/DELETE: notifications/{id}',
    ],
  },
  {
    key: 'support',
    title: 'Soporte Técnico',
    roleLabel: 'Rol: support',
    backendRole: 'support',
    badge: 'Atención de tickets',
    email: 'soporte.demo@turisteaya.org',
    password: DEMO_PASSWORD,
    fullName: 'Ana Soporte Demo',
    routeTarget: '/soporte',
    canAutoRegisterOnRender: false,
    summary: 'Atiende todos los tickets y reportes de turistas y negocios, responde en conversaciones y cambia estados y prioridades.',
    differences: [
      'Accede a todos los tickets de soporte de la plataforma (no solo los propios).',
      'Puede cambiar estado (pending, in_progress, resolved, closed) y prioridad.',
      'No puede cambiar roles de usuarios ni aprobar verificaciones (eso es de Admin).',
    ],
    renderOperations: [
      'GET: tickets, ticket-messages, profiles de usuarios con casos abiertos',
      'PATCH/DELETE: tickets/{id} (estado, prioridad, asignación)',
      'POST/PATCH/DELETE: ticket-messages, POST: notifications',
    ],
  },
  {
    key: 'admin',
    title: 'Administrador',
    roleLabel: 'Rol: admin',
    backendRole: 'admin',
    badge: 'Control total',
    email: 'admin.demo@turisteaya.org',
    password: DEMO_PASSWORD,
    fullName: 'Diego Admin Demo',
    routeTarget: '/admin',
    canAutoRegisterOnRender: false,
    summary: 'Control integral: gestiona roles y estados de cuentas, aprueba comercios, modera reseñas, otorga VIP y administra catálogos globales.',
    differences: [
      'Único rol que puede cambiar permisos en user-access (excepto los propios).',
      'Aprueba o solicita corrección en business-verifications y modera reseñas.',
      'Administra categorías, zonas, planes VIP, suscripciones y consulta audit-logs.',
    ],
    renderOperations: [
      'POST/PATCH/DELETE: user-access, categories, zones, subscription-plans, subscriptions, moderation-actions, routes, places, notifications',
      'PATCH/DELETE: business-verifications, reviews (hidden)',
      'GET: audit-logs (solo lectura de auditoría)',
    ],
  },
];

export const GUEST_ROLE_INFO = {
  title: 'Invitado (sin sesión)',
  roleLabel: 'Sin cuenta',
  summary: 'Permite explorar el catálogo público de rutas, lugares, cupones, experiencias y reseñas en modo lectura, además de guardar borradores locales en el dispositivo.',
  differences: [
    'Puede ver todas las rutas públicas y aplicar filtros o búsqueda sin iniciar sesión.',
    'Las rutas guardadas en "Mis rutas" como invitado solo viven en este dispositivo.',
    'Cualquier operación POST, PATCH o DELETE hacia Render solicita iniciar sesión.',
  ],
};

export function findDemoAccount(key: DemoRoleKey): DemoAccount {
  return DEMO_ACCOUNTS.find((item) => item.key === key) ?? DEMO_ACCOUNTS[0];
}
