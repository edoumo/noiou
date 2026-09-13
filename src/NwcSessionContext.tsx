import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LightningInvoice } from './lightning';
import { NwcReceiveOnlyAdapter, type NwcReceiveConnectionInfo } from './nwcReceive';

export const MAX_LIVE_GAME_INVOICE_SATS = 250_000;

interface NwcSessionValue {
  /** True only when the wallet transport is connected AND real game receipts are explicitly armed. */
  connected: boolean;
  /** True whenever the receive-only NWC transport is connected, including diagnostic-only mode. */
  transportConnected: boolean;
  connection: NwcReceiveConnectionInfo | null;
  liveGameReceiptsArmed: boolean;
  connect(uri: string): Promise<NwcReceiveConnectionInfo>;
  disconnect(): void;
  armLiveGameReceipts(): void;
  disarmLiveGameReceipts(): void;
  createDiagnosticInvoice(sats: number, memo?: string): Promise<LightningInvoice>;
  createGameInvoice(sats: number, memo?: string): Promise<LightningInvoice>;
  /** Compatibility alias used by the current game UI; guarded exactly like createGameInvoice. */
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
  const [liveGameReceiptsArmed, setLiveGameReceiptsArmed] = useState(false);

  useEffect(() => () => {
    adapterRef.current?.close();
    adapterRef.current = null;
  }, []);

  const value = useMemo<NwcSessionValue>(() => {
    async function createGameInvoice(sats: number, memo?: string) {
      const adapter = adapterRef.current;
      if (!adapter) throw new Error('Reconnecte un wallet NWC receive-only avant de créer une cave réelle');
      if (!liveGameReceiptsArmed) throw new Error('Les caves Lightning réelles ne sont pas armées');
      assertLiveGameInvoiceAmount(sats);
      return adapter.createInvoice(sats, memo);
    }

    return {
      connected: Boolean(connection) && liveGameReceiptsArmed,
      transportConnected: Boolean(connection),
      connection,
      liveGameReceiptsArmed,
      async connect(uri: string) {
        const secretUri = uri.trim();
        if (!secretUri) throw new Error('URI NWC manquante');

        const next = await NwcReceiveOnlyAdapter.connect(secretUri);
        const previous = adapterRef.current;
        adapterRef.current = next;
        setConnection(next.connection);
        // Every connection/reconnection starts diagnostic-only. Real game receipts require a fresh explicit arm.
        setLiveGameReceiptsArmed(false);
        previous?.close();
        return next.connection;
      },
      disconnect() {
        adapterRef.current?.close();
        adapterRef.current = null;
        setConnection(null);
        setLiveGameReceiptsArmed(false);
      },
      armLiveGameReceipts() {
        if (!adapterRef.current || !connection) throw new Error('Connecte un wallet NWC receive-only avant d’armer les caves réelles');
        setLiveGameReceiptsArmed(true);
      },
      disarmLiveGameReceipts() {
        setLiveGameReceiptsArmed(false);
      },
      async createDiagnosticInvoice(sats: number, memo?: string) {
        const adapter = adapterRef.current;
        if (!adapter) throw new Error('Reconnecte un wallet NWC receive-only avant de créer une invoice réelle');
        return adapter.createInvoice(sats, memo);
      },
      createGameInvoice,
      createInvoice: createGameInvoice,
      async getInvoiceStatus(invoice: LightningInvoice) {
        const adapter = adapterRef.current;
        if (!adapter) throw new Error('Reconnecte le wallet NWC receive-only pour vérifier cette invoice');
        if (invoice.source !== 'NWC') throw new Error('Cette invoice ne provient pas de NWC');
        adapter.restoreInvoice(invoice);
        return adapter.getInvoiceStatus(invoice.id);
      },
    };
  }, [connection, liveGameReceiptsArmed]);

  return <NwcSessionContext.Provider value={value}>{children}</NwcSessionContext.Provider>;
}

export function useNwcSession(): NwcSessionValue {
  const value = useContext(NwcSessionContext);
  if (!value) throw new Error('useNwcSession must be used inside NwcSessionProvider');
  return value;
}
