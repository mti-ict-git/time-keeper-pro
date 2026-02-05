2026-02-05 23:07:27 WITA

Modularized backend structure and routes.

- Added backend/config.ts for environment-based app and DB config
- Added backend/db.ts for MSSQL connection pool management
- Added backend/utils/format.ts for time/overnight normalization
- Added backend/utils/introspection.ts for schema introspection and type binding
- Added backend/types/scheduling.ts for MTIUsers and schedule combo types
- Added backend/routes/scheduling.ts for scheduling employees and combos
- Added backend/routes/users.ts for users schema, list, and search
- Added backend/routes/attendance.ts for attendance report schema and query
- Updated backend/server.ts to mount routers and use modular config

Verification:

- npx tsc --noEmit ran successfully
- npm run lint executed; existing repo warnings/errors remain unrelated to changes

2026-02-05 23:28:55 WITA

Dockerized local development environment.

- Added Dockerfile.backend to run Express API via tsx watch
- Added Dockerfile.web to run Vite dev server
- Added docker-compose.yml for web, backend, and MSSQL services
- Updated vite.config.ts to use VITE_BACKEND_URL for proxy target
- Added .dockerignore to reduce build context size

Verification:

- npx tsc --noEmit ran successfully
- npm run lint executed; existing repo warnings/errors remain unrelated to changes
