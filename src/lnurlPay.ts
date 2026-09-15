import { parseLightningDestination } from './lightningDestination';
import { parseExactBolt11Invoice } from './manualExternalLightning';

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

export interface LnurlPayParams {
  callback: string;
  minSendable: number;
  maxSendable: number;
  metadata: string;
  tag: 'payRequest';
  commentAllowed?: number;
  status?: string;
  reason?: string;
}

export interface ExactLightningInvoiceResult {
  invoice: string;
  destinationKind: 'LIGHTNING_ADDRESS' | 'LNURL';
  commentSent: string | null;
  serviceDescription: string | null;
}

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

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

function decodeBech32Words(value: string): { hrp: string; words: number[] } {
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) throw new Error('LNURL invalide : casse Bech32 mélangée');
  const normalized = value.toLowerCase();
  const separator = normalized.lastIndexOf('1');
  if (separator < 1 || separator + 7 > normalized.length) throw new Error('LNURL invalide : format Bech32 incorrect');
  const hrp = normalized.slice(0, separator);
  const encoded = normalized.slice(separator + 1);
  const values = Array.from(encoded, (char) => {
    const index = BECH32_CHARSET.indexOf(char);
    if (index < 0) throw new Error('LNURL invalide : caractère Bech32 inconnu');
    return index;
  });
  if (bech32Polymod([...hrpExpand(hrp), ...values]) !== 1) throw new Error('LNURL invalide : checksum Bech32 incorrect');
  return { hrp, words: values.slice(0, -6) };
}

function convertBits(words: readonly number[], fromBits: number, toBits: number): Uint8Array {
  let accumulator = 0;
  let bits = 0;
  const output: number[] = [];
  const maxValue = (1 << toBits) - 1;
  for (const word of words) {
    if (word < 0 || word >= (1 << fromBits)) throw new Error('LNURL invalide : données Bech32 hors plage');
    accumulator = (accumulator << fromBits) | word;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      output.push((accumulator >> bits) & maxValue);
    }
  }
  if (bits >= fromBits) throw new Error('LNURL invalide : padding Bech32 incorrect');
  if (((accumulator << (toBits - bits)) & maxValue) !== 0) throw new Error('LNURL invalide : padding Bech32 non nul');
  return new Uint8Array(output);
}

export function decodeLnurlToUrl(lnurl: string): string {
  const { hrp, words } = decodeBech32Words(lnurl.trim());
  if (hrp !== 'lnurl') throw new Error('LNURL invalide : préfixe attendu lnurl');
  const decoded = new TextDecoder().decode(convertBits(words, 5, 8));
  return assertSafeLnurlEndpoint(decoded, 'LNURL');
}

export function lightningAddressToUrl(address: string): string {
  const parsed = parseLightningDestination(address);
  if (parsed.kind !== 'LIGHTNING_ADDRESS') throw new Error('Adresse Lightning invalide');
  const [name, domain] = parsed.value.split('@');
  return assertSafeLnurlEndpoint(`https://${domain}/.well-known/lnurlp/${encodeURIComponent(name)}`, 'Lightning Address');
}

