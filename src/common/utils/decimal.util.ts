import Big from 'big.js';

// Money values are stored as NUMERIC(14,2) and handled as JS numbers at the
// API boundary (all representable exactly within double precision for this
// scale). All arithmetic goes through Big.js to avoid float drift.

Big.RM = Big.roundHalfUp;

/** Round a value to 2 decimal places (money). */
export function money(value: number | string | Big): number {
  return Number(new Big(value).round(2).toString());
}

/**
 * volume × price for a wagon side, floored to a whole unit.
 *
 * Volumes and prices keep their decimals, but the totals people settle on —
 * and the debts and margin derived from them — are whole numbers, so a deal is
 * never carrying a fraction of a cent. Volumes and prices are always positive
 * here, so truncating toward zero is a floor.
 */
export function total(volume: number | string, price: number | string): number {
  return Number(
    new Big(volume).times(new Big(price)).round(0, Big.roundDown).toString(),
  );
}

/** a + b at money precision. */
export function add(a: number | string, b: number | string): number {
  return money(new Big(a).plus(new Big(b)));
}

/** a − b at money precision. */
export function sub(a: number | string, b: number | string): number {
  return money(new Big(a).minus(new Big(b)));
}

/** Convert an amount between currencies given a rate (secondary units per 1 primary unit). */
export function convert(
  amount: number | string,
  rate: number | string,
  direction: 'toPrimary' | 'toSecondary',
): number {
  const big = new Big(amount);
  return direction === 'toSecondary'
    ? money(big.times(new Big(rate)))
    : money(big.div(new Big(rate)));
}
