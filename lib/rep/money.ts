export const KOBO_PER_NAIRA = 100;
export const SINGLE_TRANSACTION_LIMIT_KOBO = 250_000_000;
export const DAILY_TRANSACTION_LIMIT_KOBO = 1_000_000_000;

export function assertKobo(value: number, allowZero = false): void {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new RangeError("Amount must be a safe integer in kobo.");
  }
}

/** Round half-up to a kobo. Avoid multiplication overflow for large values. */
export function studentFeeKobo(faceAmountKobo: number): number {
  assertKobo(faceAmountKobo);
  return Math.min(Math.round(faceAmountKobo / 50), 25_000);
}

export function withdrawalFeeKobo(amountKobo: number): number {
  assertKobo(amountKobo);
  return amountKobo <= 5_000_000 ? 10_000 : 20_000;
}

export function withdrawalQuote(amountKobo: number) {
  const feeKobo = withdrawalFeeKobo(amountKobo);
  const totalDebitKobo = amountKobo + feeKobo;
  assertKobo(totalDebitKobo);
  return { amountKobo, feeKobo, totalDebitKobo };
}

/** Input balances must come from the authoritative ledger, net of reservations. */
export function checkWithdrawalFunds(
  amountKobo: number,
  availableKobo: number,
  dailyCommittedKobo: number,
): "single_limit" | "daily_limit" | "insufficient_balance" | null {
  assertKobo(availableKobo, true);
  assertKobo(dailyCommittedKobo, true);
  const quote = withdrawalQuote(amountKobo);
  if (amountKobo > SINGLE_TRANSACTION_LIMIT_KOBO) return "single_limit";
  if (amountKobo > DAILY_TRANSACTION_LIMIT_KOBO - dailyCommittedKobo) return "daily_limit";
  if (quote.totalDebitKobo > availableKobo) return "insufficient_balance";
  return null;
}
