import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Kassa becomes a money pocket that is only moved on purpose.
 *
 * Debt operations no longer touch it by default: a transaction reaches the till
 * only when it is marked as a till operation, and the signed amount it applied
 * is stored so the total is an exact sum rather than a re-derivation.
 *
 * Everything that already exists is deliberately left out — every account
 * starts from 0 and the user opts rows in one by one.
 */
export class KassaAsPocket1760000000000 implements MigrationInterface {
  name = 'KassaAsPocket1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD "affects_cash" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD "cash_applied_amount" numeric(14,2)`,
    );

    // Which wagon side a generated row belongs to. Replaces matching on the
    // row's description text, and lets a till toggle find the owning side.
    await queryRunner.query(
      `CREATE TYPE "wagon_side_enum" AS ENUM ('buy', 'sell', 'customs')`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD "wagon_side" "wagon_side_enum"`,
    );
    await queryRunner.query(
      `UPDATE "transactions" SET "wagon_side" = CASE
         WHEN "description" LIKE 'Mal alışı%' THEN 'buy'::"wagon_side_enum"
         WHEN "description" LIKE 'Mal satışı%' THEN 'sell'::"wagon_side_enum"
         WHEN "description" LIKE 'Gömrük xərci%' THEN 'customs'::"wagon_side_enum"
       END
       WHERE "source" = 'wagon'`,
    );

    await queryRunner.query(
      `ALTER TABLE "wagons" ADD "buy_through_cash" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "wagons" ADD "sell_through_cash" boolean NOT NULL DEFAULT false`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_transactions_user_cash" ON "transactions" ("user_id", "affects_cash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_transactions_user_cash"`);
    await queryRunner.query(`ALTER TABLE "wagons" DROP COLUMN "sell_through_cash"`);
    await queryRunner.query(`ALTER TABLE "wagons" DROP COLUMN "buy_through_cash"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "wagon_side"`);
    await queryRunner.query(`DROP TYPE "wagon_side_enum"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "cash_applied_amount"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "affects_cash"`);
  }
}
