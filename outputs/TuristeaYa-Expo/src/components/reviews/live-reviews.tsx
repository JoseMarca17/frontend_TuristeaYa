import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Linking, Platform, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';

import { ReviewCard } from '@/components/ReviewCard';
import { ReviewFilter, type FilterType } from '@/components/ReviewFilter';
import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { ErrorState, LoadingState } from '@/components/ui/loading-state';
import { findDiscoveryPlace } from '@/features/turista/data/discovery';
import { useRemoteData } from '@/hooks/use-remote-data';
import { listRecords, type CatalogRow } from '@/services/catalog';
import { createRecord, deleteRecord, updateRecord } from '@/services/management';
import { uploadReviewMedia } from '@/services/media';
import { useAuthStore } from '@/stores/use-auth-store';
import { useUiStore } from '@/stores/use-ui-store';
import { colors, radius, spacing } from '@/theme';

export function LiveReviews() {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const session = useAuthStore((s) => s.session);
  const showToast = useUiStore((s) => s.showToast);

  const [filter, setFilter] = useState<FilterType>('recientes');
  const [body, setBody] = useState('');
  const [rating, setRating] = useState('5');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editRating, setEditRating] = useState('5');
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [galleryPermission, setGalleryPermission] = useState<{ granted: boolean; canAskAgain: boolean } | null>(null);
  const [cameraPermission, setCameraPermission] = useState<{ granted: boolean; canAskAgain: boolean } | null>(null);
  const lock = useRef(false);

  const load = useCallback(async (signal: AbortSignal) => {
    const places = await listRecords('places', { signal, private: Boolean(session) });
    const local = placeId ? findDiscoveryPlace(placeId) : undefined;
    const place =
      places.find((row) => row.id === placeId) ||
      places.find(
        (row) =>
          local &&
          String(row.name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() ===
            local.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
      );
    if (!place) return { place: undefined, rows: [] as CatalogRow[], replies: [] as CatalogRow[], media: [] as CatalogRow[] };
    const [rows, replies, media] = await Promise.all([
      listRecords('reviews', { signal, filters: { place_id: place.id } }),
      listRecords('review-replies', { signal }).catch(() => []),
      listRecords('review-media', { signal }).catch(() => []),
    ]);
    return { place, rows: rows.filter((row) => !row.hidden), replies, media };
  }, [placeId, session]);

  const { data, loading, error, retry } = useRemoteData(load);

  useEffect(() => {
    let active = true;
    Promise.all([
      ImagePicker.getMediaLibraryPermissionsAsync(),
      ImagePicker.getCameraPermissionsAsync(),
    ])
      .then(([gallery, camera]) => {
        if (active) {
          setGalleryPermission(gallery);
          setCameraPermission(camera);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  async function requestGallery() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    setGalleryPermission(permission);
    if (!permission.granted) {
      setNotice(permission.canAskAgain ? 'Se necesita permiso para acceder a tus fotos.' : 'El acceso a fotos está bloqueado. Ábrelo desde Ajustes.');
    }
    return permission.granted;
  }

  async function requestCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    setCameraPermission(permission);
    if (!permission.granted) {
      setNotice(permission.canAskAgain ? 'Se necesita permiso para usar la cámara.' : 'El acceso a la cámara está bloqueado. Ábrelo desde Ajustes.');
    }
    return permission.granted;
  }

  function openSettings() {
    if (Platform.OS !== 'web') void Linking.openSettings();
    else setNotice('Permite el acceso a fotos o cámara desde la configuración del navegador.');
  }

  async function publish() {
    if (!session || !data?.place || lock.current || !body.trim()) return;
    const stars = Number(rating);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      setNotice('La calificación debe estar entre 1 y 5.');
      return;
    }
    lock.current = true;
    setBusy(true);
    setNotice('');
    try {
      const created = (await createRecord(
        'reviews',
        { place_id: data.place.id, user_id: session.user.id, rating: stars, body: body.trim() },
        'Publicando reseña en Render…',
      )) as { id?: string };
      let message = 'Reseña publicada.';
      if (photo && created.id) {
        try {
          await uploadReviewMedia(created.id, photo);
          message = 'Reseña y foto publicadas.';
        } catch (uploadError) {
          message = `Reseña publicada, pero no se pudo subir la foto: ${uploadError instanceof Error ? uploadError.message : 'revisa Storage.'}`;
        }
      }
      setBody('');
      setPhoto(null);
      setNotice(message);
      showToast(message, 'success');
      retry();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'No se pudo publicar.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function saveEdit(reviewId: string) {
    if (!session || lock.current || !editBody.trim()) return;
    const stars = Number(editRating);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      setNotice('La calificación debe estar entre 1 y 5.');
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      await updateRecord('reviews', reviewId, { rating: stars, body: editBody.trim() }, 'Actualizando reseña…');
      setEditingId(null);
      showToast('Reseña actualizada en Render.', 'success');
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo actualizar.', 'error');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function removeReview(reviewId: string) {
    if (!session || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await deleteRecord('reviews', reviewId, 'Eliminando reseña…');
      showToast('Reseña eliminada de Render.', 'success');
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo eliminar.', 'error');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const rows = data?.rows
    .slice()
    .sort((a, b) =>
      filter === 'mejor_valoradas'
        ? Number(b.rating) - Number(a.rating)
        : String(b.created_at).localeCompare(String(a.created_at)),
    );

  return (
    <Screen title="Reseñas del lugar" subtitle={String(data?.place?.name || '')}>
      <ReviewFilter activeFilter={filter} onFilterChange={setFilter} />
      {loading ? <LoadingState label="Cargando reseñas…" /> : null}
      {error ? <ErrorState message={error} onRetry={retry} /> : null}
      {notice ? <AppText accessibilityRole="alert">{notice}</AppText> : null}

      {!loading && !error && !data?.place ? (
        <View style={styles.card}>
          <AppText>Elige un lugar publicado del catálogo para consultar o escribir reseñas.</AppText>
          <Button title="Abrir catálogo" onPress={() => router.navigate('/turista/catalogo')} />
        </View>
      ) : null}

      {rows?.map((row) => {
        const isMine = row.user_id === session?.user.id;
        const replies = (data?.replies ?? []).filter((rep) => rep.review_id === row.id);
        const mediaRows = (data?.media ?? []).filter((m) => m.review_id === row.id);
        return (
          <View key={row.id} style={styles.reviewWrap}>
            <ReviewCard
              author={isMine ? 'Tú' : 'Visitante'}
              rating={`${row.rating}/5`}
              comment={String(row.body)}
              visitDate={row.created_at ? new Date(String(row.created_at)).toLocaleDateString() : undefined}
            />
            {mediaRows.map((m) => (
              <View key={m.id} style={styles.row}>
                <AppText variant="micro" color="inkSoft">Adjunto: {String(m.storage_path)}</AppText>
                {isMine ? (
                  <Button
                    title="Quitar foto"
                    size="sm"
                    variant="soft"
                    disabled={busy}
                    onPress={() => {
                      void deleteRecord('review-media', m.id, 'Eliminando foto…').then(() => {
                        showToast('Foto eliminada.', 'success');
                        retry();
                      });
                    }}
                  />
                ) : null}
              </View>
            ))}
            {replies.map((rep) => (
              <View key={rep.id} style={styles.replyBox}>
                <AppText variant="label" color="primary">Respuesta del negocio:</AppText>
                <AppText variant="bodySmall">{String(rep.body)}</AppText>
              </View>
            ))}
            {isMine ? (
              editingId === row.id ? (
                <View style={styles.editBox}>
                  <FormField label="Calificación (1 a 5)" value={editRating} onChangeText={setEditRating} keyboardType="number-pad" />
                  <FormField label="Tu comentario" value={editBody} onChangeText={setEditBody} multiline />
                  <View style={styles.row}>
                    <Button title="Guardar (PATCH)" size="sm" disabled={busy} onPress={() => { void saveEdit(row.id); }} />
                    <Button title="Cancelar" size="sm" variant="secondary" onPress={() => setEditingId(null)} />
                  </View>
                </View>
              ) : (
                <View style={styles.row}>
                  <Button
                    title="Editar"
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onPress={() => {
                      setEditingId(row.id);
                      setEditBody(String(row.body || ''));
                      setEditRating(String(row.rating || 5));
                    }}
                  />
                  <Button title="Eliminar" size="sm" variant="soft" disabled={busy} onPress={() => { void removeReview(row.id); }} />
                </View>
              )
            ) : null}
          </View>
        );
      })}

      {data?.place && !rows?.length ? <AppText>Aún no hay reseñas publicadas.</AppText> : null}

      {data?.place && session ? (
        <View style={styles.card}>
          <AppText variant="section">Escribe tu reseña</AppText>
          <FormField label="Calificación (1 a 5)" value={rating} onChangeText={setRating} keyboardType="number-pad" editable={!busy} />
          <FormField label="Tu experiencia" value={body} onChangeText={setBody} maxLength={4000} multiline editable={!busy} />
          <AppText variant="caption">
            Fotos: galería {galleryPermission?.granted ? 'permitida' : 'sin permiso'} · cámara {cameraPermission?.granted ? 'permitida' : 'sin permiso'}
          </AppText>
          {!galleryPermission?.granted ? <Button title="Permitir acceso a fotos" variant="secondary" size="sm" disabled={busy} onPress={() => { void requestGallery(); }} /> : null}
          {!cameraPermission?.granted ? <Button title="Permitir acceso a cámara" variant="secondary" size="sm" disabled={busy} onPress={() => { void requestCamera(); }} /> : null}
          {((galleryPermission && !galleryPermission.canAskAgain) || (cameraPermission && !cameraPermission.canAskAgain)) ? (
            <Button title="Abrir ajustes de permisos" variant="secondary" size="sm" onPress={openSettings} />
          ) : null}
          <View style={styles.row}>
            <Button
              title="Elegir foto"
              variant="secondary"
              size="sm"
              disabled={busy}
              onPress={async () => {
                if (!(galleryPermission?.granted || (await requestGallery()))) return;
                const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });
                if (!result.canceled) setPhoto(result.assets[0]);
              }}
            />
            <Button
              title="Tomar foto"
              variant="secondary"
              size="sm"
              disabled={busy}
              onPress={async () => {
                if (!(cameraPermission?.granted || (await requestCamera()))) return;
                const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 });
                if (!result.canceled) setPhoto(result.assets[0]);
              }}
            />
          </View>
          {photo ? <Image source={{ uri: photo.uri }} style={{ width: '100%', height: 180, borderRadius: 12 }} accessibilityLabel="Foto seleccionada para la reseña" /> : null}
          <Button title="Publicar reseña (POST)" disabled={busy || !body.trim()} onPress={publish} />
        </View>
      ) : data?.place ? (
        <Button title="Iniciar sesión para reseñar" onPress={() => router.navigate('/login')} />
      ) : null}
      <Button title="Actualizar" variant="secondary" disabled={loading} onPress={retry} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md + 2,
    gap: spacing.sm,
  },
  reviewWrap: { gap: spacing.xs + 2 },
  replyBox: {
    backgroundColor: colors.surfaceGreen,
    borderRadius: radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    padding: spacing.sm + 2,
    marginTop: -6,
  },
  editBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
});
