import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Pantalla, TABS_NEGOCIO } from './Ui';
import { BusinessWizard } from './business-wizard';
import { AppText } from '@/components/ui/app-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { FormField } from '@/components/ui/form-field';
import { ListCard } from '@/components/ui/list-card';
import { ErrorState, LoadingState } from '@/components/ui/loading-state';
import { RoleBanner } from '@/components/ui/role-banner';
import { useRemoteData } from '@/hooks/use-remote-data';
import { listRecords, type CatalogRow } from '@/services/catalog';
import {
  aggregateCampaignHourlyTraffic,
  canManageBusiness,
  normalizeCampaignStatus,
  parseCouponVerificationCode,
} from '@/services/domain-rules';
import { validateAndCompressImage } from '@/services/image-upload';
import { createRecord, deleteRecord, updateRecord } from '@/services/management';
import { uploadPlaceMedia } from '@/services/media';
import {
  businessNotifications as demoBizNotifs,
  businessProfile as demoBizProfile,
} from '@/services/mock/business';
import { useAuthStore } from '@/stores/use-auth-store';
import { useDemoStore } from '@/stores/use-demo-store';
import { useUiStore } from '@/stores/use-ui-store';
import { colors, radius, spacing } from '@/theme';

type Mode = 'summary' | 'data' | 'places' | 'promotions' | 'experiences' | 'campaigns' | 'reviews' | 'notifications' | 'verification';
type Field = [string, string, 'text' | 'number' | 'date'];

const fields: Record<string, Field[]> = {
  data: [
    ['name', 'Nombre del negocio', 'text'],
    ['contact_email', 'Correo de contacto', 'text'],
    ['phone', 'Teléfono', 'text'],
  ],
  places: [
    ['name', 'Nombre del lugar', 'text'],
    ['description', 'Descripción', 'text'],
    ['address', 'Dirección', 'text'],
    ['latitude', 'Latitud (ej. -16.4955)', 'number'],
    ['longitude', 'Longitud (ej. -68.1336)', 'number'],
    ['estimated_cost', 'Costo estimado (Bs)', 'number'],
    ['visit_minutes', 'Duración visita (min)', 'number'],
  ],
  promotions: [
    ['title', 'Título', 'text'],
    ['code', 'Código (ej. TURISTEA20)', 'text'],
    ['discount_percent', 'Descuento (%)', 'number'],
    ['conditions', 'Condiciones', 'text'],
    ['starts_at', 'Inicio (AAAA-MM-DDTHH:mm)', 'date'],
    ['ends_at', 'Fin (AAAA-MM-DDTHH:mm)', 'date'],
    ['max_redemptions', 'Límite total', 'number'],
    ['per_user_limit', 'Límite por usuario', 'number'],
  ],
  experiences: [
    ['title', 'Título de la experiencia', 'text'],
    ['description', 'Descripción', 'text'],
    ['starts_at', 'Fecha y hora (AAAA-MM-DDTHH:mm)', 'date'],
    ['price_per_person', 'Precio por persona (Bs)', 'number'],
    ['capacity', 'Capacidad (personas)', 'number'],
  ],
  campaigns: [
    ['title', 'Título', 'text'],
    ['ad_text', 'Texto del anuncio', 'text'],
    ['budget', 'Presupuesto (Bs)', 'number'],
    ['starts_at', 'Inicio (AAAA-MM-DDTHH:mm)', 'date'],
    ['ends_at', 'Fin (AAAA-MM-DDTHH:mm)', 'date'],
    ['radius_meters', 'Radio (metros)', 'number'],
  ],
  verification: [
    ['responsible_name', 'Nombre del responsable', 'text'],
    ['contact_email', 'Correo de contacto', 'text'],
    ['document_path', 'Ruta o referencia del documento', 'text'],
  ],
};

const titles: Record<Mode, string> = {
  summary: 'Mi negocio',
  data: 'Datos del negocio',
  places: 'Mis lugares y horarios',
  promotions: 'Promociones y cupones',
  experiences: 'Experiencias',
  campaigns: 'Mis campañas',
  reviews: 'Reseñas y respuestas',
  notifications: 'Notificaciones',
  verification: 'Verificar establecimiento',
};

const entities: Record<string, string> = {
  data: 'businesses',
  places: 'places',
  promotions: 'promotions',
  experiences: 'experiences',
  campaigns: 'campaigns',
  verification: 'business-verifications',
};

function defaultDateLocal(daysAhead: number) {
  return new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 16);
}

