import Big from 'big.js';

// Money values are stored as NUMERIC(14,2) and handled as JS numbers at the
// API boundary (all representable exactly within double precision for this
// scale). All arithmetic goes through Big.js to avoid float drift.

Big.RM = Big.roundHalfUp;

/** Round a value to 2 decimal places (money). */
export function money(value: number | string | Big): number {
  return Number(new Big(value).round(2).toString());
}

/** volume × price, rounded to money precision. */
export function total(volume: number | string, price: number | string): number {
  return money(new Big(volume).times(new Big(price)));
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
