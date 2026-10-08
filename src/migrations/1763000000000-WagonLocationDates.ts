import { MigrationInterface, QueryRunner } from 'typeorm';

export class WagonLocationDates1763000000000 implements MigrationInterface {
  name = 'WagonLocationDates1763000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wagons" ADD "location_dates" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(
      `UPDATE "wagons"
         SET "location_dates" = jsonb_build_object('russia', to_char("created_at", 'YYYY-MM-DD'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "wagons" DROP COLUMN "location_dates"`);
  }
}
