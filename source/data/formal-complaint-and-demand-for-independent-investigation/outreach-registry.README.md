# California medical accountability outreach registry

This registry accompanies [the formal complaint](article.md). It is a directory for jurisdiction-specific reporting, constituent oversight and voluntary coalition formation, not a distribution list or a finding that any allegation is true. The Git repository is public.

## How to use

Open [outreach-registry.json](outreach-registry.json). It has three independent kinds of information:

- `contact_records`: published institutional office routes (including named public officeholders when available). These are not all distinct contact endpoints: APS uses a statewide ZIP-code routing service, for example.
- `directory_lookup_records`: public office and legal-referral coverage slots. Resolve the actual office, serving person and appropriate route using `sources` before use. These are not verified individuals, and office structures and incumbents may vary.
- `stanford_county_scope`: documented clinical locations separated from historical affiliates and outreach locations requiring current verification.

Each record has a stable ID, jurisdiction, purpose and verification status. Contact records include a source URL or source key; keys resolve to URLs in `sources`. A missing email means that no suitable public institutional email has been established. Do not guess an address from a person's name.

The initial snapshot covers all 58 California county district attorney offices, 57 named district attorney directory entries and two named U.S. senators. Mariposa's directory entry identifies an assistant DA rather than an established elected incumbent. It contains 203 contact-routing records and 990 additional directory lookup records; the 1,193 records do not establish 1,193 individuals or contactable recipients. Verify officeholders after the November 2026 election and at the time of contact.

## First steps

1. File specific complaints using the regulators' intake channels. The `workflow.priority_ids` field identifies initial routes. Determine the county of each alleged incident before making a criminal referral, and distinguish criminal prosecution from civil litigation. A Stanford facility in a county does not by itself give that county authority over an incident elsewhere.
2. Ask a certified lawyer referral service to identify qualified counsel for individual civil-rights, disability-access and malpractice questions. The registry does not enumerate private attorneys.
3. Ask the neurology departments and independent patient advocacy organizations to nominate willing, conflict-screened medical reviewers or coalition representatives. Use official departmental contact channels. For Dr. Bledsoe, the designated patient-care route is UCSF MyChart for individual nonurgent care matters; formal complaints belong with Patient Relations and competent regulators. Do not post individualized allegations in clinicians' professional forums or send them to unrelated clinicians.
4. For ongoing matters, ask about filing deadlines, accommodations and continuity of care. Formal complaint submissions must follow each agency's requirements; posting the article or sending a link does not necessarily file a complaint or preserve a legal deadline.
5. Record actual sends according to [the correspondence guide](../README.md). Do not mark `status.md` sent unless a dispatch actually occurred. Do not commit private medical records, contact details, private messages or confidential receipts. Obtain consent before publishing coalition membership.

## Maintenance

Refresh officeholder names and official contacts from their primary sources, checking the specific office's current website. Preserve stable IDs; update the research date and counts when making changes. Mark an unverified office or contact as such rather than inventing one. Track historic affiliation evidence separately from active clinical practice. The official California Roster city/town directory is included as a source for further municipal coverage; it has not been expanded into individually verified people in this snapshot.

This is an initial research registry, not exhaustive verification of all Stanford clinical affiliations, every prosecutor, every private civil-rights lawyer or every neurologist. It does not implement automatic dispatch, individual clinician email collection or a mass mailing workflow.
