# Booking API

Server-side booking service: Node.js, Express 5, Prisma 7, PostgreSQL.

## Setup
```
cp .env.example .env
npm install      # also generates the Prisma client
npm start        # starts dev DB (docker), applies migrations, runs on http://localhost:3000
npm test         # starts test DB (docker), applies migrations, runs tests
```
Only the DB needed by the command is started. `npm test` stops the test DB when it passes; `npm run db:stop` stops all DB containers. `npm run dev` is `start` with auto-restart.
The test DB has no volume, so its data is discarded when its container is recreated.

After changing `prisma/schema.prisma`, create a migration with `npx prisma migrate dev --name <change>`; `npm start` and `npm test` apply pending migrations (`prisma migrate deploy`) to their DB.

## API documentation
Swagger UI: http://localhost:3000/docs (raw OpenAPI JSON: `/docs.json`).
It is generated at startup from the routers and the Zod models in `src/models/`, so new entities appear automatically. Routes added outside `crudRouter` must be described manually in `src/utils/openapi.js`.


## Project layout
- `prisma/schema.prisma` - DB models and relations; `prisma/migrations/` - SQL migrations.
- `src/models/` - Zod request-validation models, one file per entity.
- `src/routes/` - mounts the shared CRUD router with each entity's models.
- `src/controllers/` - shared CRUD handlers (`utils/crud.js`) plus per-entity overrides.
- `src/utils/` - OpenAPI generator, Prisma client, CRUD factory and router, validation and error middleware, event bus.
- `scripts/prepareDb.js` - starts the needed DB container and applies migrations.
- `tests/` - integration tests (`supertest`, run against the test DB).
