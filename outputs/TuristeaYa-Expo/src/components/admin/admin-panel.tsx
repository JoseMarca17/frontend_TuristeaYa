import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
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
import { assertCanChangeUserRole } from '@/services/domain-rules';
import { createRecord, deleteRecord, requireRole, updateRecord } from '@/services/management';
import {
  auditEntries as demoAudits,
  managedUsers as demoUsers,
  reportedReview as demoReview,
  verificationRequest as demoVerification,
} from '@/services/mock/admin';
import { useAuthStore } from '@/stores/use-auth-store';
import { useUiStore } from '@/stores/use-ui-store';
import { colors, radius, spacing } from '@/theme';

const sections = [
  ['user-access', 'Usuarios y permisos'],
  ['places', 'Todos los lugares'],
  ['tickets', 'Reportes de lugares y reseñas'],
  ['promotions', 'Todos los cupones'],
  ['routes', 'Todas las rutas'],
  ['businesses', 'Todos los negocios'],
  ['experiences', 'Experiencias'],
  ['business-verifications', 'Validación negocios'],
  ['reviews', 'Moderación reseñas'],
  ['moderation-actions', 'Acciones moderación'],
  ['categories', 'Categorías'],
  ['zones', 'Zonas'],
  ['subscription-plans', 'Planes VIP'],
  ['subscriptions', 'Suscripciones VIP'],
  ['notifications', 'Notificaciones'],
  ['audit-logs', 'Auditoría'],
] as const;

