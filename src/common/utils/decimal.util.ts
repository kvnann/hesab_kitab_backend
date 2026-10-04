import Big from 'big.js';

Big.RM = Big.roundHalfUp;

export function money(value: number | string | Big): number {
  return Number(new Big(value).round(2).toString());
}

export function total(volume: number | string, price: number | string): number {
  return Number(
    new Big(volume).times(new Big(price)).round(0, Big.roundDown).toString(),
  );
}

export function add(a: number | string, b: number | string): number {
  return money(new Big(a).plus(new Big(b)));
}

export function sub(a: number | string, b: number | string): number {
  return money(new Big(a).minus(new Big(b)));
}

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
