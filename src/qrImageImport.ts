import { BrowserQRCodeReader } from '@zxing/browser';
import { t } from './i18n';

export async function decodeQrImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error(t('error.notAnImage'));
  const reader = new BrowserQRCodeReader();
  const url = URL.createObjectURL(file);
  try {
    const result = await reader.decodeFromImageUrl(url);
    const text = result.getText().trim();
    if (!text) throw new Error(t('error.qrEmpty'));
    return text;
  } catch (caught) {
    if (caught instanceof Error && caught.message === t('error.qrEmpty')) throw caught;
    throw new Error(t('error.qrNotFound'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
