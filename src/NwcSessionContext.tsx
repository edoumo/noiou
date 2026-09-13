import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LightningInvoice } from './lightning';
import { NwcReceiveOnlyAdapter, type NwcReceiveConnectionInfo } from './nwcReceive';
import { storageRequiresNwcReceipts } from './session';

export const MAX_LIVE_GAME_INVOICE_SATS = 250_000;

interface NwcSessionValue {
  /** True when the game flow must use NWC: explicitly armed, or an active game is already locked to NWC. */
  connected: boolean;
  /** True whenever the receive-only NWC transport is currently connected. */
  transportConnected: boolean;
  connection: NwcReceiveConnectionInfo | null;
  liveGameReceiptsArmed: boolean;
  activeGameLockedToNwc: boolean;
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

function readActiveGameNwcLock(): boolean {
  if (typeof window === 'undefined') return false;
  return storageRequiresNwcReceipts(window.localStorage);
}

export function NwcSessionProvider({ children }: { children: ReactNode }) {
  const adapterRef = useRef<NwcReceiveOnlyAdapter | null>(null);
  const [connection, setConnection] = useState<NwcReceiveConnectionInfo | null>(null);
  const [liveGameReceiptsArmed, setLiveGameReceiptsArmed] = useState(false);
  const [activeGameLockedToNwc, setActiveGameLockedToNwc] = useState<boolean>(() => readActiveGameNwcLock());

  useEffect(() => () => {
    adapterRef.current?.close();
    adapterRef.current = null;
  }, []);

  const value = useMemo<NwcSessionValue>(() => {
    async function createGameInvoice(sats: number, memo?: string) {
      const adapter = adapterRef.current;
      if (!adapter) {
        if (activeGameLockedToNwc) throw new Error('Cette partie est verrouillée en NWC réel : reconnecte le wallet receive-only avant de créer une nouvelle cave/rebuy');
        throw new Error('Reconnecte un wallet NWC receive-only avant de créer une cave réelle');
      }
      if (!liveGameReceiptsArmed && !activeGameLockedToNwc) throw new Error('Les caves Lightning réelles ne sont pas armées');
      assertLiveGameInvoiceAmount(sats);
      const invoice = await adapter.createInvoice(sats, memo);
      // Once a real game invoice exists, the active game must never silently fall back to mock.
      setActiveGameLockedToNwc(true);
      return invoice;
    }

    return {
      connected: liveGameReceiptsArmed || activeGameLockedToNwc,
      transportConnected: Boolean(connection),
      connection,
      liveGameReceiptsArmed,
      activeGameLockedToNwc,
      async connect(uri: string) {
        const secretUri = uri.trim();
        if (!secretUri) throw new Error('URI NWC manquante');

        const next = await NwcReceiveOnlyAdapter.connect(secretUri);
        const previous = adapterRef.current;
        adapterRef.current = next;
        setConnection(next.connection);

        // Reconnecting into an already-live active game restores the required real-receipt path.
        // Otherwise every fresh connection starts diagnostic-only and must be armed explicitly.
        const locked = activeGameLockedToNwc || readActiveGameNwcLock();
        setActiveGameLockedToNwc(locked);
        setLiveGameReceiptsArmed(locked);
        previous?.close();
        return next.connection;
      },
      disconnect() {
        adapterRef.current?.close();
        adapterRef.current = null;
        setConnection(null);
        setLiveGameReceiptsArmed(false);
        // Deliberately keep activeGameLockedToNwc: while the live game exists, App must not
        // silently create mock invoices just because the credential is temporarily absent.
      },
      armLiveGameReceipts() {
        if (!adapterRef.current || !connection) throw new Error('Connecte un wallet NWC receive-only avant d’armer les caves réelles');
        setLiveGameReceiptsArmed(true);
      },
      disarmLiveGameReceipts() {
        // The persisted active session is authoritative. This also lets an in-memory lock be
        // released after the game has been closed/reset without requiring a page reload.
        if (readActiveGameNwcLock()) {
          throw new Error('Cette partie a déjà utilisé/validé le mode NWC réel : impossible de revenir au mock avant sa clôture/réinitialisation');
        }
        setLiveGameReceiptsArmed(false);
        setActiveGameLockedToNwc(false);
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
        const status = await adapter.getInvoiceStatus(invoice.id);
        if (status === 'PAID') setActiveGameLockedToNwc(true);
        return status;
      },
    };
  }, [connection, liveGameReceiptsArmed, activeGameLockedToNwc]);

  return <NwcSessionContext.Provider value={value}>{children}</NwcSessionContext.Provider>;
}

export function useNwcSession(): NwcSessionValue {
  const value = useContext(NwcSessionContext);
  if (!value) throw new Error('useNwcSession must be used inside NwcSessionProvider');
  return value;
}