export function AdminPanel() {
  const session = useAuthStore((s) => s.session);
  const demoRole = useAuthStore((s) => s.demoRole);
  const showToast = useUiStore((s) => s.showToast);

  const [entity, setEntity] = useState<string>('user-access');
  const [pending, setPending] = useState<{ id: string; body: Record<string, unknown>; label: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const lock = useRef(false);

  // Create / edit form states for Admin catalogs/subscriptions/notifications
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [fieldA, setFieldA] = useState('');
  const [fieldB, setFieldB] = useState('');
  const [fieldC, setFieldC] = useState('');
  const [fieldD, setFieldD] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [metrics, setMetrics] = useState<{
    users: number;
    publishedPlaces: number;
    draftPlaces: number;
    openTickets: number;
    pendingVerifications: number;
    hiddenReviews: number;
  } | null>(null);
  const [demoCreated, setDemoCreated] = useState<Record<string, CatalogRow[]>>({});
  const [demoPatched, setDemoPatched] = useState<Record<string, Record<string, Record<string, unknown>>>>({});
  const [demoDeleted, setDemoDeleted] = useState<Record<string, string[]>>({});

  const isDemo = !session && demoRole === 'admin';

  const load = useCallback(async (signal: AbortSignal): Promise<CatalogRow[]> => {
    if (isDemo) {
      if (entity === 'user-access') return demoUsers.map((u, i) => ({ id: `demo-ua-${i}`, user_id: `demo-u-${i}`, display_name: u.name, role: 'support', status: 'active' }));
      if (entity === 'business-verifications') return [{ id: 'demo-bv-1', responsible_name: demoVerification.owner, status: 'pending', review_notes: demoVerification.observations }];
      if (entity === 'reviews') {
        const publicReviews = await listRecords('reviews', { signal }).catch(() => []);
        return publicReviews.length ? publicReviews : [{ id: demoReview.id, body: demoReview.reason, rating: 2, hidden: false }];
      }
      if (entity === 'audit-logs') return demoAudits.map((a) => ({ id: a.id, action: a.label, created_at: a.time }));
      return listRecords(entity, { signal }).catch(() => []);
    }
    if (!session) throw new Error('Inicia sesión con una cuenta administradora.');
    await requireRole(['admin'], signal);
    const [rows, uaAll, placesAll, ticketsAll, verAll, reviewsAll] = await Promise.all([
      listRecords(entity, { private: true, signal }),
      listRecords('user-access', { private: true, signal }).catch(() => []),
      listRecords('places', { private: true, signal }).catch(() => []),
      listRecords('tickets', { private: true, signal }).catch(() => []),
      listRecords('business-verifications', { private: true, signal }).catch(() => []),
      listRecords('reviews', { private: true, signal }).catch(() => []),
    ]);
    setMetrics({
      users: uaAll.length,
      publishedPlaces: placesAll.filter((p) => p.published !== false).length,
      draftPlaces: placesAll.filter((p) => p.published === false).length,
      openTickets: ticketsAll.filter((t) => !['resolved', 'closed'].includes(String(t.status))).length,
      pendingVerifications: verAll.filter((v) => v.status === 'pending').length,
      hiddenReviews: reviewsAll.filter((r) => Boolean(r.hidden)).length,
    });
    if (entity === 'user-access' || entity === 'subscriptions') {
      const profiles = await listRecords('profiles', { private: true, signal });
      return rows.map((row) => ({
        ...row,
        display_name: profiles.find((profile) => profile.id === row.user_id)?.full_name || 'Cuenta sin nombre',
      }));
    }
    return rows;
  }, [entity, session, isDemo]);

  const { data, loading, error, retry } = useRemoteData(load);

  async function confirmPatch() {
    if (!pending || lock.current) return;
    if (isDemo) {
      setDemoPatched((prev) => ({
        ...prev,
        [entity]: { ...(prev[entity] || {}), [pending.id]: { ...(prev[entity]?.[pending.id] || {}), ...pending.body } },
      }));
      setPending(null);
      showToast(`${pending.label} (simulado en Vista Demo)`, 'info');
      return;
    }
    lock.current = true;
    setBusy(true);
    setNotice('');
    try {
      await updateRecord(entity, pending.id, pending.body, 'Aplicando cambio de administrador…');
      if (entity === 'reviews' && 'hidden' in pending.body) {
        await createRecord('moderation-actions', {
          moderator_id: session?.user.id,
          review_id: pending.id,
          action: pending.body.hidden ? 'hide' : 'restore',
          reason: 'Moderación desde panel administrador',
        }).catch(() => { });
      }
      setPending(null);
      setNotice('Cambio guardado.');
      showToast('Cambio aplicado en Render.', 'success');
      retry();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirmAction({
      title: 'Confirmar eliminación administrativa',
      message: 'Esta acción eliminará el registro de Render permanentemente.',
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;
    if (isDemo) {
      setDemoDeleted((prev) => ({ ...prev, [entity]: [...(prev[entity] || []), id] }));
      setConfirmDeleteId(null);
      showToast('Eliminado en Vista Demo local.', 'info');
      return;
    }
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await deleteRecord(entity, id, 'Eliminando registro en Render…');
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

  async function handleCreate() {
    if (lock.current) return;
    setFormError('');
    try {
      let body: Record<string, unknown> = {};
      if (entity === 'categories') {
        if (!fieldA.trim()) throw new Error('Escribe el nombre de la categoría.');
        const slug = (fieldB.trim() || fieldA.trim()).toLowerCase().replace(/\s+/g, '-');
        body = { name: fieldA.trim(), slug };
      } else if (entity === 'zones') {
        if (!fieldA.trim()) throw new Error('Escribe el nombre de la zona.');
        body = {
          name: fieldA.trim(),
          city: fieldB.trim() || 'La Paz',
          country_code: 'BO',
          latitude: Number(fieldC) || -16.4955,
          longitude: Number(fieldD) || -68.1336,
        };
      } else if (entity === 'subscription-plans') {
        if (!fieldA.trim()) throw new Error('Escribe el nombre del plan.');
        body = {
          name: fieldA.trim(),
          price: Number(fieldB) || 30,
          currency: 'BOB',
          period_days: Math.max(1, Number(fieldC) || 30),
        };
      } else if (entity === 'subscriptions') {
        if (!fieldA.trim() || !fieldB.trim()) throw new Error('Ingresa user_id y plan_id (UUID).');
        const days = Math.max(1, Number(fieldC) || 30);
        body = {
          user_id: fieldA.trim(),
          plan_id: fieldB.trim(),
          status: 'active',
          starts_at: new Date().toISOString(),
          ends_at: new Date(Date.now() + days * 86400000).toISOString(),
        };
      } else if (entity === 'notifications') {
        if (!fieldA.trim() || !fieldB.trim() || !fieldC.trim()) throw new Error('Completa user_id, título y mensaje.');
        body = { user_id: fieldA.trim(), title: fieldB.trim(), body: fieldC.trim(), kind: 'admin' };
      } else if (entity === 'routes') {
        if (!fieldA.trim()) throw new Error('Escribe el nombre de la ruta.');
        body = {
          user_id: session?.user.id || 'demo-admin',
          name: fieldA.trim(),
          budget: Math.max(0, Number(fieldB) || 200),
          available_minutes: Math.max(15, Number(fieldC) || 120),
          origin_lat: -16.4955,
          origin_lng: -68.1336,
          visibility: 'public',
        };
      } else if (entity === 'businesses') {
        if (!fieldA.trim()) throw new Error('Escribe el nombre del negocio.');
        body = {
          owner_id: session?.user.id || 'demo-admin',
          name: fieldA.trim(),
          contact_email: fieldB.trim() || null,
          phone: fieldC.trim() || null,
        };
      } else if (entity === 'places') {
        if (!fieldA.trim() || !fieldD.trim()) throw new Error('Completa nombre del lugar y Zone ID.');
        body = {
          zone_id: fieldD.trim(),
          name: fieldA.trim(),
          address: fieldB.trim() || 'La Paz, Bolivia',
          description: fieldC.trim() || 'Lugar turístico registrado por administración',
          latitude: -16.4955,
          longitude: -68.1336,
          estimated_cost: 20,
          visit_minutes: 30,
          published: true,
        };
      }

      if (isDemo) {
        if (editingRowId) {
          setDemoPatched((prev) => ({
            ...prev,
            [entity]: { ...(prev[entity] || {}), [editingRowId]: { ...(prev[entity]?.[editingRowId] || {}), ...body } },
          }));
          showToast('Actualizado en Vista Demo local (en Render requiere rol admin real).', 'info');
        } else {
          const fakeRow: CatalogRow = { id: `demo-${Date.now()}`, ...body, created_at: new Date().toISOString() };
          setDemoCreated((prev) => ({ ...prev, [entity]: [fakeRow, ...(prev[entity] || [])] }));
          showToast('Agregado en Vista Demo local (en Render requiere rol admin real).', 'info');
        }
        setCreateOpen(false);
        setEditingRowId(null);
        setFieldA('');
        setFieldB('');
        setFieldC('');
        setFieldD('');
        return;
      }

      lock.current = true;
      setBusy(true);
      if (editingRowId) {
        await updateRecord(entity, editingRowId, body, 'Actualizando registro en Render…');
        showToast('Registro actualizado en Render.', 'success');
      } else {
        await createRecord(entity, body, 'Creando registro en Render…');
        showToast('Registro creado en Render.', 'success');
      }
      setCreateOpen(false);
      setEditingRowId(null);
      setFieldA('');
      setFieldB('');
      setFieldC('');
      setFieldD('');
      retry();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo guardar en Render.';
      setFormError(msg);
      showToast(msg, 'error');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const canCreate = ['categories', 'zones', 'subscription-plans', 'subscriptions', 'notifications', 'routes', 'businesses', 'places'].includes(entity);

  return (
    <Screen title="Administración" subtitle="Control de roles, verificaciones, moderación y catálogos">
      <RoleBanner />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionTabs}>
        {sections.map(([name, label]) => (
          <Chip
            key={name}
            label={label}
            selected={entity === name}
            onPress={() => {
              setEntity(name);
              setPending(null);
              setConfirmDeleteId(null);
              setCreateOpen(false);
              setNotice('');
            }}
          />
        ))}
      </ScrollView>

      {metrics ? (
        <View style={styles.formCard}>
          <AppText variant="section">Métricas generales de la plataforma</AppText>
          <View style={styles.btnRow}>
            <Badge label={`Usuarios: ${metrics.users}`} tone="green" />
            <Badge label={`Lugares pub.: ${metrics.publishedPlaces}`} tone="green" />
            <Badge label={`Borradores: ${metrics.draftPlaces}`} tone="cream" />
            <Badge label={`Tickets abiertos: ${metrics.openTickets}`} tone="cream" />
            <Badge label={`Verificaciones: ${metrics.pendingVerifications}`} tone="cream" />
            <Badge label={`Reseñas ocultas: ${metrics.hiddenReviews}`} tone="cream" />
          </View>
        </View>
      ) : null}

      {!session && !isDemo ? <Button title="Iniciar sesión" onPress={() => router.navigate('/login')} /> : null}
      {loading ? <LoadingState label="Cargando módulo administrativo…" /> : null}
      {error ? <ErrorState message={error} onRetry={retry} /> : null}
      {notice ? <AppText accessibilityRole="alert">{notice}</AppText> : null}

      {canCreate && (session || isDemo) ? (
        <Button
          title={createOpen ? 'Cerrar formulario' : `+ Crear en ${sections.find(([k]) => k === entity)?.[1]}`}
          size="sm"
          onPress={() => {
            setEditingRowId(null);
            setFieldA('');
            setFieldB('');
            setFieldC('');
            setFieldD('');
            setCreateOpen((v) => !v);
          }}
        />
      ) : null}

      {createOpen ? (
        <View style={styles.formCard}>
          {entity === 'categories' ? (
            <>
              <FormField label="Nombre" value={fieldA} onChangeText={setFieldA} placeholder="Ej. Ecoturismo" />
              <FormField label="Slug (opcional)" value={fieldB} onChangeText={setFieldB} placeholder="ecoturismo" />
            </>
          ) : null}
          {entity === 'zones' ? (
            <>
              <FormField label="Nombre de la zona" value={fieldA} onChangeText={setFieldA} placeholder="Achumani" />
              <FormField label="Ciudad" value={fieldB} onChangeText={setFieldB} placeholder="La Paz" />
              <FormField label="Latitud" value={fieldC} onChangeText={setFieldC} placeholder="-16.530" keyboardType="decimal-pad" />
              <FormField label="Longitud" value={fieldD} onChangeText={setFieldD} placeholder="-68.075" keyboardType="decimal-pad" />
            </>
          ) : null}
          {entity === 'subscription-plans' ? (
            <>
              <FormField label="Nombre del plan" value={fieldA} onChangeText={setFieldA} placeholder="VIP Mensual" />
              <FormField label="Precio (BOB)" value={fieldB} onChangeText={setFieldB} placeholder="35" keyboardType="decimal-pad" />
              <FormField label="Duración (días)" value={fieldC} onChangeText={setFieldC} placeholder="30" keyboardType="number-pad" />
            </>
          ) : null}
          {entity === 'subscriptions' ? (
            <>
              <FormField label="User ID (UUID)" value={fieldA} onChangeText={setFieldA} placeholder="UUID del usuario" />
              <FormField label="Plan ID (UUID)" value={fieldB} onChangeText={setFieldB} placeholder="UUID del plan" />
              <FormField label="Días de vigencia" value={fieldC} onChangeText={setFieldC} placeholder="30" keyboardType="number-pad" />
            </>
          ) : null}
          {entity === 'notifications' ? (
            <>
              <FormField label="User ID destinatario (UUID)" value={fieldA} onChangeText={setFieldA} />
              <FormField label="Título" value={fieldB} onChangeText={setFieldB} />
              <FormField label="Mensaje" value={fieldC} onChangeText={setFieldC} multiline />
            </>
          ) : null}
          {entity === 'routes' ? (
            <>
              <FormField label="Nombre de la ruta" value={fieldA} onChangeText={setFieldA} placeholder="Ej. Ruta Centro Histórico" />
              <FormField label="Presupuesto (Bs)" value={fieldB} onChangeText={setFieldB} placeholder="200" keyboardType="decimal-pad" />
              <FormField label="Duración (minutos)" value={fieldC} onChangeText={setFieldC} placeholder="120" keyboardType="number-pad" />
            </>
          ) : null}
          {entity === 'businesses' ? (
            <>
              <FormField label="Nombre del negocio" value={fieldA} onChangeText={setFieldA} placeholder="Ej. Café Altura" />
              <FormField label="Correo" value={fieldB} onChangeText={setFieldB} placeholder="contacto@ejemplo.com" keyboardType="email-address" autoCapitalize="none" />
              <FormField label="Teléfono" value={fieldC} onChangeText={setFieldC} placeholder="70012345" keyboardType="phone-pad" />
            </>
          ) : null}
          {entity === 'places' ? (
            <>
              <FormField label="Nombre del lugar" value={fieldA} onChangeText={setFieldA} placeholder="Ej. Mirador Alto" />
              <FormField label="Dirección" value={fieldB} onChangeText={setFieldB} placeholder="Centro, La Paz" />
              <FormField label="Descripción" value={fieldC} onChangeText={setFieldC} multiline />
              <FormField label="Zone ID (UUID · ver pestaña Zonas)" value={fieldD} onChangeText={setFieldD} placeholder="2589d156-5215-4835-a24e-60df473188a1" />
            </>
          ) : null}
          {formError ? <AppText accessibilityRole="alert" variant="caption" style={{ color: '#b91c1c' }}>{formError}</AppText> : null}
          <Button title={busy ? 'Guardando…' : editingRowId ? 'Actualizar registro (PATCH)' : 'Guardar nuevo registro (POST)'} disabled={busy} onPress={() => { void handleCreate(); }} />
        </View>
      ) : null}

      {isDemo ? (
        <View style={styles.demoNoticeBox}>
          <AppText variant="micro" color="inkSoft">
            Modo Vista Demo: los botones Crear (POST), Actualizar (PATCH) y Eliminar (DELETE) modifican esta vista localmente. Para ejecutar POST reales contra Render en Administración se requiere iniciar sesión con una cuenta que tenga rol «admin» en Supabase.
          </AppText>
        </View>
      ) : null}

      {pending && (session || isDemo) ? (
        <ListCard
          title="Confirmar cambio"
          body={`${pending.label}\nRegistro: ${pending.id}`}
          footer={
            <View style={styles.btnRow}>
              <Button title={busy ? 'Guardando…' : 'Confirmar'} size="sm" disabled={busy} onPress={() => { void confirmPatch(); }} />
              <Button title="Cancelar" size="sm" variant="secondary" disabled={busy} onPress={() => setPending(null)} />
            </View>
          }
        />
      ) : null}

      {(() => {
        const deletedIds = new Set(demoDeleted[entity] || []);
        const patches = demoPatched[entity] || {};
        const merged = isDemo
          ? [...(demoCreated[entity] || []), ...(data || [])]
              .filter((r) => !deletedIds.has(r.id))
              .map((r) => (patches[r.id] ? { ...r, ...patches[r.id] } : r))
          : data || [];
        return (
          <>
            {!loading && !error && !merged.length ? <AppText>No hay registros en esta sección.</AppText> : null}
            {merged.map((row) => (
        <ListCard
          key={row.id}
          title={String(row.display_name || row.name || row.title || row.responsible_name || row.body || row.action || 'Registro')}
          body={String(
            [
              row.user_id ? `User: ${String(row.user_id).slice(0, 8)}…` : '',
              row.role ? `Rol: ${row.role}` : '',
              row.status ? `Estado: ${row.status}` : '',
              row.city,
              row.price != null ? `${row.currency || 'BOB'} ${row.price} (${row.period_days}d)` : '',
              row.rating ? `${row.rating}/5` : '',
              row.hidden ? 'Oculta' : '',
              row.review_notes,
              row.created_at ? String(row.created_at).slice(0, 16).replace('T', ' ') : '',
            ]
              .filter(Boolean)
              .join(' · '),
          )}
          footer={
            <View style={styles.btnRow}>
              {entity === 'user-access' ? (() => {
                const roleGuard = assertCanChangeUserRole(session?.user.id, String(row.user_id), 'admin');
                if (!roleGuard.allowed && !isDemo) {
                  return <AppText variant="micro" color="inkMuted">{roleGuard.reason}</AppText>;
                }
                return (
                <>
                  {['tourist', 'advertiser', 'support', 'admin'].map((role) => (
                    <Button
                      key={role}
                      size="sm"
                      variant={row.role === role ? 'primary' : 'secondary'}
                      title={`Rol: ${role}`}
                      disabled={busy || row.role === role}
                      onPress={() => setPending({ id: row.id, body: { role }, label: `Cambiar rol a ${role}` })}
                    />
                  ))}
                  {['active', 'suspended', 'blocked'].map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant="soft"
                      title={`Estado: ${status}`}
                      disabled={busy || row.status === status}
                      onPress={() => setPending({ id: row.id, body: { status }, label: `Cambiar estado a ${status}` })}
                    />
                  ))}
                </>
                );
              })() : null}
              {entity === 'business-verifications' ? (
                <View style={{ width: '100%', gap: 6 }}>
                  <FormField
                    label="Observaciones de revisión administrativa"
                    value={reviewNotes}
                    onChangeText={setReviewNotes}
                    placeholder="Ej. Documentación validada o indicar qué corregir…"
                  />
                  <View style={styles.btnRow}>
                    {['approved', 'correction_requested'].map((status) => (
                      <Button
                        key={status}
                        size="sm"
                        variant={status === 'approved' ? 'primary' : 'secondary'}
                        title={status === 'approved' ? 'Aprobar comercio' : 'Pedir corrección'}
                        disabled={busy || row.status === status}
                        onPress={() =>
                          setPending({
                            id: row.id,
                            body: {
                              status,
                              reviewer_id: session?.user.id,
                              reviewed_at: new Date().toISOString(),
                              review_notes: reviewNotes.trim() || null,
                            },
                            label: `Cambiar verificación a ${status}`,
                          })
                        }
                      />
                    ))}
                  </View>
                </View>
              ) : null}
              {entity === 'tickets' ? (
                <Button
                  size="sm"
                  title={row.status === 'resolved' ? 'Ya resuelto' : 'Marcar resuelto'}
                  disabled={busy || row.status === 'resolved'}
                  onPress={() => setPending({ id: row.id, body: { status: 'resolved' }, label: 'Resolver reporte administrativo' })}
                />
              ) : null}
              {entity === 'reviews' ? (
                <Button
                  size="sm"
                  title={row.hidden ? 'Restaurar reseña' : 'Ocultar reseña'}
                  disabled={busy}
                  onPress={() =>
                    setPending({
                      id: row.id,
                      body: { hidden: !row.hidden },
                      label: row.hidden ? 'Restaurar reseña' : 'Ocultar reseña',
                    })
                  }
                />
              ) : null}
              {entity === 'subscriptions' ? (
                <Button
                  size="sm"
                  variant="secondary"
                  title={row.status === 'active' ? 'Cancelar VIP' : 'Reactivar VIP'}
                  disabled={busy}
                  onPress={() =>
                    setPending({
                      id: row.id,
                      body: { status: row.status === 'active' ? 'canceled' : 'active' },
                      label: row.status === 'active' ? 'Cancelar suscripción' : 'Reactivar suscripción',
                    })
                  }
                />
              ) : null}
              {['categories', 'zones', 'subscription-plans'].includes(entity) ? (
                <Button
                  title="Editar"
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onPress={() => {
                    setEditingRowId(row.id);
                    if (entity === 'categories') {
                      setFieldA(String(row.name || ''));
                      setFieldB(String(row.slug || ''));
                    } else if (entity === 'zones') {
                      setFieldA(String(row.name || ''));
                      setFieldB(String(row.city || 'La Paz'));
                      setFieldC(String(row.latitude ?? '-16.4955'));
                      setFieldD(String(row.longitude ?? '-68.1336'));
                    } else if (entity === 'subscription-plans') {
                      setFieldA(String(row.name || ''));
                      setFieldB(String(row.price ?? '30'));
                      setFieldC(String(row.period_days ?? '30'));
                    }
                    setCreateOpen(true);
                  }}
                />
              ) : null}
              {entity === 'places' || entity === 'experiences' ? (
                <Button
                  size="sm"
                  title={row.published ? 'Despublicar' : 'Publicar'}
                  disabled={busy}
                  onPress={() =>
                    setPending({
                      id: row.id,
                      body: { published: !row.published },
                      label: row.published ? 'Despublicar registro' : 'Publicar registro',
                    })
                  }
                />
              ) : null}
              {entity === 'promotions' ? (
                <Button
                  size="sm"
                  title={row.status === 'active' ? 'Pausar cupón' : 'Activar cupón'}
                  disabled={busy}
                  onPress={() =>
                    setPending({
                      id: row.id,
                      body: { status: row.status === 'active' ? 'paused' : 'active' },
                      label: row.status === 'active' ? 'Pausar cupón' : 'Activar cupón',
                    })
                  }
                />
              ) : null}
              {entity === 'routes' ? (
                <Button
                  size="sm"
                  title={row.visibility === 'public' ? 'Hacer privada' : 'Hacer pública'}
                  disabled={busy}
                  onPress={() =>
                    setPending({
                      id: row.id,
                      body: { visibility: row.visibility === 'public' ? 'private' : 'public' },
                      label: row.visibility === 'public' ? 'Cambiar ruta a privada' : 'Publicar ruta',
                    })
                  }
                />
              ) : null}
              {['categories', 'zones', 'subscription-plans', 'subscriptions', 'notifications', 'business-verifications', 'reviews', 'places', 'promotions', 'routes', 'businesses', 'experiences'].includes(entity) || (entity === 'user-access' && row.user_id !== session?.user.id) ? (
                confirmDeleteId === row.id ? (
                  <>
                    <Button title="Confirmar" size="sm" disabled={busy} onPress={() => { void handleDelete(row.id); }} />
                    <Button title="Cancelar" size="sm" variant="secondary" onPress={() => setConfirmDeleteId(null)} />
                  </>
                ) : (
                  <Button title="Eliminar" size="sm" variant="soft" disabled={busy} onPress={() => setConfirmDeleteId(row.id)} />
                )
              ) : null}
              {row.hidden ? <Badge label="Oculta" tone="cream" /> : null}
            </View>
          }
        />
      ))}
          </>
        );
      })()}

      <Button title="Actualizar" variant="secondary" disabled={loading || busy} onPress={retry} />
      <Button title="Ir a Tickets de soporte" onPress={() => router.navigate('/soporte')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTabs: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
    paddingBottom: 4,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md + 2,
    gap: spacing.sm,
  },
  btnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    marginTop: 4,
  },
  demoNoticeBox: {
    backgroundColor: colors.highlight,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderHighlight,
    padding: spacing.sm + 2,
  },
});
