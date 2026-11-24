import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

import { AppText } from '@/components/ui/app-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { FormField } from '@/components/ui/form-field';
import { ListCard } from '@/components/ui/list-card';
import { StepProgressBar } from '@/components/ui/step-progress';
import { RouteMap } from '@/features/turista/components/route-map';
import type { CatalogRow } from '@/services/catalog';
import { MAX_REVIEW_PHOTOS } from '@/services/domain-rules';
import { validateAndCompressImage, type PreparedImageAsset } from '@/services/image-upload';
import { createRecord, updateRecord } from '@/services/management';
import { uploadPlaceMedia } from '@/services/media';
import { useUiStore } from '@/stores/use-ui-store';
import { borderWidth, colors, radius, spacing } from '@/theme';

const SERVICE_OPTIONS = ['Wi-Fi', 'Estacionamiento', 'Accesible', 'Delivery', 'Pago QR', 'Reservas', 'Guía', 'Pet friendly'];

export function BusinessWizard({
  business,
  existingPlace,
  zones,
  verifications,
  isDemo,
  onSaved,
}: {
  business: CatalogRow;
  existingPlace?: CatalogRow;
  zones: CatalogRow[];
  verifications: CatalogRow[];
  isDemo?: boolean;
  onSaved: () => void;
}) {
  const showToast = useUiStore((s) => s.showToast);

  const [step, setStep] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Paso 1: Datos básicos
  const [bizName, setBizName] = useState(String(business.name || ''));
  const [placeName, setPlaceName] = useState(String(existingPlace?.name || business.name || ''));
  const [description, setDescription] = useState(String(existingPlace?.description || ''));
  const [phone, setPhone] = useState(String(business.phone || ''));
  const [email, setEmail] = useState(String(business.contact_email || ''));
  const [services, setServices] = useState<string[]>(
    Array.isArray(existingPlace?.services) ? existingPlace.services.map(String) : ['Wi-Fi', 'Pago QR'],
  );
  const [menuSummary, setMenuSummary] = useState('Menú del día, especialidades locales y bebidas tradicionales.');
  const [estimatedCost, setEstimatedCost] = useState(String(existingPlace?.estimated_cost ?? 35));
  const [visitMinutes, setVisitMinutes] = useState(String(existingPlace?.visit_minutes ?? 45));

  // Paso 2: Ubicación y mapa
  const [address, setAddress] = useState(String(existingPlace?.address || 'Centro, La Paz'));
  const [zoneId, setZoneId] = useState(String(existingPlace?.zone_id || zones[0]?.id || ''));
  const [latitude, setLatitude] = useState(Number(existingPlace?.latitude ?? -16.4955));
  const [longitude, setLongitude] = useState(Number(existingPlace?.longitude ?? -68.1336));

  // Paso 3: Multimedia y verificación
  const [photos, setPhotos] = useState<PreparedImageAsset[]>([]);
  const [menuDocRef, setMenuDocRef] = useState('menus/menu-principal.pdf');
  const [legalDocRef, setLegalDocRef] = useState(
    String(verifications[0]?.document_path || 'verificaciones/licencia-nit.pdf'),
  );
  const [responsibleName, setResponsibleName] = useState(String(verifications[0]?.responsible_name || ''));

  function toggleService(srv: string) {
    setServices((prev) => (prev.includes(srv) ? prev.filter((item) => item !== srv) : [...prev, srv]));
  }

  async function pickCurrentGps() {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        showToast('Permite el acceso a ubicación para centrar el establecimiento.', 'error');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLatitude(Math.round(pos.coords.latitude * 100000) / 100000);
      setLongitude(Math.round(pos.coords.longitude * 100000) / 100000);
      showToast('Coordenadas GPS actualizadas.', 'success');
    } catch {
      showToast('No se pudo leer el GPS; selecciona el punto en el mapa.', 'info');
    }
  }

  async function pickPhotos() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast('Se requiere acceso a fotos para cargar imágenes.', 'error');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, MAX_REVIEW_PHOTOS - photos.length),
      quality: 0.85,
    });
    if (res.canceled) return;
    const next = [...photos];
    for (const asset of res.assets) {
      try {
        next.push(await validateAndCompressImage(asset, next.length, MAX_REVIEW_PHOTOS));
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Archivo inválido (Máx. 5 MB).', 'error');
        break;
      }
    }
    setPhotos(next);
  }

  function validateStep(targetStep: number): boolean {
    setError('');
    if (targetStep === 0) {
      if (!bizName.trim() || !placeName.trim() || !description.trim()) {
        setError('Completa el nombre del comercio, nombre del local y descripción.');
        return false;
      }
      if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setError('El correo de contacto no tiene formato válido.');
        return false;
      }
    }
    if (targetStep === 1) {
      if (!address.trim() || !zoneId) {
        setError('Completa dirección y selecciona una zona.');
        return false;
      }
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        setError('Selecciona coordenadas válidas en el mapa.');
        return false;
      }
    }
    return true;
  }

  async function submitAllAndVerify() {
    if (!validateStep(0) || !validateStep(1)) return;
    if (!responsibleName.trim() || !legalDocRef.trim()) {
      setError('Completa el nombre del responsable y la referencia de documento legal.');
      return;
    }
    if (isDemo) {
      showToast('Wizard de 3 pasos guardado y verificación simulada en Vista Demo.', 'info');
      onSaved();
      return;
    }
    setBusy(true);
    setError('');
    try {
      await updateRecord(
        'businesses',
        business.id,
        {
          name: bizName.trim(),
          phone: phone.trim() || null,
          contact_email: email.trim() || null,
        },
        'Actualizando datos básicos del comercio…',
      );

      const fullDesc = `${description.trim()}\nMenú destacado: ${menuSummary.trim()}`;
      let savedPlaceId = existingPlace?.id;
      const placePayload = {
        business_id: business.id,
        zone_id: zoneId,
        name: placeName.trim(),
        description: fullDesc,
        address: address.trim(),
        latitude,
        longitude,
        estimated_cost: Math.max(0, Number(estimatedCost) || 0),
        visit_minutes: Math.max(15, Number(visitMinutes) || 45),
        services,
        published: existingPlace?.published ?? false,
      };

      if (savedPlaceId) {
        await updateRecord('places', savedPlaceId, placePayload, 'Actualizando ubicación y servicios del local…');
      } else {
        const createdPlace = await createRecord<{ id: string }>('places', placePayload, 'Registrando local en Render…');
        savedPlaceId = createdPlace?.id;
      }

      if (savedPlaceId && photos.length > 0) {
        for (const photo of photos) {
          await uploadPlaceMedia(savedPlaceId, photo).catch(() => {});
        }
      }

      await createRecord(
        'business-verifications',
        {
          business_id: business.id,
          responsible_name: responsibleName.trim(),
          contact_email: email.trim() || business.contact_email || null,
          document_path: `${legalDocRef.trim()} | Menu: ${menuDocRef.trim()}`,
          status: 'pending',
        },
        'Enviando solicitud de verificación…',
      );

      showToast('Comercio guardado y solicitud de verificación enviada al administrador.', 'success');
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo completar el registro.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wizardBox}>
      <AppText variant="section">Asistente de comercio (3 pasos)</AppText>
      <StepProgressBar
        steps={['Datos básicos', 'Ubicación', 'Multimedia y verificación']}
        currentStep={step}
        onSelectStep={(idx) => {
          if (idx <= step || validateStep(step)) setStep(idx);
        }}
      />

      {step === 0 ? (
        <View style={{ gap: spacing.sm }}>
          <FormField label="Nombre legal o comercial" value={bizName} onChangeText={setBizName} />
          <FormField label="Nombre visible del establecimiento" value={placeName} onChangeText={setPlaceName} />
          <FormField label="Descripción para turistas" value={description} onChangeText={setDescription} multiline />
          <FormField label="Teléfono" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <FormField label="Correo electrónico" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <FormField label="Menú / Oferta destacada" value={menuSummary} onChangeText={setMenuSummary} multiline />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <FormField label="Costo promedio (Bs)" value={estimatedCost} onChangeText={setEstimatedCost} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <FormField label="Visita est. (min)" value={visitMinutes} onChangeText={setVisitMinutes} keyboardType="number-pad" />
            </View>
          </View>
          <AppText variant="label">Servicios del local</AppText>
          <View style={styles.chipRow}>
            {SERVICE_OPTIONS.map((srv) => (
              <Chip key={srv} label={srv} selected={services.includes(srv)} onPress={() => toggleService(srv)} />
            ))}
          </View>
          <Button title="Continuar al Paso 2: Ubicación" onPress={() => { if (validateStep(0)) setStep(1); }} />
        </View>
      ) : null}

      {step === 1 ? (
        <View style={{ gap: spacing.sm }}>
          <FormField label="Dirección exacta" value={address} onChangeText={setAddress} />
          <AppText variant="label">Zona</AppText>
          <View style={styles.chipRow}>
            {zones.slice(0, 8).map((z) => (
              <Chip key={z.id} label={String(z.name)} selected={zoneId === z.id} onPress={() => setZoneId(z.id)} />
            ))}
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <FormField
                label="Latitud"
                value={String(latitude)}
                keyboardType="decimal-pad"
                onChangeText={(v) => { const n = Number(v); if (Number.isFinite(n)) setLatitude(n); }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <FormField
                label="Longitud"
                value={String(longitude)}
                keyboardType="decimal-pad"
                onChangeText={(v) => { const n = Number(v); if (Number.isFinite(n)) setLongitude(n); }}
              />
            </View>
          </View>
          <Button title="Usar ubicación GPS actual" size="sm" variant="secondary" onPress={() => { void pickCurrentGps(); }} />
          <RouteMap
            origin={{ latitude, longitude }}
            stops={[{ id: existingPlace?.id || 'draft', name: placeName || 'Mi local', latitude, longitude, position: 1 }]}
            title="Selección interactiva en mapa"
            onPickPoint={(pt) => {
              setLatitude(pt.latitude);
              setLongitude(pt.longitude);
              showToast(`Coordenadas ajustadas: ${pt.latitude}, ${pt.longitude}`, 'info');
            }}
          />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Button title="Atrás" variant="secondary" onPress={() => setStep(0)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Paso 3: Multimedia" onPress={() => { if (validateStep(1)) setStep(2); }} />
            </View>
          </View>
        </View>
      ) : null}

      {step === 2 ? (
        <View style={{ gap: spacing.sm }}>
          <View style={styles.rowBetween}>
            <AppText variant="label">Fotografías del local (JPG/PNG/WEBP)</AppText>
            <Badge label={`Máx. 5 MB (${photos.length}/${MAX_REVIEW_PHOTOS})`} tone="cream" />
          </View>
          <Button title="Seleccionar y comprimir fotos" size="sm" variant="secondary" onPress={() => { void pickPhotos(); }} />
          {photos.length > 0 ? (
            <View style={{ gap: 6 }}>
              {photos.map((photo, idx) => (
                <View key={`${photo.uri}-${idx}`} style={styles.photoRow}>
                  <Image source={{ uri: photo.uri }} style={styles.thumb} accessibilityLabel={`Foto ${idx + 1}`} />
                  <AppText variant="caption" style={{ flex: 1 }} numberOfLines={1}>
                    {photo.fileName || `Foto ${idx + 1}`} · {photo.compressedLabel || 'Lista'}
                  </AppText>
                  <Button title="Quitar" size="sm" variant="soft" onPress={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))} />
                </View>
              ))}
            </View>
          ) : null}

          <FormField
            label="Menú en PDF o catálogo URL (Render Storage admite imágenes en /media/places)"
            value={menuDocRef}
            onChangeText={setMenuDocRef}
          />
          <FormField
            label="Documentos legales (NIT / Licencia de funcionamiento)"
            value={legalDocRef}
            onChangeText={setLegalDocRef}
          />
          <FormField
            label="Responsable legal"
            value={responsibleName}
            onChangeText={setResponsibleName}
            placeholder="Nombre y apellido del representante"
          />

          {verifications.map((v) => (
            <ListCard
              key={v.id}
              title={`Estado de verificación: ${String(v.status || 'pending')}`}
              body={`Responsable: ${String(v.responsible_name || '-')}${v.review_notes ? `\nObservaciones del administrador: ${v.review_notes}` : ''}`}
            />
          ))}

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Button title="Vista previa pública" variant="secondary" onPress={() => setPreviewOpen(true)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Paso anterior" variant="soft" onPress={() => setStep(1)} />
            </View>
          </View>
          <Button
            title={busy ? 'Enviando solicitud…' : 'Guardar y solicitar verificación'}
            disabled={busy}
            onPress={() => { void submitAllAndVerify(); }}
          />
        </View>
      ) : null}

      {error ? <AppText accessibilityRole="alert" variant="caption" style={{ color: '#b91c1c' }}>{error}</AppText> : null}

      <Modal visible={previewOpen} transparent animationType="slide" onRequestClose={() => setPreviewOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.rowBetween}>
              <AppText variant="title">Vista previa pública</AppText>
              <Pressable onPress={() => setPreviewOpen(false)} accessibilityLabel="Cerrar vista previa">
                <AppText variant="label" color="primary">Cerrar</AppText>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: spacing.sm }}>
              <ListCard
                title={placeName || bizName || 'Mi comercio'}
                body={`${description || 'Sin descripción'}\n\nDirección: ${address}\nCosto est.: Bs ${estimatedCost} · Visita: ${visitMinutes} min\nMenú: ${menuSummary}`}
                footer={
                  <View style={styles.chipRow}>
                    <Badge label={verifications[0]?.status === 'approved' ? 'Verificado' : 'Pendiente de revisión'} tone="green" />
                    {services.map((s) => <Badge key={s} label={s} tone="cream" />)}
                  </View>
                }
              />
              <RouteMap
                origin={{ latitude, longitude }}
                stops={[{ id: 'preview', name: placeName || 'Local', latitude, longitude, position: 1 }]}
                height={180}
                title="Ubicación en mapa público"
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wizardBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: borderWidth.hairline,
    borderColor: colors.borderGreen,
    padding: spacing.md + 2,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', gap: spacing.sm },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  thumb: { width: 44, height: 44, borderRadius: radius.sm },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,28,22,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: '85%',
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
    gap: spacing.sm,
  },
});
