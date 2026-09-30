import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Where the wagon physically is: it starts in Russia, passes through
 * Azerbaijan and ends in Iran. Separate from `status`, which is the
 * open/archived flag — a wagon can be anywhere on the route and still be open.
 */
export class WagonLocation1761000000000 implements MigrationInterface {
  name = 'WagonLocation1761000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "wagon_location_enum" AS ENUM ('russia', 'azerbaijan', 'iran')`,
    );
    await queryRunner.query(
      `ALTER TABLE "wagons" ADD "location" "wagon_location_enum" NOT NULL DEFAULT 'russia'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "wagons" DROP COLUMN "location"`);
    await queryRunner.query(`DROP TYPE "wagon_location_enum"`);
  }
}
