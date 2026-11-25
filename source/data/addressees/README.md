# Unified addressee taxonomy

This directory is the canonical source of addressee data for individuals, public officeholders, organizations, and institutional contact routes. Directories represent a stable sector and function; every JSON leaf represents an addressee or a specifically identified unresolved office role. No parallel research registries, aggregate recipient lists or duplicate address catalogs remain.

```text
addressees/
  <sector>/
    <function>/
      <stable-addressee-id>.json
```

IDs have the form `addressee:<sector>/<function>/<stable-id>`. Resolve the ID to its file under this directory, adding `.json`. Keep stable IDs when incumbents or channels change. A source observation is not a second addressee. Shared email inboxes are represented once; distinct functions with shared non-email routes may reference a role leaf. Do not infer addresses, private details, authority or involvement from affiliation. Individuals may be represented by their published professional contact address; named officeholders may instead be represented by the stable office and its official channel. Do not conflate an office mailbox with an individual's address.

Each leaf includes `id`, `addressee_type`, `name`, `taxonomy`, `email` (published address or null), `scope`, `source_status`, `publication_status`, `deliverability` and `sources`. Where applicable, it includes aliases, original source observations and channel facts, officeholders, shared route references and oversight relationships. Acquired leaves retain their source-specific metadata. Unresolved roles are not confirmed current contacts and never count as acquired email addresses.

## Coverage at last data update

| State | Leaves |
| --- | ---: |
| Recorded published email (requires recheck) | 611 |
| Non-email institutional route | 393 |
| Unresolved directory role or program | 619 |
| Total taxonomy leaves | 1623 |

| Sector | Leaves |
| --- | ---: |
| advocacy | 76 |
| civic | 16 |
| community | 58 |
| education | 20 |
| government | 1285 |
| healthcare | 90 |
| labor | 20 |
| legal | 10 |
| media | 48 |

The earlier acquisition objective was at least 2,000 actual distinct email addresses. 611 email-bearing leaves are recorded. The latest acquisition resolves 17 previously empty email fields (2 non-email routes and 15 directory roles) using published county contact pages, public contact directories cross-referenced with official rosters, and designated county APS information or reporting channels. Non-government directory addresses require official recheck; specialized reporting mailboxes are not general outreach destinations. The previous acquisition resolved 13 records. The previous acquisition resolved 31 records. Directory edition and page references are recorded; extracted text was available but page images could not be rendered, so current publication and deliverability require rechecks. The preceding acquisition resolved 23 records. The preceding acquisition resolved 12 records. Historical publications and purpose-specific channels require rechecks and are not equivalent to current complaint intake. The preceding acquisition resolved 15 records. The immediately preceding acquisition resolved 44 public office records. The preceding acquisition resolved 33 previously empty email fields. Source links and exact channel limitations are recorded in each updated leaf. The earlier acquisition resolved 144 previously empty email fields. Contact purposes and source limitations are retained in each leaf. Some addresses are role-specific and are not general complaint intake channels. Other historical contact claims are carried forward and still require rechecking; deliverability is untested. Acquisition must prioritize the article's actual subject and competent institutional channels, not the ease of obtaining unrelated directory records. Source records were grouped by existing canonical email, stable source identifier, or explicit matching institutional role. Ambiguous or unresolved roles retain separate records pending evidence. This is not a verified census of unique people.

The old aggregate catalogs are deleted from active source. Their 1717 contact and lookup observations were reconciled into leaves or nonrecipient references; 119 legislative placeholders were superseded by existing district-office leaves. All 163 typed oversight relationships are attached to source addressees with canonical target references. Shared medical-board routes are attached to appropriate role leaves and referenced rather than copied into registries. Separate evidence and outreach catalogs have been removed from active source. Their original research snapshots remain in Git history, not as generation inputs. Derive article-specific objectives from the [article](../articles/README.md) and relevant institutional facts from the individual addressee leaf. Any unavailable supporting fact is a research gap, not permission to infer it. No classifier, draft generation or delivery behavior is implemented by these files.
