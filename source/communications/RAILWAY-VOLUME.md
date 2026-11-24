# Railway setup without a private GitHub repository

Use the public grwtsk/grwtsk.com repository for code, reviewed public records and deliberately public, non-sensitive Markdown signals. The private authoritative ledger and admitted inbound archive use application-level AES-256-GCM encryption on a Railway volume. Do not commit raw private third-party emails, credentials or attachments to public Git history. This replaces private Git history with database transactions and volume backups; it does not enable unrestricted sending, raw email publication or full MIME/attachment storage.

## Setup

Open grwtsk-mail, production, personal-correspondence. Add a volume on the project canvas, attached to personal-correspondence at /data. Use one replica and disable sleeping. Do not modify the public website service.

Set STATE_BACKEND=volume, STATE_DIR=/data/correspondence, RAILWAY_RUN_UID=0. Railway mounts volumes as root; the entrypoint prepares only the dedicated state subdirectory and drops privileges to node before starting. Railway supplies RAILWAY_VOLUME_MOUNT_PATH; never fabricate it. The server refuses a missing expected mount or directory and never silently switches to temporary storage or GitHub. No state repo or state token is needed.

Set STATE_KEY_BASE64 (32 random bytes encoded as base64), OPERATOR_TOKEN (high-entropy token), RESEND_API_KEY, RESEND_WEBHOOK_SECRET, OPENAI_API_KEY and OPENAI_MODEL. See .env.example. Keep ENABLE_LIVE_SEND=false and AUTHORIZED_OFFICES_JSON=[] until qualification and individual authorization. ENABLE_AUTO_DRAFTS and ENABLE_AUTO_QUALITY only prepare internal proposals. Set MAIL_FROM and MAIL_PRIMARY_ADDRESS to jacob@grwtsk.com, MAIL_RECEIVE_DOMAIN to correspondence.grwtsk.com, and optionally MAIL_PRIMARY_ALIAS for a verified forwarding route.

Connect grwtsk/grwtsk.com at a qualified commit on main. Root /source/communications, Dockerfile, healthcheck /healthz, port 8080. Leave the start command at the Dockerfile default. Generate the HTTPS service domain. Configure the verified Resend sending and receiving domains and signed webhook at /webhooks/resend. Inspect current MX before changing DNS; use the provider's exact values. See PERSONAL-MAILBOX.md.

## Signals

Edit source/communications/signals/approved.md through a reviewed repository change using signals.example.md. Only deliberately public, redacted and appropriate content belongs there. General preferences work across cases; case requests use opaque case IDs. Redeploy after changes. The deployment reads the bundled file with content hash and Railway deployment commit provenance when available. It does not treat public issue comments as instructions or recipient authorization. Public summaries must be reviewed before manually committing them as described in PUBLIC-RECORD.md.

## Recovery

SQLite persists the encrypted ledger and independent encrypted archive records in /data/correspondence/correspondence.sqlite. Transactions use BEGIN IMMEDIATE, full synchronization and rollback on mutation errors. The archive deduplicates provider IDs and paginates by date. Dates and opaque provider IDs remain database metadata. The existing ledger's 480 KB plaintext cap and body/attachment bounds remain. This is not an unbounded mailbox or immutable audit log.

Enable daily and weekly volume backups (optionally monthly). Preserve the encryption key separately. Test restoration before live delivery. Never wipe the volume or regenerate the key after initialization. Restoring a backup may roll back records of actual external sends; disable live delivery and reconcile provider history before any subsequent dispatch. Maintain appropriate independent protected backups. No GitHub state backup is configured. Switching storage backends requires explicit migration and reconciliation.

Synthetic CI does not qualify Railway permissions, mail transport, DNS or backups. Perform owned-address receipt, send, reply, replay, restart and restore tests before enabling delivery. No code automatically provisions a volume, credentials or a mailbox.

Official documentation: https://docs.railway.com/volumes and https://docs.railway.com/volumes/backups.
