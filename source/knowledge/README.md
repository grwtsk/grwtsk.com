# Reusable correspondence knowledge

This library holds public, reusable research outside the article directories. It is not a mailing list, a case tracker, a provider configuration or a publication input. The static generator expects the immediate children of `source/data/` to be article directories; do not place a shared library there.

| File | Responsibility |
| --- | --- |
| [writing-themes.json](writing-themes.json) | Stable cross-letter topic vocabulary; a topic alone grants no recipient eligibility. |
| [organizations/](organizations/README.md) | All nine canonical organization catalogs, including authority, community, clinical, legal, disability, newsroom and worker resources. |
| [historical-evidence.json](historical-evidence.json) | Public historical reporting and proceedings; source evidence only, never a recipient list. |
| [professional-evidence.json](professional-evidence.json) | Public professional-profile statements, source URLs and stable fact IDs; evidence only, never recipients. |
| [OFFLINE-WRITING.md](OFFLINE-WRITING.md) | Proposed offline classifier, context packaging and first-round writing-skill qualification. Not implemented or authorized to send. |
| [validate.mjs](validate.mjs) | Offline structural and referential validation for article manifests using these libraries. |

The [article outreach context](../data/formal-complaint-and-demand-for-independent-investigation/outreach-context.json) references the shared catalogs and retains case-specific routing priorities, review questions and original research-state fields. The [first article's manifest](../data/formal-complaint-and-demand-for-independent-investigation/community-support-and-professional-evidence.json) references these resources by stable ID and keeps the article-specific identity matches, caveats, formal-review routes and participation status. No resource is copied into another letter. A new letter can select existing IDs, add new sourced records here when needed, and add its own case-level limits without changing earlier letters. Keep the source URL and verification date on every record; recheck contact and eligibility before real use. A corrected fact replaces the active record; Git provides revision history.

## How to use this without remembering commands

Ask an assistant in the repository to reuse the relevant themes and resource IDs for the new letter, show the proposed change and validate it. The assistant must distinguish resource guidance, institutional routes, reported events and professional evidence. Do not mark an organization invited, participating or contacted merely because a draft exists. Review proposals through [writing review #11](https://github.com/grwtsk/grwtsk.com/issues/11). No email is authorized by this library or by a review comment.

The public repository must not contain confidential records, private witness details, personal contact information, raw correspondence or drafts with sensitive details. Public profile evidence is not a personal outreach directory. Keep protected information in the existing protected communications boundary. Do not derive allegations from affiliations or reuse a prior letter's case assertions without a specific, independently reviewed source link.

## Engineering

Run `node source/knowledge/validate.mjs` from a checkout; the site CI also runs this structural check. It performs no network requests and cannot generate or send messages. It checks catalog IDs, themes, case references, evidence eligibility and referenced formal-review route IDs. It does not verify that a source remains current, substantiate an allegation or test deliverability. All nine organization catalogs, 25 community resource records, three evidence profiles, seven source statements, two verification references and the separately indexed historical evidence were retained from the original article research (2026-11-24); no external source was rechecked during this migration.
