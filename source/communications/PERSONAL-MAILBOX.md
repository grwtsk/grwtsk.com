# Personal mailbox: jacob@grwtsk.com

The service is a headless mail intake, protected archive, and casework backend. GitHub is the user-facing workflow. It uses Resend as the SMTP transport/receiving provider rather than deploying an unaudited SMTP relay. The website is a separate application. The AI prepares editable drafts; it does not send autonomously, alter recipient authorization, or deploy self-modifications.

## Mail routing and configuration

The example config sets MAIL_FROM and MAIL_PRIMARY_ADDRESS to jacob@grwtsk.com. MAIL_RECEIVE_DOMAIN is correspondence.grwtsk.com for unique case reply addresses. MAIL_PRIMARY_ALIAS is optional, for an existing mailbox host's verified forwarding route into the dedicated receiving domain.

Before changing DNS, inspect the current MX at grwtsk.com. If an existing provider hosts root-domain mail, retain its MX and create the actual jacob mailbox or alias there; configure a verified forwarding route to a dedicated receiving address, if supported. Forwarding can alter sender authentication: unverified messages stay in the archive and are not approved for automated casework use. If there is no existing mail service and all root-domain traffic can safely be handled by Resend, verify grwtsk.com and enable receiving there using the exact MX supplied by Resend. Root-domain MX changes affect every mailbox on that domain. Do not replace existing records without a migration and rollback plan. Enable and verify SPF, DKIM and DMARC according to the provider's domain-specific instructions; do not guess DNS values.

Use the verified root domain for the From address, dedicated subdomain for case reply aliases, and a signed email.received webhook plus the supported delivery event webhooks. Use a dedicated provider account/project and the minimum token permissions needed. The provider's dashboard remains a fallback for original messages, attachment access and outage recovery. Turn off tracking pixels/click tracking. Confirm email identity, receiving, replies, delivery events and recovery with an address you own before going live.

## Protected archive and recovery

Admitted and held messages are encrypted in SQLite archive records on the production Railway volume. The legacy private-state adapter uses the following create-once path:

    mailbox/inbound/YYYY-MM-DD/HHmmssSSS-provider-uuid.enc.json

The filename uses the provider creation timestamp and ID so webhook retries recover the same object. Message bodies, subject, sender, authentication and attachment metadata are encrypted with a path-bound AES-256-GCM envelope. The date and opaque provider ID are visible to repository collaborators, as are Git commit metadata. Case-associated replies continue to have their private ledger entry. The archive is committed first; on later ledger failure the webhook returns a failure for retry. Direct mail to the primary address is not silently discarded or linked to an unrelated case. Ambiguous case routing is archived for review, not attached to multiple cases. Outbound attempts and receipts continue in the encrypted ledger.

The authenticated maintenance API lists a received date in UTC, ten messages per page, and returns bounded plain-text content, never archived HTML. The read-only recovery worker checks eligible missed webhook events; individual provider-ID recovery remains a protected maintenance operation. No message is resent. For a direct message to the primary address, the operator may link it to an existing authorized case only if the sender matches, provider-reported DMARC passed, and chronology is valid. This does not mark it reviewed, add a recipient, or send a reply.

The archive stores text up to 48 KB and HTML up to 72 KB, with explicit truncation metadata, attachment metadata (first 50), but not attachment bytes or raw MIME. Original files remain with the provider while retained. This is not yet a complete archival mailbox or an IMAP/JMAP service: the GitHub Contents directory limit of 1,000 entries per date is surfaced, and provider retention, storage and API limits apply. The original bounded case ledger still requires capacity monitoring and migration before exhaustion. Maintain protected independent volume backups and preserve the encryption key separately. Rehearse restoring to an isolated database. Do not rely on Git history for deletion or a certified evidence vault.

## Local OpenAI API key

At the checkout root, keep .secrets/openai-api-key.txt out of Git and Docker build context. Set mode 600; do not paste it into issues, logs, or this documentation. From source/communications run npm run start:local. The local launcher reads .env if present and uses the root key file only when OPENAI_API_KEY is not already set. It rejects non-regular files, oversized keys, unsafe permissions and whitespace. On Railway, set OPENAI_API_KEY directly using the secret variable interface; the local file is not deployed. Set OPENAI_MODEL to an available Responses model supporting structured outputs.

## Continuous improvement

The issue ledger and approved Markdown remain the source of instructions. Each prepared knowledge proposal can receive one structured quality assessment (clarity, grounding, completeness, missing context, verbosity, unsupported assertion, tone or relevance). The quality review worker, optionally ENABLE_AUTO_QUALITY=true, runs on the existing five-minute internal worker interval; it requires at least five reviewed proposals, a new aggregate fingerprint and at most one review attempt per rolling day. It supplies only label counts and sample size to OpenAI, never raw messages, recipient addresses or case details. The output is stored as an internal candidate writing preference. The operator may adopt a reviewed change in approved Markdown. No generated output alters executable code, prompts, permissions or deployment automatically. Tests and code review remain required before deploying changes. This is an evaluation-based feedback loop, not model fine-tuning or guaranteed improvement.

## Deployment gates

1. Preserve the existing Railway volume, state encryption key, maintenance token, mail-provider key and webhook signing secret.
2. Create an isolated Railway service with root /source/communications, Dockerfile, healthcheck /healthz, no sleep, one replica; do not modify the public website or apply its pending changes.
3. Configure verified domain routing and DNS only after determining the existing provider. Keep ENABLE_LIVE_SEND=false and use controlled addresses to qualify the whole path.
4. Run npm test and perform owned-address receipt, send, delivery webhook, reply, outage recovery, duplicate replay and restore tests. Check attachment behavior and provider retention. Monitor archive and ledger capacity.
5. Maintain public-safe issues and reviewed signals in the public repository. GitHub is the writing review surface; outbound delivery remains locked. Never give the AI arbitrary shell, code-write, mail-send, DNS or deploy permissions.

The code does not provision a provider account, domain, DNS record, state repository, or operational mailbox by itself.

## Admission and public disclosure update

[PUBLIC-RECORD.md](PUBLIC-RECORD.md) supersedes the broader intake description above: only individually authorized senders with provider-computed DMARC pass are archived; authenticated automated or ambiguous messages are held. Unknown or unverified messages are excluded from the application. Public record exports require explicit review, and the provider dashboard is the exception review/recovery path. No automatic replies or publication.

## Volume storage option

See [RAILWAY-VOLUME.md](RAILWAY-VOLUME.md). In volume mode, the authoritative private state and admitted originals are stored in encrypted SQLite on a persistent volume, not a private GitHub repository. Approved public-safe Markdown is bundled from source/communications/signals/approved.md. Public records remain reviewed exports; no raw email is published.
