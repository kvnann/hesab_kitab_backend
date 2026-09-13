import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AppConfig } from '../config/configuration';
import { buildDataSourceOptions } from './data-source';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>): TypeOrmModuleOptions => {
        const db = config.get('database', { infer: true });
        return {
          ...buildDataSourceOptions(),
          host: db.host,
          port: db.port,
          username: db.user,
          password: db.password,
          database: db.name,
          ssl: db.ssl ? { rejectUnauthorized: false } : false,
          migrationsRun: db.migrationsRun,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
