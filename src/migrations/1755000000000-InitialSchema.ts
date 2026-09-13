import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1755000000000 implements MigrationInterface {
  name = 'InitialSchema1755000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "currency_enum" AS ENUM ('dollar', 'manat')`,
    );
    await queryRunner.query(
      `CREATE TYPE "secondary_currency_enum" AS ENUM ('dollar', 'manat', 'euro')`,
    );
    await queryRunner.query(
      `CREATE TYPE "wagon_status_enum" AS ENUM ('open', 'closed')`,
    );
    await queryRunner.query(
      `CREATE TYPE "transaction_type_enum" AS ENUM ('income', 'expense', 'other')`,
    );

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "username" varchar(50) NOT NULL,
        "password_hash" text NOT NULL,
        "full_name" varchar(100) NOT NULL,
        "note" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_users_username" UNIQUE ("username")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "token_hash" char(64) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_refresh_tokens_token_hash" UNIQUE ("token_hash")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_tokens_user_id" ON "refresh_tokens" ("user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "contacts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "name" varchar(100) NOT NULL,
        "phone" text,
        "owes_us" numeric(14,2) NOT NULL DEFAULT 0,
        "description" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_contacts_name_not_blank" CHECK (btrim("name") <> '')
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_contacts_user_id" ON "contacts" ("user_id")`,
    );
    // Contact names are unique per user, case-insensitively.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_contacts_user_name" ON "contacts" ("user_id", lower("name"))`,
    );

    await queryRunner.query(`
      CREATE TABLE "wagons" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "name" varchar(100) NOT NULL,
        "currency" "currency_enum" NOT NULL DEFAULT 'dollar',
        "status" "wagon_status_enum" NOT NULL DEFAULT 'open',
        "buy_volume" numeric(12,3),
        "buy_price" numeric(14,2),
        "bought_from_contact_id" uuid REFERENCES "contacts"("id") ON DELETE SET NULL,
        "buy_applied_amount" numeric(14,2),
        "sell_volume" numeric(12,3),
        "sell_price" numeric(14,2),
        "sold_to_contact_id" uuid REFERENCES "contacts"("id") ON DELETE SET NULL,
        "sell_applied_amount" numeric(14,2),
        "description" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_wagons_side_present" CHECK (
          ("buy_volume" IS NOT NULL AND "buy_price" IS NOT NULL)
          OR ("sell_volume" IS NOT NULL AND "sell_price" IS NOT NULL)
        ),
        CONSTRAINT "chk_wagons_buy_pair" CHECK (("buy_volume" IS NULL) = ("buy_price" IS NULL)),
        CONSTRAINT "chk_wagons_sell_pair" CHECK (("sell_volume" IS NULL) = ("sell_price" IS NULL)),
        CONSTRAINT "chk_wagons_positive" CHECK (
          COALESCE("buy_volume", 1) > 0 AND COALESCE("buy_price", 1) >= 0
          AND COALESCE("sell_volume", 1) > 0 AND COALESCE("sell_price", 1) >= 0
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_wagons_user_status" ON "wagons" ("user_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_wagons_bought_from" ON "wagons" ("bought_from_contact_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_wagons_sold_to" ON "wagons" ("sold_to_contact_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "transactions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "type" "transaction_type_enum" NOT NULL,
        "amount" numeric(14,2) NOT NULL,
        "currency" "currency_enum" NOT NULL DEFAULT 'dollar',
        "date" date NOT NULL,
        "contact_id" uuid REFERENCES "contacts"("id") ON DELETE SET NULL,
        "wagon_id" uuid REFERENCES "wagons"("id") ON DELETE SET NULL,
        "description" text,
        "balance_applied_amount" numeric(14,2),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_transactions_amount_positive" CHECK ("amount" > 0)
      )
    `);
    // B-tree index for fast date range and per-day lookups (calendar screens).
    await queryRunner.query(
      `CREATE INDEX "idx_transactions_user_date" ON "transactions" ("user_id", "date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_transactions_user_contact" ON "transactions" ("user_id", "contact_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_transactions_user_wagon" ON "transactions" ("user_id", "wagon_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "settings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "primary_currency" "currency_enum" NOT NULL DEFAULT 'dollar',
        "secondary_currency" "secondary_currency_enum" NOT NULL DEFAULT 'manat',
        "exchange_rate" numeric(12,4) NOT NULL DEFAULT 1.7,
        "last_changed_date" timestamptz NOT NULL DEFAULT now(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_settings_user_id" UNIQUE ("user_id"),
        CONSTRAINT "chk_settings_rate_positive" CHECK ("exchange_rate" > 0)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "settings"`);
    await queryRunner.query(`DROP TABLE "transactions"`);
    await queryRunner.query(`DROP TABLE "wagons"`);
    await queryRunner.query(`DROP TABLE "contacts"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "transaction_type_enum"`);
    await queryRunner.query(`DROP TYPE "wagon_status_enum"`);
    await queryRunner.query(`DROP TYPE "secondary_currency_enum"`);
    await queryRunner.query(`DROP TYPE "currency_enum"`);
  }
}
