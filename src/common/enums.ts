export enum Currency {
  DOLLAR = 'dollar',
  MANAT = 'manat',
}

export enum SecondaryCurrency {
  DOLLAR = 'dollar',
  MANAT = 'manat',
  EURO = 'euro',
}

export enum WagonStatus {
  OPEN = 'open',
  CLOSED = 'closed',
}

export enum TransactionType {
  INCOME = 'income',
  EXPENSE = 'expense',
  OTHER = 'other',
}

/**
 * Where a transaction came from. 'wagon' rows are created and owned by a
 * wagon's buy/sell side: they document a balance change on the contact's page
 * but move no cash, so they stay out of the till and the day/month totals.
 */
export enum TransactionSource {
  MANUAL = 'manual',
  WAGON = 'wagon',
}

/** Direction of an initial contact balance, as chosen in the UI. */
export enum OwingDirection {
  OWES_US = 'owes_us',
  WE_OWE = 'we_owe',
}
