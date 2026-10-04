import { MigrationInterface, QueryRunner } from 'typeorm';

export class WagonArchivedAt1762000000000 implements MigrationInterface {
  name = 'WagonArchivedAt1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "wagons" ADD "archived_at" timestamptz`);
    await queryRunner.query(
      `UPDATE "wagons" SET "archived_at" = "updated_at" WHERE "status" = 'closed'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "wagons" DROP COLUMN "archived_at"`);
  }
}
