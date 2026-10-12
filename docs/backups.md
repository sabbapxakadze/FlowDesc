# Backups

What protects the live data, how the weekly backup works, and how to get something back. Written 2026-10-09 (ADR 0055).

## Two layers

1. **Neon's own history window.** The free plan keeps a 6-hour window of changes (capped at 1 GB of change history) that a database can be restored to, plus one manual snapshot. Source: Neon's documentation as summarized by a search, not read in full, and not tested on this project. It protects against a mistake you notice within hours.
2. **A weekly encrypted dump** (`.github/workflows/backup.yml`). Every Sunday a GitHub machine dumps the live database, encrypts the file with AES-256 and keeps it as a workflow artifact for 90 days. It protects against a mistake you notice days or weeks later, or a lost Neon project. It does NOT include the uploaded files in the bucket: those live only in Neon Object Storage.

Why encrypted: the repository is public and the artifacts of a public repository may be downloadable by anyone signed in to GitHub (not verified), and the dump holds real people's emails and password hashes.

## One-time setup (the owner)

1. In the GitHub repository: Settings, Secrets and variables, Actions, New repository secret:
   - `DATABASE_URL`: Neon's direct connection string (the same value as on Render).
   - `BACKUP_PASSPHRASE`: a long random passphrase you make up. **Also store it in a password manager.** GitHub never shows a secret again, and a lost passphrase makes every backup unreadable.
2. Actions tab, Backup, Run workflow, once by hand. Check that it goes green and an artifact called `flowdesc-backup` appears.
3. Check once a month, or after the first run, that the artifact is there. A failed run shows red in the Actions tab; whether GitHub emails you about a failed scheduled run was not verified.

## How to restore (from a downloaded backup)

You need `openssl` and the Postgres client tools (`pg_restore`), version 18 or newer, and a database to restore into: a new Neon branch or project is safest, never the live database first.

```bash
# 1. Download the artifact from the Actions tab and unzip it, so you have flowdesc-YYYY-MM-DD.dump.enc
# 2. Decrypt it (it asks for nothing: the passphrase comes from the environment)
export BACKUP_PASSPHRASE='the passphrase from your password manager'
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:BACKUP_PASSPHRASE -in flowdesc-YYYY-MM-DD.dump.enc -out flowdesc.dump
# 3. Look inside first (a wrong passphrase fails at step 2 with "bad decrypt")
pg_restore --list flowdesc.dump | head
# 4. Restore into an EMPTY database
pg_restore --no-owner --no-privileges --dbname="<connection string of the empty database>" flowdesc.dump
```

Then point `DATABASE_URL` on Render at the restored database (or copy the rows you need across).

## What was checked, and what was not

- **Checked locally (2026-10-09):** the same `pg_dump` flags, the check for the users table, the encryption and the decryption on a copy of the local test database: the decrypted file was byte-identical to the dump, a wrong passphrase was refused, and the archive's users data had the same 5 rows as the database.
- **Run on GitHub (owner-reported, 2026-10-09):** the owner ran the Backup workflow by hand after adding the two secrets and reported it green, which includes installing the Postgres 18 client, connecting to Neon, the dump, the users-table check, the encryption and the upload The owner also opened the run's Artifacts list and confirmed it holds an encrypted `.enc` file (owner-reported; I did not see it, and the file's size or a decryption from the downloaded copy was not checked).
- **Not checked:** a restore into a real database (the local role cannot create one, so only the archive's contents were read); a run triggered by the schedule rather than by hand; whether GitHub keeps artifacts for the full 90 days; and if the server is ever upgraded past Postgres 18, `pg_dump` stops with a version message and the job turns red: raise the number in the workflow.
- **Not covered:** the files in the bucket, and anything outside the database.