function assertSafeLnurlEndpoint(raw: string, label: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} invalide : URL de service illisible`);
  }
  if (url.protocol !== 'https:') throw new Error(`${label} non supporté : le service doit utiliser HTTPS`);
  if (url.username || url.password) throw new Error(`${label} invalide : identifiants intégrés interdits`);
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host === '127.0.0.1' || host === '::1') {
    throw new Error(`${label} refusé : destination locale interdite`);
  }
  return url.toString();
}

function textDescription(metadata: string): string | null {
  try {
    const items: unknown = JSON.parse(metadata);
    if (!Array.isArray(items)) return null;
    for (const item of items) {
      if (Array.isArray(item) && item[0] === 'text/plain' && typeof item[1] === 'string') return item[1];
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchJson<T>(fetcher: FetchLike, url: string, label: string): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(url, { method: 'GET', headers: { Accept: 'application/json' } });
  } catch {
    throw new Error(`${label} inaccessible depuis ce navigateur. Utilise le fallback invoice BOLT11 exacte.`);
  }
  if (!response.ok) throw new Error(`${label} a répondu HTTP ${response.status}. Utilise le fallback invoice BOLT11 exacte.`);
  try {
    return await response.json() as T;
  } catch {
    throw new Error(`${label} a renvoyé une réponse illisible. Utilise le fallback invoice BOLT11 exacte.`);
  }
}

function validatePayParams(value: LnurlPayParams, sats: number): void {
  if (value.status === 'ERROR') throw new Error(`Service Lightning refusé : ${value.reason || 'erreur sans détail'}`);
  if (value.tag !== 'payRequest') throw new Error('Destination Lightning refusée : le service ne propose pas LNURL-pay');
  if (!Number.isFinite(value.minSendable) || !Number.isFinite(value.maxSendable) || value.minSendable <= 0 || value.maxSendable < value.minSendable) {
    throw new Error('Destination Lightning refusée : limites LNURL-pay invalides');
  }
  const msats = sats * 1000;
  if (msats < value.minSendable || msats > value.maxSendable) {
    const min = Math.ceil(value.minSendable / 1000);
    const max = Math.floor(value.maxSendable / 1000);
    throw new Error(`Montant refusé par le wallet : ${sats.toLocaleString('fr-FR')} sats demandés, plage autorisée ${min.toLocaleString('fr-FR')}–${max.toLocaleString('fr-FR')} sats`);
  }
  assertSafeLnurlEndpoint(value.callback, 'Callback LNURL-pay');
}

export async function requestExactInvoiceFromReusableDestination(
  destination: string,
  sats: number,
  traceComment: string,
  fetcher: FetchLike = fetch,
): Promise<ExactLightningInvoiceResult> {
  if (!Number.isInteger(sats) || sats <= 0) throw new Error('Montant Lightning attendu invalide');
  const parsed = parseLightningDestination(destination);
  if (parsed.kind !== 'LIGHTNING_ADDRESS' && parsed.kind !== 'LNURL') {
    throw new Error('Cette destination réutilisable ne permet pas encore à NOIOU de générer une invoice exacte. Utilise une invoice BOLT11 du montant demandé.');
  }

  const payUrl = parsed.kind === 'LIGHTNING_ADDRESS'
    ? lightningAddressToUrl(parsed.value)
    : decodeLnurlToUrl(parsed.value);
  const params = await fetchJson<LnurlPayParams>(fetcher, payUrl, parsed.kind === 'LIGHTNING_ADDRESS' ? 'Lightning Address' : 'LNURL');
  validatePayParams(params, sats);

  const callback = new URL(assertSafeLnurlEndpoint(params.callback, 'Callback LNURL-pay'));
  callback.searchParams.set('amount', String(sats * 1000));
  const allowed = Number.isInteger(params.commentAllowed) && (params.commentAllowed ?? 0) > 0 ? params.commentAllowed! : 0;
  const comment = allowed > 0 ? Array.from(traceComment).slice(0, allowed).join('') : null;
  if (comment) callback.searchParams.set('comment', comment);

  const invoiceResponse = await fetchJson<{ pr?: string; status?: string; reason?: string }>(fetcher, callback.toString(), 'Callback LNURL-pay');
  if (invoiceResponse.status === 'ERROR') throw new Error(`Création de l’invoice refusée : ${invoiceResponse.reason || 'erreur sans détail'}`);
  if (!invoiceResponse.pr) throw new Error('Création de l’invoice refusée : aucune invoice BOLT11 reçue');

  let invoice: string;
  try {
    invoice = parseExactBolt11Invoice(invoiceResponse.pr, sats);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invoice refusée par NOIOU : ${detail}`);
  }

  return {
    invoice,
    destinationKind: parsed.kind,
    commentSent: comment,
    serviceDescription: textDescription(params.metadata),
  };
}
