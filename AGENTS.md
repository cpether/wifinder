# Operational Notes

- Install dependencies: `pnpm install`
- Start API locally: `pnpm start`
- Set `GOOGLE_MAPS_API_KEY` before `pnpm start` to enable the live Google Map tab; without it, the nearby list still works and the map tab shows a configuration message.
- `better-sqlite3` is an allowed native build under pnpm; after a fresh clone, `pnpm install` is the expected way to fetch and build it.
- Override SQLite file path with `DB_PATH` when you need an isolated database; default is `data/wifinder.sqlite`.
- Persistence uses the bundled `better-sqlite3` dependency; the app no longer requires the system `sqlite3` CLI.
- Load demo seed data explicitly with `pnpm db:seed` (or `DB_PATH=... pnpm db:seed` for an isolated database).
- Run test suite: `pnpm test`
- Run a focused integration file while iterating on web/API slices: `pnpm test -- test/api.integration.test.js`
- Run the browser-shell deep-link test directly with: `pnpm test -- test/web.app.test.js`
- Integration tests start a local HTTP server and require an environment that permits localhost port binding.
