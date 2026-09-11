# Legacy one-off migrations

These scripts were each run **once**, by hand, before the automatic migration
runner existed in `server.js`. They are kept only so that a brand-new database
can be brought up to the same schema.

**You do not need to run these during normal operation.** `runMigrations()` in
`server.js` executes automatically at start-up and applies every schema change
the current application version requires.

They previously carried hardcoded `localhost` / `root` / empty-password
credentials. They now read the same `DB_*` environment variables as the server,
so they can never silently connect to the wrong database.

| Script | What it added |
|---|---|
| `create_godown_table.js` | `godown_stock` table |
| `migrate_arrivals.js` | `vehicle_arrivals` table, `daily_entries.has_vehicle_arrival` |
| `setup_accessories.js` | `daily_accessory_sales` table |
| `setup_sbc_dbc.js` | SBC / DBC rate columns on `products`, `price_history`, `daily_product_stock` |
| `add_delivery_columns.js` | `cash_qty` / `online_qty` on `daily_deliveries` |
| `add_online_qty.js` | `online_qty` on `daily_product_stock` |
| `fix_fks.js` | Repointed the `daily_deliveries` foreign key at `employees` |
