import { BrowserQRCodeReader } from '@zxing/browser';

export async function decodeQrImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choisis une image contenant un QR code.');
  const reader = new BrowserQRCodeReader();
  const url = URL.createObjectURL(file);
  try {
    const result = await reader.decodeFromImageUrl(url);
    const text = result.getText().trim();
    if (!text) throw new Error('QR vide.');
    return text;
  } catch (caught) {
    if (caught instanceof Error && caught.message === 'QR vide.') throw caught;
    throw new Error('Aucun QR code lisible trouvé dans cette image.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
