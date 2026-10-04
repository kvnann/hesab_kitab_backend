import { MigrationInterface, QueryRunner } from 'typeorm';

export class WagonCustomsExpense1759000000000 implements MigrationInterface {
  name = 'WagonCustomsExpense1759000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "customs_payer_enum" AS ENUM ('buyer', 'seller')`,
    );
    await queryRunner.query(`ALTER TABLE "wagons" ADD "customs_expense" numeric(14,2)`);
    await queryRunner.query(
      `ALTER TABLE "wagons" ADD "customs_payer" "customs_payer_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wagons" ADD "customs_applied_amount" numeric(14,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "wagons" ADD CONSTRAINT "chk_wagons_customs_non_negative"
         CHECK ("customs_expense" IS NULL OR "customs_expense" >= 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "wagons" ADD CONSTRAINT "chk_wagons_customs_payer"
         CHECK (COALESCE("customs_expense", 0) = 0 OR "customs_payer" IS NOT NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wagons" DROP CONSTRAINT "chk_wagons_customs_payer"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wagons" DROP CONSTRAINT "chk_wagons_customs_non_negative"`,
    );
    await queryRunner.query(`ALTER TABLE "wagons" DROP COLUMN "customs_applied_amount"`);
    await queryRunner.query(`ALTER TABLE "wagons" DROP COLUMN "customs_payer"`);
    await queryRunner.query(`ALTER TABLE "wagons" DROP COLUMN "customs_expense"`);
    await queryRunner.query(`DROP TYPE "customs_payer_enum"`);
  }
}
