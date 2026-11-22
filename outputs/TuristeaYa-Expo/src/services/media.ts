import type { ImagePickerAsset } from 'expo-image-picker';

import { endpoints } from './endpoints';
import { authenticatedRequest } from './session';

export type UploadedMedia = {
  id: string;
  storage_path: string;
  url?: string | null;
};

function formFor(asset: ImagePickerAsset) {
  const form = new FormData();
  if (asset.file) {
    // Expo ImagePicker exposes a real browser File on web. Sending the native
    // { uri, name, type } shape here makes the multipart body invalid in a
    // browser even though the preview works.
    form.append('file', asset.file);
  } else {
    form.append('file', {
      uri: asset.uri,
      name: asset.fileName || `turisteaya-${Date.now()}.jpg`,
      type: asset.mimeType || 'image/jpeg',
    } as unknown as Blob);
  }
  return form;
}

export function uploadReviewMedia(reviewId: string, asset: ImagePickerAsset) {
  return authenticatedRequest<UploadedMedia>(endpoints.reviewMedia(reviewId), {
    method: 'POST',
    body: formFor(asset),
  });
}

export function uploadPlaceMedia(placeId: string, asset: ImagePickerAsset) {
  return authenticatedRequest<UploadedMedia>(endpoints.placeMedia(placeId), {
    method: 'POST',
    body: formFor(asset),
  });
}
