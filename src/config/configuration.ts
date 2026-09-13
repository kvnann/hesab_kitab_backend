export interface AppConfig {
  nodeEnv: string;
  port: number;
  corsOrigins: string[];
  swaggerEnabled: boolean;
  database: {
    host: string;
    port: number;
    user: string;
    password: string;
    name: string;
    ssl: boolean;
    migrationsRun: boolean;
  };
  auth: {
    accessSecret: string;
    accessTtl: string;
    refreshTtlDays: number;
  };
  encryptionKey: string;
  throttle: {
    limit: number;
    authLimit: number;
  };
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(',').map((o) => o.trim()),
  swaggerEnabled: process.env.SWAGGER_ENABLED !== 'false',
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    user: process.env.DB_USER ?? 'hesab',
    password: process.env.DB_PASSWORD ?? '',
    name: process.env.DB_NAME ?? 'hesab_kitab',
    ssl: process.env.DB_SSL === 'true',
    migrationsRun: process.env.DB_MIGRATIONS_RUN !== 'false',
  },
  auth: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtlDays: parseInt(process.env.REFRESH_TOKEN_TTL_DAYS ?? '30', 10),
  },
  encryptionKey: process.env.ENCRYPTION_KEY ?? '',
  throttle: {
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '120', 10),
    authLimit: parseInt(process.env.THROTTLE_AUTH_LIMIT ?? '10', 10),
  },
});
