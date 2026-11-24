# Headless correspondence service

**Use GitHub, not a separate mailbox interface.** The service runs in the background on Railway; the public website and its visual layout are independent.

## Operational entry points

| GitHub issue | Purpose |
|---|---|
| [#8](https://github.com/grwtsk/grwtsk.com/issues/8) | Healthcare report index, open questions, and lifecycle |
| [#14](https://github.com/grwtsk/grwtsk.com/issues/14) | Initial healthcare report and unsent writing review |
| [#11](https://github.com/grwtsk/grwtsk.com/issues/11) | General writing preferences |
| [#10](https://github.com/grwtsk/grwtsk.com/issues/10) | Evidence-based workflow refinement |
| [#6](https://github.com/grwtsk/grwtsk.com/issues/6) | Correspondence infrastructure status |

The service root redirects to #8. There are no browser assets, mailbox pages, or operator login screens. GitHub issue comments and forms remain the ordinary workflow. Use protected channels for confidential information, never public issue comments or Git history.

## Runtime architecture

- Signed Resend inbound and delivery webhooks at `/webhooks/resend`. Unknown or unverified senders are excluded; held mail does not enter AI prompts.
- Encrypted SQLite ledger and inbound archive on the existing Railway volume at `/data/correspondence/correspondence.sqlite`. The encryption key and provider credentials remain in protected configuration.
- Report-specific writing, exact owner decision capture, public-safe projections, scoped receipt linkage, and aggregate workflow improvement analysis. GitHub Actions publish only the validated projections.
- Public machine endpoints: `/healthz`, `/coordination/status`, `/writing-review/status`, and `/report-review/status`. The authenticated `/api/*` maintenance endpoints remain available for programmatic recovery and protected records, not as a user interface.
- **Writing-review mode:** `WRITING_REVIEW_ONLY=true` blocks outbound email at the route, runtime configuration, and provider adapter. Approval of wording does not authorize sending. Do not bypass the lock.

## Engineering and recovery

The deployed service is isolated from the static website, follows reviewed commits from main, uses one replica and retains its existing volume. Do not change DNS, secrets, recipient configuration, or the volume when changing application code. The legacy private GitHub storage adapter is not needed for production.

See [GitHub-first architecture](GITHUB-FIRST.md), [Railway volume](RAILWAY-VOLUME.md), [mail transport and archive](PERSONAL-MAILBOX.md), [public disclosure](PUBLIC-RECORD.md), [coordination internals](COORDINATION.md), and [knowledge internals](KNOWLEDGE.md) for maintenance details.

CI uses Node.js 22, synthetic test data and fake upstream transports; it also builds the service Docker image. Run `npm test` in this directory only when maintaining the code. Normal use requires no local commands. The health endpoint establishes liveness, not provider connectivity or independent clinical verification. Bounded provider recovery and local encrypted checkpoints do not replace off-volume backup and recovery qualification.
