import { MigrationInterface, QueryRunner } from 'typeorm';

export class KassaAsPocket1760000000000 implements MigrationInterface {
  name = 'KassaAsPocket1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD "affects_cash" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD "cash_applied_amount" numeric(14,2)`,
    );

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
      `UPDATE "transactions"
         SET "type" = CASE WHEN "wagon_side" = 'buy'
                           THEN 'income'::"transaction_type_enum"
                           ELSE 'expense'::"transaction_type_enum" END
       WHERE "source" = 'wagon' AND "wagon_side" IS NOT NULL`,
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
