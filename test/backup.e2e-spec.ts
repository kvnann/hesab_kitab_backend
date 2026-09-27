import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  authed,
  closeTestApp,
  createTestApp,
  registerUser,
} from './utils/test-app';

describe('Backup (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('exports everything the user owns', async () => {
    const user = await registerUser(app);
    const contact = await authed(app, user)
      .post('/api/v1/contacts')
      .send({ name: 'Etibar', phone: '+994 50 123 45 67' })
      .expect(201);
    await authed(app, user)
      .post('/api/v1/wagons')
      .send({ name: '676', buyVolume: 205, buyPrice: 200, boughtFrom: 'Etibar' })
      .expect(201);
    await authed(app, user)
      .post('/api/v1/transactions')
      .send({
        type: 'expense',
        amount: 500,
        date: '2026-09-27',
        contactId: contact.body.id,
        description: 'Borc verildi',
      })
      .expect(201);

    const backup = await authed(app, user).get('/api/v1/backup').expect(200);

    expect(backup.body).toMatchObject({
      format: 'hesab-kitab-backup',
      version: 1,
      user: { username: user.username },
    });
    expect(typeof backup.body.exportedAt).toBe('string');
    expect(backup.body.contacts).toHaveLength(1);
    expect(backup.body.wagons).toHaveLength(1);
    // The manual transaction plus the row the wagon generated.
    expect(backup.body.transactions).toHaveLength(2);
    expect(backup.body.counts).toMatchObject({
      contacts: 1,
      wagons: 1,
      transactions: 2,
    });
    expect(backup.body.settings).toMatchObject({ primaryCurrency: 'dollar' });

    // Phone numbers are encrypted at rest but must be readable in a backup.
    expect(backup.body.contacts[0].phone).toBe('+994 50 123 45 67');
  });

  it('never includes credentials', async () => {
    const user = await registerUser(app);
    const backup = await authed(app, user).get('/api/v1/backup').expect(200);

    const raw = JSON.stringify(backup.body);
    expect(raw).not.toContain('passwordHash');
    expect(raw).not.toContain('password_hash');
    expect(raw).not.toContain('$argon2');
    expect(raw).not.toContain('refreshToken');
    expect(backup.body.user.password).toBeUndefined();
  });

  it("contains only the caller's own data", async () => {
    const mine = await registerUser(app);
    const theirs = await registerUser(app);
    await authed(app, mine).post('/api/v1/contacts').send({ name: 'Mine' }).expect(201);
    await authed(app, theirs).post('/api/v1/contacts').send({ name: 'Theirs' }).expect(201);

    const backup = await authed(app, mine).get('/api/v1/backup').expect(200);
    const names = backup.body.contacts.map((c: { name: string }) => c.name);
    expect(names).toEqual(['Mine']);
  });

  it('requires authentication', async () => {
    const { default: request } = await import('supertest');
    await request(app.getHttpServer()).get('/api/v1/backup').expect(401);
  });
});
