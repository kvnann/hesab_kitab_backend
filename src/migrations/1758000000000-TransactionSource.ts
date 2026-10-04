import { MigrationInterface, QueryRunner } from 'typeorm';

export class TransactionSource1758000000000 implements MigrationInterface {
  name = 'TransactionSource1758000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "transaction_source_enum" AS ENUM ('manual', 'wagon')`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD "source" "transaction_source_enum" NOT NULL DEFAULT 'manual'`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_transactions_wagon_source" ON "transactions" ("wagon_id", "source")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_transactions_wagon_source"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "source"`);
    await queryRunner.query(`DROP TYPE "transaction_source_enum"`);
  }
}
