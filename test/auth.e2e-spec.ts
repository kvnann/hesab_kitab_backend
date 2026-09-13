import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authed, closeTestApp, createTestApp, registerUser } from './utils/test-app';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('signs up, returns tokens and never exposes the password hash', async () => {
    const user = await registerUser(app);
    expect(user.accessToken).toBeTruthy();
    expect(user.refreshToken).toBeTruthy();

    const me = await authed(app, user).get('/api/v1/users/me').expect(200);
    expect(me.body.username).toBe(user.username);
    expect(me.body.passwordHash).toBeUndefined();
    expect(me.body.password_hash).toBeUndefined();
  });

  it('creates default settings at signup', async () => {
    const user = await registerUser(app);
    const settings = await authed(app, user).get('/api/v1/settings').expect(200);
    expect(settings.body.primaryCurrency).toBe('dollar');
    expect(settings.body.secondaryCurrency).toBe('manat');
    expect(settings.body.exchangeRate).toBe(1.7);
  });

  it('rejects duplicate usernames with 409', async () => {
    const user = await registerUser(app);
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        username: user.username.toUpperCase(),
        password: 'Another-pass-123',
        fullName: 'Impostor',
      })
      .expect(409);
  });

  it('logs in with valid credentials and rejects bad ones', async () => {
    const user = await registerUser(app);

    const ok = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: user.username, password: user.password })
      .expect(200);
    expect(ok.body.tokens.accessToken).toBeTruthy();

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: user.username, password: 'wrong-password-1' })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'no_such_user_xyz', password: 'whatever-123' })
      .expect(401);
  });

  it('rotates refresh tokens: old one dies, new one works', async () => {
    const user = await registerUser(app);

    const first = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: user.refreshToken })
      .expect(200);
    expect(first.body.refreshToken).not.toBe(user.refreshToken);

    // The consumed token must be rejected.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: user.refreshToken })
      .expect(401);

    // The rotated token still works.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.body.refreshToken })
      .expect(200);
  });

  it('logout revokes the refresh token', async () => {
    const user = await registerUser(app);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: user.refreshToken })
      .expect(204);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: user.refreshToken })
      .expect(401);
  });

  it('rejects unauthenticated and garbage-token requests', async () => {
    await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
  });

  it('changes password and invalidates the old one', async () => {
    const user = await registerUser(app);
    await authed(app, user)
      .patch('/api/v1/users/me/password')
      .send({ currentPassword: user.password, newPassword: 'New-password-456' })
      .expect(204);

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: user.username, password: user.password })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: user.username, password: 'New-password-456' })
      .expect(200);
  });

  it('rejects access tokens of deleted users', async () => {
    const user = await registerUser(app);
    await authed(app, user).delete('/api/v1/users/me').expect(204);
    await authed(app, user).get('/api/v1/users/me').expect(401);
  });
});
