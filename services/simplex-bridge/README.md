# SimpleX bridge

This persistent Node service connects the Vercel app to SimpleX. It uses the official SimpleX Node bot API and a SQLCipher-backed SQLite store. It listens on localhost by default; put an HTTPS reverse proxy in front of the HTTP routes. It does not expose the unauthenticated SimpleX CLI WebSocket API.

## Run

Build and host this directory on a persistent Linux host with a persistent `/data` volume. Use Node 22 or `docker build -t conceptnichod-simplex-bridge .`. Configure the environment listed below, then start the container. Configure the reverse proxy to expose only `/health` and the authenticated `/v1/*` routes over HTTPS. Keep the service reachable only by the Vercel app and administrators.

Required environment:

- `APP_BASE_URL`: public HTTPS origin for the ConceptNichod app.
- `SIMPLEX_BRIDGE_SECRET`: random bearer secret shared with Vercel, at least 32 characters.
- `SIMPLEX_BRIDGE_WEBHOOK_SECRET`: a different random bearer secret shared with Vercel, at least 32 characters.
- `BRIDGE_MAPPING_KEY`: base64-encoded 32-byte AES key for the contact/code mapping file.
- `SIMPLEX_DB_ENCRYPTION_KEY`: non-empty SQLCipher key for the bot's local database.
- `DATA_DIR`: persistent encrypted data volume, normally `/data`.

Optional: `BRIDGE_HOST` (defaults to `127.0.0.1`), `PORT` (defaults to `7788`), `SIMPLEX_BOT_DISPLAY_NAME`.

## Privacy and retention

The bridge sees message text to route it. It stores user-to-contact mappings and short-lived one-time link codes in an AES-GCM encrypted file. It stores SimpleX chat history in its encrypted local database and schedules local message deletion after 24 hours. Physical deletion is retried after restarts. Report emails in the app and recipient-device copies are outside this retention window.

Do not log message content, link URLs, link codes, usernames paired with UUIDs, or secrets. Keep `/data` private and backed by encrypted storage. If the bridge cannot be reached, the app still stores the in-app message encrypted at rest and marks SimpleX relay delivery as unavailable.
