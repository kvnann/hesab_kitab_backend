import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { RefreshToken } from '../modules/auth/entities/refresh-token.entity';
import { Contact } from '../modules/contacts/entities/contact.entity';
import { Settings } from '../modules/settings/entities/settings.entity';
import { Transaction } from '../modules/transactions/entities/transaction.entity';
import { User } from '../modules/users/entities/user.entity';
import { Wagon } from '../modules/wagons/entities/wagon.entity';
import { InitialSchema1755000000000 } from '../migrations/1755000000000-InitialSchema';
import { TransactionAffectsBalance1755100000000 } from '../migrations/1755100000000-TransactionAffectsBalance';
import { TransactionSource1758000000000 } from '../migrations/1758000000000-TransactionSource';

loadEnv();

export const entities = [User, RefreshToken, Contact, Wagon, Transaction, Settings];
export const migrations = [
  InitialSchema1755000000000,
  TransactionAffectsBalance1755100000000,
  TransactionSource1758000000000,
];

export function buildDataSourceOptions(): PostgresConnectionOptions {
  return {
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USER ?? 'hesab',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'hesab_kitab',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    entities,
    migrations,
    // Never auto-sync a production schema — migrations are the only source of truth.
    synchronize: false,
    logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  };
}

/** CLI data source for `pnpm typeorm ...` commands. */
export default new DataSource(buildDataSourceOptions());
