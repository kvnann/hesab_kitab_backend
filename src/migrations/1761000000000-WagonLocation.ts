import { MigrationInterface, QueryRunner } from 'typeorm';

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
