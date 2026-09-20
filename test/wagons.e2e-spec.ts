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

  it('applies the balance when a contact is added to an existing side', async () => {
    const user = await registerUser(app);
    // Created without "Kimdən alınıb" — nobody to bill yet.
    const wagon = await authed(app, user)
      .post('/api/v1/wagons')
      .send({ name: '676', buyVolume: 205, buyPrice: 200 })
      .expect(201);
    expect(wagon.body.boughtFrom).toBeNull();

    // Editing the wagon to name the seller must move that seller's balance:
    // the side was never a deliberate cash deal, it just had no contact.
    await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ buyVolume: 205, buyPrice: 200, boughtFrom: 'Etibar' })
      .expect(200);
    expect(await contactBalance(app, user, 'Etibar')).toBe(-41000);

    // Same on the sell side.
    await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ sellVolume: 200, sellPrice: 200, soldTo: 'Namiq' })
      .expect(200);
    expect(await contactBalance(app, user, 'Namiq')).toBe(40000);
    expect(await contactBalance(app, user, 'Etibar')).toBe(-41000);
  });

  it('keeps a cash deal cash when the wagon is edited', async () => {
    const user = await registerUser(app);
    const wagon = await authed(app, user)
      .post('/api/v1/wagons')
      .send({
        name: '678',
        buyVolume: 100,
        buyPrice: 10,
        boughtFrom: 'Cash Seller',
        applyBuyToBalance: false,
      })
      .expect(201);
    expect(await contactBalance(app, user, 'Cash Seller')).toBe(0);

    // An unrelated edit must not turn the cash deal into a debt.
    await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ buyPrice: 12 })
      .expect(200);
    expect(await contactBalance(app, user, 'Cash Seller')).toBe(0);
  });

  it('moves the balance to the new contact when the counterparty changes', async () => {
    const user = await registerUser(app);
    const wagon = await authed(app, user)
      .post('/api/v1/wagons')
      .send({ name: '679', buyVolume: 100, buyPrice: 10, boughtFrom: 'Etibar' })
      .expect(201);
    expect(await contactBalance(app, user, 'Etibar')).toBe(-1000);

    await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ boughtFrom: 'Rəşad' })
      .expect(200);
    expect(await contactBalance(app, user, 'Etibar')).toBe(0);
    expect(await contactBalance(app, user, 'Rəşad')).toBe(-1000);
  });

  it('reverses both contacts when the wagon is deleted', async () => {
    const user = await registerUser(app);
    const wagon = await authed(app, user)
      .post('/api/v1/wagons')
      .send({
        name: '680',
        buyVolume: 205,
        buyPrice: 200,
        boughtFrom: 'Etibar',
        sellVolume: 200,
        sellPrice: 200,
        soldTo: 'Namiq',
      })
      .expect(201);
    expect(await contactBalance(app, user, 'Etibar')).toBe(-41000);
    expect(await contactBalance(app, user, 'Namiq')).toBe(40000);

    await authed(app, user).delete(`/api/v1/wagons/${wagon.body.id}`).expect(204);

    // The contacts survive; only the wagon's effect is undone.
    expect(await contactBalance(app, user, 'Etibar')).toBe(0);
    expect(await contactBalance(app, user, 'Namiq')).toBe(0);
  });

  it('repairs a wagon whose contact was linked but never billed', async () => {
    const user = await registerUser(app);
    const wagon = await authed(app, user)
      .post('/api/v1/wagons')
      .send({
        name: '681',
        buyVolume: 100,
        buyPrice: 10,
        boughtFrom: 'Etibar',
        applyBuyToBalance: false,
      })
      .expect(201);
    expect(await contactBalance(app, user, 'Etibar')).toBe(0);

    // What the wagon form now sends on save: explicitly authoritative.
    await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({
        buyVolume: 100,
        buyPrice: 10,
        boughtFrom: 'Etibar',
        applyBuyToBalance: true,
      })
      .expect(200);
    expect(await contactBalance(app, user, 'Etibar')).toBe(-1000);
  });

  it('leaves a labelled row on each contact page and keeps the till clean', async () => {
    const user = await registerUser(app);
    const wagon = await authed(app, user)
      .post('/api/v1/wagons')
      .send({
        name: '676',
        buyVolume: 205,
        buyPrice: 200,
        boughtFrom: 'Etibar',
        sellVolume: 200,
        sellPrice: 200,
        soldTo: 'Namiq',
      })
      .expect(201);

    const contacts = await authed(app, user).get('/api/v1/contacts').expect(200);
    const etibar = contacts.body.find((c: { name: string }) => c.name === 'Etibar');
    const namiq = contacts.body.find((c: { name: string }) => c.name === 'Namiq');

    const bought = await authed(app, user)
      .get(`/api/v1/transactions?contactId=${etibar.id}`)
      .expect(200);
    expect(bought.body.items).toHaveLength(1);
    expect(bought.body.items[0]).toMatchObject({
      description: 'Mal alışı - 676',
      amount: 41000,
      source: 'wagon',
      affectsBalance: false,
      type: 'other',
    });

    const sold = await authed(app, user)
      .get(`/api/v1/transactions?contactId=${namiq.id}`)
      .expect(200);
    expect(sold.body.items[0].description).toBe('Mal satışı - 676');

    // The wagon moved no cash, so the till and the month stay at zero.
    const cash = await authed(app, user).get('/api/v1/transactions/cash').expect(200);
    expect(cash.body).toMatchObject({ income: 0, expense: 0, net: 0 });

    // And the rows are hidden from the day report, which is a cash report.
    const today = new Date().toISOString().slice(0, 10);
    const day = await authed(app, user)
      .get(`/api/v1/transactions?date=${today}&source=manual`)
      .expect(200);
    expect(day.body.items).toHaveLength(0);

    // They belong to the wagon and cannot be edited or deleted on their own.
    const rowId = bought.body.items[0].id;
    await authed(app, user)
      .patch(`/api/v1/transactions/${rowId}`)
      .send({ amount: 5 })
      .expect(400);
    await authed(app, user).delete(`/api/v1/transactions/${rowId}`).expect(400);

    // Editing the wagon rewrites them rather than piling up duplicates.
    await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ buyPrice: 210 })
      .expect(200);
    const afterEdit = await authed(app, user)
      .get(`/api/v1/transactions?contactId=${etibar.id}`)
      .expect(200);
    expect(afterEdit.body.items).toHaveLength(1);
    expect(afterEdit.body.items[0].amount).toBe(43050);

    // Renaming the wagon updates the text.
    await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ name: '999' })
      .expect(200);
    const renamed = await authed(app, user)
      .get(`/api/v1/transactions?contactId=${etibar.id}`)
      .expect(200);
    expect(renamed.body.items[0].description).toBe('Mal alışı - 999');

    // Deleting the wagon takes its rows with it.
    await authed(app, user).delete(`/api/v1/wagons/${wagon.body.id}`).expect(204);
    const gone = await authed(app, user)
      .get(`/api/v1/transactions?contactId=${etibar.id}`)
      .expect(200);
    expect(gone.body.items).toHaveLength(0);
  });

  it('removes the row when a side loses its contact', async () => {
    const user = await registerUser(app);
    const wagon = await authed(app, user)
      .post('/api/v1/wagons')
      .send({ name: '682', buyVolume: 100, buyPrice: 10, boughtFrom: 'Etibar' })
      .expect(201);
    const contacts = await authed(app, user).get('/api/v1/contacts').expect(200);
    const etibar = contacts.body.find((c: { name: string }) => c.name === 'Etibar');
    expect(
      (await authed(app, user).get(`/api/v1/transactions?contactId=${etibar.id}`)).body.items,
    ).toHaveLength(1);

    await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ boughtFrom: null })
      .expect(200);

    const after = await authed(app, user)
      .get(`/api/v1/transactions?contactId=${etibar.id}`)
      .expect(200);
    expect(after.body.items).toHaveLength(0);
    expect(await contactBalance(app, user, 'Etibar')).toBe(0);
  });

  it('back-fills the row for a wagon that predates the feature, without double-billing', async () => {
    const user = await registerUser(app);
    const wagon = await authed(app, user)
      .post('/api/v1/wagons')
      .send({ name: '683', buyVolume: 1, buyPrice: 15129, boughtFrom: 'Etibar' })
      .expect(201);
    expect(await contactBalance(app, user, 'Etibar')).toBe(-15129);

    // Simulate a wagon created before this feature existed: the balance was
    // applied, but no explanatory row was ever written.
    const dataSource = app.get(DataSource);
    await dataSource.query(
      `DELETE FROM transactions WHERE wagon_id = $1 AND source = 'wagon'`,
      [wagon.body.id],
    );
    const contacts = await authed(app, user).get('/api/v1/contacts').expect(200);
    const etibar = contacts.body.find((c: { name: string }) => c.name === 'Etibar');
    expect(
      (await authed(app, user).get(`/api/v1/transactions?contactId=${etibar.id}`)).body
        .items,
    ).toHaveLength(0);

    // Re-saving the wagon from the app back-fills the row and leaves the
    // balance exactly where it was — reversed and re-applied, not applied twice.
    await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({
        name: '683',
        buyVolume: 1,
        buyPrice: 15129,
        boughtFrom: 'Etibar',
        applyBuyToBalance: true,
      })
      .expect(200);

    expect(await contactBalance(app, user, 'Etibar')).toBe(-15129);
    const rows = await authed(app, user)
      .get(`/api/v1/transactions?contactId=${etibar.id}`)
      .expect(200);
    expect(rows.body.items).toHaveLength(1);
    expect(rows.body.items[0].description).toBe('Mal alışı - 683');
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
