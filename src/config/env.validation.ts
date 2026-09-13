import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  CORS_ORIGINS: Joi.string().default('*'),
  SWAGGER_ENABLED: Joi.boolean().default(true),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().integer().default(5432),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().min(8).required(),
  DB_NAME: Joi.string().required(),
  DB_SSL: Joi.boolean().default(false),
  DB_MIGRATIONS_RUN: Joi.boolean().default(true),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().min(1).max(365).default(30),

  ENCRYPTION_KEY: Joi.string().hex().length(64).required(),

  THROTTLE_LIMIT: Joi.number().integer().min(1).default(120),
  THROTTLE_AUTH_LIMIT: Joi.number().integer().min(1).default(10),
});
