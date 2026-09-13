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

/** Direction of an initial contact balance, as chosen in the UI. */
export enum OwingDirection {
  OWES_US = 'owes_us',
  WE_OWE = 'we_owe',
}
