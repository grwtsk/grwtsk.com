# Communications system

A general-purpose headless communications service. GitHub is the only normal user interface; the static public website is independent.

| GitHub issue | Purpose |
|---|---|
| [#6](https://github.com/grwtsk/grwtsk.com/issues/6) | Operations and communication receipts |
| [#11](https://github.com/grwtsk/grwtsk.com/issues/11) | Unsent writing review and preferences |
| [#5](https://github.com/grwtsk/grwtsk.com/issues/5) | System design and outstanding qualifications |

The service root redirects to #6. No browser console, mailbox pages or operator login screens are shipped.

## Runtime

- Signed Resend webhooks at `/webhooks/resend`; exact admission rules and encrypted archival storage.
- Protected SQLite ledger and archive on the existing Railway volume at `/data/correspondence/correspondence.sqlite`. The old volume path, database name and encryption AAD are storage compatibility contracts, not source paths. Do not rename them.
- General writing review and preferences, fixed-schema public receipts, read-only missed-intake recovery and exact provider-evidence reconciliation.
- Public machine endpoints: `/healthz`, `/coordination/status`, and `/writing-review/status`. Authenticated `/api/*` maintenance endpoints are not a user interface.
- **Outbound delivery is locked.** `WRITING_REVIEW_ONLY=true` and the disabled production flags remain in force. No issue comment authorizes a send.
- Healthcare-specific tracking, forms, report drafting automation and healthcare improvement automation are deferred to [issue #7](https://github.com/grwtsk/grwtsk.com/issues/7). Do not implement them until explicitly authorized.

## Engineering and recovery

Railway builds the service from `/source/communications`, one replica, with its existing volume, domain and protected configuration. The backend does not require a private GitHub repository. Do not change the website deployment, DNS, secrets, recipient list or persistent state during source refactors.

See [GitHub-first architecture](GITHUB-FIRST.md), [Railway volume](RAILWAY-VOLUME.md), [mail transport and archive](PERSONAL-MAILBOX.md), [public disclosure](PUBLIC-RECORD.md), [coordination internals](COORDINATION.md) and [knowledge internals](KNOWLEDGE.md). CI runs Node.js 22 synthetic tests and builds the Docker image without live email. Local encrypted checkpoints do not substitute for off-volume recovery.
