import { MigrationInterface, QueryRunner } from 'typeorm';

export class WagonCustomsCash1764000000000 implements MigrationInterface {
  name = 'WagonCustomsCash1764000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "contacts" c
          SET "owes_us" = c."owes_us" - w."customs_applied_amount"
         FROM "wagons" w
        WHERE w."customs_applied_amount" IS NOT NULL
          AND w."customs_applied_amount" <> 0
          AND c."id" = CASE WHEN w."customs_payer" = 'buyer'
                            THEN w."sold_to_contact_id"
                            ELSE w."bought_from_contact_id" END`,
    );

    await queryRunner.query(
      `DELETE FROM "transactions" WHERE "source" = 'wagon' AND "wagon_side" = 'customs'`,
    );

    await queryRunner.query(
      `ALTER TABLE "wagons" ADD "customs_through_cash" boolean NOT NULL DEFAULT true`,
    );

    await queryRunner.query(
      `ALTER TABLE "wagons" DROP CONSTRAINT IF EXISTS "chk_wagons_customs_payer"`,
    );
    await queryRunner.query(`ALTER TABLE "wagons" DROP COLUMN "customs_payer"`);
    await queryRunner.query(`ALTER TABLE "wagons" DROP COLUMN "customs_applied_amount"`);
    await queryRunner.query(`DROP TYPE "customs_payer_enum"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "customs_payer_enum" AS ENUM ('buyer', 'seller')`,
    );
    await queryRunner.query(
      `ALTER TABLE "wagons" ADD "customs_applied_amount" numeric(14,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "wagons" ADD "customs_payer" "customs_payer_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wagons" ADD CONSTRAINT "chk_wagons_customs_payer"
         CHECK (COALESCE("customs_expense", 0) = 0 OR "customs_payer" IS NOT NULL)`,
    );
    await queryRunner.query(`ALTER TABLE "wagons" DROP COLUMN "customs_through_cash"`);
  }
}
