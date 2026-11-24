# Private correspondence service

A separately hosted Node.js 22+ application, with no runtime npm dependencies. The website remains the static article publisher. This service is for authorized, individually reviewed casework and consented correspondence, **not a campaign sender**. The article registry is not imported. The AI never has mail tools or GitHub access and never sends mail.

## Architecture

- HTTP application and keyboard-accessible plain-text operator interface: open a case, draft, edit, save exact revision, approve, view history, review replies, close case, reconcile uncertain sends.
- OpenAI Responses API: accepts only an operator-confirmed redacted brief plus recipient office role/scope, returns structured subject and plain text. The operator checks every factual statement and changes the draft as needed. No raw article, registry, inbound mail, medical record or address is sent to the model automatically. The request sets store=false; this is not a promise of zero provider retention.
- Resend: verified sending domain, one recipient per manually approved casework email, dedicated inbound domain, unique unguessable case reply address, signed receiving and delivery webhooks. No tracking pixels, batch/CC/BCC, mailing-list imports, campaign scheduling, automated follow-ups or repeated unanswered sends.
- GitHub: a separate **private** repository is the authoritative persistence backend. The public site repo contains code only. One bounded authenticated AES-256-GCM encrypted state document contains case records, saved drafts, outbound attempts, accepted receipts, delivery events, inbound text previews and review/closure events. Each mutation commits with the previously read GitHub blob SHA; competing writes retry the pure mutation, never the mail send. File content and identifiers are encrypted; Git commit timestamps/metadata remain visible to repository collaborators. Git history is an audit trail, not immutable or a certified evidence vault.
- No database or persistent container filesystem. Running a second application instance does not make it a mass sender; the GitHub CAS and durable attempt record protect concurrent operations.

## Before starting: accounts, privacy, domain

1. Create a **new private GitHub repository**, e.g. a dedicated correspondence state repository in your account, initialized with a README on main. Restrict collaborators, disable public visibility and use a fine-grained token limited to that repository with Contents read/write and Metadata read. Never give this service a token with write access to the public website or other projects. The service checks the state repo is private before reading or writing. Do not store confidential or medical records in the public website repository. This application is not a HIPAA-compliant medical record system, not an emergency channel, and not a full email client or archival vault.
2. Generate a 32-byte encryption key and a separate high-entropy operator token locally using secure random generation. For example:
   ~~~sh
   openssl rand -base64 32
   openssl rand -hex 32
   ~~~
   Save both in your password manager. Preserve the encryption key securely; losing it means losing the ability to decrypt historical state. Do not put them in Git, shell command history or logs. No real secrets are in .env.example.
3. Use a dedicated mail subdomain such as correspondence.grwtsk.com, **not** the root domain's MX unless you intend to replace existing mail hosting. In Resend configure a dedicated verified sending domain and receiving domain (or an assigned receiving subdomain). Add only the DNS records displayed by the provider, including SPF/DKIM and the receiving MX; configure DMARC consistent with your domain's existing policy. Verify domain ownership and delivery with an address you control. Do not alter existing production mail settings. Use a dedicated provider account/project or narrowly scoped key with permissions for sending and retrieving incoming and sent email. Configure a signed webhook at https://YOUR-SERVICE/webhooks/resend for email.received and supported sent/delivered/delivery_delayed/bounced/complained/failed/suppressed events; never enable open/click tracking. Resend hosts the SMTP transport; this code hosts the correspondence application and webhook receiver. It does not run a raw SMTP/IMAP server.
4. Create a dedicated OpenAI API project key and set the model to an available model supporting Responses structured outputs. AI use is optional; manual drafting works without it. API use and provider mail delivery may incur fees. Send no medical records or protected information to the AI. Use appropriate confidential official portals for sensitive evidence.
5. Set environment variables from .env.example in your hosting provider's secret settings. Use an explicitly reviewed JSON array of at most 25 authorized role-level office inboxes or consenting correspondents; default is empty. For each, confirm the office has jurisdiction and accepts this kind of communication, or document actual consent. Example (synthetic, not a real recipient):
   ~~~json
   [{"id":"test-office","email":"intake@example.org","role":"Example public casework office","scope":"Example jurisdiction","basis":"official_casework","source":"https://example.org/intake","verification":"Verified office purpose and address on [date]"}]
   ~~~
   Do not use this service to circulate individual accusations to clinicians, relatives, coworkers, congregations, unrelated organizations, or a political mailing list. Non-accepting offices should be contacted using their prescribed secure intake, not email.

## Run and verify

From source/correspondence:
~~~sh
npm test
node --env-file=.env server.mjs
~~~
The tests use synthetic data and fake upstream transports; they never contact a real recipient. Open http://localhost:8080 locally and enter the operator token. For remote use, HTTPS is mandatory; the token is retained only in page memory. Use a private workstation and log out/close the tab when finished. The application requires private state and Resend configuration at startup; live sends are off by default. AI keys are optional. The health route is liveness, not proof of provider connectivity.

