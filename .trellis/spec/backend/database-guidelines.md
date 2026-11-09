# Database Guidelines

> Database patterns and conventions for this project.

---

## Overview

<!--
Document your project's database conventions here.

Questions to answer:
- What ORM/query library do you use?
- How are migrations managed?
- What are the naming conventions for tables/columns?
- How do you handle transactions?
-->

(To be filled by the team)

---

## Query Patterns

<!-- How should queries be written? Batch operations? -->

(To be filled by the team)

---

## Migrations

### PostgreSQL is the deployment acceptance target

The user explicitly prioritizes PostgreSQL (also called "pq") for this site.
Do not substitute SQLite success or a MySQL/SQLite compatibility matrix for
PostgreSQL validation, or expand unrelated database testing without a reason.
Preserve existing shared-driver support; this priority is not permission to
remove it.

- Inspect the PostgreSQL DDL produced by the actual GORM dialect. JSON
  serialization does not imply a TEXT/JSON column: `serializer:json;size:16777215`
  produces `varchar(16777215)`, exceeding PostgreSQL's 10485760 varchar limit.
  Use an explicit text type or the established GormDBDataType implementation.
- Before declaring a schema change ready for deployment, apply the affected
  migration to an isolated test PostgreSQL database and verify the relevant
  persistence path. Check upgrade behavior when changing an existing column.
- Dialect-only regression tests are useful but are not a live PostgreSQL
  migration/startup check. SQLite round trips cannot enforce PostgreSQL limits.
- If a PostgreSQL test service is unavailable, report that exact verification
  gap. Never label the migration, application startup, or production recovery
  verified based only on another database, compilation or an image build.
- Never use production DDL, destructive resets, restarts or deployment retries
  as an unapproved substitute for isolated verification.

Incident reference: IQ targets caused SQLSTATE 22023 and fatal startup migration
failure after merge; see `model/iq_schema_test.go` and `group-iq-tests.md`.

---

## Naming Conventions

<!-- Table names, column names, index names -->

(To be filled by the team)

---

## Common Mistakes

<!-- Database-related mistakes your team has made -->

(To be filled by the team)
