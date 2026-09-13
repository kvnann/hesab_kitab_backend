// Test environment defaults. Imported BEFORE any application module so the
// values exist when ConfigModule validates them (ES module execution order).
process.env.NODE_ENV = 'test';
process.env.DB_HOST ??= 'localhost';
process.env.DB_PORT ??= '5433';
process.env.DB_USER ??= 'hesab_test';
process.env.DB_PASSWORD ??= 'hesab-test-password';
process.env.DB_NAME ??= 'hesab_kitab_test';
process.env.DB_MIGRATIONS_RUN = 'true';
process.env.JWT_ACCESS_SECRET ??= 'test-secret-'.padEnd(64, 'x');
process.env.JWT_ACCESS_TTL ??= '15m';
process.env.REFRESH_TOKEN_TTL_DAYS ??= '30';
process.env.ENCRYPTION_KEY ??=
  '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
process.env.THROTTLE_LIMIT ??= '100000';
process.env.THROTTLE_AUTH_LIMIT ??= '100000';
process.env.SWAGGER_ENABLED = 'false';

export {};
