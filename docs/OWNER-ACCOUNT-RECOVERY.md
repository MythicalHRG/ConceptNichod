# Recovering the designated platform-owner account

The admin routes intentionally return a stealth 404 unless the authenticated database user has the designated identity and `role: owner`. The centralized authorization helper accepts either the reserved username or email as identity, but this recovery command requires both fields to match on the same record.

Normal registration reserves the username/email, and login must never grant privileges. If the existing designated account has `role: user`, a deployment alone cannot repair that database record.

## One-time, controlled repair

1. Confirm that you control the production MongoDB project and the designated owner account.
2. Use a trusted operator machine and load the production database connection string into the local environment without copying it into chat, Git, or logs. For Vercel-hosted projects, use the Vercel CLI to pull the appropriate production environment into the ignored `.env.local` file.
3. Run:

   ```sh
   OWNER_BOOTSTRAP_CONFIRM=PROMOTE_MYTHICALHRG_OWNER npm run owner:bootstrap
   ```

The script requires explicit confirmation, locates exactly one record matching the reserved owner identity, verifies that both fields belong to the same record, and only changes `role: user` to `role: owner`. It refuses missing, duplicate, mismatched, or unexpected-role records and verifies the update afterward. It is idempotent when the account is already an owner.

Do not add a public HTTP endpoint for this operation. Do not put database credentials or confirmation values in source control. If no matching account exists, stop: use a separately controlled account-recovery process rather than silently creating credentials or promoting a different user.

## Afterward

Sign out and back in to refresh the session, then visit `/dashboard/admin`. The admin route and all server-action owner checks remain enforced.
