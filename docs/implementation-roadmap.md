# Implementation Roadmap

## Phase: Authenticated Operations Gateway

Status: complete

### Objective

Allow local administrators to execute bounded schedule recovery and attendance recovery through the production backend network boundary.

### Source documents

- `docs/functional-specification.md`
- `docs/technical-implementation-plan.md`
- `docs/database-schema-specification.md`
- `docs/openapi.yaml`
- `docs/open-questions-and-challenges.md`

### Checklist

- [x] API-key and IP-allowlist middleware
- [x] Persistent asynchronous job records
- [x] Schedule compare and selected/all-user backfill
- [x] Attendance selected/all-user backfill
- [x] Attendance preview and filtered idempotent replay
- [x] Explicit confirmation for broad/destructive modes
- [x] OpenAPI and operator examples

### Challenge / verification

- `npx tsc --noEmit`: passed.
- Python AST syntax check: passed.
- Attendance CLI help exposes all new bounded replay arguments.
- `npm run lint`: zero errors; seven pre-existing Fast Refresh warnings.
- `git diff --check`: passed.
- No production backfill or replay was executed during implementation.