function BusinessEditor({
  mode,
  row,
  businessId,
  places,
  zones,
  onSaved,
  onCancel,
  isDemo,
}: {
  mode: string;
  row?: CatalogRow;
  businessId: string;
  places: CatalogRow[];
  zones: CatalogRow[];
  onSaved: (demoRow?: CatalogRow, isEdit?: boolean) => void;
  onCancel?: () => void;
  isDemo?: boolean;
}) {
  const showToast = useUiStore((s) => s.showToast);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (fields[mode] || []).map(([key, , type]) => {
        if (row?.[key] != null) {
          if (type === 'date') return [key, String(row[key]).slice(0, 16)];
          return [key, String(row[key])];
        }
        if (key === 'starts_at') return [key, defaultDateLocal(mode === 'experiences' ? 3 : 0)];
        if (key === 'ends_at') return [key, defaultDateLocal(30)];
        if (key === 'latitude') return [key, '-16.4955'];
        if (key === 'longitude') return [key, '-68.1336'];
        if (key === 'estimated_cost') return [key, '35'];
        if (key === 'visit_minutes') return [key, '45'];
        if (key === 'max_redemptions') return [key, '50'];
        if (key === 'per_user_limit') return [key, '1'];
        if (key === 'radius_meters') return [key, '1000'];
        if (key === 'capacity') return [key, '12'];
        if (key === 'document_path') return [key, 'verificaciones/licencia-funcionamiento.pdf'];
        return [key, ''];
      }),
    ),
  );
  const [placeId, setPlaceId] = useState(String(row?.place_id || places[0]?.id || ''));
  const [zoneId, setZoneId] = useState(String(row?.zone_id || zones[0]?.id || ''));
  const [vipOnly, setVipOnly] = useState(Boolean(row?.vip_only));
  const [published, setPublished] = useState(row?.published !== false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  async function save() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNotice('');
    try {
      const payload: Record<string, unknown> = {};
      for (const [key, label, type] of fields[mode]) {
        const value = (values[key] || '').trim();
        const allowEmpty = ['phone', 'contact_email', 'description'].includes(key);
        if (!value && !allowEmpty) throw new Error(`Completa ${label}.`);
        if (type === 'number') {
          const number = Number(value.replace(',', '.'));
          const allowNegative = key === 'latitude' || key === 'longitude' || key === 'estimated_cost';
          if (!value || !Number.isFinite(number) || (!allowNegative && number <= 0)) {
            throw new Error(`${label} debe ser un número válido.`);
          }
          payload[key] = number;
        } else if (type === 'date') {
          if (!Number.isFinite(Date.parse(value))) throw new Error(`Fecha inválida: ${label}.`);
          payload[key] = new Date(value).toISOString();
        } else {
          payload[key] = value || null;
        }
      }
      if (payload.ends_at && payload.starts_at && String(payload.ends_at) <= String(payload.starts_at)) {
        throw new Error('La fecha final debe ser posterior al inicio.');
      }
      if (mode === 'promotions' || mode === 'experiences') {
        if (!placeId) throw new Error('Crea o asocia primero un lugar en "Mis lugares" para vincularlo.');
        payload.place_id = placeId;
      }
      if (mode === 'places') {
        if (!zoneId) throw new Error('Selecciona una zona para el lugar.');
        payload.zone_id = zoneId;
        payload.published = published;
      }
      if (mode === 'experiences') {
        payload.vip_only = vipOnly;
        payload.published = published;
      }
      if (mode === 'promotions' && !row) {
        payload.status = 'active';
      }

      if (isDemo) {
        const entityMap: Record<string, 'businesses' | 'places' | 'promotions' | 'experiences' | 'campaigns' | 'verifications' | undefined> = {
          data: 'businesses',
          places: 'places',
          promotions: 'promotions',
          experiences: 'experiences',
          campaigns: 'campaigns',
          verification: 'verifications',
        };
        const demoKey = entityMap[mode];
        const demoRow: CatalogRow = {
          id: row?.id || `demo-${Date.now()}`,
          business_id: businessId,
          ...payload,
        };
        if (demoKey) {
          useDemoStore.getState().upsertEntityRow(demoKey, demoRow);
        }
        showToast('Cambios guardados.', 'success');
        onSaved(demoRow, Boolean(row));
        return;
      }

      if (row) {
        await updateRecord(entities[mode], row.id, payload, 'Actualizando…');
      } else {
        await createRecord(
          entities[mode],
          {
            ...payload,
            business_id: businessId,
            ...(mode === 'campaigns' ? { placement: 'home' } : {}),
          },
          'Guardando…',
        );
      }
      showToast('Guardado.', 'success');
      onSaved();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <View style={styles.editorCard}>
      {fields[mode]?.map(([key, label, type]) => (
        <FormField
          key={key}
          label={label}
          value={values[key]}
          editable={!busy}
          keyboardType={type === 'number' ? 'decimal-pad' : 'default'}
          onChangeText={(value) => setValues((old) => ({ ...old, [key]: value }))}
        />
      ))}
      {mode === 'places' ? (
        <>
          <AppText variant="label">Zona del lugar</AppText>
          <View style={styles.chipRow}>
            {zones.slice(0, 8).map((zone) => (
              <Chip key={zone.id} label={String(zone.name)} selected={zoneId === zone.id} onPress={() => setZoneId(zone.id)} />
            ))}
          </View>
          <Chip label={published ? '✓ Publicado en catálogo' : 'Borrador oculto'} selected={published} onPress={() => setPublished((p) => !p)} />
        </>
      ) : null}
      {mode === 'promotions' || mode === 'experiences' ? (
        <>
          <AppText variant="label">Lugar asociado</AppText>
          <View style={styles.chipRow}>
            {places.map((place) => (
              <Chip key={place.id} label={String(place.name)} selected={placeId === place.id} onPress={() => setPlaceId(place.id)} />
            ))}
          </View>
          {!places.length ? (
            <View style={{ gap: 6 }}>
              <AppText variant="caption" style={{ color: '#b91c1c' }}>
                Primero crea un lugar en «Mis lugares» (en el panel Resumen → Lugares) para poder asociarlo aquí.
              </AppText>
              <Button title="Ir a crear un lugar" size="sm" variant="secondary" onPress={() => router.navigate('/RamaNegocio')} />
            </View>
          ) : null}
        </>
      ) : null}
      {mode === 'experiences' ? (
        <View style={styles.chipRow}>
          <Chip label={vipOnly ? '✓ Solo VIP' : 'Abierta a todo turista'} selected={vipOnly} onPress={() => setVipOnly((v) => !v)} />
          <Chip label={published ? '✓ Publicada' : 'Oculta'} selected={published} onPress={() => setPublished((p) => !p)} />
        </View>
      ) : null}
      {notice ? <AppText accessibilityRole="alert" style={{ color: '#b91c1c' }}>{notice}</AppText> : null}
      <View style={styles.chipRow}>
        <View style={{ flex: 1 }}>
          <Button title={busy ? 'Guardando…' : row ? 'Guardar cambios' : 'Crear'} disabled={busy} onPress={save} />
        </View>
        {onCancel ? (
          <Button title="Cancelar" variant="secondary" disabled={busy} onPress={onCancel} />
        ) : null}
      </View>
    </View>
  );
}

