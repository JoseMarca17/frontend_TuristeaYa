import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Linking, Platform, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';

import { ReviewCard } from '@/components/ReviewCard';
import { ReviewFilter, type FilterType } from '@/components/ReviewFilter';
import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { FormField } from '@/components/ui/form-field';
import { ErrorState, LoadingState } from '@/components/ui/loading-state';
import { findDiscoveryPlace } from '@/features/turista/data/discovery';
import { useRemoteData } from '@/hooks/use-remote-data';
import { listRecords, type CatalogRow } from '@/services/catalog';
import { MAX_REVIEW_PHOTOS } from '@/services/domain-rules';
import { validateAndCompressImage, type PreparedImageAsset } from '@/services/image-upload';
import { createRecord, deleteRecord, updateRecord } from '@/services/management';
import { uploadReviewMedia } from '@/services/media';
import { useAuthStore } from '@/stores/use-auth-store';
import { createDemoId, useDemoStore } from '@/stores/use-demo-store';
import { useUiStore } from '@/stores/use-ui-store';
import { colors, radius, spacing } from '@/theme';

export function LiveReviews() {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const session = useAuthStore((s) => s.session);
  const demoRole = useAuthStore((s) => s.demoRole);
  const isDemo = !session && Boolean(demoRole);
  const demoPlaces = useDemoStore((s) => s.places);
  const demoReviews = useDemoStore((s) => s.reviews);
  const demoReplies = useDemoStore((s) => s.reviewReplies);
  const demoName = useDemoStore((s) => s.profileName);
  const addDemoReview = useDemoStore((s) => s.addReview);
  const updateDemoReview = useDemoStore((s) => s.updateReview);
  const deleteDemoReview = useDemoStore((s) => s.deleteReview);
  const addDemoTicket = useDemoStore((s) => s.addTicket);
  const showToast = useUiStore((s) => s.showToast);

  const [filter, setFilter] = useState<FilterType>('recientes');
  const [body, setBody] = useState('');
  const [rating, setRating] = useState('5');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editRating, setEditRating] = useState('5');
  const [photos, setPhotos] = useState<PreparedImageAsset[]>([]);
  const [reportingReviewId, setReportingReviewId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [galleryPermission, setGalleryPermission] = useState<{ granted: boolean; canAskAgain: boolean } | null>(null);
  const [cameraPermission, setCameraPermission] = useState<{ granted: boolean; canAskAgain: boolean } | null>(null);
  const lock = useRef(false);

  const load = useCallback(async (signal: AbortSignal) => {
    const places = await listRecords('places', { signal, private: Boolean(session) }).catch(() => []);
    const allPlaces = isDemo ? [...demoPlaces, ...places] : places;
    const local = placeId ? findDiscoveryPlace(placeId) : undefined;
    const place =
      allPlaces.find((row) => row.id === placeId) ||
      allPlaces.find(
        (row) =>
          local &&
          String(row.name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() ===
          local.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
      );
    if (!place) return { place: undefined, rows: [] as CatalogRow[], replies: [] as CatalogRow[], media: [] as CatalogRow[] };
    const [rows, replies, media] = await Promise.all([
      listRecords('reviews', { signal, filters: { place_id: place.id } }).catch(() => []),
      listRecords('review-replies', { signal }).catch(() => []),
      listRecords('review-media', { signal }).catch(() => []),
    ]);
    const extraReviews = isDemo
      ? demoReviews
          .filter((r) => r.place_id === place.id)
          .map((r) => ({ ...r }) as unknown as CatalogRow)
      : [];
    const extraReplies = isDemo
      ? demoReplies.map((rep) => ({ ...rep }) as unknown as CatalogRow)
      : [];
    return {
      place,
      rows: [...extraReviews, ...rows].filter((row) => !row.hidden),
      replies: [...extraReplies, ...replies],
      media,
    };
  }, [placeId, session, isDemo, demoPlaces, demoReviews, demoReplies]);

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
      .catch(() => { });
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

  async function appendValidatedAssets(assets: ImagePicker.ImagePickerAsset[]) {
    const nextList = [...photos];
    for (const asset of assets) {
      try {
        const compressed = await validateAndCompressImage(asset, nextList.length, MAX_REVIEW_PHOTOS);
        nextList.push(compressed);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Imagen rechazada.';
        setNotice(msg);
        showToast(msg, 'error');
        break;
      }
    }
    setPhotos(nextList);
  }

  async function publish() {
    if ((!session && !isDemo) || !data?.place || lock.current || !body.trim()) return;
    const stars = Number(rating);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      setNotice('La calificación debe estar entre 1 y 5.');
      return;
    }
    if (isDemo) {
      addDemoReview({
        id: `demo-rev-${Date.now()}`,
        place_id: data.place.id,
        user_id: `demo-${demoRole}`,
        author: demoName || 'Tú',
        rating: stars,
        body: body.trim(),
        hidden: false,
        created_at: new Date().toISOString(),
        photos: photos.map((p) => p.uri),
      });
      setBody('');
      setPhotos([]);
      setNotice('Reseña publicada.');
      showToast('Reseña publicada.', 'success');
      return;
    }
    lock.current = true;
    setBusy(true);
    setNotice('');
    try {
      const created = (await createRecord(
        'reviews',
        { place_id: data.place.id, user_id: session!.user.id, rating: stars, body: body.trim() },
        'Publicando reseña…',
      )) as { id?: string };

      let uploadedCount = 0;
      const uploadErrors: string[] = [];
      if (photos.length > 0 && created.id) {
        for (const asset of photos) {
          try {
            await uploadReviewMedia(created.id, asset);
            uploadedCount += 1;
          } catch (uploadError) {
            uploadErrors.push(uploadError instanceof Error ? uploadError.message : 'Storage no disponible');
          }
        }
      }

      const message =
        uploadErrors.length > 0
          ? `Reseña publicada (${uploadedCount}/${photos.length} fotos subidas).`
          : uploadedCount > 0
            ? `Reseña y ${uploadedCount} foto(s) publicadas.`
            : 'Reseña publicada.';

      setBody('');
      setPhotos([]);
      setNotice(message);
      showToast(message, uploadErrors.length > 0 ? 'info' : 'success');
      retry();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'No se pudo publicar.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function saveEdit(reviewId: string) {
    if ((!session && !isDemo) || lock.current || !editBody.trim()) return;
    const stars = Number(editRating);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      setNotice('La calificación debe estar entre 1 y 5.');
      return;
    }
    if (isDemo && reviewId.startsWith('demo-rev-')) {
      updateDemoReview(reviewId, { rating: stars, body: editBody.trim() });
      setEditingId(null);
      showToast('Reseña actualizada.', 'success');
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      await updateRecord('reviews', reviewId, { rating: stars, body: editBody.trim() }, 'Actualizando reseña…');
      setEditingId(null);
      showToast('Reseña actualizada.', 'success');
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo actualizar.', 'error');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function removeReview(reviewId: string) {
    if ((!session && !isDemo) || lock.current) return;
    const ok = await confirmAction({
      title: 'Eliminar reseña',
      message: '¿Eliminar permanentemente esta reseña y sus adjuntos?',
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;
    if (isDemo && reviewId.startsWith('demo-rev-')) {
      deleteDemoReview(reviewId);
      showToast('Reseña eliminada.', 'success');
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      await deleteRecord('reviews', reviewId, 'Eliminando reseña…');
      showToast('Reseña eliminada.', 'success');
      retry();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo eliminar.', 'error');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function reportReview(reviewId: string) {
    if ((!session && !isDemo) || !data?.place || !reportReason.trim() || lock.current) return;
    if (isDemo) {
      addDemoTicket({
        id: createDemoId('demo-tk'),
        user_id: `demo-${demoRole}`,
        place_id: data.place.id,
        review_id: reviewId,
        kind: 'review',
        priority: 'medium',
        status: 'pending',
        subject: `Reporte de reseña en ${data.place.name}`,
        description: reportReason.trim(),
        created_at: new Date().toISOString(),
      });
      setReportingReviewId(null);
      setReportReason('');
      showToast('Reporte enviado al equipo de moderación.', 'success');
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      await createRecord(
        'tickets',
        {
          user_id: session!.user.id,
          place_id: data.place.id,
          review_id: reviewId,
          kind: 'review',
          priority: 'medium',
          subject: `Reporte de reseña en ${data.place.name}`,
          description: reportReason.trim(),
        },
        'Reportando reseña para moderación…',
      );
      setReportingReviewId(null);
      setReportReason('');
      showToast('Reporte enviado al equipo de moderación.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo enviar el reporte.', 'error');
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
        const isMine = session ? row.user_id === session.user.id : isDemo && row.user_id === `demo-${demoRole}`;
        const replies = (data?.replies ?? []).filter((rep) => rep.review_id === row.id);
        const mediaRows = (data?.media ?? []).filter((m) => m.review_id === row.id);
        return (
          <View key={row.id} style={styles.reviewWrap}>
            <ReviewCard
              author={isMine ? 'Tú' : String(row.author || 'Visitante')}
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
                <AppText variant="label" color="primary">Respuesta del comercio:</AppText>
                <AppText variant="bodySmall">{String(rep.body)}</AppText>
              </View>
            ))}
            {isMine ? (
              editingId === row.id ? (
                <View style={styles.editBox}>
                  <FormField label="Calificación (1 a 5)" value={editRating} onChangeText={setEditRating} keyboardType="number-pad" />
                  <FormField label="Tu comentario" value={editBody} onChangeText={setEditBody} multiline />
                  <View style={styles.row}>
                    <Button title="Guardar cambios" size="sm" disabled={busy} onPress={() => { void saveEdit(row.id); }} />
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
            ) : session || isDemo ? (
              <View style={{ gap: 6 }}>
                <Button
                  title={reportingReviewId === row.id ? 'Cancelar reporte' : 'Reportar reseña'}
                  size="sm"
                  variant="soft"
                  onPress={() => setReportingReviewId(reportingReviewId === row.id ? null : row.id)}
                />
                {reportingReviewId === row.id ? (
                  <View style={styles.editBox}>
                    <FormField
                      label="Motivo del reporte"
                      placeholder="Ej. Contenido ofensivo, spam o información falsa"
                      value={reportReason}
                      onChangeText={setReportReason}
                    />
                    <Button
                      title="Enviar reporte de moderación"
                      size="sm"
                      disabled={busy || !reportReason.trim()}
                      onPress={() => { void reportReview(row.id); }}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}

      {data?.place && !rows?.length ? <AppText>Aún no hay reseñas publicadas.</AppText> : null}

      {data?.place && (session || isDemo) ? (
        <View style={styles.card}>
          <View style={styles.row}>
            <AppText variant="section" style={{ flex: 1 }}>Escribe tu reseña</AppText>
            <Badge label={`Máx. 5 MB por foto (${photos.length}/${MAX_REVIEW_PHOTOS})`} tone="cream" />
          </View>
          <FormField label="Calificación (1 a 5)" value={rating} onChangeText={setRating} keyboardType="number-pad" editable={!busy} />
          <FormField label="Tu experiencia" value={body} onChangeText={setBody} maxLength={4000} multiline editable={!busy} />
          <AppText variant="caption" color="inkSoft">
            Formatos permitidos: JPG, PNG o WEBP · Compresión automática antes de subir.
          </AppText>
          <AppText variant="caption">
            Permisos: galería {galleryPermission?.granted ? 'permitida' : 'sin permiso'} · cámara {cameraPermission?.granted ? 'permitida' : 'sin permiso'}
          </AppText>
          {!galleryPermission?.granted ? <Button title="Permitir acceso a fotos" variant="secondary" size="sm" disabled={busy} onPress={() => { void requestGallery(); }} /> : null}
          {!cameraPermission?.granted ? <Button title="Permitir acceso a cámara" variant="secondary" size="sm" disabled={busy} onPress={() => { void requestCamera(); }} /> : null}
          {((galleryPermission && !galleryPermission.canAskAgain) || (cameraPermission && !cameraPermission.canAskAgain)) ? (
            <Button title="Abrir ajustes de permisos" variant="secondary" size="sm" onPress={openSettings} />
          ) : null}
          <View style={styles.row}>
            <Button
              title="Elegir fotos"
              variant="secondary"
              size="sm"
              disabled={busy || photos.length >= MAX_REVIEW_PHOTOS}
              onPress={async () => {
                if (!(galleryPermission?.granted || (await requestGallery()))) return;
                const result = await ImagePicker.launchImageLibraryAsync({
                  mediaTypes: ['images'],
                  allowsMultipleSelection: true,
                  selectionLimit: MAX_REVIEW_PHOTOS - photos.length,
                  quality: 0.85,
                });
                if (!result.canceled) await appendValidatedAssets(result.assets);
              }}
            />
            <Button
              title="Tomar foto"
              variant="secondary"
              size="sm"
              disabled={busy || photos.length >= MAX_REVIEW_PHOTOS}
              onPress={async () => {
                if (!(cameraPermission?.granted || (await requestCamera()))) return;
                const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.85 });
                if (!result.canceled) await appendValidatedAssets(result.assets);
              }}
            />
          </View>
          {photos.length > 0 ? (
            <View style={{ gap: spacing.xs }}>
              {photos.map((photo, index) => (
                <View key={`${photo.uri}-${index}`} style={styles.photoPreviewRow}>
                  <Image source={{ uri: photo.uri }} style={styles.thumb} accessibilityLabel={`Foto adjunta ${index + 1}`} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="caption" numberOfLines={1}>{photo.fileName || `Foto ${index + 1}`}</AppText>
                    {photo.compressedLabel ? <AppText variant="micro" color="primary">{photo.compressedLabel}</AppText> : null}
                  </View>
                  <Button
                    title="Quitar"
                    size="sm"
                    variant="soft"
                    onPress={() => setPhotos((prev) => prev.filter((_, i) => i !== index))}
                  />
                </View>
              ))}
            </View>
          ) : null}
          <Button title="Publicar reseña" disabled={busy || !body.trim()} onPress={publish} />
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
  photoPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
  },
  thumb: { width: 52, height: 52, borderRadius: radius.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2, alignItems: 'center' },
});
