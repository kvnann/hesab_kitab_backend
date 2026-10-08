export enum Currency {
  DOLLAR = 'dollar',
  MANAT = 'manat',
}

export enum SecondaryCurrency {
  DOLLAR = 'dollar',
  MANAT = 'manat',
  EURO = 'euro',
}

export enum WagonSide {
  BUY = 'buy',
  SELL = 'sell',
  CUSTOMS = 'customs',
}

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

export enum TransactionSource {
  MANUAL = 'manual',
  WAGON = 'wagon',
}

export enum OwingDirection {
  OWES_US = 'owes_us',
  WE_OWE = 'we_owe',
}
