# SimpleX bridge contract

The web app runs on Vercel; the SimpleX bot is a separate persistent service. The bridge must implement this authenticated HTTPS API before relay delivery is enabled.

## App to bridge

Every request uses `Authorization: Bearer $SIMPLEX_BRIDGE_SECRET` and a JSON body. The bridge must compare the shared secret in constant time, reject unknown fields where practical, bound request sizes, and use message IDs for idempotency.

- `POST /v1/account-links`: `{ "userId": "<server-derived ConceptNichod UUID>" }` → `{ "contactLink": "...", "linkCode": "<single-use code>" }`. The code is random, single use, and expires within five minutes. The user opens the link in SimpleX and sends `/link <code>` to the bot. The bridge posts the successful link callback below.
- `POST /v1/conversations`: `{ "conversationId": "<app conversation id>", "participantIds": ["<sorted app UUID>", "<sorted app UUID>"] }` → `{ "simplexConversationId": "..." }`. Both IDs come from the authenticated app server, never from a browser request.
- `POST /v1/messages`: `{ "messageId": "<Mongo message id>", "conversationId": "...", "senderId": "...", "senderUsername": "...", "recipientId": "...", "body": "...", "expiresAt": "<ISO timestamp>" }` → `{ "accepted": true }`. The bridge validates both participants against its mapping, checks the expiry is no more than 24 hours away, sends through SimpleX, and treats duplicate `messageId` requests idempotently.

## Bridge to app

The bridge posts `POST /api/simplex/account-linked` with `Authorization: Bearer $SIMPLEX_BRIDGE_WEBHOOK_SECRET` and `{ "userId": "<mapped UUID>", "linked": true }` after a successful one-time link. It may use the same endpoint with `linked: false` when a SimpleX link is revoked. The app verifies the shared secret and updates only that account's private link state.

## Hosting and retention

Run the bot and its chat database on a persistent host. Keep the unauthenticated SimpleX CLI WebSocket bound to loopback, firewall it from public access, and keep the bot on the same host. Use TLS for the public app-to-bridge endpoint. Do not expose the CLI WebSocket as the bridge API.

Configure 24-hour history deletion in the bot database as well as in MongoDB. The bridge must delete its local message copies at expiry. Keep mapping records separate from message content and encrypt the SimpleX chat database at rest. Do not log message bodies, invitation links, one-time codes, bridge secrets, or user UUIDs.

## Required environment

- Vercel: `SESSION_SECRET` (at least 32 random characters), `CHAT_ENCRYPTION_KEY` (base64-encoded 32-byte key), `SIMPLEX_BRIDGE_URL` (HTTPS), `SIMPLEX_BRIDGE_SECRET`, and `SIMPLEX_BRIDGE_WEBHOOK_SECRET` (both at least 32 random characters and different from each other).
- Bridge host: its corresponding app URL, `SIMPLEX_BRIDGE_SECRET`, `SIMPLEX_BRIDGE_WEBHOOK_SECRET`, persistent encrypted SimpleX database settings, and retention configuration.

The web app keeps chat in app-only mode when the bridge URL or secret is absent. Relay delivery requires the bridge process and user link mapping to be available. A SimpleX bot can read the messages it routes; the relay does not make the app conversation end-to-end encrypted between students.
