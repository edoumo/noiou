import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LightningInvoice } from './lightning';
import { NwcReceiveOnlyAdapter, type NwcReceiveConnectionInfo } from './nwcReceive';

export const MAX_LIVE_GAME_INVOICE_SATS = 250_000;

interface NwcSessionValue {
  connected: boolean;
  connection: NwcReceiveConnectionInfo | null;
  connect(uri: string): Promise<NwcReceiveConnectionInfo>;
  disconnect(): void;
  createInvoice(sats: number, memo?: string): Promise<LightningInvoice>;
  getInvoiceStatus(invoice: LightningInvoice): Promise<LightningInvoice['status']>;
}

const NwcSessionContext = createContext<NwcSessionValue | null>(null);

export function assertLiveGameInvoiceAmount(sats: number): void {
  if (!Number.isInteger(sats) || sats <= 0) throw new Error('Le montant Lightning doit être un nombre entier positif de sats');
  if (sats > MAX_LIVE_GAME_INVOICE_SATS) {
    throw new Error(`Par sécurité, une cave Lightning réelle est limitée à ${MAX_LIVE_GAME_INVOICE_SATS.toLocaleString('fr-FR')} sats dans cette version privée`);
  }
}

export function NwcSessionProvider({ children }: { children: ReactNode }) {
  const adapterRef = useRef<NwcReceiveOnlyAdapter | null>(null);
  const [connection, setConnection] = useState<NwcReceiveConnectionInfo | null>(null);

  useEffect(() => () => {
    adapterRef.current?.close();
    adapterRef.current = null;
  }, []);

  const value = useMemo<NwcSessionValue>(() => ({
    connected: Boolean(connection),
    connection,
    async connect(uri: string) {
      const secretUri = uri.trim();
      if (!secretUri) throw new Error('URI NWC manquante');

      const next = await NwcReceiveOnlyAdapter.connect(secretUri);
      const previous = adapterRef.current;
      adapterRef.current = next;
      setConnection(next.connection);
      previous?.close();
      return next.connection;
    },
    disconnect() {
      adapterRef.current?.close();
      adapterRef.current = null;
      setConnection(null);
    },
    async createInvoice(sats: number, memo?: string) {
      const adapter = adapterRef.current;
      if (!adapter) throw new Error('Reconnecte un wallet NWC receive-only avant de créer une invoice réelle');
      assertLiveGameInvoiceAmount(sats);
      return adapter.createInvoice(sats, memo);
    },
    async getInvoiceStatus(invoice: LightningInvoice) {
      const adapter = adapterRef.current;
      if (!adapter) throw new Error('Reconnecte le wallet NWC receive-only pour vérifier cette invoice');
      if (invoice.source !== 'NWC') throw new Error('Cette invoice ne provient pas de NWC');
      adapter.restoreInvoice(invoice);
      return adapter.getInvoiceStatus(invoice.id);
    },
  }), [connection]);

  return <NwcSessionContext.Provider value={value}>{children}</NwcSessionContext.Provider>;
}

export function useNwcSession(): NwcSessionValue {
  const value = useContext(NwcSessionContext);
  if (!value) throw new Error('useNwcSession must be used inside NwcSessionProvider');
  return value;
}
