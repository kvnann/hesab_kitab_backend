import './env';
import { ClassSerializerInterceptor, INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { App } from 'supertest/types';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../../src/app.module';

export interface TestUser {
  id: string;
  username: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();

  // Mirror the production bootstrap in main.ts.
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  await app.init();
  return app;
}

export async function closeTestApp(app: INestApplication<App>): Promise<void> {
  await app.get(DataSource).destroy().catch(() => undefined);
  await app.close();
}

/** Sign up a fresh user with a unique username; returns credentials and tokens. */
export async function registerUser(app: INestApplication<App>): Promise<TestUser> {
  const username = `user_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
  const password = 'Test-password-123';
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/signup')
    .send({ username, password, fullName: 'Test User' })
    .expect(201);

  return {
    id: response.body.user.id,
    username,
    password,
    accessToken: response.body.tokens.accessToken,
    refreshToken: response.body.tokens.refreshToken,
  };
}

export function authed(
  app: INestApplication<App>,
  user: TestUser,
): {
  get: (url: string) => request.Test;
  post: (url: string) => request.Test;
  patch: (url: string) => request.Test;
  delete: (url: string) => request.Test;
} {
  const server = app.getHttpServer();
  const withAuth = (test: request.Test): request.Test =>
    test.set('Authorization', `Bearer ${user.accessToken}`);
  return {
    get: (url) => withAuth(request(server).get(url)),
    post: (url) => withAuth(request(server).post(url)),
    patch: (url) => withAuth(request(server).patch(url)),
    delete: (url) => withAuth(request(server).delete(url)),
  };
}
