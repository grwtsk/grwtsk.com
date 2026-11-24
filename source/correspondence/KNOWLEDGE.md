# Structured communication: write once, reuse within the correct case

The service reads the reviewed, public-safe signals Markdown bundled with its deployment. The optional legacy private-state adapter uses a separate private repository. The service retrieves the Markdown at a pinned Git commit, parses it, and builds a bounded, scoped context for one existing case. The AI can use that context to prepare internal proposals. It has no mail tools, web tools, credentials, or arbitrary repository search. No proposal is sent without the existing exact-draft approval.

## Set up once

1. Maintain [signals/approved.md](signals/approved.md) as reviewed, deliberately public-safe input. Copy [signals.example.md](signals.example.md) as the starting format, keeping only applicable entries. The example is synthetic.
2. The protected maintenance API supports an existing individually authorized case and its scoped signals. Do not publish private case identifiers or reply addresses. A case-level request is required for proposals.
3. Only mark a redacted entry "ai: approved" if it is appropriate to share with the configured AI provider. The standing approval applies to the current entry content; edit it only after reviewing the new wording. Use "ai: local-only" to exclude it. Do not put sensitive records, raw messages, medical details, private identifiers, credentials, or other confidential evidence in Markdown. The deployed Markdown is plaintext in public Git history; the application ledger remains encrypted.
4. The maintenance API supports preparation from Markdown, and ENABLE_AUTO_DRAFTS controls the optional internal scheduler. The scheduler checks once on startup and every five minutes, at most one new proposal per cycle, with a minimum 60-second separation and 12 proposal attempts per rolling day across the ledger. It never calls the send route.

## Markdown schema

Use the heading "## Communication signals v1", followed by one "### stable-id" heading per entry, then these exact fields in order, a blank line, and the Markdown body:

- kind: fact, request, preference, decision, question, coordination, or reply-summary.
- scope: general, office:authorized-office-id, or case:case-uuid. General and office scopes may contain generic preferences and coordination instructions only; substantive facts, requests, decisions, questions, and reply summaries must be case-scoped.
- state: active or retired. Retire superseded claims; use stable IDs for corrected material.
- evidence: documented, firsthand, reported, uncertain, or instruction. A question is uncertain, a reply summary is reported. A documented label is operator-supplied, not independent verification.
- source: a short provenance note (document reference, date, or explanation of instruction). Do not include confidential identifiers. This is stored in the source Markdown and visible to the operator; only signal IDs, kind, evidence and body are supplied to the model.
- reply: none, except for a reply-summary, where it must be the UUID of the reviewed incoming reply.
- ai: approved or local-only.

The parser rejects duplicate IDs, unrecognized metadata and oversized input. Bound: 48 KB, 80 entries, 2,500 characters per body, 24 KB selected context. Do not insert another level-three heading inside an entry body. Use lower headings or ordinary Markdown lists. Empty files must retain the exact top heading. The existing case record is separate from this knowledge file; do not edit encrypted ledger contents by hand.

## Reusing information and coordinating

Keep one accurate entry for each fact or decision; do not copy the same prose into every outgoing draft. Use an active case request to establish what is being asked. A new reply is stored privately by the existing mail receiver. Review it and, when it introduces new information or a question, enter a short redacted reply-summary linked to its reply ID (available through the authenticated maintenance API). The service reuses all eligible active facts, preferences and prior decisions automatically; it does not pass the raw incoming email to the AI. Prior sent text and replies remain in the encrypted ledger, not in AI context by default.

The model returns a subject, body, referenced signal IDs, unresolved information and an operator coordination note. It is instructed to answer from existing information without asking for it again, distinguish evidence and allegations, and ask for an appropriate official referral or consent-based coordination when relevant. It cannot determine whether an office has accepted responsibility, share a different case's notes, add recipients, or arrange cross-office exchanges. Unknown information remains unresolved. Model-reported signal IDs are provenance aids, not proof that every assertion is supported.

A durable proposal reservation prevents repeated preparation of an identical case/context/reply fingerprint. A changed relevant signal creates a new fingerprint; unrelated edits do not. A failed or interrupted reservation is not automatically retried; the original signals are retained and manual drafting remains available. Before saving an AI-derived proposal and reserving its send, the service rechecks that the relevant approved context and reply match. An edit concurrent with that check can still race: the Markdown commit and encrypted ledger update are separate GitHub operations. The specific snapshot and fingerprint are retained with the draft and outbound record. Keep the notes stable while approving a message.

The public report-level writing workflow is reviewed in GitHub issues. Protected internal proposals can be inspected programmatically through the authenticated maintenance API. No message can be sent during the current writing-review phase. If a recipient's reply cannot be authenticated or came from a new address, use that office's designated intake procedure. The system never automatically sends or follows up on unanswered messages.

## Limits

The server searches this bounded curated Markdown file, not the entire web, external repositories or private email accounts. It does not infer facts not recorded, certify evidence, automatically ingest unredacted correspondence, execute prompt instructions embedded in records, or autonomously contact other offices. Existing ledger capacity limits apply to internal proposals. The optional scheduler prepares internal proposals, not external messages. Normal production operation is headless on Railway.

## Volume storage option

See [RAILWAY-VOLUME.md](RAILWAY-VOLUME.md). In volume mode, the authoritative private state and admitted originals are stored in encrypted SQLite on a persistent volume, not a private GitHub repository. Approved public-safe Markdown is bundled from source/correspondence/signals/approved.md. Public records remain reviewed exports; no raw email is published.
