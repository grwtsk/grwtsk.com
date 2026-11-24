# GitHub-first communications

The service is headless. Its root redirects to the public operations issue (#6); the former browser console and its assets have been removed. Protected maintenance operations use the authenticated API. The writing-review send lock remains in force.

Public operations: https://github.com/grwtsk/grwtsk.com/issues/6
Design and next obligations: https://github.com/grwtsk/grwtsk.com/issues/5

The existing Railway volume and authenticated Resend intake stay authoritative for protected originals and receipts. The public dashboard projects only opaque IDs, UTC dates, direction and enumerated receipt states for the consenting owner-test case. No addresses, bodies, headers, case aliases, private identifiers or third-party correspondence are exported. GitHub Actions reads the fixed public endpoint and updates the single issue using its built-in Issues-write token. No additional secret or repository is required.

Direct primary-address mail from the exact admitted owner-test address is automatically associated with its unique active case, or creates its first case. Other senders retain existing review boundaries.

For owner-test qualification only, a new authenticated message whose entire plain text is **Please confirm receipt.** (no attachments, no truncation, no extra instructions) can receive a fixed automated acknowledgment after the activation timestamp and a previous accepted send. No unanswered reminders. No automatic send based on AI output. Durable reservation, suppression, frequency bounds, and no-uncertain-retry invariants remain. An unsent human draft blocks automated replacement. Comment **Pause routine replies** or **Resume routine replies** on issue #6; only the immutable owner account ID is accepted, and edited or missing control comments fail closed. Emailing **Stop automated acknowledgments.** opts out without automatic re-enrollment. The worker polls every five minutes.

## Configuration

Railway: ENABLE_GITHUB_FIRST=true, GITHUB_FIRST_ACTIVATED_AT=<fixed ISO UTC timestamp>, ENABLE_OWNER_ROUTINE_ACKS=false, ENABLE_LIVE_SEND=false. The review-only source lock is authoritative. No additional addresses. The dashboard uses the default branch's GitHub Actions schedule, which can be delayed; an owner comment or manual run also triggers it.

## Remaining work

Issue-specific question/answer capture, validated public knowledge retrieval, AI-assisted routing and redacted summaries, richer issue dependencies, delivery reconciliation, per-participant opt-in and verified backup restoration remain outstanding. New substantive external sends require specific authorization. No raw third-party mail is published.

## Current production disposition

Writing-review phase: `WRITING_REVIEW_ONLY=true` in `writing-review.mjs`. Both dispatch flags are forced off and provider writes are disabled in the runtime. Public issue #11 is the writing-review surface. The first bounded model qualification selects source-controlled text variants for initial, acknowledgment, follow-up, corrective-action and outcome review. This is not unrestricted AI drafting or a real complaint submission. A separate reviewed source change and explicit authorization are required to re-enable sends.

## Read-only operational recovery

During writing review, provider list and retrieval operations are GET-only. A bounded recovery cycle rechecks authorized intake through the original authentication/admission path and reconciles pending send reservations only with exact provider evidence. No uncertain outcome is resent. Incomplete coverage and unresolved reservations are surfaced in the communications operations projection. The same-volume checkpoint does not replace off-volume disaster recovery.

## Deferred healthcare specification

Healthcare tracking, report-specific drafting and receipt linkage, and healthcare improvement automation are preserved in issue #7 and are not deployed. Reintroduction requires explicit owner authorization.
