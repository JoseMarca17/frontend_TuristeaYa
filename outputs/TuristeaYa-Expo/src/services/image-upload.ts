import type { ImagePickerAsset } from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';
import { MAX_IMAGE_BYTES, validateImageUpload } from './domain-rules';

export type PreparedImageAsset = ImagePickerAsset & {
  compressedLabel?: string;
};

/**
 * Valida formato y límite (Máx. 5 MB por foto), y comprime/redimensiona a máx. 1280px antes de subir.
 */
export async function validateAndCompressImage(
  asset: ImagePickerAsset,
  currentCount: number,
  maxCount = 5,
): Promise<PreparedImageAsset> {
  const initialSize = asset.fileSize ?? asset.file?.size ?? null;
  const check = validateImageUpload(
    { mimeType: asset.mimeType, fileSize: initialSize, fileName: asset.fileName },
    currentCount,
    maxCount,
  );
  if (!check.valid) {
    throw new Error(check.reason || 'Imagen no válida.');
  }

  try {
    const actions = asset.width && asset.width > 1280 ? [{ resize: { width: 1280 } }] : [];
    const manipulated = await manipulateAsync(asset.uri, actions, {
      compress: 0.72,
      format: SaveFormat.JPEG,
    });

    if (Platform.OS === 'web') {
      const response = await fetch(manipulated.uri);
      const blob = await response.blob();
      if (blob.size > MAX_IMAGE_BYTES) {
        throw new Error('Incluso tras comprimir, la foto supera el máximo de 5 MB.');
      }
      const cleanName = (asset.fileName || `turisteaya-${Date.now()}`).replace(/\.[^.]+$/, '') + '.jpg';
      const compressedFile = new File([blob], cleanName, { type: 'image/jpeg' });
      const mbLabel = `${(blob.size / (1024 * 1024)).toFixed(2)} MB`;
      return {
        ...asset,
        uri: manipulated.uri,
        width: manipulated.width,
        height: manipulated.height,
        mimeType: 'image/jpeg',
        fileName: cleanName,
        fileSize: blob.size,
        file: compressedFile,
        compressedLabel: `Comprimida (${mbLabel})`,
      };
    }

    return {
      ...asset,
      uri: manipulated.uri,
      width: manipulated.width,
      height: manipulated.height,
      mimeType: 'image/jpeg',
      fileName: (asset.fileName || `turisteaya-${Date.now()}`).replace(/\.[^.]+$/, '') + '.jpg',
      compressedLabel: 'Comprimida a JPEG optimizado',
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('5 MB')) throw error;
    // Si una plataforma no soporta manipulator en cierto URI, validamos el tamaño original y seguimos.
    if (typeof initialSize === 'number' && initialSize > MAX_IMAGE_BYTES) {
      throw new Error('La imagen supera el máximo de 5 MB permitido.');
    }
    return asset;
  }
}
