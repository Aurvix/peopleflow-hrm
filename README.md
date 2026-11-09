# Peopleflow HRM

An independent, local HRM SaaS prototype with SQLite persistence, tenant isolation, role-based access, workforce workflows and an MCP interface. This builds on the phase 8 review snapshot with a small task-workflow update. It remains a local development prototype.

## Run the local demo

Requires Node.js 24 or newer and npm. Install the locked dependencies without lifecycle scripts:

```sh
npm ci --ignore-scripts
```

In PowerShell, from this directory:

```powershell
$env:PORT = '4329'
$env:DB_PATH = Join-Path $PWD 'data/public-demo.sqlite'
$env:SEED_PASSWORD = 'Peopleflow-Local-Demo-Only!'
npm start
```

On macOS/Linux:

```sh
PORT=4329 DB_PATH=./data/public-demo.sqlite SEED_PASSWORD='Peopleflow-Local-Demo-Only!' npm start
```

Open http://127.0.0.1:4329. This is a local-only demo, not a hosted service.

| Role | Test login | Password after the fresh setup above |
| --- | --- | --- |
| Company admin | admin@north.test | Peopleflow-Local-Demo-Only! |
| HR | hr@north.test | Peopleflow-Local-Demo-Only! |
| Employee | employee@north.test | Peopleflow-Local-Demo-Only! |
| Platform admin | platform@peopleflow.test | Peopleflow-Local-Demo-Only! |

All seeded people, companies, email addresses and records are synthetic. These published credentials apply only to a newly created local demo database. Never reuse this password for real accounts or expose this demo to the Internet.

Seeding happens only when the database has no users. Changing `SEED_PASSWORD` does not reset existing accounts. To start over, stop the server and choose a new, unused `DB_PATH` (for example `data/public-demo-2.sqlite`), then run the same setup. Keep the old database if you need its records. If `SEED_PASSWORD` is omitted with the default database path, a random password is saved locally in ignored `data/sandbox-access.txt`.

## Task-workflow update (November 9, 2026)

Tasks now include overdue and due-today filters, visible result counts, a clear-filters action, and clearer status/priority labels. Due dates continue to use UTC. Task updates preserve the current filters, guard repeated submissions, and avoid reopening dismissed dialogs when a delayed save completes.

This update was published without final test or browser verification, as requested. The existing integration suite and added task-filter tests remain available for a later verification pass. No production-readiness claim is made.

## Existing capabilities

- Authentication, sessions, CSRF checks, tenant boundaries, built-in roles and effective custom permissions.
- Employee and organization records, linked users, assigned tasks, comments and activity.
- Leave types, allowances, holidays, calendar, attendance corrections, UTC shifts and synthetic attendance-import preview/apply.
- Recruitment, interviews, hiring/onboarding and payroll simulations with approval rules.
- Sandbox SaaS plans, quotas, currencies, coupons, plan requests, referrals and content pages.
- Scoped MCP reads and task preview/apply through shared application services.

Run the integration suite with `npm test` (it uses a temporary synthetic database and port 4317). No production database is required. MCP uses `PEOPLEFLOW_URL` and a locally issued `PEOPLEFLOW_MCP_TOKEN`; never commit tokens.

## Incomplete status

This is a development prototype, not production-ready or a complete HR/payroll product. Last recorded scope was 107 partially implemented and 105 absent role-specific destinations; no full screen-parity claim is made. The unfinished phase 9 draft is not included.

Attendance is UTC-only; IANA timezone/DST and India-local handling remain unfinished. Real biometric devices, external connectors, notifications, payments, statutory payroll/tax compliance and production hosting are not implemented. Payroll statements and commerce approvals are simulations; they do not pay or charge anyone. Employee lifecycle, contracts, recruitment configuration/assessments, performance, training, assets and meeting workflows still have substantial gaps. Existing tests are not a comprehensive security audit.

## Publication and rights

This fresh snapshot contains original application source and synthetic tests only. Existing databases, credentials, session stores, logs, private development notes, screenshots, third-party reference code/assets and previous history are excluded. Original development files are preserved separately.

No application license has been selected; public visibility does not grant a new license. Dependencies retain their own licenses; see [DEPENDENCIES.md](DEPENDENCIES.md). No third-party proprietary reference material is distributed here.
