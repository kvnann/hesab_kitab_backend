import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  authed,
  closeTestApp,
  createTestApp,
  registerUser,
} from './utils/test-app';

describe('Settings (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('updates the exchange rate and stamps lastChangedDate', async () => {
    const user = await registerUser(app);
    const before = await authed(app, user).get('/api/v1/settings').expect(200);

    const updated = await authed(app, user)
      .patch('/api/v1/settings')
      .send({ exchangeRate: 1.75 })
      .expect(200);
    expect(updated.body.exchangeRate).toBe(1.75);
    expect(new Date(updated.body.lastChangedDate).getTime()).toBeGreaterThan(
      new Date(before.body.lastChangedDate).getTime() - 1,
    );
  });

  it('rejects identical primary and secondary currencies', async () => {
    const user = await registerUser(app);
    await authed(app, user)
      .patch('/api/v1/settings')
      .send({ secondaryCurrency: 'dollar' })
      .expect(400);
  });

  it('allows swapping currencies and euro as secondary', async () => {
    const user = await registerUser(app);
    const swapped = await authed(app, user)
      .patch('/api/v1/settings')
      .send({ primaryCurrency: 'manat', secondaryCurrency: 'dollar', exchangeRate: 0.59 })
      .expect(200);
    expect(swapped.body.primaryCurrency).toBe('manat');

    const euro = await authed(app, user)
      .patch('/api/v1/settings')
      .send({ primaryCurrency: 'dollar', secondaryCurrency: 'euro' })
      .expect(200);
    expect(euro.body.secondaryCurrency).toBe('euro');
  });

  it('rejects invalid rates', async () => {
    const user = await registerUser(app);
    await authed(app, user).patch('/api/v1/settings').send({ exchangeRate: 0 }).expect(400);
    await authed(app, user)
      .patch('/api/v1/settings')
      .send({ exchangeRate: -1.5 })
      .expect(400);
  });

  it('deletes all user data on account deletion (cascade)', async () => {
    const user = await registerUser(app);
    await authed(app, user).post('/api/v1/contacts').send({ name: 'X' }).expect(201);
    await authed(app, user)
      .post('/api/v1/wagons')
      .send({ name: 'W', buyVolume: 1, buyPrice: 1, boughtFrom: 'X' })
      .expect(201);
    await authed(app, user)
      .post('/api/v1/transactions')
      .send({ type: 'other', amount: 5, date: '2026-07-01' })
      .expect(201);

    await authed(app, user).delete('/api/v1/users/me').expect(204);

    const dataSource = app.get(DataSource);
    for (const table of ['contacts', 'wagons', 'transactions', 'settings', 'refresh_tokens']) {
      const rows = await dataSource.query<{ count: string }[]>(
        `SELECT COUNT(*) AS count FROM ${table} WHERE user_id = $1`,
        [user.id],
      );
      expect(Number(rows[0].count), `${table} should be empty`).toBe(0);
    }
  });
});
