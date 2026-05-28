# Time Keeper Pro — Code Wiki

This wiki describes the code structure and runtime architecture of the Time Keeper Pro repository.

## Contents

- [Architecture](./architecture.md)
- [Backend (API + Sync)](./backend.md)
- [Frontend (Web UI)](./frontend.md)
- [Database](./database.md)
- [Running & Operations](./running.md)

## High-Level Topology

```mermaid
flowchart LR
  U[User Browser] -->|HTTP :9000| WEB[Vite/React Web]
  WEB -->|/api (proxy)| API[Express API :5000]
  API -->|mssql| DB[(Main MSSQL DB)]
  API -->|mssql| OR[(Orange MSSQL DB)]
  API -->|mssql| DATA[(DataDB MSSQL DB)]
  API -->|LDAP| AD[(AD/LDAP Server)]
```

## “Start Here” Files

- Frontend entry: [main.tsx](file:///c:/Scripts/Projects/time-keeper-pro/src/main.tsx), [App.tsx](file:///c:/Scripts/Projects/time-keeper-pro/src/App.tsx)
- Backend entry: [server.ts](file:///c:/Scripts/Projects/time-keeper-pro/backend/server.ts), [routes](file:///c:/Scripts/Projects/time-keeper-pro/backend/routes)
- Sync core: [runScheduleSync](file:///c:/Scripts/Projects/time-keeper-pro/backend/sync.ts#L102-L336)
- Docker runtime: [docker-compose.yml](file:///c:/Scripts/Projects/time-keeper-pro/docker-compose.yml)

