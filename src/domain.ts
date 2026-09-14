export type Currency = 'EUR' | 'USD' | 'SATS';
export type PaymentMethod = 'CASH' | 'LIGHTNING';
export type GameStatus = 'DRAFT' | 'OPEN' | 'SETTLING' | 'CLOSED' | 'CANCELLED';
export type DealerMode = 'NONE' | 'FIXED' | 'PERCENT' | 'END_OF_GAME';
export type ContributionKind = 'BUYIN' | 'REBUY';
export type ContributionStatus = 'CREATED' | 'PENDING' | 'PAID' | 'CANCELLED';
export type PayoutStatus = 'PENDING' | 'CONFIRMED';
export type LightningReceiveMode = 'MOCK' | 'NWC_RECEIVE_ONLY' | 'EXTERNAL_WALLET_MANUAL';

export type LedgerEventType =
  | 'GAME_CREATED'
  | 'PLAYER_JOINED'
  | 'BUYIN_CREATED'
  | 'REBUY_CREATED'
  | 'LIGHTNING_INVOICE_CREATED'
  | 'LIGHTNING_MANUAL_REQUEST_CREATED'
  | 'LIGHTNING_MANUAL_RECEIPT_CONFIRMED'
  | 'CASH_CONFIRMED'
  | 'CONTRIBUTION_PAID'
  | 'SETTLEMENT_STARTED'
  | 'FINAL_STACKS_RECORDED'
  | 'SETTLEMENT_CALCULATED'
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
  chipValue: number;
  status: GameStatus;
  dealer: DealerRule;
  lightningReceiveMode?: LightningReceiveMode;
  organizerLightningDestination?: string;
  lockedBtcFiatRate?: number;
  createdAt: string;
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
