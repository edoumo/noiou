import { parseLightningDestination } from './lightningDestination';

export const MANUAL_EXTERNAL_REFERENCE_PREFIX = 'manual-lightning:';

export interface Bolt11Amount {
  msats: bigint;
  sats: number | null;
}

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Polymod(values: readonly number[]): number {
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let checksum = 1;
  for (const value of values) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let index = 0; index < generators.length; index += 1) {
      if ((top >>> index) & 1) checksum ^= generators[index];
    }
  }
  return checksum >>> 0;
}

function hrpExpand(hrp: string): number[] {
  return [
    ...Array.from(hrp, (char) => char.charCodeAt(0) >>> 5),
    0,
    ...Array.from(hrp, (char) => char.charCodeAt(0) & 31),
  ];
}

function verifyBech32(value: string): boolean {
  if (!value || value !== value.toLowerCase()) return false;
  const separator = value.lastIndexOf('1');
  if (separator < 1 || separator + 7 > value.length) return false;
  const hrp = value.slice(0, separator);
  const data = value.slice(separator + 1);
  const values: number[] = [];
  for (const char of data) {
    const index = BECH32_CHARSET.indexOf(char);
    if (index < 0) return false;
    values.push(index);
  }
  return bech32Polymod([...hrpExpand(hrp), ...values]) === 1;
}

function unwrapLightning(input: string): string {
  const trimmed = input.trim();
  if (/^lightning:/i.test(trimmed)) {
    const raw = trimmed.replace(/^lightning:/i, '');
    try { return decodeURIComponent(raw).trim(); } catch { return raw.trim(); }
  }
  return trimmed;
}

export function parseBolt11AmountFromHrp(hrp: string): Bolt11Amount | null {
  const match = /^ln(?:bc|tb|bcrt)(\d+)?([munp])?$/.exec(hrp.toLowerCase());
  if (!match || !match[1]) return null;
  const amount = BigInt(match[1]);
  const unit = match[2] ?? '';
  let msats: bigint;

  if (unit === '') msats = amount * 100_000_000_000n;
  else if (unit === 'm') msats = amount * 100_000_000n;
  else if (unit === 'u') msats = amount * 100_000n;
  else if (unit === 'n') msats = amount * 100n;
  else {
    if (amount % 10n !== 0n) throw new Error('Invoice BOLT11 avec montant inférieur au millisatoshi non supportée');
    msats = amount / 10n;
  }

  const sats = msats % 1000n === 0n ? Number(msats / 1000n) : null;
  if (sats !== null && !Number.isSafeInteger(sats)) throw new Error('Montant BOLT11 trop grand');
  return { msats, sats };
}

export function parseExactBolt11Invoice(input: string, expectedSats: number): string {
  if (!Number.isInteger(expectedSats) || expectedSats <= 0) throw new Error('Montant attendu invalide');
  const normalized = unwrapLightning(input).toLowerCase();
  const parsed = parseLightningDestination(normalized);
  if (parsed.kind !== 'BOLT11_INVOICE') throw new Error('Scanne ou colle une invoice BOLT11 Lightning ponctuelle');
  if (!verifyBech32(normalized)) throw new Error('Invoice BOLT11 invalide : checksum Bech32 incorrect');

  const separator = normalized.lastIndexOf('1');
  const amount = parseBolt11AmountFromHrp(normalized.slice(0, separator));
  if (!amount) throw new Error('Invoice BOLT11 sans montant : génère une invoice du montant exact demandé');
  if (amount.msats !== BigInt(expectedSats) * 1000n) {
    const invoiceSats = amount.sats === null ? `${amount.msats.toString()} msats` : `${amount.sats.toLocaleString('fr-FR')} sats`;
    throw new Error(`Montant BOLT11 incorrect : invoice ${invoiceSats}, attendu ${expectedSats.toLocaleString('fr-FR')} sats`);
  }
  return normalized;
}

export function buildManualExternalReference(id: string = crypto.randomUUID()): string {
  return `${MANUAL_EXTERNAL_REFERENCE_PREFIX}${id}`;
}

export function isManualExternalReference(reference: string | undefined): boolean {
  return Boolean(reference?.startsWith(MANUAL_EXTERNAL_REFERENCE_PREFIX));
}
