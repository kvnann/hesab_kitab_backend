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

async function createContact(
  app: INestApplication<App>,
  user: TestUser,
  name: string,
  initialBalance = 0,
): Promise<{ id: string; owesUs: number }> {
  const response = await authed(app, user)
    .post('/api/v1/contacts')
    .send({ name, initialBalance })
    .expect(201);
  return response.body;
}

async function getBalance(
  app: INestApplication<App>,
  user: TestUser,
  contactId: string,
): Promise<number> {
  const response = await authed(app, user)
    .get(`/api/v1/contacts/${contactId}`)
    .expect(200);
  return response.body.owesUs;
}

describe('Transactions (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('creates a transaction by contactName, auto-creating the contact', async () => {
    const user = await registerUser(app);
    const tx = await authed(app, user)
      .post('/api/v1/transactions')
      .send({ type: 'expense', amount: 300, date: '2026-07-27', contactName: 'Yeni Adam' })
      .expect(201);
    expect(tx.body.contact.name).toBe('Yeni Adam');
    expect(await getBalance(app, user, tx.body.contact.id)).toBe(300);

    // Same name (case-insensitive) reuses the contact.
    await authed(app, user)
      .post('/api/v1/transactions')
      .send({ type: 'expense', amount: 200, date: '2026-07-28', contactName: 'yeni adam' })
      .expect(201);
    const contacts = await authed(app, user).get('/api/v1/contacts').expect(200);
    expect(contacts.body).toHaveLength(1);
    expect(contacts.body[0].owesUs).toBe(500);
  });

  it('income from a contact settles their debt', async () => {
    const user = await registerUser(app);
    const contact = await createContact(app, user, 'Kənan', 4000);

    const response = await authed(app, user)
      .post('/api/v1/transactions')
      .send({
        type: 'income',
        amount: 2000,
        date: '2026-07-27',
        contactId: contact.id,
        description: 'Vaqon 676 üzrə ödəniş',
      })
      .expect(201);
    expect(response.body.contact.name).toBe('Kənan');

    expect(await getBalance(app, user, contact.id)).toBe(2000);
  });

  it('expense paid to a contact reduces our debt (owes_us increases)', async () => {
    const user = await registerUser(app);
    const contact = await createContact(app, user, 'Vəli');

    await authed(app, user)
      .post('/api/v1/transactions')
      .send({ type: 'expense', amount: 2000, date: '2026-07-27', contactId: contact.id })
      .expect(201);

    expect(await getBalance(app, user, contact.id)).toBe(2000);
  });

  it("affectsBalance=false ('Digər') income/expense never touches balances", async () => {
    const user = await registerUser(app);
    const contact = await createContact(app, user, 'Digər Contact', 1000);

    const tx = await authed(app, user)
      .post('/api/v1/transactions')
      .send({
        type: 'income',
        amount: 500,
        date: '2026-07-27',
        contactId: contact.id,
        affectsBalance: false,
      })
      .expect(201);
    expect(tx.body.affectsBalance).toBe(false);
    expect(await getBalance(app, user, contact.id)).toBe(1000);

    // Editing keeps it list-only.
    await authed(app, user)
      .patch(`/api/v1/transactions/${tx.body.id}`)
      .send({ amount: 900 })
      .expect(200);
    expect(await getBalance(app, user, contact.id)).toBe(1000);

    // Flipping the flag on applies the effect; still counted in summaries.
    await authed(app, user)
      .patch(`/api/v1/transactions/${tx.body.id}`)
      .send({ affectsBalance: true })
      .expect(200);
    expect(await getBalance(app, user, contact.id)).toBe(100);

    const summary = await authed(app, user)
      .get('/api/v1/transactions/summary?year=2026&month=7')
      .expect(200);
    expect(summary.body.income).toBe(900);
  });

  it("'other' transactions never touch balances", async () => {
    const user = await registerUser(app);
    const contact = await createContact(app, user, 'Qabil', 1000);

    await authed(app, user)
      .post('/api/v1/transactions')
      .send({ type: 'other', amount: 500, date: '2026-07-27', contactId: contact.id })
      .expect(201);

    expect(await getBalance(app, user, contact.id)).toBe(1000);
  });

  it('converts manat amounts through the manual rate', async () => {
    const user = await registerUser(app);
    const contact = await createContact(app, user, 'AZN Contact');

    await authed(app, user)
      .post('/api/v1/transactions')
      .send({
        type: 'income',
        amount: 1700,
        currency: 'manat',
        date: '2026-07-27',
        contactId: contact.id,
      })
      .expect(201);

    // 1700 AZN = 1000 USD at 1.70 → income settles debt → −1000.
    expect(await getBalance(app, user, contact.id)).toBe(-1000);
  });

  it('recalculates balances on update (amount, type and contact changes)', async () => {
    const user = await registerUser(app);
    const contact = await createContact(app, user, 'C1', 1000);

    const tx = await authed(app, user)
      .post('/api/v1/transactions')
      .send({ type: 'income', amount: 300, date: '2026-07-01', contactId: contact.id })
      .expect(201);
    expect(await getBalance(app, user, contact.id)).toBe(700);

    // Change the amount → effect recomputed from scratch.
    await authed(app, user)
      .patch(`/api/v1/transactions/${tx.body.id}`)
      .send({ amount: 500 })
      .expect(200);
    expect(await getBalance(app, user, contact.id)).toBe(500);

    // Flip to 'other' → effect fully reversed.
    await authed(app, user)
      .patch(`/api/v1/transactions/${tx.body.id}`)
      .send({ type: 'other' })
      .expect(200);
    expect(await getBalance(app, user, contact.id)).toBe(1000);

    // Move it to a different contact as an expense.
    const second = await createContact(app, user, 'C2');
    await authed(app, user)
      .patch(`/api/v1/transactions/${tx.body.id}`)
      .send({ type: 'expense', contactId: second.id })
      .expect(200);
    expect(await getBalance(app, user, contact.id)).toBe(1000);
    expect(await getBalance(app, user, second.id)).toBe(500);
  });

  it('reverses the balance effect on delete', async () => {
    const user = await registerUser(app);
    const contact = await createContact(app, user, 'Del Contact');

    const tx = await authed(app, user)
      .post('/api/v1/transactions')
      .send({ type: 'expense', amount: 750, date: '2026-07-02', contactId: contact.id })
      .expect(201);
    expect(await getBalance(app, user, contact.id)).toBe(750);

    await authed(app, user).delete(`/api/v1/transactions/${tx.body.id}`).expect(204);
    expect(await getBalance(app, user, contact.id)).toBe(0);
  });

  it('links transactions to owned wagons only', async () => {
    const user = await registerUser(app);
    const other = await registerUser(app);
    const wagon = await authed(app, user)
      .post('/api/v1/wagons')
      .send({ name: 'Vaqon 676', buyVolume: 1, buyPrice: 1 })
      .expect(201);

    const tx = await authed(app, user)
      .post('/api/v1/transactions')
      .send({ type: 'other', amount: 10, date: '2026-07-03', wagonId: wagon.body.id })
      .expect(201);
    expect(tx.body.wagon.name).toBe('Vaqon 676');

    // Another user cannot reference a wagon they do not own.
    await authed(app, other)
      .post('/api/v1/transactions')
      .send({ type: 'other', amount: 10, date: '2026-07-03', wagonId: wagon.body.id })
      .expect(404);

    // Nor a contact that is not theirs.
    const contact = await createContact(app, user, 'NotYours');
    await authed(app, other)
      .post('/api/v1/transactions')
      .send({ type: 'income', amount: 10, date: '2026-07-03', contactId: contact.id })
      .expect(404);
  });

  it('filters by date range and paginates', async () => {
    const user = await registerUser(app);
    for (const [date, amount] of [
      ['2026-07-24', 450],
      ['2026-07-25', 100],
      ['2026-07-26', 2000],
      ['2026-07-27', 3000],
    ] as const) {
      await authed(app, user)
        .post('/api/v1/transactions')
        .send({ type: 'expense', amount, date })
        .expect(201);
    }

    const ranged = await authed(app, user)
      .get('/api/v1/transactions?from=2026-07-25&to=2026-07-26')
      .expect(200);
    expect(ranged.body.total).toBe(2);
    expect(ranged.body.items.map((t: { date: string }) => t.date).sort()).toEqual([
      '2026-07-25',
      '2026-07-26',
    ]);

    const paged = await authed(app, user)
      .get('/api/v1/transactions?page=2&limit=3')
      .expect(200);
    expect(paged.body.total).toBe(4);
    expect(paged.body.items).toHaveLength(1);
    expect(paged.body.totalPages).toBe(2);

    const exact = await authed(app, user)
      .get('/api/v1/transactions?date=2026-07-27')
      .expect(200);
    expect(exact.body.total).toBe(1);
    expect(exact.body.items[0].amount).toBe(3000);
  });

  it('produces the month summary for the calendar screen', async () => {
    const user = await registerUser(app);
    const entries = [
      { type: 'income', amount: 8000, date: '2026-07-27' },
      { type: 'expense', amount: 10000, date: '2026-07-27' },
      { type: 'income', amount: 2000, date: '2026-07-26' },
      { type: 'expense', amount: 450, date: '2026-07-24' },
      // Manat income: 1700 AZN = 1000 USD at the default 1.70 rate.
      { type: 'income', amount: 1700, currency: 'manat', date: '2026-07-24' },
      // Outside the requested month — must be excluded.
      { type: 'income', amount: 99999, date: '2026-08-01' },
    ];
    for (const entry of entries) {
      await authed(app, user).post('/api/v1/transactions').send(entry).expect(201);
    }

    const summary = await authed(app, user)
      .get('/api/v1/transactions/summary?year=2026&month=7')
      .expect(200);

    expect(summary.body.income).toBe(8000 + 2000 + 1000);
    expect(summary.body.expense).toBe(10450);
    expect(summary.body.net).toBe(550);
    expect(summary.body.days).toHaveLength(3);

    const day27 = summary.body.days.find((d: { date: string }) => d.date === '2026-07-27');
    expect(day27).toMatchObject({ income: 8000, expense: 10000, net: -2000, count: 2 });

    const day24 = summary.body.days.find((d: { date: string }) => d.date === '2026-07-24');
    expect(day24).toMatchObject({ income: 1000, expense: 450, net: 550, count: 2 });
  });

  it("deletes a contact's transactions along with the contact", async () => {
    const user = await registerUser(app);
    const contact = await createContact(app, user, 'Ephemeral');
    const other = await createContact(app, user, 'Survivor');

    const tx = await authed(app, user)
      .post('/api/v1/transactions')
      .send({ type: 'income', amount: 100, date: '2026-07-10', contactId: contact.id })
      .expect(201);
    const unrelated = await authed(app, user)
      .post('/api/v1/transactions')
      .send({ type: 'income', amount: 70, date: '2026-07-10', contactId: other.id })
      .expect(201);

    await authed(app, user).delete(`/api/v1/contacts/${contact.id}`).expect(204);

    await authed(app, user).get(`/api/v1/transactions/${tx.body.id}`).expect(404);
    // Only that contact's history goes; everything else is untouched.
    await authed(app, user).get(`/api/v1/transactions/${unrelated.body.id}`).expect(200);

    const day = await authed(app, user)
      .get('/api/v1/transactions?date=2026-07-10')
      .expect(200);
    expect(day.body.items).toHaveLength(1);
    expect(day.body.items[0].id).toBe(unrelated.body.id);

    const summary = await authed(app, user)
      .get('/api/v1/transactions/summary?year=2026&month=7')
      .expect(200);
    expect(summary.body.income).toBe(70);
  });

  it('resolves contactName on update, creating the contact when new', async () => {
    const user = await registerUser(app);
    const original = await createContact(app, user, 'Original');
    const tx = await authed(app, user)
      .post('/api/v1/transactions')
      .send({ type: 'income', amount: 500, date: '2026-07-11', contactId: original.id })
      .expect(201);

    // Income settles the debt, so the first contact went 500 below zero.
    const before = await authed(app, user)
      .get(`/api/v1/contacts/${original.id}`)
      .expect(200);
    expect(before.body.owesUs).toBe(-500);

    const moved = await authed(app, user)
      .patch(`/api/v1/transactions/${tx.body.id}`)
      .send({ contactName: 'Brand New' })
      .expect(200);
    expect(moved.body.contact.name).toBe('Brand New');

    // The old contact is made whole and the new one carries the effect.
    const after = await authed(app, user)
      .get(`/api/v1/contacts/${original.id}`)
      .expect(200);
    expect(after.body.owesUs).toBe(0);

    const created = await authed(app, user)
      .get(`/api/v1/contacts/${moved.body.contact.id}`)
      .expect(200);
    expect(created.body.owesUs).toBe(-500);
  });

  it('deleting a transaction reverses the balance it applied', async () => {
    const user = await registerUser(app);
    const contact = await createContact(app, user, 'Reversible');
    const tx = await authed(app, user)
      .post('/api/v1/transactions')
      .send({ type: 'expense', amount: 320, date: '2026-07-12', contactId: contact.id })
      .expect(201);

    const owed = await authed(app, user).get(`/api/v1/contacts/${contact.id}`).expect(200);
    expect(owed.body.owesUs).toBe(320);

    await authed(app, user).delete(`/api/v1/transactions/${tx.body.id}`).expect(204);

    const settled = await authed(app, user)
      .get(`/api/v1/contacts/${contact.id}`)
      .expect(200);
    expect(settled.body.owesUs).toBe(0);
    // The contact itself survives its transaction being removed.
    expect(settled.body.name).toBe('Reversible');
  });

  it('has the b-tree index on (user_id, date)', async () => {
    const dataSource = app.get(DataSource);
    const rows = await dataSource.query<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes
       WHERE tablename = 'transactions' AND indexname = 'idx_transactions_user_date'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain('USING btree (user_id, date)');
  });
});
