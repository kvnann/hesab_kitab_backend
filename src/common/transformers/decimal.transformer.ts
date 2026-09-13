import { ValueTransformer } from 'typeorm';

/**
 * Postgres NUMERIC columns arrive as strings; expose them as JS numbers.
 * Safe for NUMERIC(14,2)/NUMERIC(12,3): all values fit exactly in a double.
 */
export class DecimalTransformer implements ValueTransformer {
  to(value: number | null | undefined): number | null | undefined {
    // Preserve undefined so unset columns fall back to their DB DEFAULT.
    return value;
  }

  from(value: string | null): number | null {
    return value === null || value === undefined ? null : parseFloat(value);
  }
}

export const decimalTransformer = new DecimalTransformer();
