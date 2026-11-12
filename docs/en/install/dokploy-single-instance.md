# Dokploy: persistent single-instance deployment

FreeLLMAPI currently uses synchronous SQLite through `better-sqlite3`. It is
not a horizontally scalable, stateless server. Do **not** run multiple app
replicas against separate container filesystems or treat the R2 snapshot as a
live shared database.

This deployment runs the existing combined dashboard + API in one Dokploy
service, with one persistent Docker volume. It avoids a database rewrite and
keeps the current SQLite schema and application features.

## Before switching traffic

1. In the old Vercel deployment, wait until the logs show a successful
   `[db-backup] uploaded ...` after the latest account/data changes.
2. Keep the existing `ENCRYPTION_KEY` value. Do not rotate it.
3. If you set `FREEAPI_DB_BACKUP_KEY` separately in Vercel, preserve that exact
   value too. If it was unset, the backup uses `ENCRYPTION_KEY`.
4. Keep the Cloudflare Worker URL and token already configured in Vercel.

The R2 backup is a periodic encrypted snapshot, not a live database. It can
only restore the most recently uploaded snapshot; changes made after that
snapshot may be missing. Multiple Vercel instances can overwrite the same
snapshot, so check the newest upload timestamp before switching.

## Create the Dokploy application

1. In Dokploy, create an application from the Git repository
   `aliakbar0912/freellmapi`.
2. Select the branch containing this deployment file.
3. Select Docker Compose and set the compose file path to
   `docker-compose.dokploy.yml`.
4. Add these environment variables in the Dokploy application's environment
   settings. Copy the values from the existing Vercel production environment;
   do not paste secrets into Git:
   - `ENCRYPTION_KEY` — exact existing Vercel value.
   - `FREEAPI_DB_BACKUP_URL` — existing Worker URL ending in `/backup`.
   - `FREEAPI_DB_BACKUP_TOKEN` — exact same token used by the Worker.
   - `FREEAPI_DB_BACKUP_INTERVAL_MS` — `300000`.
   - `FREEAPI_DB_BACKUP_KEY` — only if the old Vercel deployment explicitly
     had this variable; preserve its exact value.
5. Deploy the application. Configure its Dokploy domain/proxy to forward to
   container port `3001` (the Compose file exposes this port internally).
6. Ensure the service is configured for **one replica only**. Do not scale it
   horizontally. The named `freellmapi-data` volume persists at
   `/app/server/data` across container replacements and redeploys.

## Verify before cutover

- The app's `/api/ping` endpoint returns HTTP 200.
- Startup logs show `[db-backup] restored ...` if the volume was initially
  empty and an R2 snapshot existed.
- Logs show `Database initialized at .../freeapi.db`.
- Dashboard login works and expected users, provider keys, profiles, and
  settings are present.
- Logs later show `[db-backup] uploaded ...`.

Only after these checks pass should you point users/API clients at the Dokploy
domain and stop the Vercel container deployment. Do not delete the old Vercel
project or R2 bucket until the new service has been verified and backed up.

## Important architecture note

The repository's production Docker image serves the React dashboard and API
from the same Express server. This compose deployment therefore hosts both
together on Dokploy; it does not split the frontend onto Vercel. Keeping only
the frontend on Vercel would require a separate static build plus explicit API
base-URL/CORS configuration, which is a different code change. The simplest
safe fix for the current SQLite app is the single persistent Dokploy service.
