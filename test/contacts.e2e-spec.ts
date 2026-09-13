import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  TestUser,
  authed,
  closeTestApp,
  createTestApp,
  registerUser,
} from './utils/test-app';

describe('Contacts (e2e)', () => {
  let app: INestApplication<App>;
  let user: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
    user = await registerUser(app);
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('creates a contact with an initial "owes us" balance', async () => {
    const response = await authed(app, user)
      .post('/api/v1/contacts')
      .send({
        name: 'Namiq',
        direction: 'owes_us',
        initialBalance: 2000,
        description: 'Vaqon 674 üçün avans',
      })
      .expect(201);
    expect(response.body.owesUs).toBe(2000);
  });

  it('creates a contact with a "we owe" balance as negative', async () => {
    const response = await authed(app, user)
      .post('/api/v1/contacts')
      .send({ name: 'Şamil Əliyev', direction: 'we_owe', initialBalance: 2200 })
      .expect(201);
    expect(response.body.owesUs).toBe(-2200);
  });

  it('stores phone numbers encrypted at rest but returns them decrypted', async () => {
    const phone = '+994 50 123 45 67';
    const created = await authed(app, user)
      .post('/api/v1/contacts')
      .send({ name: 'Vəli', phone })
      .expect(201);
    expect(created.body.phone).toBe(phone);

    const dataSource = app.get(DataSource);
    const [row] = await dataSource.query<{ phone: string }[]>(
      'SELECT phone FROM contacts WHERE id = $1',
      [created.body.id],
    );
    expect(row.phone).toBeTruthy();
    expect(row.phone).not.toContain('123');
    expect(row.phone).not.toBe(phone);
  });

  it('rejects duplicate names case-insensitively with 409', async () => {
    await authed(app, user).post('/api/v1/contacts').send({ name: 'Kənan' }).expect(201);
    await authed(app, user).post('/api/v1/contacts').send({ name: 'kənan' }).expect(409);
  });

  it('rejects blank names', async () => {
    await authed(app, user).post('/api/v1/contacts').send({ name: '   ' }).expect(400);
    await authed(app, user).post('/api/v1/contacts').send({}).expect(400);
  });

  it('updates and deletes a contact', async () => {
    const created = await authed(app, user)
      .post('/api/v1/contacts')
      .send({ name: 'Temp Contact', initialBalance: 100 })
      .expect(201);

    const updated = await authed(app, user)
      .patch(`/api/v1/contacts/${created.body.id}`)
      .send({ name: 'Renamed Contact', owesUs: -50.5, description: 'note' })
      .expect(200);
    expect(updated.body.name).toBe('Renamed Contact');
    expect(updated.body.owesUs).toBe(-50.5);

    await authed(app, user).delete(`/api/v1/contacts/${created.body.id}`).expect(204);
    await authed(app, user).get(`/api/v1/contacts/${created.body.id}`).expect(404);
  });

  it('computes the receivable/payable summary', async () => {
    const fresh = await registerUser(app);
    await authed(app, fresh)
      .post('/api/v1/contacts')
      .send({ name: 'A', direction: 'owes_us', initialBalance: 12400 })
      .expect(201);
    await authed(app, fresh)
      .post('/api/v1/contacts')
      .send({ name: 'B', direction: 'we_owe', initialBalance: 3200 })
      .expect(201);

    const summary = await authed(app, fresh).get('/api/v1/contacts/summary').expect(200);
    expect(summary.body).toMatchObject({
      receivable: 12400,
      payable: -3200,
      net: 9200,
      count: 2,
    });
  });

  it("isolates users: one user cannot see another's contacts", async () => {
    const other = await registerUser(app);
    const created = await authed(app, user)
      .post('/api/v1/contacts')
      .send({ name: 'Private Contact' })
      .expect(201);

    await authed(app, other).get(`/api/v1/contacts/${created.body.id}`).expect(404);
    await authed(app, other)
      .patch(`/api/v1/contacts/${created.body.id}`)
      .send({ name: 'Hacked' })
      .expect(404);
    await authed(app, other).delete(`/api/v1/contacts/${created.body.id}`).expect(404);

    // Same name is allowed for a different user.
    await authed(app, other)
      .post('/api/v1/contacts')
      .send({ name: 'Private Contact' })
      .expect(201);
  });
});