## Railway hosting

Create a **separate service**, linked to this repository after the code is reviewed and merged. Set its Root Directory to /source/correspondence so its Dockerfile is detected; do not change the website service's root, build or deployment. Set the environment variables as secrets, keep ENABLE_LIVE_SEND=false, and generate a HTTPS service domain. Configure the signed Resend webhook to that domain. Set the service healthcheck path to /healthz. No volume is required. Limit service access to the operator; the webhook must be publicly reachable, but the operator API requires the high-entropy bearer token. The static page has no private data. Consider a separate identity-aware access proxy for the operator routes before wider use; keep the signed webhook outside it. Do not enable live sending until an owned-address smoke test and repository restore test have passed. No hosting, DNS, provider account or private repository is provisioned by this source change.

## Daily use

- Open exactly one case for an authorized office. Its reply address is generated from a random case ID on the receiving domain.
- Supply a short redacted brief containing verified facts, relevant jurisdiction, and one specific requested action. Generate or manually write a message. Keep separate what you witnessed, what documents show, and what requires investigation.
- Review and save the draft. Approval is bound to its exact hash, recipient, and reply address. The application commits a pending attempt before invoking the provider. The operator must explicitly confirm sending. An accepted provider receipt is not proof of delivery.
- Followups are manual, only after reviewing a new reply from the authorized address that passes the provider-reported DMARC check. Sender authentication is not proof of individual identity. If the office replies from a different address or you need to follow up without a reply, use the official casework procedure outside this service. There is no automatic resend, AI auto-reply or dispatch to the registry. Cases can be closed; bounce/complaint events suppress further sends. At most three attempts per 24 hours, spaced by at least one minute, across the whole ledger.
- Every recognized incoming reply is recorded by provider ID, bounded plain-text preview, subject, sender, receipt time, authentication indicator and attachment count when supplied. HTML-only messages and long replies are flagged. Attachments, raw MIME, full HTML, original sensitive documents and unknown mailbox traffic are not copied into Git; review them in the provider's private dashboard while available. Inbound replay is deduplicated by email ID and delivery replay by webhook ID; signed request timestamps have a five-minute window. If the state write fails, webhook returns failure so the provider can retry according to its policy. No automated classification or send is triggered by a reply.
- If a send times out, or the provider accepts it but the final GitHub receipt fails, it remains pending. **Do not retry.** Check the provider dashboard for the message tagged with correspondence_id equal to the pending message ID. Enter the provider receipt into Reconcile; the service checks the retrieved provider record matches the exact reserved sender, recipient, subject, text, reply address and tag. If no matching provider evidence is available, leave the case pending or closed and contact the provider. The service never clears uncertain attempts automatically.
- Keep actual confidential correspondence separate from the public article. Do not publish raw responses or private data. The website's status.md and responses directory should only be edited manually with verified dispatch receipts and authorized redacted summaries, following the existing source/data/README.md. No public publication or dispatch status is updated by this service.

## Operational limits and recovery

One encrypted snapshot (480,000 plaintext bytes) is intentionally bounded; every update preserves a Git commit. Capacity errors fail closed. Do not delete or rewrite history to bypass capacity; export or migrate to a purpose-built secure store under an authorized retention policy before reaching the limit. This first version has no automatic archive/compaction, external backups, attachment ingestion, SMTP mailbox UI, per-user accounts, or guaranteed exactly-once delivery across GitHub and the mail provider. It records durable intent and fails closed on uncertainty. After a restart, use the same repo, branch, and encryption key. Audit all access, restrict GitHub privileges and provider tokens, protect key backups, and evaluate retention/privacy obligations; deleting one Git file does not erase its history. If the provider API contract changes, run a new controlled integration test. If credentials are compromised, disable live sending, rotate credentials and assess exposure.

References:
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://resend.com/docs/api-reference/emails/send-email
- https://resend.com/docs/api-reference/emails/retrieve-email
- https://resend.com/docs/api-reference/emails/retrieve-received-email
- https://resend.com/docs/webhooks/verify-webhooks-requests
- https://resend.com/docs/dashboard/receiving/introduction
- https://docs.github.com/en/rest/repos/contents
- https://docs.railway.com/builds/dockerfiles

## Structured knowledge and internal reply preparation

See [KNOWLEDGE.md](KNOWLEDGE.md) and [signals.example.md](signals.example.md). The optional automatic worker reads approved scoped Markdown from the private state repo and prepares internal proposals with source provenance and unresolved information. It never sends. Existing per-message approval, recipient authorization, reply checks and live-delivery limits remain in effect.
