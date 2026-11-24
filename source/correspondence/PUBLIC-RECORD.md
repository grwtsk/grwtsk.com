# Focused intake and public correspondence record

The public-record goal is to account for actual correspondence without broadcasting private original messages or unverified allegations. The private GitHub repository remains authoritative for the underlying archive and encrypted ledger. The public website repository is a separate publication surface.

## Admission policy

The service uses the individually reviewed AUTHORIZED_OFFICES_JSON configuration, not every address in an outreach registry. It matches the exact normalized From address and requires Resend's server-computed DMARC result to be pass. DMARC authenticates the sending domain, not the identity of a person; the operator still reviews correspondence. Resend's received_for is derived from Received headers and does not independently establish identity. Case alias routing must match the authorized office and not be ambiguous or closed.

- Unknown sender, wrong mailbox or unverified authentication: acknowledge the webhook without storing the body in the application, using AI or replying. Original messages may remain in the provider dashboard, subject to its retention. No permanent provider-side deletion is implemented.
- Authenticated listed sender with automation/list headers or mismatched/ambiguous case route: archive privately with held status; do not attach to an active case or give the content to AI.
- Authenticated listed sender without those indicators: archive as admitted. Only a matching case alias may automatically index the message. Direct primary-address correspondence requires explicit association and review. Header checks are conservative heuristics, not a reliable spam classifier; even admitted email can contain malicious or irrelevant text.

Do not automatically answer an unknown sender: this creates a spam/backscatter and prompt-injection path. Review exceptional high-value messages in the provider dashboard; if appropriate, independently verify the official or consenting correspondent before adding it to the limited authorization configuration and recover its provider ID. Never treat the full contact registry as authorization. Incoming text is data, not instructions. The existing case review and Markdown approval rules remain in effect. No inbound content is supplied directly to the AI.

## Public record

In the operator interface, select a case and Refresh coverage. Choose an eligible provider-accepted send or reviewed authenticated reply; alternatively open an admitted primary-inbox archive record. Select:

- Receipt only: date, direction, actual receipt status and a content-withheld label, no original text.
- Reviewed public summary: a short plain-text summary composed and reviewed for accuracy, relevance, disclosure authority and third-party privacy. A statement that the operator chooses to disclose their own information does not authorize disclosure of other people's information or confidential material. Do not include private details of other people, credentials, raw email headers, confidential case identifiers, attachments, addresses or individually identifying accusations. Use receipt-only when disclosure cannot be cleared. Contact/markup checks are incomplete guardrails and do not certify redaction.

Confirm the exact disclosure. The system records one stable public export per underlying message in the private ledger, deduplicated by outbound ID or inbound provider ID; direct archive and case reply reference the same inbound message. The export includes a public random ID, UTC date, direction, receipt status and optionally the reviewed summary. It excludes private source IDs, original subject, body, addresses and attachment data. The service deliberately has no public-repo write token. Copy the reviewed exact Markdown to the indicated public path under source/data/formal-complaint-and-demand-for-independent-investigation/public-correspondence/ and commit it via a reviewed GitHub change. The exported hash is for checking the Markdown bytes. The service does not claim the file is published or update status.md automatically. This auxiliary directory is repository-visible; no website rendering changes are included. Corrections to previously exported text require review rather than silently overwriting the approved record. Coverage tracks prepared records, not actual publication.

Public Git history, forks and caches may retain information even after deletion. Do not use the public repository as the raw email store. The protected inbound archive still has the existing bounded message bodies and attachment metadata, and the encrypted outgoing ledger preserves actual attempts and receipts. Full MIME/attachment persistence remains outstanding. A receipt is not proof of delivery, investigation, legal filing or a finding. The application does not publish messages, reply automatically, or expand the contact list.

## Deployment

The admission policy is fail-closed: an empty authorization list accepts no incoming email into the application. Test with an owned address and verified DMARC, plus unknown sender, forged header, automation header, wrong case, replay, and unverified-authentication fixtures. Resend can return gray or unknown for otherwise legitimate correspondence; those cases require review and an authenticated route. Keep live sending disabled until qualification. Review source documentation:
- https://resend.com/docs/api-reference/emails/retrieve-received-email
- https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository

## Volume storage option

See [RAILWAY-VOLUME.md](RAILWAY-VOLUME.md). In volume mode, the authoritative private state and admitted originals are stored in encrypted SQLite on a persistent volume, not a private GitHub repository. Approved public-safe Markdown is bundled from source/correspondence/signals/approved.md. Public records remain reviewed exports; no raw email is published.
