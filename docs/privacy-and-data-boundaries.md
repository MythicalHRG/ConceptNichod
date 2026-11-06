# Privacy and data boundaries

## User profiles

Profiles are private by default. A user must enable discoverability before their profile appears in AspirantsConnect or `/profile/<username>` can be opened by other users.

When discoverability is enabled, the directory may show the username, full name, class level, exam focus, and bio. City and social links are returned only when the separate city and social-link switches are enabled. Aggregate progress is returned only when the progress switch is enabled; the public view uses generic session labels and does not include topic names, summaries, answers, or saved study material.

Email, date of birth, gender, account UUID, login IP addresses, topics, generated summaries, practice answers, review cards, mistakes, mock-test answers, and the mastery timeline are not public profile fields.

## Learning records

Study materials, attempts, confidence ratings, topic links, and mock-test sessions are queried using the UUID from the verified session cookie. Submitted user IDs are not accepted as ownership proof. Topic summaries are included only in server-side AI calls started by that topic's owner.

## AspirantsConnect

Direct messages are visible only to their two participants and are encrypted in MongoDB using AES-256-GCM. The application derives the sender from the verified session. Each message has a 24-hour expiry; every read filters expired messages immediately and MongoDB also has a TTL index. The TTL index performs eventual physical deletion.

Users can mute or close a conversation, and can disable incoming messages in profile settings. The product does not have a user-to-user block control. Chat reports include the currently available unexpired transcript and are emailed to the configured admin account; the report email may outlive chat expiry.

Community Q&A posts are visible to signed-in students and display the author's username. Group activity is visible only to group members. Accountability matching exposes a username, optional display name, weekly goal, and schedule only to students who have also opted in.

## SimpleX boundary

The SimpleX bridge is an optional, separately hosted relay. App-to-bridge requests use a server-only bearer secret over HTTPS; bridge-to-app account-link callbacks use a different secret. The CLI WebSocket API has no authentication and must remain bound to localhost on the bridge host. The bridge can read message content to route it, as accepted in the product plan; this integration must not be described as end-to-end encrypted between app users.

The app encrypts message bodies at rest. The bridge's own SimpleX database must also have encryption at rest and 24-hour chat-history deletion configured. A delayed Mongo TTL deletion alone does not satisfy the bridge retention requirement. User-device copies and report emails can remain longer.
