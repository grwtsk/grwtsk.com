# Addressee data

Each JSON leaf under this directory represents one canonical published professional or official mailbox. The taxonomy is sector/function/leaf, not a campaign, a delivery list, or a transient research batch. A leaf ID and path are persistent; update contact details and incumbents in place rather than renaming a role when a person or address changes. Shared inboxes are recorded once, with source records, aliases and scopes. Two different role-specific inboxes remain different leaves. No private contact addresses, guessed address patterns, invented recipients, telephone-only directory rows, or directory URLs are counted as email leaves.

The existing nine organization catalogs at the parent level hold discovery and role metadata; their email-bearing records now refer to the canonical leaf with channel.addressee_ref. Those catalogs retain original stable record IDs and source facts. Resolve references relative to source/data/organizations/. A source may contain multiple records for the same mailbox; deduplication uses trimmed lowercase email, with exact source spelling retained where different. An address published in a source does not establish deliverability, authority, consent, or appropriateness for a particular letter. Verify current scope and channel before use. A listed officeholder is not a personal email destination.

## Acquisition

The 2026 California Roster Assembly and Senate pages were visually inspected. Literal published emails were transcribed without inferring missing addresses. Each acquired record cites its exact roster page; the roster is a snapshot and current incumbency is not certified. Vacant districts and absent emails are not invented. The prior 96 unique addresses are carried forward from repository research, not reverified in this migration. No personal/campaign emails were acquired from candidate records.

- 79 published Assembly office routes.
- 40 published Senate office routes.
- 96 unique existing mailbox routes normalized from the original catalogs.
- 215 distinct canonical email leaves total. The request for thousands remains incomplete; no count of directory slots is represented as email coverage.

See [coverage.json](coverage.json) for the count by taxonomy. There is no classifier, writing engine, or sending behavior in this data directory.
