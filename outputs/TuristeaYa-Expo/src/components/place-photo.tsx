import { useState } from 'react';
import { Linking } from 'react-native';
import { Image } from 'expo-image';
import { AppText } from './ui/app-text';
import { Button } from './ui/button';
import { publicPhotos } from '@/services/place-photos';

export function PlacePhoto({ name }: { name: string }) {
  const photo = publicPhotos[name];
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState('');
  if (!photo) return null;
  return <>
    {!failed ? <Image source={{ uri: photo.url }} style={{ width: '100%', height: 180, borderRadius: 10 }} contentFit="cover" accessibilityLabel={name} onError={() => setFailed(true)} /> : <AppText>La foto no está disponible en este momento.</AppText>}
    <AppText variant="caption">Foto: {photo.artist} · {photo.license}</AppText>
    <Button title="Ver fuente de la foto" variant="secondary" onPress={async () => {
      try { await Linking.openURL(photo.source); } catch { setNotice('No se pudo abrir la fuente.'); }
    }} />
    {notice ? <AppText>{notice}</AppText> : null}
  </>;
}
