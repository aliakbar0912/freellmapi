# FreeLLMAPI encrypted SQLite backups on Cloudflare R2

This Worker exposes the exact authenticated HTTP GET/PUT interface that FreeLLMAPI's built-in `FREEAPI_DB_BACKUP_URL` backup client expects. The application encrypts and compresses the SQLite snapshot before sending it; R2 stores only that encrypted object.

## 1. Create the R2 bucket

In Cloudflare Dashboard, open **R2 Object Storage** and create a bucket named:

`freellmapi-db-backups`

Or use Wrangler:

```bash
npx wrangler login
npx wrangler r2 bucket create freellmapi-db-backups
```

## 2. Deploy the Worker

From this directory:

```bash
npm create cloudflare@latest -- --existing-script freellmapi-r2-backup
npx wrangler secret put BACKUP_TOKEN
npx wrangler deploy
```

For an existing checkout, the essential commands are simply:

```bash
npx wrangler secret put BACKUP_TOKEN
npx wrangler deploy
```

When prompted for `BACKUP_TOKEN`, enter a long random secret (at least 32 random bytes). Do not commit it to GitHub. The deployed URL will look like:

`https://freellmapi-r2-backup.<your-workers-subdomain>.workers.dev/backup`

The Worker only permits authenticated GET and PUT requests to the fixed object key. It does not expose bucket listing or arbitrary object paths.

## 3. Configure Vercel

In **Vercel → Project → Settings → Environment Variables**, add these variables for Production (and Preview only if you intentionally use it there):

| Name | Value |
|---|---|
| `FREEAPI_DB_BACKUP_URL` | Your Worker URL ending in `/backup` |
| `FREEAPI_DB_BACKUP_TOKEN` | The exact secret entered for Worker `BACKUP_TOKEN` |
| `FREEAPI_DB_BACKUP_INTERVAL_MS` | `300000` |

Keep the existing `ENCRYPTION_KEY` unchanged. If `FREEAPI_DB_BACKUP_KEY` is not set, FreeLLMAPI uses `ENCRYPTION_KEY` to encrypt/decrypt the backup. **Do not rotate or replace ENCRYPTION_KEY while relying on an existing backup**, or that backup cannot be decrypted. If you need to rotate it, first migrate/re-encrypt the backup deliberately.

Redeploy the Vercel project after adding the variables.

## 4. Verify

On a fresh deployment, look for these server log messages:

- `[db-backup] restored ... bytes from https://...` — a previous database was restored.
- `[db-backup] uploaded ... bytes to https://...` — a new encrypted snapshot was saved.

The first-ever deployment has no object to restore; after the server initializes, the backup pump should upload one. Confirm the object exists in the R2 bucket.

## Important limitations

- This is **periodic backup/restore**, not a live shared database. The default interval is five minutes, so the newest few minutes of writes may be lost if an instance disappears before its next successful upload.
- Do not run multiple independently writable Vercel instances against this single snapshot. They can overwrite each other's database state. Keep the deployment to one active instance / one writer; R2 does not provide SQLite locking or multi-writer coordination.
- A warm Vercel instance may keep using its local SQLite file and therefore will not restore again on every request. The backup is read only when the local DB file is missing at process startup.
- Test account creation, logout/login, and a redeploy before relying on this for important data. Keep a separate backup if the dashboard contains valuable provider credentials or settings.
