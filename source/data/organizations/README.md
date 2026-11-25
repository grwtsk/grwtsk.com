# Unified addressee taxonomy

This directory is the canonical source of addressee data. Directories represent a stable sector and function; every JSON leaf represents an addressee or a specifically identified unresolved office role. No parallel research registries, aggregate recipient lists or duplicate address catalogs remain.

```text
organizations/
  <sector>/
    <function>/
      <stable-addressee-id>.json
```

IDs have the form `addressee:<sector>/<function>/<stable-id>`. Resolve the ID to its file under this directory, adding `.json`. Keep stable IDs when incumbents or channels change. A source observation is not a second addressee. Shared email inboxes are represented once; distinct functions with shared non-email routes may reference a role leaf. Do not infer addresses, private details, authority or involvement from affiliation. Named officeholders identify public professional roles only.

Each leaf includes `id`, `addressee_type`, `name`, `taxonomy`, `email` (published address or null), `scope`, `source_status`, `publication_status`, `deliverability` and `sources`. Where applicable, it includes aliases, original source observations and channel facts, officeholders, shared route references and oversight relationships. Acquired leaves retain their source-specific metadata. Unresolved roles are not confirmed current contacts and never count as acquired email addresses.

## Coverage at consolidation

| State | Leaves |
| --- | ---: |
| Recorded published email (requires recheck) | 245 |
| Non-email institutional route | 459 |
| Unresolved directory role or program | 916 |
| Total taxonomy leaves | 1620 |

| Sector | Leaves |
| --- | ---: |
| advocacy | 76 |
| civic | 16 |
| community | 58 |
| education | 18 |
| government | 1284 |
| healthcare | 90 |
| labor | 20 |
| legal | 10 |
| media | 48 |

The earlier acquisition objective was at least 2,000 actual distinct email addresses. Only 245 are recorded; consolidation acquired none. Published contact claims are carried forward, not independently reverified; deliverability is untested. Source records were grouped by existing canonical email, stable source identifier, or explicit matching institutional role. Ambiguous or unresolved roles retain separate records pending evidence. This is not a verified census of unique people.

The old aggregate catalogs are deleted from active source. Their 1717 contact and lookup observations were reconciled into leaves or nonrecipient references; 119 legislative placeholders were superseded by existing district-office leaves. All 163 typed oversight relationships are attached to source addressees with canonical target references. Shared medical-board routes are attached to appropriate role leaves and referenced rather than copied into registries. Source metadata, pure directory references and historical-only observations live in [evidence/research-references.json](../evidence/research-references.json); article-specific objectives are in [outreach/](../outreach/README.md). Original snapshots remain in Git history. No classifier, draft generation or delivery behavior is implemented by these files.
