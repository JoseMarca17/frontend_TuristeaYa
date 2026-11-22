import { useCallback, useState } from 'react';
import { Image, Linking, Platform, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import { router, useFocusEffect } from 'expo-router';

import { Screen } from '@/components/layout/screen';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { colors, radius } from '@/theme';

type SensorValues = { x: number; y: number; z: number };

const emptySensor: SensorValues = { x: 0, y: 0, z: 0 };
const formatNumber = (value: number) => Number.isFinite(value) ? value.toFixed(2) : '—';

export default function HerramientasScreen() {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [qrValue, setQrValue] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoMessage, setPhotoMessage] = useState('');
  const [cameraBlocked, setCameraBlocked] = useState(false);
  const [locationText, setLocationText] = useState('Aún no se consultó la ubicación.');
  const [heading, setHeading] = useState<number | null>(null);
  const [accelerometer, setAccelerometer] = useState<SensorValues>(emptySensor);
  const [gyroscope, setGyroscope] = useState<SensorValues>(emptySensor);
  const [sensorMessage, setSensorMessage] = useState('');

  useFocusEffect(useCallback(() => {
    let active = true;
    const subscriptions: { remove: () => void }[] = [];
    setSensorMessage('');
    Accelerometer.setUpdateInterval(500);
    Gyroscope.setUpdateInterval(500);
    try {
      subscriptions.push(Accelerometer.addListener((value) => { if (active) setAccelerometer(value); }));
      subscriptions.push(Gyroscope.addListener((value) => { if (active) setGyroscope(value); }));
      if (Platform.OS !== 'web') {
        void Location.watchHeadingAsync((value) => {
          if (active) setHeading(value.trueHeading >= 0 ? value.trueHeading : value.magHeading);
        }).then((subscription) => {
          if (active) subscriptions.push(subscription);
          else subscription.remove();
        }).catch(() => { if (active) setSensorMessage('La brújula no está disponible en este dispositivo.'); });
      }
    } catch {
      setSensorMessage('Los sensores no están disponibles en este dispositivo.');
    }
    return () => {
      active = false;
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, []));

  async function readLocation() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error('Permiso de ubicación denegado.');
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocationText(`${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)} · precisión ${Math.round(position.coords.accuracy ?? 0)} m`);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setLocationText(error instanceof Error ? error.message : 'No se pudo obtener la ubicación.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  }

  async function pickPhoto() {
    setPhotoMessage('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setPhotoMessage('No se concedió acceso a la galería.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });
    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
      setPhotoMessage('Foto seleccionada localmente. La subida al backend se conectará al módulo de Storage.');
    }
  }

  async function takePhoto() {
    setPhotoMessage('');
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    setCameraBlocked(!permission.canAskAgain && !permission.granted);
    if (!permission.granted) {
      setPhotoMessage(permission.canAskAgain
        ? 'Se necesita permiso para usar la cámara.'
        : 'El permiso de cámara está bloqueado. Pulsa «Abrir ajustes» y habilítalo.');
      return;
    }
    setScannerOpen(false);
    // La captura completa se realizará desde la vista de cámara dedicada;
    // aquí se abre la cámara del sistema para mantener el flujo Expo Go simple.
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 });
    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
      setPhotoMessage('Foto tomada localmente. La subida al backend se conectará al módulo de Storage.');
    }
  }

  async function scan(value: { data: string }) {
    setQrValue(value.data);
    setScannerOpen(false);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }

  async function openScanner() {
    if (!(cameraPermission?.granted ?? (await requestCameraPermission()).granted)) {
      setPhotoMessage('No se concedió acceso a la cámara.');
      return;
    }
    setPhotoMessage('');
    setScannerOpen(true);
  }

  function openSettings() {
    if (Platform.OS !== 'web') void Linking.openSettings();
    else setPhotoMessage('Permite la cámara desde la configuración del navegador.');
  }

  return <Screen title="Herramientas del teléfono" subtitle="Funciones nativas de TuristeaYa">
    <AppText variant="body">Estas funciones usan el hardware del dispositivo y muestran estados claros cuando un permiso no está disponible.</AppText>

    <View style={styles.section}>
      <AppText variant="section">Ubicación y brújula</AppText>
      <AppText variant="bodySmall">{locationText}</AppText>
      <AppText variant="bodySmall">Rumbo: {heading == null ? '—' : `${Math.round(heading)}°`}</AppText>
      <Button title="Consultar ubicación actual" onPress={() => { void readLocation(); }} />
      <Button title="Abrir selector de ubicación" variant="secondary" onPress={() => router.navigate('/turista/ubicacion')} />
    </View>

    <View style={styles.section}>
      <AppText variant="section">Cámara, galería y QR</AppText>
      {scannerOpen ? <View style={styles.cameraBox}>
        <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={scan} />
        <Button title="Cerrar escáner" variant="secondary" onPress={() => setScannerOpen(false)} />
      </View> : null}
      <Button title="Tomar foto" onPress={() => { void takePhoto(); }} />
      {cameraBlocked ? <Button title="Abrir ajustes de cámara" variant="secondary" onPress={openSettings} /> : null}
      <Button title="Elegir foto de la galería" variant="secondary" onPress={() => { void pickPhoto(); }} />
      <Button title="Escanear código QR" variant="secondary" onPress={() => { void openScanner(); }} />
      {photoUri ? <Image source={{ uri: photoUri }} style={styles.photo} accessibilityLabel="Foto seleccionada" /> : null}
      {photoMessage ? <AppText variant="bodySmall" accessibilityLiveRegion="polite">{photoMessage}</AppText> : null}
      {qrValue ? <AppText variant="bodySmall" selectable accessibilityLiveRegion="polite">QR leído: {qrValue}</AppText> : null}
    </View>

    <View style={styles.section}>
      <AppText variant="section">Sensores de movimiento</AppText>
      <AppText variant="bodySmall">Acelerómetro: x {formatNumber(accelerometer.x)} · y {formatNumber(accelerometer.y)} · z {formatNumber(accelerometer.z)}</AppText>
      <AppText variant="bodySmall">Giroscopio: x {formatNumber(gyroscope.x)} · y {formatNumber(gyroscope.y)} · z {formatNumber(gyroscope.z)}</AppText>
      {sensorMessage ? <AppText variant="bodySmall" accessibilityRole="alert">{sensorMessage}</AppText> : null}
      <Button title="Probar vibración" variant="secondary" onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} />
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  section: { gap: 10, padding: 14, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  cameraBox: { height: 260, overflow: 'hidden', borderRadius: radius.md, backgroundColor: '#111', position: 'relative' },
  photo: { width: '100%', height: 220, borderRadius: radius.md },
});
