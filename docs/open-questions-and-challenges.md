# Open Questions and Challenges

- The repository's legacy API routes are not yet fully catalogued in `docs/openapi.yaml`; the new operations contract is documented completely.
- Running jobs are persisted, but an interrupted process does not automatically resume a partially completed job after container restart.
- `replace: true` uses the existing attendance script's replacement semantics. It replaces matching event identities and removes matching `No Shift Data` rows, but it is not a wholesale delete of the employee/date range.
- The configured CIDR assumes the operator workstation reaches the backend from `10.60.10.0/24`; deployments behind a reverse proxy must define trusted proxy behavior before relying on forwarded client IPs.

