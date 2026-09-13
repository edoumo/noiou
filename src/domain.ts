export type Currency = 'EUR' | 'USD' | 'SATS';
export type PaymentMethod = 'CASH' | 'LIGHTNING';
export type GameStatus = 'DRAFT' | 'OPEN' | 'SETTLING' | 'CLOSED' | 'CANCELLED';
export type DealerMode = 'NONE' | 'FIXED' | 'PERCENT' | 'END_OF_GAME';
export type ContributionKind = 'BUYIN' | 'REBUY';
export type ContributionStatus = 'CREATED' | 'PENDING' | 'PAID' | 'CANCELLED';
export type PayoutStatus = 'PENDING' | 'CONFIRMED';

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
