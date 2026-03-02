# Mini Job Processing Platform

A background job processing platform built with NestJS that handles task scheduling, prioritization, rate limiting, retries, idempotency, and role-based access control.

## Tech Stack

- **NestJS** — backend framework
- **TypeScript** — type safety
- **PostgreSQL** — primary database
- **TypeORM** — ORM with migration support
- **Redis** — caching and queue backend
- **BullMQ** — job queue and worker management
- **Passport + JWT** — authentication
- **Swagger** — API documentation

## Prerequisites

Make sure you have the following installed:

- Node.js (v18+)
- PostgreSQL (v14+)
- Redis (v7+) — can run via Docker: `docker run -d --name redis -p 6379:6379 redis:7-alpine`

## Setup

1. Clone the repo and install dependencies:

```bash
git clone <repo-url>
cd mini-job-processing-task
npm install
```

2. Create a `.env` file based on the example:

```bash
cp env.example .env
```

Then fill in your values:

```
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_NAME=mini_job_processing

JWT_SECRET=pick-a-strong-random-string
JWT_EXPIRES_IN=30m

REDIS_HOST=localhost
REDIS_PORT=6379

ADMIN_EMAIL=admin@admin.com
ADMIN_PASSWORD=admin123
```

3. Create the database in PostgreSQL:

```sql
CREATE DATABASE mini_job_processing;
```

4. Run migrations:

```bash
npm run migration:run
```

5. Start the app:

```bash
npm run start:dev
```

The server runs on `http://localhost:3000` by default. Swagger docs are available at `http://localhost:3000/api/docs`.

An admin user is automatically created on first startup using the `ADMIN_EMAIL` and `ADMIN_PASSWORD` from your `.env`.

## API Endpoints

### Auth

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/auth/register` | Register a new user | No |
| POST | `/auth/login` | Login and get JWT token | No |

### Tasks

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| POST | `/tasks` | Create a new task | Yes | Any |
| GET | `/tasks` | List tasks (filtered, paginated) | Yes | Any |
| POST | `/tasks/:id/cancel` | Cancel a pending task | Yes | Owner/Admin |
| POST | `/tasks/:id/reprocess` | Reprocess a failed task | Yes | Admin |
| GET | `/tasks/metrics` | Get task statistics | Yes | Admin |

## Architecture

```
src/
├── auth/                  # Authentication module
│   ├── auth.controller    # Login/register endpoints
│   ├── auth.service       # Business logic, password hashing, JWT signing
│   ├── strategies/        # Passport JWT strategy
│   ├── guards/            # JWT auth guard, roles guard
│   ├── decorators/        # @CurrentUser(), @Roles()
│   └── dto/               # Request/response DTOs
├── users/
│   ├── entities/          # User entity (TypeORM)
│   └── enums/             # Role enum (ADMIN, USER)
├── tasks/
│   ├── tasks.controller   # CRUD endpoints with RBAC
│   ├── tasks.service      # Task creation, cancellation, filtering, metrics
│   ├── task.processor     # BullMQ worker — processes jobs via MockService
│   ├── rate-limiter       # Per-type rate limiting using Redis sorted sets
│   ├── entities/          # Task entity with indexes
│   ├── enums/             # TaskStatus, TaskPriority
│   └── dto/               # Create, filter, response, metrics DTOs
├── mock/
│   └── mock.service       # Simulates task processing (2-5s delay, 75% success)
├── common/
│   ├── filters/           # Global exception filter
│   └── dto/               # Shared error response DTO
├── config/
│   ├── database.config    # DB config loaded via ConfigModule
│   └── data-source        # TypeORM CLI data source for migrations
└── migrations/            # Auto-generated TypeORM migrations
```

### How Task Processing Works

1. User creates a task via `POST /tasks`
2. Task is saved to PostgreSQL with status `PENDING`
3. A job is pushed to the BullMQ queue (with priority and optional delay)
4. The worker picks up the job and calls `MockService.processTask()`
5. On success → status becomes `COMPLETED`
6. On failure → retries up to 3 times with exponential backoff (2s, 4s, 8s)
7. If all retries fail → status becomes `FAILED` and the job moves to the dead-letter queue

### Concurrency Safety

The worker uses PostgreSQL `SELECT ... FOR UPDATE` inside a transaction. This means if two workers try to pick up the same task, only one will proceed — the other skips it. This guarantees a task is never processed twice at the same time.

### Rate Limiting

Rate limits are enforced per task type using Redis sorted sets as a sliding window counter:

- `email` type → max 5 per minute
- `report` type → max 2 per minute
- Other types → no limit

When the limit is hit, the job gets re-queued with a calculated delay instead of being dropped.

### Idempotency

Every task requires a unique `idempotencyKey`. If you try to create a task with a key that already exists, you get a `409 Conflict`. This prevents duplicate task creation from retried API calls.

## Design Decisions

**TypeORM with migrations over Prisma** — TypeORM was chosen because the requirements explicitly asked for it. Migrations are generated from entity definitions, so the schema always stays in sync with the code. `synchronize` is disabled to prevent accidental schema changes in production.

**BullMQ over a simple cron-based approach** — BullMQ gives us built-in support for job priorities, delayed execution, retries with backoff, and concurrency control. It's backed by Redis, which we already need, so it doesn't add infrastructure complexity.

**Pessimistic locking over optimistic locking** — For the concurrency guarantee, I went with `SELECT ... FOR UPDATE` because it completely prevents double-processing. Optimistic locking with version columns would require handling conflicts after the fact, which adds complexity and doesn't fully prevent wasted work.

**Redis sorted sets for rate limiting over BullMQ's built-in rate limiter** — BullMQ has a rate limiter, but it applies globally to the entire queue. We needed per-type limits (different limits for `email` vs `report`), so a custom implementation with sorted sets gives us that flexibility. The sliding window approach is also more accurate than fixed windows.

**Dead-letter queue as a separate BullMQ queue** — Failed jobs are pushed to a dedicated DLQ rather than just being marked in the database. This makes it possible to set up monitoring or alerting on the queue level, and keeps failed job data available in Redis for debugging without extra DB queries.

**Global exception filter** — All errors go through a single filter that normalizes the response format to `{ statusCode, message, timestamp }`. This keeps error responses consistent across the entire API regardless of where the error originates.

## Available Scripts

```bash
npm run start:dev        # Development with hot reload
npm run build            # Compile TypeScript
npm run start:prod       # Run compiled version

npm run migration:generate -- src/migrations/Name   # Generate migration
npm run migration:run                                # Run pending migrations
npm run migration:revert                             # Revert last migration

npm run test             # Unit tests
npm run lint             # Lint and auto-fix
```
