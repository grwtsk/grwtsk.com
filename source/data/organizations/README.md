# Organization and addressee data

The [addressees/](addressees/README.md) hierarchy is the canonical source of email addresses, organized as sector/function/one JSON leaf per addressee. Stable IDs identify public offices or organizational mailboxes; listed officeholders are role metadata rather than additional personal recipients. The nine catalogs below provide discovery, jurisdiction, role and source data. Email-bearing catalog records use `channel.addressee_ref` to reference a leaf instead of duplicating the email address. The [coverage summary](addressees/coverage.json) counts actual distinct email leaves, not lookup slots. They are outside every article directory, and do not enroll recipients or imply endorsement. Stable source record IDs, official channels, jurisdictions, purpose, limitations and source verification dates remain intact. Schema v2 of the eight relocated registries separates case-specific fields from shared facts; the community support catalog retains its existing schema.

| Catalog | Records and purpose |
| --- | --- |
| [outreach-registry.json](outreach-registry.json) | Public institutional routes and unresolved directory coverage |
| [authority-oversight.json](authority-oversight.json) | Competent authorities, jurisdiction and typed relationships |
| [medical-board-oversight.json](medical-board-oversight.json) | Medical Board and related oversight offices, roles and shared channels |
| [community-support.json](community-support.json) | Community, disability, family, ethics and spiritual resources |
| [disease-disability-and-civic-resources.json](disease-disability-and-civic-resources.json) | Disease, disability, patient-rights and general civic resources |
| [news-media-resources.json](news-media-resources.json) | Newsroom and tip channels with editorial and confidentiality limits |
| [peninsula-community-and-neurology-resources.json](peninsula-community-and-neurology-resources.json) | Community services, clinical programs and directory references |
| [victim-support-and-stanford-investigations.json](victim-support-and-stanford-investigations.json) | Victim support and competent institutional investigation routes |
| [worker-rights-and-related-incident-reports.json](worker-rights-and-related-incident-reports.json) | Labor, disability and worker-support organizational routes |

Historical reporting, proceedings and representation records moved to [historical-evidence.json](../evidence/historical-evidence.json). The original article's [outreach context](../outreach/formal-complaint-and-demand-for-independent-investigation/outreach-context.json) retains the original case-specific priorities, process notes, review questions and research-state values. These are not shared participation or dispatch state, and must not be imported into another letter. The [community and professional manifest](../outreach/formal-complaint-and-demand-for-independent-investigation/community-support-and-professional-evidence.json) retains case-specific evidence references and identity caveats.

For a future letter, reference relevant canonical addressee IDs and catalog record IDs in its own context. Recheck current sources, legal entity, jurisdiction and channel purpose before any real communication. Directory references and evidence-only records are not recipients. Do not guess contact addresses or infer a person's involvement from institutional affiliations. No sending functionality is provided here. See the [offline writing proposal](../OFFLINE-WRITING.md) and [data guide](../README.md).
