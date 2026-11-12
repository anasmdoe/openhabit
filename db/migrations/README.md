# Numbered migrations

Each file is `NNNN_short_name.sql` and is applied once, in order, inside a transaction. The applied
version and a checksum are recorded in `schema_migrations`.

- `0001_baseline.sql` is the schema as it stood before numbering. It is written to be idempotent, so
  databases created earlier adopt it safely.
- To change the schema, add the **next** number. Never edit a file that has been released: the
  checksum is checked and a changed file stops the migration.
- `db/init.sql` is **generated** from these files (`node db/build-init.js`) so that Docker's
  `initdb`, the Kubernetes ConfigMap and plain `psql -f db/init.sql` keep working. CI fails if it is
  out of date. Do not edit it by hand.
- `node db/migrate.mjs` (and the migrate Lambda) apply the same files directly.
