export enum Currency {
  DOLLAR = 'dollar',
  MANAT = 'manat',
}

export enum SecondaryCurrency {
  DOLLAR = 'dollar',
  MANAT = 'manat',
  EURO = 'euro',
}

/** Which part of a wagon a generated ledger row came from. */
export enum WagonSide {
  BUY = 'buy',
  SELL = 'sell',
  CUSTOMS = 'customs',
}

/** Who carries a wagon's customs cost: the buyer (Alıcı) or seller (Satıcı). */
export enum CustomsPayer {
  BUYER = 'buyer',
  SELLER = 'seller',
}

/**
 * Where the wagon is on its route. Ordered: goods start in Russia, clear
 * through Azerbaijan and arrive in Iran.
 */
export enum WagonLocation {
  RUSSIA = 'russia',
  AZERBAIJAN = 'azerbaijan',
  IRAN = 'iran',
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
