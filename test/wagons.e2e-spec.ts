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

    expect(await contactBalance(app, user, 'Kənan')).toBe(-41000);
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
    const wagon = await authed(app, user)
      .post('/api/v1/wagons')
      .send({ name: '676', buyVolume: 205, buyPrice: 200 })
      .expect(201);
    expect(wagon.body.boughtFrom).toBeNull();

    await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ buyVolume: 205, buyPrice: 200, boughtFrom: 'Etibar' })
      .expect(200);
    expect(await contactBalance(app, user, 'Etibar')).toBe(-41000);

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
      type: 'income',
    });

    const sold = await authed(app, user)
      .get(`/api/v1/transactions?contactId=${namiq.id}`)
      .expect(200);
    expect(sold.body.items[0].description).toBe('Mal satışı - 676');

    const cash = await authed(app, user).get('/api/v1/transactions/cash').expect(200);
    expect(cash.body).toMatchObject({ income: 0, expense: 0, net: 0 });

    const today = new Date().toISOString().slice(0, 10);
    const day = await authed(app, user)
      .get(`/api/v1/transactions?date=${today}&source=manual`)
      .expect(200);
    expect(day.body.items).toHaveLength(0);

    const rowId = bought.body.items[0].id;
    await authed(app, user)
      .patch(`/api/v1/transactions/${rowId}`)
      .send({ amount: 5 })
      .expect(400);
    await authed(app, user).delete(`/api/v1/transactions/${rowId}`).expect(400);

    await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ buyPrice: 210 })
      .expect(200);
    const afterEdit = await authed(app, user)
      .get(`/api/v1/transactions?contactId=${etibar.id}`)
      .expect(200);
    expect(afterEdit.body.items).toHaveLength(1);
    expect(afterEdit.body.items[0].amount).toBe(43050);

    await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ name: '999' })
      .expect(200);
    const renamed = await authed(app, user)
      .get(`/api/v1/transactions?contactId=${etibar.id}`)
      .expect(200);
    expect(renamed.body.items[0].description).toBe('Mal alışı - 999');

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

  it('treats a wagon with no customs exactly as before', async () => {
    const user = await registerUser(app);
    const wagon = await authed(app, user)
      .post('/api/v1/wagons')
      .send({ name: '697', buyVolume: 100, buyPrice: 10, boughtFrom: 'Etibar' })
      .expect(201);
    expect(wagon.body.customsExpense).toBeNull();
    expect(wagon.body.customsThroughCash).toBe(true);
    expect(await contactBalance(app, user, 'Etibar')).toBe(-1000);
  });

  it('sends each wagon side through the till only when asked', async () => {
    const user = await registerUser(app);
    const wagon = await authed(app, user)
      .post('/api/v1/wagons')
      .send({
        name: '700',
        buyVolume: 205,
        buyPrice: 200,
        boughtFrom: 'Etibar',
        sellVolume: 200,
        sellPrice: 200,
        soldTo: 'Namiq',
      })
      .expect(201);

    expect((await authed(app, user).get('/api/v1/transactions/cash')).body.net).toBe(0);

    await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ buyThroughCash: true })
      .expect(200);
    expect((await authed(app, user).get('/api/v1/transactions/cash')).body.net).toBe(-41000);

    await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ sellThroughCash: true })
      .expect(200);
    const both = await authed(app, user).get('/api/v1/transactions/cash').expect(200);
    expect(both.body).toMatchObject({ income: 40000, expense: 41000, net: -1000 });

    expect(await contactBalance(app, user, 'Etibar')).toBe(-41000);
    expect(await contactBalance(app, user, 'Namiq')).toBe(40000);
  });

  it('accepts the till flags at creation time', async () => {
    const user = await registerUser(app);
    await authed(app, user)
      .post('/api/v1/wagons')
      .send({
        name: '701',
        buyVolume: 100,
        buyPrice: 10,
        boughtFrom: 'Etibar',
        buyThroughCash: true,
      })
      .expect(201);
    expect((await authed(app, user).get('/api/v1/transactions/cash')).body.net).toBe(-1000);
  });

  it('flips the wagon side when its row is dropped from the till', async () => {
    const user = await registerUser(app);
    const wagon = await authed(app, user)
      .post('/api/v1/wagons')
      .send({
        name: '702',
        sellVolume: 100,
        sellPrice: 10,
        soldTo: 'Namiq',
        sellThroughCash: true,
      })
      .expect(201);
    expect((await authed(app, user).get('/api/v1/transactions/cash')).body.net).toBe(1000);

    const contacts = await authed(app, user).get('/api/v1/contacts').expect(200);
    const namiq = contacts.body.find((c: { name: string }) => c.name === 'Namiq');
    const rows = await authed(app, user)
      .get(`/api/v1/transactions?contactId=${namiq.id}`)
      .expect(200);
    const row = rows.body.items[0];
    expect(row.wagonSide).toBe('sell');

    await authed(app, user)
      .patch(`/api/v1/transactions/${row.id}/cash`)
      .send({ affectsCash: false })
      .expect(200);
    expect((await authed(app, user).get('/api/v1/transactions/cash')).body.net).toBe(0);

    const reread = await authed(app, user)
      .get(`/api/v1/wagons/${wagon.body.id}`)
      .expect(200);
    expect(reread.body.sellThroughCash).toBe(false);

    await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ description: 'qeyd' })
      .expect(200);
    expect((await authed(app, user).get('/api/v1/transactions/cash')).body.net).toBe(0);
  });

  it('removes the till effect when the wagon is deleted', async () => {
    const user = await registerUser(app);
    const wagon = await authed(app, user)
      .post('/api/v1/wagons')
      .send({
        name: '704',
        buyVolume: 100,
        buyPrice: 10,
        boughtFrom: 'Etibar',
        buyThroughCash: true,
      })
      .expect(201);
    expect((await authed(app, user).get('/api/v1/transactions/cash')).body.net).toBe(-1000);

    await authed(app, user).delete(`/api/v1/wagons/${wagon.body.id}`).expect(204);
    expect((await authed(app, user).get('/api/v1/transactions/cash')).body.net).toBe(0);
  });

  it('starts in Russia and moves freely between any two points', async () => {
    const user = await registerUser(app);
    const wagon = await authed(app, user)
      .post('/api/v1/wagons')
      .send({ name: '720', buyVolume: 100, buyPrice: 10, boughtFrom: 'Etibar' })
      .expect(201);
    expect(wagon.body.location).toBe('russia');
    expect(await contactBalance(app, user, 'Etibar')).toBe(-1000);

    const moved = await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ location: 'iran' })
      .expect(200);
    expect(moved.body.location).toBe('iran');

    const back = await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ location: 'azerbaijan' })
      .expect(200);
    expect(back.body.location).toBe('azerbaijan');

    expect(await contactBalance(app, user, 'Etibar')).toBe(-1000);
    expect((await authed(app, user).get('/api/v1/transactions/cash')).body.net).toBe(0);

    await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ location: 'nowhere' })
      .expect(400);
  });

  it('accepts a starting location at creation', async () => {
    const user = await registerUser(app);
    const wagon = await authed(app, user)
      .post('/api/v1/wagons')
      .send({ name: '721', buyVolume: 1, buyPrice: 1, location: 'azerbaijan' })
      .expect(201);
    expect(wagon.body.location).toBe('azerbaijan');
  });

  it('keeps decimals on the inputs but floors the totals and the debts', async () => {
    const user = await registerUser(app);
    const wagon = await authed(app, user)
      .post('/api/v1/wagons')
      .send({
        name: '730',
        buyVolume: 205.5,
        buyPrice: 199.99,
        boughtFrom: 'Etibar',
        sellVolume: 200.25,
        sellPrice: 210.5,
        soldTo: 'Namiq',
      })
      .expect(201);

    expect(wagon.body.buyVolume).toBe(205.5);
    expect(wagon.body.buyPrice).toBe(199.99);
    expect(wagon.body.sellVolume).toBe(200.25);
    expect(wagon.body.sellPrice).toBe(210.5);

    expect(wagon.body.buyTotal).toBe(41097);
    expect(wagon.body.sellTotal).toBe(42152);
    expect(wagon.body.difference).toBe(1055);

    expect(await contactBalance(app, user, 'Etibar')).toBe(-41097);
    expect(await contactBalance(app, user, 'Namiq')).toBe(42152);

    const contacts = await authed(app, user).get('/api/v1/contacts').expect(200);
    const etibar = contacts.body.find((c: { name: string }) => c.name === 'Etibar');
    const rows = await authed(app, user)
      .get(`/api/v1/transactions?contactId=${etibar.id}`)
      .expect(200);
    expect(rows.body.items[0].amount).toBe(41097);
  });

  it('lists open wagons oldest first and the archive newest archived first', async () => {
    const user = await registerUser(app);
    const ids: string[] = [];
    for (const name of ['first', 'second', 'third']) {
      const created = await authed(app, user)
        .post('/api/v1/wagons')
        .send({ name, buyVolume: 1, buyPrice: 1 })
        .expect(201);
      ids.push(created.body.id);
    }

    const open = await authed(app, user).get('/api/v1/wagons?status=open').expect(200);
    expect(open.body.map((w: { name: string }) => w.name)).toEqual([
      'first',
      'second',
      'third',
    ]);

    await authed(app, user)
      .patch(`/api/v1/wagons/${ids[2]}`)
      .send({ status: 'closed' })
      .expect(200);
    await authed(app, user)
      .patch(`/api/v1/wagons/${ids[0]}`)
      .send({ status: 'closed' })
      .expect(200);

    const archived = await authed(app, user)
      .get('/api/v1/wagons?status=closed')
      .expect(200);
    expect(archived.body.map((w: { name: string }) => w.name)).toEqual([
      'first',
      'third',
    ]);
    expect(archived.body[0].archivedAt).not.toBeNull();

    await authed(app, user)
      .patch(`/api/v1/wagons/${ids[2]}`)
      .send({ description: 'sonradan qeyd' })
      .expect(200);
    const after = await authed(app, user)
      .get('/api/v1/wagons?status=closed')
      .expect(200);
    expect(after.body.map((w: { name: string }) => w.name)).toEqual(['first', 'third']);

    const restored = await authed(app, user)
      .patch(`/api/v1/wagons/${ids[0]}`)
      .send({ status: 'open' })
      .expect(200);
    expect(restored.body.archivedAt).toBeNull();
    const reopened = await authed(app, user).get('/api/v1/wagons?status=open').expect(200);
    expect(reopened.body.map((w: { name: string }) => w.name)).toEqual([
      'first',
      'second',
    ]);
  });

  it('stamps the date each time the wagon reaches a location', async () => {
    const user = await registerUser(app);
    const today = new Date().toISOString().slice(0, 10);

    const wagon = await authed(app, user)
      .post('/api/v1/wagons')
      .send({ name: '740', buyVolume: 1, buyPrice: 1 })
      .expect(201);
    expect(wagon.body.location).toBe('russia');
    expect(wagon.body.locationDates).toEqual({ russia: today });

    const moved = await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ location: 'azerbaijan' })
      .expect(200);
    expect(moved.body.locationDates).toEqual({ russia: today, azerbaijan: today });

    // An edit that does not move the wagon must not add a stamp.
    const edited = await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ description: 'qeyd', location: 'azerbaijan' })
      .expect(200);
    expect(edited.body.locationDates).toEqual({ russia: today, azerbaijan: today });

    // Skipping ahead stamps only the place it arrived at.
    const toIran = await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ location: 'iran' })
      .expect(200);
    expect(toIran.body.locationDates).toEqual({
      russia: today,
      azerbaijan: today,
      iran: today,
    });
  });

  it('keeps earlier stamps when the wagon goes back', async () => {
    const user = await registerUser(app);
    const today = new Date().toISOString().slice(0, 10);
    const wagon = await authed(app, user)
      .post('/api/v1/wagons')
      .send({ name: '741', buyVolume: 1, buyPrice: 1, location: 'iran' })
      .expect(201);
    expect(wagon.body.locationDates).toEqual({ iran: today });

    const back = await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ location: 'russia' })
      .expect(200);
    expect(back.body.location).toBe('russia');
    expect(back.body.locationDates).toEqual({ iran: today, russia: today });
  });

  it('pays customs out of the till and leaves every balance alone', async () => {
    const user = await registerUser(app);
    const wagon = await authed(app, user)
      .post('/api/v1/wagons')
      .send({
        name: '750',
        buyVolume: 100,
        buyPrice: 10,
        boughtFrom: 'Etibar',
        sellVolume: 100,
        sellPrice: 15,
        soldTo: 'Namiq',
        customsExpense: 200,
      })
      .expect(201);
    expect(wagon.body.customsThroughCash).toBe(true);

    // Nobody is billed for customs any more.
    expect(await contactBalance(app, user, 'Etibar')).toBe(-1000);
    expect(await contactBalance(app, user, 'Namiq')).toBe(1500);

    // It comes out of the pocket instead.
    const cash = await authed(app, user).get('/api/v1/transactions/cash').expect(200);
    expect(cash.body.net).toBe(-200);

    // And it still comes off the margin: 1500 − 1000 − 200.
    expect(wagon.body.difference).toBe(300);

    const till = await authed(app, user)
      .get('/api/v1/transactions?affectsCash=true')
      .expect(200);
    expect(till.body.items).toHaveLength(1);
    expect(till.body.items[0]).toMatchObject({
      description: 'Gömrük xərci - 750',
      amount: 200,
      type: 'expense',
      cashAppliedAmount: -200,
      wagonSide: 'customs',
    });
    expect(till.body.items[0].contact).toBeNull();
  });

  it('can keep customs off the till', async () => {
    const user = await registerUser(app);
    const wagon = await authed(app, user)
      .post('/api/v1/wagons')
      .send({
        name: '751',
        buyVolume: 100,
        buyPrice: 10,
        boughtFrom: 'Etibar',
        customsExpense: 300,
        customsThroughCash: false,
      })
      .expect(201);
    expect((await authed(app, user).get('/api/v1/transactions/cash')).body.net).toBe(0);

    // Turning it on later creates the till entry.
    await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ customsThroughCash: true })
      .expect(200);
    expect((await authed(app, user).get('/api/v1/transactions/cash')).body.net).toBe(-300);

    // Clearing the cost removes it again.
    await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ customsExpense: null })
      .expect(200);
    expect((await authed(app, user).get('/api/v1/transactions/cash')).body.net).toBe(0);
  });

  it('takes the customs till entry away with the wagon', async () => {
    const user = await registerUser(app);
    const wagon = await authed(app, user)
      .post('/api/v1/wagons')
      .send({ name: '752', buyVolume: 1, buyPrice: 1, customsExpense: 50 })
      .expect(201);
    expect((await authed(app, user).get('/api/v1/transactions/cash')).body.net).toBe(-50);

    await authed(app, user).delete(`/api/v1/wagons/${wagon.body.id}`).expect(204);
    expect((await authed(app, user).get('/api/v1/transactions/cash')).body.net).toBe(0);
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

    const archived = await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ status: 'closed' })
      .expect(200);
    expect(archived.body.status).toBe('closed');
    expect(await contactBalance(app, user, 'S')).toBe(-1000);
    expect(await contactBalance(app, user, 'B')).toBe(1100);

    const open = await authed(app, user).get('/api/v1/wagons?status=open').expect(200);
    expect(open.body.some((w: { id: string }) => w.id === wagon.body.id)).toBe(false);
    const closed = await authed(app, user)
      .get('/api/v1/wagons?status=closed')
      .expect(200);
    expect(closed.body.some((w: { id: string }) => w.id === wagon.body.id)).toBe(true);

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

    await authed(app, user)
      .patch('/api/v1/settings')
      .send({ exchangeRate: 2 })
      .expect(200);

    await authed(app, user)
      .patch(`/api/v1/wagons/${wagon.body.id}`)
      .send({ status: 'closed' })
      .expect(200);
    expect(await contactBalance(app, user, 'Rate Buyer')).toBe(1000);

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
