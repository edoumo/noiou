import type { Contribution, Game } from './domain';
import type { LightningInvoice } from './lightning';
import type { SessionSnapshot } from './session';

export interface MockRetirementPlan {
  /**
   * True when the stored session was created in the retired "Mock / test" mode and an
   * active game was switched to the explicit external/manual flow.
   */
  migrated: boolean;
  game: Game | null;
  contributions: Contribution[];
  /** Contributions whose fictional request was still open (CREATED/PENDING). */
  cancelledOpenContributionIds: string[];
  /** Contributions that had been "confirmed" against a fictional invoice. */
  cancelledPaidContributionIds: string[];
  /** A SETTLING/legacy state where historical fictional receipts remain for the record. */
  historicalMockReceiptsRemain: boolean;
}

function isOrganizerAllocation(contribution: Contribution): boolean {
  return Boolean(contribution.externalReference?.startsWith('organizer-allocation:'));
}

function isFictionalLightningInvoice(invoices: Record<string, LightningInvoice>, contribution: Contribution): boolean {
  const invoice = invoices[contribution.id];
  if (!invoice) return false;
  // Legacy sessions stored mock invoices without an explicit source; the old default was mock.
  return !invoice.source || invoice.source === 'MOCK';
}

/**
 * UX27 — the "Mock / test" receive mode is retired from the production experience.
 *
 * A local session left behind by the previous build could still be sitting in the old
 * default (mock) receive mode. In production this must never:
 * - keep creating fictional Lightning requests (switch the active game to the explicit
 *   external/manual flow);
 * - present fictional receipts as real money (open fictional requests are cancelled, and
 *   on a still-OPEN game even previously "confirmed" fictional receipts are cancelled so
 *   the caves must be re-collected through a real flow before play/settlement continues);
 * - touch real records: organizer-wallet allocations, real NWC sessions (locked), cash
 *   contributions and the whole audit ledger stay exactly as they were.
 *
 * A game already in SETTLING keeps its historical records (no financial receipt can be
 * created anymore) but is still switched off the mock mode with an explicit warning.
 * CLOSED games are never touched — no further financial action is possible on them.
 * Development/test builds keep the mock and skip this migration entirely.
 */
export function planMockRetirement(
  snapshot: SessionSnapshot | null,
  options: { allowMockPayments: boolean; nwcLocked: boolean },
): MockRetirementPlan {
  const base: MockRetirementPlan = {
    migrated: false,
    game: snapshot?.game ?? null,
    contributions: snapshot?.contributions ?? [],
    cancelledOpenContributionIds: [],
    cancelledPaidContributionIds: [],
    historicalMockReceiptsRemain: false,
  };
  const game = snapshot?.game ?? null;
  if (!game) return base;
  if (options.allowMockPayments) return base;
  if (options.nwcLocked) return base;

  const isMockLegacy = game.lightningReceiveMode === 'MOCK' || game.lightningReceiveMode === undefined;
  if (!isMockLegacy) return base;

  const invoices = snapshot?.mockInvoices ?? {};

  if (game.status === 'CLOSED') return base;

  if (game.status === 'SETTLING') {
    const historical = (snapshot?.contributions ?? []).some((contribution) =>
      contribution.method === 'LIGHTNING' && !isOrganizerAllocation(contribution) && isFictionalLightningInvoice(invoices, contribution));
    return {
      ...base,
      migrated: true,
      game: { ...game, lightningReceiveMode: 'EXTERNAL_WALLET_MANUAL' },
      historicalMockReceiptsRemain: historical,
    };
  }

  if (game.status !== 'OPEN') return base;

  const cancelledOpenContributionIds: string[] = [];
  const cancelledPaidContributionIds: string[] = [];
  const contributions = (snapshot?.contributions ?? []).map((contribution) => {
    if (contribution.method !== 'LIGHTNING') return contribution;
    if (isOrganizerAllocation(contribution)) return contribution;
    if (!isFictionalLightningInvoice(invoices, contribution)) return contribution;

    if (contribution.status === 'CREATED' || contribution.status === 'PENDING') {
      cancelledOpenContributionIds.push(contribution.id);
      return { ...contribution, status: 'CANCELLED' as const };
    }
    if (contribution.status === 'PAID') {
      cancelledPaidContributionIds.push(contribution.id);
      return { ...contribution, status: 'CANCELLED' as const };
    }
    return contribution;
  });

  return {
    migrated: true,
    game: { ...game, lightningReceiveMode: 'EXTERNAL_WALLET_MANUAL' },
    contributions,
    cancelledOpenContributionIds,
    cancelledPaidContributionIds,
    historicalMockReceiptsRemain: false,
  };
}
