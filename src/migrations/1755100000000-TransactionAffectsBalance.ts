import { MigrationInterface, QueryRunner } from 'typeorm';

export class TransactionAffectsBalance1755100000000 implements MigrationInterface {
  name = 'TransactionAffectsBalance1755100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD "affects_balance" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "affects_balance"`);
  }
}
