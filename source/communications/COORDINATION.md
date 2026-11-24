# Issue-centered collaborative correspondence

The correspondence service maintains an encrypted internal issue ledger on the existing Railway volume. A case tracks one individually authorized office's email history; an issue tracks a requested action or question that may have more than one relevant case. The issue layer has **no send or publishing capability**. It does not change the sender's single-recipient transport or the existing approval, suppression and follow-up constraints.

## Internal coordination API

The following describes protected maintenance operations, not a routine owner workflow. Use the public GitHub issue system for ordinary report coordination.

1. Through the authenticated maintenance API, create a clear issue, responsible office/role and requested action. Record the status as open, waiting, resolved or closed as appropriate. A recorded owner is a proposed responsible role, not evidence that an office accepted an obligation.
2. Link the relevant existing correspondence case. Every recognized inbound reply and outbound attempt already persists in the case; the issue view derives an activity summary from linked cases and flags unsummarized replies. The issue projection tracks unlinked cases. Attach cases only when they address that issue.
3. Review a reply and record a concise redacted summary against its exact case and reply ID. The issue retains the fact that the office reported something, rather than asserting that the report is independently verified. A reply is summarized once per issue. Raw replies and private correspondence never enter a sharing preview.
4. Update the next action and status when new information arrives. Link related issues, or consolidate an active issue into another active issue. Consolidation preserves the source and target records, original case links, feedback, audit events and source scope. It does not transfer data, disclosure permissions or recipients. No automatic consolidation or escalation occurs.
5. If appropriate for an explicitly authorized collaboration, write a separate de-identified issue summary and optionally a separate de-identified feedback summary. Explicitly review each for disclosure. Prepare the group update preview. It contains only the approved sharing text, issue reference, status and neutral coordination prompt; no raw replies, recipient addresses, case references, private summaries, or linked-issue material. Review the full preview again before any manual sharing. Feedback sharing approval can be withdrawn for subsequent previews; prior Git history and external copies cannot be recalled.

The authenticated coordination API returns the issues, open/closed state, links, proposed office routes, and case activity. Mutations use encrypted ledger transactions and audit events. Limits are 150 issues, 300 links, 150 route nominations, 25 case references and 120 feedback records per issue, subject to the existing overall storage bound. There is no deletion or destructive merge in this version.

## Contributors and appropriate office routes

Use public GitHub issues for publishable process concerns, proposed changes, and voluntary participation. Do not use the public repository as a private complaint inbox or address book. No private collaboration repository is required. Access to a public issue is not consent to receive private mail.

Invited collaborators can file issue suggestions or propose an appropriate institutional office and its official intake page. They can link related issues in GitHub. The operator reviews the proposal and may record it in the private issue ledger as proposed, route-verified or declined. No nomination, link, issue or reviewed feedback automatically authorizes an email address. If a published role inbox or a consenting correspondent is genuinely appropriate for a specific case, verify it independently and use the existing AUTHORIZED_OFFICES_JSON configuration process. Never add private addresses, guessed contact details, member lists or unrelated people.

## Correspondence and AI

The primary recipient remains one authorized office. There is no mandatory CC, CC growth, reply-all, automatic forwarding, group mailing or automatic publication. For sensitive reports, follow the office's confidential submission process. Coordination can occur through de-identified updates and normal consent-based referrals, not by adding people to pressure a recipient. Actual interagency sharing requires an appropriate purpose and permission.

The existing Markdown signal engine remains case-scoped. If reviewed feedback establishes a new relevant fact or question, record a short approved redacted signal in the appropriate case's signals/approved.md entry (including the reply ID for a reply-summary). The model can prepare an internal case-specific reply from those signals. It cannot read the entire group repository or synthesize private replies across issues. Group previews are deterministic, not model-generated, to preserve exact reviewed text and avoid introducing unsupported assertions. They have no transport or publication integration.

## Verification and deployment

Run npm test in source/correspondence. All tests use synthetic cases and addresses; no real email or external collaboration is performed. Production uses the Railway volume and protected credentials described in README.md. The authenticated maintenance API is not a multi-user private collaboration interface. Public GitHub issues supply contributor identity and moderation separately.
