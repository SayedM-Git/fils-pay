# ops/

Local and hosted container stack for FilsPay: Postgres, API, settlement, reporting, checkout, and admin web apps. Set production secrets and public URLs through the environment before using it outside a local development network.

## Quick start

```
docker compose -f ops/docker-compose.yml up -d postgres
docker compose -f ops/docker-compose.yml run --rm migrate
docker compose -f ops/docker-compose.yml --profile dev-seed run --rm seed
docker compose -f ops/docker-compose.yml up --build api settlement reporting web admin
```

The seed job is opt-in under the `dev-seed` profile because it resets fixture
data. The web apps are built into Nginx containers and exposed on ports 8080
(checkout) and 8081 (admin). Point `VITE_API_BASE_URL` at the API address used
by browsers, and configure `ALLOWED_ORIGINS` to include the public web origins.

## Files

| File | Purpose |
|---|---|
| `docker-compose.yml` | the stack |
| `.env.docker` | shared service settings, loaded by compose for every service |
| `Dockerfile.node` | image for api, reporting, migrate and seed |
| `Dockerfile.go` | multi-stage build of `apps/settlement` |
| `Dockerfile.web`, `Dockerfile.admin` | Vite builds served by Nginx |
| `nginx-spa.conf` | client-side route fallback |

> **AM (July):** the two Dockerfiles aren't in the repo for me. built my own
>
> **MK:** they were in the initial ops commit. check you're on main

## Database

Every service, plus the one-off `migrate`/`seed` jobs, connects with the
same `filspay` role and the same `DATABASE_URL`
(`postgres://filspay:filspay_dev_password@postgres:5432/filspay?sslmode=disable`).
One role keeps local setup to a single password instead of hand-rolling
per-service grants for a stack this size. `sslmode=disable` is safe here:
Postgres and every service run on the same Docker Compose bridge network,
which never carries traffic outside the host, so there's no untrusted hop
for a connection to cross.

The settlement worker can be given a second connection string,
`PGCONN_SETTLEMENT`, for its batch-close pool. It only takes effect when
`DATABASE_URL` is unset.

To reset the database to a clean, freshly-seeded state at any point, re-run
the `seed` job above — `db/seed/index.ts` truncates and regenerates its
fixture tables on every invocation; it doesn't need the volume removed
first.

## Required settings per service

| Service | Needs | Where it comes from in compose |
|---|---|---|
| api | `DATABASE_URL`, `SETTLEMENT_INTERNAL_URL` | `environment:` |
| api | `WEBHOOK_SECRET_ENCRYPTION_KEY` | only outside dev; a dev key is used otherwise |
| api | `ACQUIRER_CALLBACK_SIGNING_SECRET`, `NODE_ENV` | `.env.docker` |
| settlement | `DATABASE_URL` | `environment:` |
| settlement | `SETTLEMENT_INTERNAL_TOKEN` | defaults to `dev-token` |
| reporting | `DATABASE_URL` | `environment:`; runs `worker` by default |

> **MK:** the api won't boot without WEBHOOK_SECRET_ENCRYPTION_KEY in any environment. set it on the hosted box.

## Resource sizing

For deployment, set unique database credentials, `DATABASE_URL`, `SETTLEMENT_INTERNAL_TOKEN`, `WEBHOOK_SECRET_ENCRYPTION_KEY`, `ACQUIRER_CALLBACK_SIGNING_SECRET`, `ALLOWED_ORIGINS`, and the browser-visible `VITE_API_BASE_URL`. Use the hosting provider’s managed secrets and database settings. The compose defaults are for local development only.

> **AM:** first build on the box filled the disk (go build cache). cleared it and it went through on the second try
