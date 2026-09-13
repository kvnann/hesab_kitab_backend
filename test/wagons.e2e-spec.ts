import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  TestUser,
  authed,
  closeTestApp,
  createTestApp,
  registerUser,
} from './utils/test-app';

async function contactBalance(
  app: INestApplication<App>,
  user: TestUser,
  name: string,
): Promise<number | undefined> {
  const contacts = await authed(app, user).get('/api/v1/contacts').expect(200);
  const contact = contacts.body.find((c: { name: string }) => c.name === name);
  return contact?.owesUs;
}

describe('Wagons (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('creates a wagon with both sides, auto-creates contacts and applies balances', async () => {
    const user = await registerUser(app);

    // Design example: buy 205 m³ × 200 $/m³ from Kənan, sell 200 m³ × 200 $/m³ to Namiq.
    const response = await authed(app, user)
      .post('/api/v1/wagons')
      .send({
        name: 'Vaqon No. 676',
        buyVolume: 205,
        buyPrice: 200,
        boughtFrom: 'Kənan',
        sellVolume: 200,
        sellPrice: 200,
        soldTo: 'Namiq',
        description: '5 m³ yolda itki, sənədlə təsdiqlənib',
      })
      .expect(201);

    expect(response.body.buyTotal).toBe(41000);
    expect(response.body.sellTotal).toBe(40000);
    expect(response.body.difference).toBe(-1000);
    expect(response.body.boughtFrom.name).toBe('Kənan');
    expect(response.body.soldTo.name).toBe('Namiq');
    expect(response.body.status).toBe('open');

    // We bought on credit from Kənan → we owe him 41000.
    expect(await contactBalance(app, user, 'Kənan')).toBe(-41000);
    // Namiq bought from us on credit → he owes 40000.
    expect(await contactBalance(app, user, 'Namiq')).toBe(40000);
  });

  it('reuses an existing contact instead of duplicating it', async () => {
    const user = await registerUser(app);
    await authed(app, user)
      .post('/api/v1/contacts')
      .send({ name: 'Əli', direction: 'owes_us', initialBalance: 500 })
      .expect(201);

    await authed(app, user)
      .post('/api/v1/wagons')
      .send({ name: 'Vaqon 1', buyVolume: 10, buyPrice: 100, boughtFrom: 'əli' })
      .expect(201);

    const contacts = await authed(app, user).get('/api/v1/contacts').expect(200);
    const alis = contacts.body.filter((c: { name: string }) =>
      c.name.toLowerCase().includes('əli'),
    );
    expect(alis).toHaveLength(1);
    expect(alis[0].owesUs).toBe(500 - 1000);
  });

  it('supports buy-only wagons; selling details can be added later', async () => {
    const user = await registerUser(app);
    const created = await authed(app, user)
      .post('/api/v1/wagons')
      .send({ name: 'Vaqon 674', buyVolume: 200, buyPrice: 200, boughtFrom: 'Kənan' })
      .expect(201);
    expect(created.body.sellTotal).toBeNull();
    expect(await contactBalance(app, user, 'Kənan')).toBe(-40000);

    // Later the deal is closed with a sale.
    const updated = await authed(app, user)
      .patch(`/api/v1/wagons/${created.body.id}`)
      .send({ sellVolume: 205, sellPrice: 200, soldTo: 'Namiq', status: 'closed' })
      .expect(200);
    expect(updated.body.difference).toBe(1000);
    expect(updated.body.status).toBe('closed');
    expect(await contactBalance(app, user, 'Kənan')).toBe(-40000);
    expect(await contactBalance(app, user, 'Namiq')).toBe(41000);
  });

  it('rejects wagons with no side and half-filled sides', async () => {
    const user = await registerUser(app);
    await authed(app, user).post('/api/v1/wagons').send({ name: 'Empty' }).expect(400);
    await authed(app, user)
      .post('/api/v1/wagons')
      .send({ name: 'Half', buyVolume: 100 })
      .expect(400);
    await authed(app, user)
      .post('/api/v1/wagons')
      .send({ name: 'Half2', sellPrice: 100 })
      .expect(400);
  });

  it('re-applies balances consistently when a price is edited', async () => {
    const user = await registerUser(app);
    const wagon = await authed(app, user)
      .post('/api/v1/wagons')
      .send({ name: 'W', buyVolume: 100, buyPrice: 10, boughtFrom: 'Seller' })
      .expect(201);
    expect(await contactBalance(app, user, 'Seller')).toBe(-1000);

    await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ buyPrice: 12 })
      .expect(200);
    expect(await contactBalance(app, user, 'Seller')).toBe(-1200);
  });

  it('moves the debt when the counterparty changes', async () => {
    const user = await registerUser(app);
    const wagon = await authed(app, user)
      .post('/api/v1/wagons')
      .send({ name: 'W', sellVolume: 50, sellPrice: 20, soldTo: 'First Buyer' })
      .expect(201);
    expect(await contactBalance(app, user, 'First Buyer')).toBe(1000);

    await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ soldTo: 'Second Buyer' })
      .expect(200);
    expect(await contactBalance(app, user, 'First Buyer')).toBe(0);
    expect(await contactBalance(app, user, 'Second Buyer')).toBe(1000);
  });

  it('honors applyBuyToBalance=false (cash deal, no debt)', async () => {
    const user = await registerUser(app);
    await authed(app, user)
      .post('/api/v1/wagons')
      .send({
        name: 'Cash wagon',
        buyVolume: 10,
        buyPrice: 10,
        boughtFrom: 'Cash Seller',
        applyBuyToBalance: false,
      })
      .expect(201);
    expect(await contactBalance(app, user, 'Cash Seller')).toBe(0);
  });

  it('converts manat wagons into the primary (dollar) balance using the rate', async () => {
    const user = await registerUser(app);
    // Default settings: primary dollar, secondary manat, 1 USD = 1.70 AZN.
    await authed(app, user)
      .post('/api/v1/wagons')
      .send({
        name: 'Manat wagon',
        currency: 'manat',
        sellVolume: 100,
        sellPrice: 17,
        soldTo: 'AZN Buyer',
      })
      .expect(201);
    // 1700 AZN / 1.7 = 1000 USD
    expect(await contactBalance(app, user, 'AZN Buyer')).toBe(1000);
  });

  it('reverses balances when a wagon is deleted', async () => {
    const user = await registerUser(app);
    const wagon = await authed(app, user)
      .post('/api/v1/wagons')
      .send({
        name: 'Doomed',
        buyVolume: 10,
        buyPrice: 100,
        boughtFrom: 'S',
        sellVolume: 10,
        sellPrice: 110,
        soldTo: 'B',
      })
      .expect(201);
    expect(await contactBalance(app, user, 'S')).toBe(-1000);
    expect(await contactBalance(app, user, 'B')).toBe(1100);

    await authed(app, user).delete(`/api/v1/wagons/${wagon.body.id}`).expect(204);
    expect(await contactBalance(app, user, 'S')).toBe(0);
    expect(await contactBalance(app, user, 'B')).toBe(0);
  });

  it('archives and restores a wagon without touching balances', async () => {
    const user = await registerUser(app);
    const wagon = await authed(app, user)
      .post('/api/v1/wagons')
      .send({
        name: 'Arxiv vaqon',
        buyVolume: 10,
        buyPrice: 100,
        boughtFrom: 'S',
        sellVolume: 10,
        sellPrice: 110,
        soldTo: 'B',
      })
      .expect(201);
    expect(await contactBalance(app, user, 'S')).toBe(-1000);
    expect(await contactBalance(app, user, 'B')).toBe(1100);

    // Archive → status closed, balances untouched.
    const archived = await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ status: 'closed' })
      .expect(200);
    expect(archived.body.status).toBe('closed');
    expect(await contactBalance(app, user, 'S')).toBe(-1000);
    expect(await contactBalance(app, user, 'B')).toBe(1100);

    // It leaves the active list and appears in the archive list.
    const open = await authed(app, user).get('/api/v1/wagons?status=open').expect(200);
    expect(open.body.some((w: { id: string }) => w.id === wagon.body.id)).toBe(false);
    const closed = await authed(app, user)
      .get('/api/v1/wagons?status=closed')
      .expect(200);
    expect(closed.body.some((w: { id: string }) => w.id === wagon.body.id)).toBe(true);

    // Restore.
    const restored = await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ status: 'open' })
      .expect(200);
    expect(restored.body.status).toBe('open');
    expect(await contactBalance(app, user, 'S')).toBe(-1000);
    expect(await contactBalance(app, user, 'B')).toBe(1100);
  });

  it('archiving after an exchange-rate change does not shift balances', async () => {
    const user = await registerUser(app);
    // Manat wagon at the default rate 1.70 → 1700 AZN = 1000 USD owed to us.
    const wagon = await authed(app, user)
      .post('/api/v1/wagons')
      .send({
        name: 'Rate wagon',
        currency: 'manat',
        sellVolume: 100,
        sellPrice: 17,
        soldTo: 'Rate Buyer',
      })
      .expect(201);
    expect(await contactBalance(app, user, 'Rate Buyer')).toBe(1000);

    // The user later updates the manual rate.
    await authed(app, user)
      .patch('/api/v1/settings')
      .send({ exchangeRate: 2 })
      .expect(200);

    // Archiving is metadata-only: the historical balance must stay at 1000,
    // not be re-converted to 850 at the new rate.
    await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ status: 'closed' })
      .expect(200);
    expect(await contactBalance(app, user, 'Rate Buyer')).toBe(1000);

    // Renaming is metadata-only too.
    await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ name: 'Renamed', description: 'note' })
      .expect(200);
    expect(await contactBalance(app, user, 'Rate Buyer')).toBe(1000);
  });

  it('filters by status and isolates users', async () => {
    const user = await registerUser(app);
    const other = await registerUser(app);
    const wagon = await authed(app, user)
      .post('/api/v1/wagons')
      .send({ name: 'Mine', buyVolume: 1, buyPrice: 1 })
      .expect(201);

    const open = await authed(app, user).get('/api/v1/wagons?status=open').expect(200);
    expect(open.body.some((w: { id: string }) => w.id === wagon.body.id)).toBe(true);
    const closed = await authed(app, user)
      .get('/api/v1/wagons?status=closed')
      .expect(200);
    expect(closed.body.some((w: { id: string }) => w.id === wagon.body.id)).toBe(false);

    await authed(app, other).get(`/api/v1/wagons/${wagon.body.id}`).expect(404);
    await authed(app, other).delete(`/api/v1/wagons/${wagon.body.id}`).expect(404);
  });
});
