import type { LockedRate } from './priceOracle';

export type Currency = 'EUR' | 'USD' | 'SATS';
export type PaymentMethod = 'CASH' | 'LIGHTNING';
export type GameStatus = 'DRAFT' | 'OPEN' | 'SETTLING' | 'CLOSED' | 'CANCELLED';
export type DealerMode = 'NONE' | 'FIXED' | 'PERCENT' | 'END_OF_GAME';
export type ContributionKind = 'BUYIN' | 'REBUY';
export type ContributionStatus = 'CREATED' | 'PENDING' | 'PAID' | 'CANCELLED';
export type PayoutStatus = 'PENDING' | 'CONFIRMED';
export type LightningReceiveMode = 'MOCK' | 'NWC_RECEIVE_ONLY' | 'EXTERNAL_WALLET_MANUAL';
export type PayoutExecution = 'CASH_CONFIRMATION' | 'MANUAL_EXTERNAL_WALLET' | 'ORGANIZER_WALLET_RETENTION';

export type LedgerEventType =
  | 'GAME_CREATED'
  | 'GAME_STARTED'
  | 'PLAYER_JOINED'
  | 'BUYIN_CREATED'
  | 'REBUY_CREATED'
  | 'ORGANIZER_WALLET_ALLOCATION'
  | 'LIGHTNING_INVOICE_CREATED'
  | 'LIGHTNING_MANUAL_REQUEST_CREATED'
  | 'LIGHTNING_MANUAL_RECEIPT_CONFIRMED'
  | 'RECEIVE_MODE_MIGRATED'
  | 'PRICE_RATE_LOCKED'
  | 'CASH_CONFIRMED'
  | 'CONTRIBUTION_PAID'
  | 'SETTLEMENT_STARTED'
  | 'FINAL_STACKS_RECORDED'
  | 'SETTLEMENT_CALCULATED'
  | 'ORGANIZER_PAYOUT_RETAINED'
  | 'PAYOUT_CONFIRMED'
  | 'DEALER_COMPENSATION_CONFIRMED'
  | 'DEALER_TIP_RECORDED'
  | 'PROJECT_DONATION_RECORDED'
  | 'GAME_CLOSED';

export interface Money {
  amount: number;
  currency: Currency;
}

export interface Player {
  id: string;
  nickname: string;
  preferredPayment: PaymentMethod | 'ANY';
  lightningAddress?: string;
  /** True only for the player who is also operating the organizer wallet/device. */
  isOrganizer?: boolean;
}

export interface DealerRule {
  enabled: boolean;
  mode: DealerMode;
  value?: number;
  label?: string;
  preferredPayment?: PaymentMethod | 'ANY';
  lightningAddress?: string;
}

export interface Game {
  id: string;
  name?: string;
  currency: Currency;
  buyInAmount: number;
  rebuyEnabled: boolean;
  rebuyAmount?: number;
  /**
   * Physical/table chip units issued for one standard buy-in.
   * New sessions use this value so money and chips remain separate quantities.
   */
  chipsPerBuyIn?: number;
  /**
   * Legacy money-per-chip field kept so schema-v1 sessions/backups created before UX19 remain readable.
   * New settlement logic prefers chipsPerBuyIn whenever it is present.
   */
  chipValue: number;
  status: GameStatus;
  dealer: DealerRule;
  lightningReceiveMode?: LightningReceiveMode;
  organizerLightningDestination?: string;
  /**
   * Legacy flat BTC/fiat rate, kept so schema-v1 sessions and backups created
   * before the price-oracle work remain readable byte-for-byte. New games ALSO
   * write `lockedRate`; the flat number is mirrored from it for compatibility.
   */
  lockedBtcFiatRate?: number;
  /**
   * Immutable BTC/fiat rate metadata locked at game creation (provider, pair,
   * bid/ask, midpoint rate, retrieval/lock timestamps, manual flag + note).
   * Written once by `applyLockedRateToGame`; never mutated afterwards, so a
   * settings change can never alter an active game.
   */
  lockedRate?: LockedRate;
  createdAt: string;
  /**
   * UX23 lobby marker. New games use lobbyVersion=1 and remain in preparation until startedAt is set.
   * Missing lobbyVersion means a legacy OPEN session, which is treated as already started for compatibility.
   */
  lobbyVersion?: 1;
  startedAt?: string;
}

export interface Contribution {
  id: string;
  gameId: string;
  playerId: string;
  kind: ContributionKind;
  method: PaymentMethod;
  amount: number;
  status: ContributionStatus;
  externalReference?: string;
  createdAt: string;
  paidAt?: string;
}

export interface FinalStack {
  playerId: string;
  chips: number;
}

export interface Payout {
  playerId: string;
  amount: number;
  method: PaymentMethod | 'ANY';
  status: PayoutStatus;
  /** One-time BOLT11 or reusable destination selected for this payout. */
  lightningRequest?: string;
  /** How the payout was actually executed; organizer retention is explicitly non-transfer. */
  execution?: PayoutExecution;
}

export interface DealerTip {
  id: string;
  gameId: string;
  playerId: string;
  amount: number;
  currency: Currency;
  method: PaymentMethod;
  sats?: number;
  createdAt: string;
}

export interface ProjectDonation {
  id: string;
  donorLabel?: string;
  sats: number;
  createdAt: string;
}

export interface SettlementResult {
  balanced: boolean;
  issuedChips: number;
  countedChips: number;
  chipDifference: number;
  distributableAmount: number;
  dealerCompensation: number;
  payouts: Payout[];
}

export interface LedgerEvent {
  id: string;
  gameId: string;
  sequence: number;
  type: LedgerEventType;
  at: string;
  payload: Record<string, unknown>;
  previousHash: string;
  hash: string;
}

export interface LedgerEventDraft {
  id?: string;
  gameId: string;
  type: LedgerEventType;
  at?: string;
  payload?: Record<string, unknown>;
}
