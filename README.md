# hesab_kitab — Backend

NestJS + PostgreSQL backend for the **hesab_kitab** mobile application: a personal
ledger for wagon trading with contact debt balances, dated transactions and
dual-currency (USD/AZN) support.

## Stack

- **NestJS 11** (TypeScript, strict mode), **TypeORM** with versioned SQL migrations
- **PostgreSQL 16**
- **Auth**: username + password (argon2id), short-lived JWT access tokens,
  rotating opaque refresh tokens (sliding 30-day expiry, stored hashed)
- **Encryption**: contact phone numbers encrypted at rest (AES-256-GCM)
- **Vitest** unit + e2e tests, **ESLint** (typed rules), Swagger docs at `/docs`
- Fully dockerised: multi-stage non-root image with healthcheck + compose stacks

## Domain model

| Entity | Notes |
|---|---|
| `users` | username (unique), full name, optional note |
| `contacts` | per-user, unique name (case-insensitive), signed `owes_us` balance, encrypted phone |
| `wagons` | buy side and/or sell side (volume × price), linked to contacts by FK, `open`/`closed` |
| `transactions` | `income`/`expense`/`other`, calendar date, optional contact + wagon links |
| `settings` | primary/secondary currency + manual exchange rate, auto-created at signup |

### Business rules

- `owes_us > 0` → the contact owes us; `< 0` → we owe the contact.
- Buying a wagon from a contact **decreases** their `owes_us` by the buy total;
  selling to a contact **increases** it by the sell total. Either side can be
  added later, and balances update automatically. `applyBuyToBalance` /
  `applySellToBalance: false` records a cash deal with no debt effect.
- `income` with a contact settles their debt (`owes_us −= amount`);
  `expense` settles ours (`owes_us += amount`); `other` is list-only.
- Contacts referenced by name (`boughtFrom`/`soldTo`) are auto-created.
- Every applied balance delta is stored (`*_applied_amount`) so edits and
  deletes reverse effects exactly. All balance mutations run in DB transactions
  with row locks (`SELECT … FOR UPDATE`).
- Amounts in the secondary currency are converted to the primary one using the
  manual rate from settings (e.g. `1 USD = 1.70 AZN`).
- Deleting a user cascades to all their data; deleting a contact keeps
  wagons/transactions (links are nulled).

### Performance

- B-tree index on `transactions(user_id, date)` for calendar/range queries,
  plus indexes on every FK and `wagons(user_id, status)`.
- Money is `NUMERIC(14,2)` (never floats); arithmetic goes through big.js.

## API overview

All routes under `/api/v1`, JWT-protected unless noted. Interactive docs: `/docs`.

```
POST   /auth/signup | /auth/login | /auth/refresh | /auth/logout   (public)
GET    /health                                                     (public)
GET|PATCH|DELETE /users/me        PATCH /users/me/password
CRUD   /contacts                  GET /contacts/summary
CRUD   /wagons?status=open
CRUD   /transactions?from&to&date&type&contactId&wagonId&page&limit
GET    /transactions/summary?year=2026&month=7
GET|PATCH /settings
```

## Development

```bash
cp .env.example .env                      # fill in secrets (see below)
docker compose -f docker-compose.dev.yml up -d   # Postgres on 5432 + test DB on 5433
pnpm install
pnpm start:dev                            # API on http://localhost:3000
```

### Tests

```bash
pnpm test        # unit tests
pnpm test:e2e    # e2e — needs the db-test container from docker-compose.dev.yml
pnpm lint
```

The e2e suite (43 tests) covers auth flows, token rotation, user isolation,
encryption-at-rest, every balance rule, currency conversion and cascades.

## Production deployment (VPS)

```bash
# on the server
git clone <repo> && cd backend
cp .env.example .env
# generate strong secrets:
#   DB_PASSWORD:       openssl rand -hex 24
#   JWT_ACCESS_SECRET: openssl rand -hex 64
#   ENCRYPTION_KEY:    openssl rand -hex 32   (exactly 64 hex chars — BACK IT UP)
docker compose up -d --build
curl http://localhost:3000/health
```

- Migrations run automatically at startup (`DB_MIGRATIONS_RUN=true`).
- Postgres is not exposed outside the compose network.
- Put a reverse proxy (Caddy/nginx) with TLS in front of port 3000 and set
  `CORS_ORIGINS` accordingly. Example Caddyfile:

  ```
  api.example.com {
      reverse_proxy localhost:3000
  }
  ```

- **Backups**: the database lives in the `pgdata` volume. Nightly dump example:

  ```bash
  docker compose exec -T db pg_dump -U hesab hesab_kitab | gzip > backup_$(date +%F).sql.gz
  ```

- **Losing `ENCRYPTION_KEY` makes encrypted phone numbers unrecoverable, and
  changing it breaks decryption of existing rows** — store it in a password
  manager alongside `DB_PASSWORD`.

### Environment variables

See [.env.example](.env.example) — every variable is validated at boot
(the app refuses to start with missing/weak configuration).

## Migrations

```bash
pnpm migration:generate src/migrations/MyChange   # diff entities vs DB
pnpm migration:run
pnpm migration:revert
```

New migrations must be registered in `src/database/data-source.ts` (`migrations` array).
# hesab_kitab_backend
