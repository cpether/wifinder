# Operational Notes

- Start API locally: `npm start`
- Override SQLite file path with `DB_PATH` when you need an isolated database; default is `data/wifinder.sqlite`.
- Persistence uses the bundled `better-sqlite3` dependency; the app no longer requires the system `sqlite3` CLI.
- Run test suite: `npm test`
- Integration tests start a local HTTP server and require an environment that permits localhost port binding.
