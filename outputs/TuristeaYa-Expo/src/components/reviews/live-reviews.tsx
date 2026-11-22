import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Linking, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { ReviewCard } from '@/components/ReviewCard';
import { ReviewFilter, type FilterType } from '@/components/ReviewFilter';
import { findDiscoveryPlace } from '@/features/turista/data/discovery';
import { useRemoteData } from '@/hooks/use-remote-data';
import { useSession } from '@/hooks/use-session';
import { listRecords } from '@/services/catalog';
import { createRecord } from '@/services/management';
import { uploadReviewMedia } from '@/services/media';

export function LiveReviews() {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const session = useSession();
  const [filter, setFilter] = useState<FilterType>('recientes');
  const [body, setBody] = useState('');
  const [rating, setRating] = useState('5');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [galleryPermission, setGalleryPermission] = useState<{ granted: boolean; canAskAgain: boolean } | null>(null);
  const [cameraPermission, setCameraPermission] = useState<{ granted: boolean; canAskAgain: boolean } | null>(null);
  const lock = useRef(false);
  const load = useCallback(async (signal: AbortSignal) => {
    const places = await listRecords('places', { signal, private: !!session });
    const local = placeId ? findDiscoveryPlace(placeId) : undefined;
    const place = places.find(row => row.id === placeId) || places.find(row => local && String(row.name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === local.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());
    const rows = place ? await listRecords('reviews', { signal, filters: { place_id: place.id } }) : [];
    return { place, rows: rows.filter(row => !row.hidden) };
  }, [placeId, session]);
  const { data, loading, error, retry } = useRemoteData(load);

  useEffect(() => {
    let active = true;
    Promise.all([
      ImagePicker.getMediaLibraryPermissionsAsync(),
      ImagePicker.getCameraPermissionsAsync(),
    ]).then(([gallery, camera]) => {
      if (active) {
        setGalleryPermission(gallery);
        setCameraPermission(camera);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  async function requestGallery() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    setGalleryPermission(permission);
    if (!permission.granted) setNotice(permission.canAskAgain ? 'Se necesita permiso para acceder a tus fotos.' : 'El acceso a fotos está bloqueado. Ábrelo desde Ajustes.');
    return permission.granted;
  }

  async function requestCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    setCameraPermission(permission);
    if (!permission.granted) setNotice(permission.canAskAgain ? 'Se necesita permiso para usar la cámara.' : 'El acceso a la cámara está bloqueado. Ábrelo desde Ajustes.');
    return permission.granted;
  }

  function openSettings() {
    if (Platform.OS !== 'web') void Linking.openSettings();
    else setNotice('Permite el acceso a fotos o cámara desde la configuración del navegador.');
  }
  async function publish() {
    if (!session || !data?.place || lock.current || !body.trim()) return;
    const stars = Number(rating);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) { setNotice('La calificación debe estar entre 1 y 5.'); return; }
    lock.current = true; setBusy(true); setNotice('');
    try {
      const created = await createRecord('reviews', { place_id: data.place.id, user_id: session.user.id, rating: stars, body: body.trim() }) as { id?: string };
      let message = 'Reseña publicada.';
      if (photo && created.id) {
        try { await uploadReviewMedia(created.id, photo); message = 'Reseña y foto publicadas.'; }
        catch (uploadError) { message = `Reseña publicada, pero no se pudo subir la foto: ${uploadError instanceof Error ? uploadError.message : 'revisa los permisos y Storage.'}`; }
      }
      setBody(''); setPhoto(null); setNotice(message); retry();
    }
    catch (err) { setNotice(err instanceof Error ? err.message : 'No se pudo publicar.'); }
    finally { lock.current = false; setBusy(false); }
  }
  const rows = data?.rows.slice().sort((a, b) => filter === 'mejor_valoradas' ? Number(b.rating) - Number(a.rating) : String(b.created_at).localeCompare(String(a.created_at)));
  return <Screen title="Reseñas del lugar" subtitle={String(data?.place?.name || '')}>
    <ReviewFilter activeFilter={filter} onFilterChange={setFilter} />
    {loading ? <AppText>Cargando reseñas…</AppText> : null}
    {error || notice ? <AppText accessibilityRole="alert">{error || notice}</AppText> : null}
    {!loading && !error && !data?.place ? <><AppText>Elige un lugar publicado del catálogo para consultar o escribir reseñas.</AppText><Button title="Abrir catálogo" onPress={() => router.navigate('/turista/catalogo')} /></> : null}
    {rows?.map(row => <ReviewCard key={row.id} author={row.user_id === session?.user.id ? 'Tú' : 'Visitante'} rating={`${row.rating}/5`} comment={String(row.body)} />)}
    {data?.place && !rows?.length ? <AppText>Aún no hay reseñas publicadas.</AppText> : null}
    {data?.place && session ? <>
      <FormField label="Calificación (1 a 5)" value={rating} onChangeText={setRating} keyboardType="number-pad" editable={!busy} />
      <FormField label="Tu experiencia" value={body} onChangeText={setBody} maxLength={4000} multiline editable={!busy} />
      <AppText variant="caption">Fotos: galería {galleryPermission?.granted ? 'permitida' : 'sin permiso'} · cámara {cameraPermission?.granted ? 'permitida' : 'sin permiso'}</AppText>
      {!galleryPermission?.granted ? <Button title="Permitir acceso a fotos" variant="secondary" disabled={busy} onPress={() => { void requestGallery(); }} /> : null}
      {!cameraPermission?.granted ? <Button title="Permitir acceso a cámara" variant="secondary" disabled={busy} onPress={() => { void requestCamera(); }} /> : null}
      {((galleryPermission && !galleryPermission.canAskAgain) || (cameraPermission && !cameraPermission.canAskAgain)) ? <Button title="Abrir ajustes de permisos" variant="secondary" onPress={openSettings} /> : null}
      <Button title="Elegir foto para la reseña" variant="secondary" disabled={busy} onPress={async () => {
        if (!(galleryPermission?.granted || await requestGallery())) return;
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });
        if (!result.canceled) setPhoto(result.assets[0]);
      }} />
      <Button title="Tomar foto para la reseña" variant="secondary" disabled={busy} onPress={async () => {
        if (!(cameraPermission?.granted || await requestCamera())) return;
        const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 });
        if (!result.canceled) setPhoto(result.assets[0]);
      }} />
      {photo ? <Image source={{ uri: photo.uri }} style={{ width: '100%', height: 180, borderRadius: 12 }} accessibilityLabel="Foto seleccionada para la reseña" /> : null}
      <Button title="Publicar reseña" disabled={busy || !body.trim()} onPress={publish} />
    </> : <Button title="Iniciar sesión" onPress={() => router.navigate('/login')} />}
    <Button title="Actualizar" disabled={loading} onPress={retry} />
  </Screen>;
}
