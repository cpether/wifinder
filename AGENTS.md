# Operational Notes

- Start API locally: `npm start`
- Install dependencies first in a fresh checkout: `npm install`
- Set `GOOGLE_MAPS_API_KEY` before `npm start` to enable the live Google Map tab; without it, the nearby list still works and the map tab shows a configuration message.
- Override SQLite file path with `DB_PATH` when you need an isolated database; default is `data/wifinder.sqlite`.
- Persistence uses the bundled `better-sqlite3` dependency; the app no longer requires the system `sqlite3` CLI.
- Load demo seed data explicitly with `npm run db:seed` (or `DB_PATH=... npm run db:seed` for an isolated database).
- Run test suite: `npm test`
- Integration tests start a local HTTP server and require an environment that permits localhost port binding.