export function BusinessPanel({ mode: initialMode }: { mode: Mode }) {
  const session = useAuthStore((s) => s.session);
  const demoRole = useAuthStore((s) => s.demoRole);
  const demoStore = useDemoStore();
  const showToast = useUiStore((s) => s.showToast);

  const [subMode, setSubMode] = useState<Mode>(initialMode);
  const mode = initialMode === 'summary' ? subMode : initialMode;

  const [businessId, setBusinessId] = useState('');
  const [edit, setEdit] = useState<CatalogRow | 'new' | null>(null);
  const [newBizMode, setNewBizMode] = useState(false);
  const [newBizName, setNewBizName] = useState('');
  const [newBizEmail, setNewBizEmail] = useState('');
  const [newBizPhone, setNewBizPhone] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [qrInput, setQrInput] = useState('');
  const [qrCheckResult, setQrCheckResult] = useState('');
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [wizardOpen, setWizardOpen] = useState(initialMode === 'verification');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  const isDemo = !session && demoRole === 'advertiser';

  async function openQrScanner() {
    const permission = cameraPermission?.granted
      ? cameraPermission
      : await requestCameraPermission();
    if (!permission.granted) {
      setQrCheckResult('No se concedió permiso para usar la cámara. Puedes introducir el código manualmente.');
      return;
    }
    setQrCheckResult('');
    setQrScannerOpen(true);
  }

  function handleQrScanned(result: { data?: string }) {
    const value = String(result.data || '').trim();
    if (!value) return;
    setQrInput(value);
    setQrScannerOpen(false);
    setQrCheckResult('Código QR leído. Pulsa «Verificar cupón» para comprobarlo.');
  }

  const load = useCallback(
    async (signal: AbortSignal) => {
      const zones = await listRecords('zones', { signal }).catch(() => []);
      if (isDemo) {
        const [allCategories, allReviews] = await Promise.all([
          listRecords('categories', { signal }).catch(() => []),
          listRecords('reviews', { signal }).catch(() => []),
        ]);
        const businesses = demoStore.businesses.length
          ? demoStore.businesses
          : [{ id: 'demo-biz-1', owner_id: 'demo-advertiser', name: demoBizProfile.name, contact_email: 'contacto@comercio.example', phone: '70011223' }];
        const business = businesses.find((b) => b.id === businessId) || businesses[0];
        const places = demoStore.places.filter((p) => p.business_id === business.id);
        let rows: CatalogRow[] = [];
        let replies: CatalogRow[] = [];
        const openingHours: CatalogRow[] = [];
        const placeCats: CatalogRow[] = [];
        const placeMedia: CatalogRow[] = [];
        const campaignEvents: CatalogRow[] = [];

        if (mode === 'places') rows = places;
        else if (mode === 'promotions') rows = demoStore.promotions.filter((p) => p.business_id === business.id);
        else if (mode === 'experiences') rows = demoStore.experiences.filter((e) => e.business_id === business.id);
        else if (mode === 'campaigns') rows = demoStore.campaigns.filter((c) => c.business_id === business.id);
        else if (mode === 'verification') rows = demoStore.verifications.filter((v) => v.business_id === business.id);
        else if (mode === 'reviews') {
          rows = [
            ...demoStore.reviews.map((r) => ({ ...r }) as unknown as CatalogRow),
            ...allReviews.slice(0, 6),
          ];
          replies = demoStore.reviewReplies.map((r) => ({ ...r }) as unknown as CatalogRow);
        } else if (mode === 'notifications') {
          rows = demoBizNotifs.map((n) => ({ id: n.id, title: n.title, body: n.body }));
        }
        return { businesses, business, places, zones, rows, replies, categories: allCategories, openingHours, placeCats, placeMedia, campaignEvents };
      }

      if (!session) throw new Error('Inicia sesión para gestionar tus negocios en Render.');
      const businesses = (
        await listRecords('businesses', { private: true, signal, filters: { owner_id: session.user.id } })
      ).filter((row) => row.owner_id === session.user.id);
      const business = businesses.find((row) => row.id === businessId) || businesses[0];
      if (!business) return { businesses, business: undefined, places: [], zones, rows: [], replies: [], categories: [], openingHours: [], placeCats: [], placeMedia: [], campaignEvents: [] };

      const [places, categories] = await Promise.all([
        listRecords('places', { private: true, signal, filters: { business_id: business.id } }),
        listRecords('categories', { signal }).catch(() => []),
      ]);
      const myPlaces = places.filter((p) => p.business_id === business.id);
      let rows: CatalogRow[] = [];
      let replies: CatalogRow[] = [];
      let openingHours: CatalogRow[] = [];
      let placeCats: CatalogRow[] = [];
      let placeMedia: CatalogRow[] = [];
      let campaignEvents: CatalogRow[] = [];

      if (mode === 'places') {
        rows = myPlaces;
        const [oh, pc, pm] = await Promise.all([
          listRecords('opening-hours', { signal }).catch(() => []),
          listRecords('place-categories', { signal }).catch(() => []),
          listRecords('place-media', { signal }).catch(() => []),
        ]);
        const myPlaceIds = new Set(myPlaces.map((p) => p.id));
        openingHours = oh.filter((h) => myPlaceIds.has(String(h.place_id)));
        placeCats = pc.filter((l) => myPlaceIds.has(String(l.place_id)));
        placeMedia = pm.filter((m) => myPlaceIds.has(String(m.place_id)));
      } else if (['promotions', 'campaigns', 'verification', 'experiences'].includes(mode)) {
        rows = (await listRecords(entities[mode], { private: true, signal, filters: { business_id: business.id } })).filter(
          (r) => r.business_id === business.id,
        );
        if (mode === 'campaigns') {
          campaignEvents = await listRecords('campaign-events', { signal }).catch(() => []);
        }
      } else if (mode === 'notifications') {
        rows = (await listRecords('notifications', { private: true, signal, filters: { user_id: session.user.id } })).filter(
          (r) => r.user_id === session.user.id,
        );
      } else if (mode === 'reviews') {
        const [allReviews, allReplies] = await Promise.all([
          listRecords('reviews', { signal }),
          listRecords('review-replies', { signal }).catch(() => []),
        ]);
        rows = allReviews.filter((row) => myPlaces.some((place) => place.id === row.place_id));
        replies = allReplies.filter((rep) => rep.business_id === business.id);
      }
      return { businesses, business, places: myPlaces, zones, rows, replies, categories, openingHours, placeCats, placeMedia, campaignEvents };
    },
    [session, businessId, mode, isDemo, demoStore.businesses, demoStore.places, demoStore.promotions, demoStore.experiences, demoStore.campaigns, demoStore.verifications, demoStore.reviews, demoStore.reviewReplies],
  );

  const { data, loading, error, retry } = useRemoteData(load);
  const visibleRows = data ? data.rows : [];

  async function createBusiness() {
    if (lock.current || !newBizName.trim()) return;
    if (isDemo) {
      const id = `demo-biz-${Date.now()}`;
      demoStore.upsertEntityRow('businesses', {
        id,
        owner_id: 'demo-advertiser',
        name: newBizName.trim(),
        contact_email: newBizEmail.trim() || 'contacto@comercio.example',
        phone: newBizPhone.trim() || null,
      });
      setNewBizMode(false);
      setNewBizName('');
      setBusinessId(id);
      showToast('Negocio registrado.', 'success');
      return;
    }
    if (!session) return;
    lock.current = true;
    setBusy(true);
    setNotice('');
    try {
      const created = await createRecord<{ id: string }>(
        'businesses',
        {
          owner_id: session.user.id,
          name: newBizName.trim(),
          contact_email: newBizEmail.trim() || session.user.email || null,
          phone: newBizPhone.trim() || null,
        },
        'Registrando negocio en Render…',
      );
      setNewBizMode(false);
      setNewBizName('');
      if (created?.id) setBusinessId(created.id);
      showToast('Negocio creado en Render.', 'success');
      retry();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'No se pudo crear el negocio.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function deleteBusiness(id: string) {
    if (isDemo || lock.current) return;
    const ok = await confirmAction({
      title: 'Eliminar establecimiento',
      message: 'Esta acción eliminará el negocio de Render si no tiene verificaciones activas. ¿Continuar?',
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;
    lock.current = true;
    setBusy(true);
    try {
      await deleteRecord('businesses', id, 'Eliminando negocio…');
      setBusinessId('');
      setConfirmDeleteId(null);
      showToast('Negocio eliminado.', 'success');
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo eliminar (puede tener registros asociados).', 'error');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function changeStatus(row: CatalogRow, patch: Record<string, unknown>) {
    if (isDemo) {
      const entityMap: Record<string, 'places' | 'promotions' | 'experiences' | 'campaigns' | undefined> = {
        places: 'places',
        promotions: 'promotions',
        experiences: 'experiences',
        campaigns: 'campaigns',
      };
      const demoKey = entityMap[mode];
      if (demoKey) demoStore.upsertEntityRow(demoKey, { ...row, ...patch });
      showToast('Estado actualizado.', 'success');
      return;
    }
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNotice('');
    try {
      await updateRecord(entities[mode], row.id, patch, 'Actualizando estado…');
      showToast('Actualizado en Render.', 'success');
      retry();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'No se pudo actualizar.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function removeRow(entity: string, id: string) {
    if (isDemo) {
      const entityMap: Record<string, 'places' | 'promotions' | 'experiences' | 'campaigns' | 'verifications' | undefined> = {
        places: 'places',
        promotions: 'promotions',
        experiences: 'experiences',
        campaigns: 'campaigns',
        'business-verifications': 'verifications',
      };
      const demoKey = entityMap[entity];
      if (demoKey) demoStore.deleteEntityRow(demoKey, id);
      setConfirmDeleteId(null);
      showToast('Registro eliminado.', 'info');
      return;
    }
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await deleteRecord(entity, id, 'Eliminando registro…');
      setConfirmDeleteId(null);
      showToast('Registro eliminado de Render.', 'success');
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo eliminar.', 'error');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function uploadPlacePhotoAction(placeId: string) {
    if (isDemo) { showToast('Subida simulada en Vista Demo.', 'info'); return; }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { showToast('Permite el acceso a fotos para subir imágenes.', 'error'); return; }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });
    if (picked.canceled) return;
    setBusy(true);
    try {
      const prepared = await validateAndCompressImage(picked.assets[0], 0, 5);
      await uploadPlaceMedia(placeId, prepared);
      showToast('Foto comprimida y subida a Render (Máx. 5 MB).', 'success');
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo subir la foto.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function verifyScannedCoupon(promoRows: CatalogRow[]) {
    const parsed = parseCouponVerificationCode(qrInput);
    if (!parsed.validFormat) {
      setQrCheckResult('Código inválido: escribe o pega un código de cupón o voucher TYA-VOUCHER|...');
      return;
    }
    const found = promoRows.find((p) => String(p.code || '').toUpperCase() === parsed.code);
    if (!found) {
      setQrCheckResult(`Código inválido (${parsed.code}): no corresponde a ninguna promoción de este comercio.`);
      return;
    }
    const status = String(found.status || 'active').toLowerCase();
    const expired = found.ends_at && Date.parse(String(found.ends_at)) < Date.now();
    if (status !== 'active' || expired) {
      setQrCheckResult(`Cupón no vigente (${parsed.code}): estado ${status}${expired ? ' · vencido' : ''}.`);
      return;
    }
    setQrCheckResult(`✓ Cupón VÁLIDO: "${found.title}" (-${found.discount_percent}%). Ref: ${parsed.ref || 'directo'}`);
  }

  async function addOpeningHour(placeId: string) {
    if (isDemo) { showToast('Horario agregado en Vista Demo.', 'info'); return; }
    setBusy(true);
    try {
      await createRecord(
        'opening-hours',
        { place_id: placeId, weekday: 1, opens_at: '09:00:00', closes_at: '19:00:00' },
        'Guardando horario…',
      );
      showToast('Horario Lun 09:00–19:00 agregado.', 'success');
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo agregar horario.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function togglePlaceCategory(placeId: string, categoryId: string, existingLinkId?: string) {
    if (isDemo) { showToast('Categoría actualizada (Vista Demo).', 'info'); return; }
    setBusy(true);
    try {
      if (existingLinkId) {
        await deleteRecord('place-categories', existingLinkId, 'Quitando categoría del lugar…');
        showToast('Categoría quitada del lugar.', 'info');
      } else {
        await createRecord('place-categories', { place_id: placeId, category_id: categoryId }, 'Asignando categoría…');
        showToast('Categoría asignada al lugar.', 'success');
      }
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo actualizar la categoría.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pantalla titulo={titles[mode]} subtitulo="Gestión de tu establecimiento" tabs={TABS_NEGOCIO}>
      <RoleBanner />

      {!session && !isDemo ? <Button title="Iniciar sesión" onPress={() => router.navigate('/login')} /> : null}

      {/* Selector de sección cuando está en /RamaNegocio */}
      {initialMode === 'summary' ? (
        <View style={styles.chipRow}>
          {(
            [
              ['summary', 'Resumen'],
              ['places', 'Lugares'],
              ['promotions', 'Promociones'],
              ['experiences', 'Experiencias'],
              ['campaigns', 'Campañas'],
              ['reviews', 'Reseñas'],
              ['verification', 'Verificación'],
              ['notifications', 'Avisos'],
            ] as [Mode, string][]
          ).map(([key, label]) => (
            <Chip key={key} label={label} selected={mode === key} onPress={() => { setSubMode(key); setEdit(null); }} />
          ))}
        </View>
      ) : null}

      {loading ? <LoadingState label="Cargando datos del negocio…" /> : null}
      {error ? <ErrorState message={error} onRetry={retry} /> : null}
      {notice ? <AppText accessibilityRole="alert" style={{ color: '#b91c1c' }}>{notice}</AppText> : null}

      {/* Selector de negocios + botón crear negocio */}
      {session || isDemo ? (
        <View style={styles.chipRow}>
          {data?.businesses.map((biz) => (
            <Chip
              key={biz.id}
              label={String(biz.name)}
              selected={data.business?.id === biz.id}
              onPress={() => { setBusinessId(biz.id); setEdit(null); }}
            />
          ))}
          <Chip label="+ Nuevo negocio" selected={newBizMode} onPress={() => setNewBizMode((v) => !v)} />
        </View>
      ) : null}

      {newBizMode && (session || isDemo) ? (
        <View style={styles.editorCard}>
          <AppText variant="section">Nuevo establecimiento</AppText>
          <FormField label="Nombre del negocio" value={newBizName} onChangeText={setNewBizName} placeholder="Ej. Café Mirador Sopocachi" />
          <FormField label="Correo de contacto" value={newBizEmail} onChangeText={setNewBizEmail} placeholder={session?.user.email || 'contacto@ejemplo.com'} keyboardType="email-address" autoCapitalize="none" />
          <FormField label="Teléfono (opcional)" value={newBizPhone} onChangeText={setNewBizPhone} keyboardType="phone-pad" />
          <Button title={busy ? 'Creando…' : 'Guardar negocio'} disabled={busy || !newBizName.trim()} onPress={() => { void createBusiness(); }} />
        </View>
      ) : null}

      {!loading && !error && !data?.business && !newBizMode && (session || isDemo) ? (
        <View style={styles.editorCard}>
          <AppText variant="section">Tu cuenta aún no tiene negocios registrados</AppText>
          <AppText variant="bodySmall" color="inkSoft">
            Crea tu primer establecimiento en Render para publicar lugares, cupones, experiencias y campañas.
          </AppText>
          <Button title="Registrar mi primer negocio" onPress={() => setNewBizMode(true)} />
        </View>
      ) : null}

      {data?.business && (isDemo || canManageBusiness(session?.user.id, 'advertiser', String(data.business.owner_id))) ? (
        <>
          {mode === 'summary' ? (
            <View style={styles.editorCard}>
              <View style={styles.rowBetween}>
                <AppText variant="section">{String(data.business.name)}</AppText>
                <Badge label={`${data.places.length} lugares`} tone="green" />
              </View>
              <AppText variant="caption" color="inkSoft">
                {String(data.business.contact_email || 'Sin correo')} · {String(data.business.phone || 'Sin teléfono')}
              </AppText>
              <View style={styles.quickNav}>
                <Button title={wizardOpen ? 'Ocultar asistente 3 pasos' : 'Asistente 3 pasos'} size="sm" onPress={() => setWizardOpen((v) => !v)} />
                <Button title="Gestionar lugares" size="sm" onPress={() => setSubMode('places')} />
                <Button title="Promociones" size="sm" variant="secondary" onPress={() => router.navigate('/RamaNegocio/promociones')} />
                <Button title="Experiencias" size="sm" variant="secondary" onPress={() => setSubMode('experiences')} />
                <Button title="Campañas" size="sm" variant="secondary" onPress={() => router.navigate('/RamaNegocio/proximamente')} />
                <Button title="Reseñas" size="sm" variant="secondary" onPress={() => router.navigate('/RamaNegocio/resenas')} />
                <Button title="Verificación" size="sm" variant="secondary" onPress={() => router.navigate('/RamaNegocio/verificar')} />
                <Button title="Ayuda" size="sm" variant="soft" onPress={() => router.navigate('/RamaNegocio/ayuda')} />
              </View>
            </View>
          ) : null}

          {wizardOpen || mode === 'verification' ? (
            <BusinessWizard
              key={`wiz-${data.business.id}`}
              business={data.business}
              existingPlace={data.places[0]}
              zones={data.zones}
              verifications={mode === 'verification' ? data.rows : []}
              isDemo={isDemo}
              onSaved={() => {
                setWizardOpen(false);
                retry();
              }}
            />
          ) : null}

          {mode === 'promotions' ? (
            <View style={styles.editorCard}>
              <AppText variant="section">Validar código o voucher QR en local</AppText>
              {qrScannerOpen ? (
                <View style={styles.qrScannerBox}>
                  <CameraView
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={handleQrScanned}
                  />
                  <Button title="Cerrar escáner" size="sm" variant="secondary" onPress={() => setQrScannerOpen(false)} />
                </View>
              ) : null}
              <FormField
                label="Código del cupón o voucher QR escaneado"
                placeholder="Ej. PACENO2026 o TYA-VOUCHER|PACENO2026|12AB"
                value={qrInput}
                onChangeText={setQrInput}
              />
              <Button title="Escanear con cámara" size="sm" variant="soft" onPress={() => { void openQrScanner(); }} />
              <Button title="Verificar cupón" size="sm" variant="secondary" onPress={() => verifyScannedCoupon(data.rows)} />
              {qrCheckResult ? <AppText variant="bodySmall" color="primary">{qrCheckResult}</AppText> : null}
            </View>
          ) : null}

          {mode === 'data' ? (
            <>
              <BusinessEditor
                key={`${session?.user.id || 'demo'}-${data.business.id}`}
                mode="data"
                row={data.business}
                businessId={data.business.id}
                places={data.places}
                zones={data.zones}
                isDemo={isDemo}
                onSaved={() => { retry(); }}
              />
              {session ? (
                confirmDeleteId === data.business.id ? (
                  <View style={styles.confirmRow}>
                    <AppText variant="caption" style={{ flex: 1 }}>¿Eliminar este negocio?</AppText>
                    <Button title="Confirmar" size="sm" disabled={busy} onPress={() => { void deleteBusiness(data.business!.id); }} />
                    <Button title="Cancelar" size="sm" variant="secondary" onPress={() => setConfirmDeleteId(null)} />
                  </View>
                ) : (
                  <Button title="Eliminar negocio (DELETE)" variant="soft" size="sm" onPress={() => setConfirmDeleteId(data.business!.id)} />
                )
              ) : null}
            </>
          ) : null}

          {['places', 'promotions', 'experiences', 'campaigns', 'verification'].includes(mode) ? (
            <Button
              title={edit === 'new' ? 'Cerrar formulario' : `+ Crear ${titles[mode].toLowerCase()}`}
              onPress={() => setEdit(edit === 'new' ? null : 'new')}
            />
          ) : null}

          {edit && fields[mode] ? (
            <BusinessEditor
              key={`${session?.user.id || 'demo'}-${data.business.id}-${edit === 'new' ? 'new' : edit.id}`}
              mode={mode}
              row={edit === 'new' ? undefined : edit}
              businessId={data.business.id}
              places={data.places}
              zones={data.zones}
              isDemo={isDemo}
              onSaved={() => {
                setEdit(null);
                if (!isDemo) retry();
              }}
              onCancel={() => setEdit(null)}
            />
          ) : null}

          {visibleRows.map((row) => (
            <ListCard
              key={row.id}
              title={String(row.title || row.name || row.responsible_name || row.body || 'Registro')}
              body={String(
                [
                  row.code ? `Código: ${row.code}` : '',
                  row.discount_percent ? `-${row.discount_percent}%` : '',
                  row.price_per_person != null ? `Bs ${row.price_per_person}` : '',
                  row.status,
                  row.address,
                  row.description,
                  row.review_notes,
                ]
                  .filter(Boolean)
                  .join(' · '),
              )}
              footer={
                <View style={styles.chipRow}>
                  {['places', 'promotions', 'experiences', 'campaigns'].includes(mode) ? (
                    <Button title="Editar" size="sm" variant="secondary" disabled={busy} onPress={() => setEdit(row)} />
                  ) : null}
                  {['promotions', 'campaigns'].includes(mode) ? (
                    <Button
                      title={row.status === 'active' ? 'Pausar' : 'Activar'}
                      size="sm"
                      disabled={busy}
                      onPress={() => { void changeStatus(row, { status: row.status === 'active' ? 'paused' : 'active' }); }}
                    />
                  ) : null}
                  {mode === 'experiences' ? (
                    <Button
                      title={row.published ? 'Ocultar' : 'Publicar'}
                      size="sm"
                      disabled={busy}
                      onPress={() => { void changeStatus(row, { published: !row.published }); }}
                    />
                  ) : null}
                  {mode === 'places' ? (
                    <View style={{ width: '100%', gap: 6 }}>
                      <View style={styles.chipRow}>
                        <Button title="Subir foto" size="sm" variant="secondary" disabled={busy} onPress={() => { void uploadPlacePhotoAction(row.id); }} />
                        <Button title="+ Horario" size="sm" variant="soft" disabled={busy} onPress={() => { void addOpeningHour(row.id); }} />
                      </View>
                      {(data.openingHours ?? []).filter((h) => h.place_id === row.id).map((h) => (
                        <View key={h.id} style={styles.chipRow}>
                          <AppText variant="micro" color="inkSoft" style={{ alignSelf: 'center' }}>
                            Día {String(h.weekday)}: {String(h.opens_at).slice(0, 5)}–{String(h.closes_at).slice(0, 5)}
                          </AppText>
                          <Button title="Quitar horario" size="sm" variant="soft" disabled={busy} onPress={() => { void removeRow('opening-hours', h.id); }} />
                        </View>
                      ))}
                      {(data.placeMedia ?? []).filter((m) => m.place_id === row.id).map((m) => (
                        <View key={m.id} style={styles.chipRow}>
                          <AppText variant="micro" color="inkSoft" style={{ alignSelf: 'center' }} numberOfLines={1}>
                            Foto: {String(m.storage_path).slice(0, 28)}
                          </AppText>
                          <Button title="Borrar foto" size="sm" variant="soft" disabled={busy} onPress={() => { void removeRow('place-media', m.id); }} />
                        </View>
                      ))}
                      <View style={styles.chipRow}>
                        {(data.categories ?? []).slice(0, 6).map((cat) => {
                          const link = (data.placeCats ?? []).find((l) => l.place_id === row.id && l.category_id === cat.id);
                          return (
                            <Chip
                              key={cat.id}
                              label={String(cat.name)}
                              selected={Boolean(link)}
                              onPress={() => { void togglePlaceCategory(row.id, cat.id, link?.id); }}
                            />
                          );
                        })}
                      </View>
                    </View>
                  ) : null}
                  {mode === 'campaigns' ? (
                    <CampaignStatsCard
                      row={row}
                      events={(data.campaignEvents ?? []).filter((ev) => ev.campaign_id === row.id)}
                      onAutoPause={(statusValue) => {
                        void changeStatus(row, { status: statusValue });
                      }}
                    />
                  ) : null}
                  {mode === 'notifications' && !row.read_at ? (
                    <Button
                      title="Marcar leída"
                      size="sm"
                      disabled={busy}
                      onPress={() => {
                        void updateRecord('notifications', row.id, { read_at: new Date().toISOString() }).then(retry);
                      }}
                    />
                  ) : null}
                  {['places', 'promotions', 'experiences', 'campaigns', 'notifications'].includes(mode) ? (
                    confirmDeleteId === row.id ? (
                      <>
                        <Button title="Confirmar" size="sm" disabled={busy} onPress={() => { void removeRow(mode === 'notifications' ? 'notifications' : entities[mode], row.id); }} />
                        <Button title="Cancelar" size="sm" variant="secondary" onPress={() => setConfirmDeleteId(null)} />
                      </>
                    ) : (
                      <Button title="Eliminar" size="sm" variant="soft" disabled={busy} onPress={() => setConfirmDeleteId(row.id)} />
                    )
                  ) : null}
                  {mode === 'reviews' ? (
                    <ReviewReply
                      review={row}
                      existingReplies={(data.replies ?? []).filter((r) => r.review_id === row.id)}
                      businessId={data.business!.id}
                      isDemo={isDemo}
                      onChanged={retry}
                    />
                  ) : null}
                </View>
              }
            />
          ))}

          {!data.rows.length && !['summary', 'data'].includes(mode) ? (
            <AppText variant="bodySmall" color="inkSoft">Sin registros todavía en esta sección.</AppText>
          ) : null}
        </>
      ) : null}

      <Button title="Actualizar" variant="secondary" disabled={loading || busy} onPress={retry} />
    </Pantalla>
  );
}

function CampaignStatsCard({
  row,
  events,
  onAutoPause,
}: {
  row: CatalogRow;
  events: CatalogRow[];
  onAutoPause: (nextStatus: 'finished' | 'exhausted') => void;
}) {
  const impressions = events.filter((e) => e.kind === 'impression').length;
  const clicks = events.filter((e) => e.kind === 'click' || e.kind === 'open').length;
  const conversions = events.filter((e) => e.kind === 'conversion' || e.kind === 'route' || e.kind === 'visit').length;
  const estSpent = Math.round((impressions * 0.25 + clicks * 1.5 + conversions * 4) * 100) / 100;
  const lifecycle = normalizeCampaignStatus(String(row.status || 'DRAFT'), {
    budget: Number(row.budget ?? 0),
    spentAmount: estSpent,
    startsAt: row.starts_at ? String(row.starts_at) : null,
    endsAt: row.ends_at ? String(row.ends_at) : null,
  });
  const traffic = aggregateCampaignHourlyTraffic(
    events as { kind?: string | null; occurred_at?: string | null; created_at?: string | null }[],
  );
  const days = row.starts_at && row.ends_at
    ? Math.max(1, Math.ceil((Date.parse(String(row.ends_at)) - Date.parse(String(row.starts_at))) / 86400000))
    : 30;
  const dailyBudget = Math.round((Number(row.budget ?? 0) / days) * 100) / 100;

  return (
    <View style={{ width: '100%', gap: 4, marginTop: 4 }}>
      <AppText variant="caption" color="inkSoft">
        Estado: {lifecycle.status} · Saldo: Bs {lifecycle.remainingBudget} · Diario est.: Bs {dailyBudget}/día
      </AppText>
      <AppText variant="micro" color="inkSoft">
        Impresiones: {impressions} · Clics: {clicks} · Conversiones: {conversions} · Hora pico: {traffic.peakHourLabel}
      </AppText>
      {traffic.buckets.slice(0, 5).map((b) => (
        <AppText key={b.hourLabel} variant="micro" color="primary">
          {b.hourLabel}: {b.impressions} imp · {b.clicks} clics · {b.conversions} conv
        </AppText>
      ))}
      {lifecycle.shouldAutoPause ? (
        <Button
          title="Pausar por presupuesto agotado / finalizado"
          size="sm"
          variant="soft"
          onPress={() => onAutoPause(lifecycle.status === 'FINISHED' ? 'finished' : 'exhausted')}
        />
      ) : null}
    </View>
  );
}

function ReviewReply({
  review,
  existingReplies,
  businessId,
  isDemo,
  onChanged,
}: {
  review: CatalogRow;
  existingReplies: CatalogRow[];
  businessId: string;
  isDemo?: boolean;
  onChanged: () => void;
}) {
  const showToast = useUiStore((s) => s.showToast);
  const addDemoReply = useDemoStore((s) => s.addReviewReply);
  const updateDemoReply = useDemoStore((s) => s.updateReviewReply);
  const deleteDemoReply = useDemoStore((s) => s.deleteReviewReply);
  const [body, setBody] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  async function send() {
    if (lock.current || !body.trim()) return;
    if (isDemo) {
      addDemoReply({
        id: `demo-rep-${Date.now()}`,
        review_id: review.id,
        business_id: businessId,
        body: body.trim(),
        created_at: new Date().toISOString(),
      });
      setBody('');
      showToast('Respuesta publicada.', 'success');
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      await createRecord('review-replies', { business_id: businessId, review_id: review.id, body: body.trim() }, 'Publicando respuesta…');
      setBody('');
      showToast('Respuesta publicada.', 'success');
      onChanged();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo responder.', 'error');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function saveEdit(id: string) {
    if (lock.current || !editText.trim()) return;
    if (isDemo && id.startsWith('demo-rep-')) {
      updateDemoReply(id, editText.trim());
      setEditingId(null);
      showToast('Respuesta actualizada.', 'success');
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      await updateRecord('review-replies', id, { body: editText.trim() }, 'Editando respuesta…');
      setEditingId(null);
      showToast('Respuesta actualizada.', 'success');
      onChanged();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo editar.', 'error');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function removeReply(id: string) {
    if (lock.current) return;
    if (isDemo && id.startsWith('demo-rep-')) {
      deleteDemoReply(id);
      showToast('Respuesta eliminada.', 'success');
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      await deleteRecord('review-replies', id, 'Eliminando respuesta…');
      showToast('Respuesta eliminada.', 'success');
      onChanged();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo eliminar.', 'error');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <View style={{ width: '100%', gap: spacing.xs + 2, marginTop: 4 }}>
      {existingReplies.map((rep) => (
        <View key={rep.id} style={styles.replyCard}>
          {editingId === rep.id ? (
            <>
              <FormField label="Editar respuesta" value={editText} onChangeText={setEditText} />
              <View style={styles.chipRow}>
                <Button title="Guardar" size="sm" disabled={busy} onPress={() => { void saveEdit(rep.id); }} />
                <Button title="Cancelar" size="sm" variant="secondary" onPress={() => setEditingId(null)} />
              </View>
            </>
          ) : (
            <>
              <AppText variant="bodySmall">{String(rep.body)}</AppText>
              <View style={styles.chipRow}>
                <Button title="Editar" size="sm" variant="secondary" onPress={() => { setEditingId(rep.id); setEditText(String(rep.body)); }} />
                <Button title="Eliminar" size="sm" variant="soft" onPress={() => { void removeReply(rep.id); }} />
              </View>
            </>
          )}
        </View>
      ))}
      <FormField label="Respuesta del comercio" value={body} onChangeText={setBody} editable={!busy} />
      <Button title="Publicar respuesta" size="sm" disabled={busy || !body.trim()} onPress={send} />
    </View>
  );
}

const styles = StyleSheet.create({
  scopeNotice: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.sm + 2,
  },
  editorCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md + 2,
    gap: spacing.sm,
  },
  qrScannerBox: {
    height: 240,
    overflow: 'hidden',
    borderRadius: radius.md,
    backgroundColor: '#111',
    position: 'relative',
    justifyContent: 'flex-end',
    padding: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  quickNav: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    marginTop: 4,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  replyCard: {
    backgroundColor: colors.surfaceGreen,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 6,
  },
});
