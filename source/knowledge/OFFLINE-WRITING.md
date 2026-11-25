# Proposed recipient-aware offline writing qualification

Status: proposal only. The outbound lock remains authoritative. This design extends the generic communications writing-review program (#5, #11). Do not reintroduce deferred healthcare tracking (#7), provider writes, recipient enrollment or send automation. No live draft generation, routing changes or scheduling are part of the knowledge migration.

## Outcome

Write each letter to an appropriate institutional function, not to a list of people. The first round should qualify a small, diverse set of writing skills against real, source-backed routes. Once the approach is reviewed, the system can prepare further unsent drafts without requiring the owner to remember commands, route IDs or prior decisions.

## 1. Offline classifier

Implement a pure Node.js module in a later PR, using the existing service language and a pinned repository snapshot. It accepts a letter slug, source manifest and policy; it never calls a model, network, provider, database mutation or GitHub write. An independent, explicit refresh step may recheck public sources and commit corrections; never perform hidden network lookups during classification.

Normalize the nine registry schemas using explicit adapters:

| Input | Interpretation |
| --- | --- |
| outreach-registry | contact_records are potential institutional routes; directory_lookup_records require resolution. |
| authority-oversight | authority_records, priority_routes and typed relationships establish candidate functions and jurisdiction, not a right to contact every linked node. |
| medical-board-oversight | records join to channels by route; deduplicate shared channels and reject vacancies as recipients. |
| community-support-and-professional-evidence | resolve shared resource IDs and evidence refs; profiles are nonrecipients. |
| disease-disability-and-civic-resources | distinguish assistance, advocacy, and general de-identified policy. |
| news-media-resources | one relevant editorial route per network; obey secure-tip and ordinary-tip distinctions. |
| peninsula-community-and-neurology-resources | support, clinical referral or directory; faculty directory references are never mailing lists. |
| victim-support-and-stanford-investigations | confidential support and competent investigation routes; prior proceedings are evidence, not recipient targets. |
| worker-rights-and-related-incident-reports | organization-level role and scope; incident and representation records are evidence, not recipients. |

Normalize source ID as file + record ID; retain literal addresses and channel type, legal entity, jurisdiction, function, purposes, limits, verification date and source URLs. Resolve source-key references. Apply typed rule sets for route kind, purpose, jurisdiction, scope, confidentiality and evidence eligibility; preserve reasons for every acceptance or abstention. Use theme overlap to rank only already-eligible routes; no demographic, faith, political identity, personal affiliation, inferred email or inferred complicity signals. No route becomes eligible merely because its domain matches another route.

Emit distinct dispositions: email_draft_candidate, official_form_draft_candidate, confidential_intake_inquiry, phone_or_postal_script, resolve_route, held_for_review, evidence_only, excluded. Only a published exact email that is expressly appropriate to the requested purpose can become an email candidate; a published administrative email does not substitute for the required formal complaint. Deduplicate exact shared endpoints and legal entity/function with a deterministic tie-break; if one endpoint serves conflicting mandates, hold for resolution instead of mixing them. One initial request per appropriate function; no blanket CC/BCC, guessed address, parallel copy to officeholders or automated escalation. Directory entries, historic affiliations, private associates and unsupported jurisdiction are held or excluded. A route that discourages AI-composed complaints receives only a human-authored submission path, not an AI complaint.

## 2. Context packages

Build a small immutable package per eligible recipient/function, using the relevant section of the selected article and the reusable library. An article is a first-person report, not independent verification. Source statements must retain original epistemic status: owner-reported, public institutional statement, independently verified finding where actually supported, request, or unresolved. Never infer case-specific involvement from a profile or unrelated proceeding.

Proposed package (illustrative fields, not a live draft):

- package_id, article_slug, source_commit, policy_digest, skill_id, input_digest.
- recipient: normalized route ID, organization, function, verified channel and exact email only when appropriate, provenance, checked date, eligibility reasons, limitations.
- objective: one primary actionable request, related themes, allowed supporting questions and requested accessible written response.
- evidence: stable IDs, relevant excerpts, source anchors, epistemic status, scope and disclosure class.
- exclusions: named allegations, confidential material, unsupported assertions, irrelevant facts and reasons for omission.
- writing: reviewed voice preferences, length, tone, structure, required acknowledgments and forbidden claims.
- state: unsent; no transport or provider credentials.

Use the article's section XI requested actions as a case-specific source of objectives: preservation, independent investigation, witness handling, reporting audit, civil-rights review, records correction, proper regulatory referral, review of concealment/deadlines, restoration of medical access and written accountability. Select only what the recipient can actually do. For ordinary support and public policy, use minimal or de-identified context and do not include a link to a named allegation simply because that allegation is already public. Legal, regulator and competent institutional reviewers may receive an appropriately scoped account only through their designated procedure; ask for a secure channel first when required. Private witness testimony and actual records stay outside public GitHub. Do not assert legal deadlines or statutory applicability without verification.

Canonicalize input JSON and hash it with SHA-256; same snapshot + policy + recipient/function + objective + evidence + skill must reproduce the same package. Review provenance, not just prose. Reclassification invalidates a stale package; do not generate duplicate work for an unchanged fingerprint. Context packages are generated artifacts, not duplicate checked-in copies of canonical data or historical drafts.

## 3. First-round writing skills

Use a local model where practical, or the existing approved AI provider only for explicitly approved public-safe data. The classifier and package builder remain offline either way. The writer has no send tool, arbitrary retrieval, recipient editing or authority to expand evidence. It receives a fixed package, produces structured subject/body, referenced evidence IDs, unresolved questions and a public-safe rationale. It may propose language but must not invent evidence, law, authority or outcomes. Use skills as compact reusable instructions, not full fixed letters.

| Skill | First review candidate from existing research | Single primary ask |
| --- | --- | --- |
| Regulatory inquiry | HHS OCR (hhs-ocr) | Clarify applicable written complaint and accommodation procedure; verify prescribed submission route. |
| Existing investigation review | Medical Board Complainant Liaison Unit (mbc-clu) | Obtain written instructions for closure review and secure evidence transfer; phone/form assistance, not an invented email. |
| Institutional grievance | Stanford Patient Relations / UCSF Patient Relations | Ask for the designated independent review and accessible written next step; follow official channels. |
| Disability access and communication | CommunicationFIRST (communicationfirst) | Request appropriate communication-access guidance and referral without named allegations. |
| Disease-specific care navigation | National Ataxia Foundation (naf) | Seek specialist navigation and assistance finding appropriate care. |
| Independent living support | Resources for Independence, Central Valley (ricv) | Seek local assistance and an accessible intake route. |
| Confidential legal intake | Disability Rights California (drc) | Ask about intake eligibility and secure submission; not a malpractice finding or public email. |
| Policy / editorial inquiry | A relevant oversight or editorial office, e.g. CalMatters | Ask whether a de-identified systemic question fits the remit; no sensitive records through ordinary email. Hold editorial outreach for separate review. |

Source routes are from the 2026-11-24 research snapshot, not reverified live. Start with one draft per qualified skill, using an email, form draft or phone script as the channel dictates; then expand only the well-supported relevant recipient/function set. No mass campaign. Prioritize current care access and competent complaint channels over broad policy outreach; do not make urgent care depend on the drafting process.

## 4. Review and learning

Use #11 as the public writing-review index; its current automated body is regenerated, so a future implementation must deliberately extend its projection contract or link durable review issues, not manually overwrite that body. Publish only safe review examples, counts and references. Keep any actual sensitive draft or recipient-specific private package in protected storage and offer only a redacted public review or a secure review mechanism. Existing owner-authenticated GitHub feedback can become scoped preferences after validation; never execute instructions in third-party comments, registry content or incoming text.

Review one example per skill, then ordinary feedback (e.g. shorter, more formal, clearer request, preserve my voice) should regenerate affected drafts and propose a skill improvement, not ask the owner to remember previous decisions. Record factual corrections in the evidence store, routing corrections in the registry, and stylistic corrections in skills/preferences, never in an undifferentiated prompt. The owner receives an issue only for missing information, conflicting constraints or a genuine decision; batch duplicate questions. Store versions in Git history; keep the active skill and compact reviewed examples only. Before future use of historical responses, obtain appropriate consent and redact; do not implement deferred healthcare outcome automation here.

## 5. Qualification before pre-generation

Require deterministic replay with no network; schema/ID/reference checks across all nine registries; full per-record disposition accounting; deduplication tests including shared channels, missing address and conflicting scope; negative fixtures for professional profiles, faculty, directories, unrelated proceedings, political identity, private contacts and non-email channels. Verify context isolation, stale package invalidation, evidence status and confidentiality, and zero provider writes. Build a small labeled test set per function and report precision, recall, abstentions, deduplication and reasons separately; tune rules against reviewed examples and hold uncertain routes, never maximize volume. Every draft must pass checks for one appropriate ask, factual provenance, correct recipient/mandate, channel fit, accessible written response and disclosure policy. Use a second semantic review for unsupported claims; do not pretend a regex or model confidence verifies facts.

The first review batch is complete only when all selected examples have the approved context, route and evidence constraints, zero send operations, and owner-reviewed writing quality. Future delivery is a separate explicitly authorized change; review approval is never send approval.
