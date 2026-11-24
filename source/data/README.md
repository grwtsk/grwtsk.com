# Correspondence data

Each immediate child directory is one article with a stable lowercase ASCII slug.
Only directories are publication inputs. Keep private material out of this public
repository. The generator reads Markdown with YAML front matter, not this README.

- `article.md`: immutable authored text with explicit title, author, written timestamp,
  language, description, category, and tags in front matter. Use level-two headings
  for primary sections; the page template supplies the only level-one heading.
- `status.md`: correspondence state and append-only send records.
- `responses/`: one Markdown file per actual response; the site links to each
  repository file and, when supplied, its public-record URL. An empty directory
  means no responses recorded. No fabricated examples are published.

Article front matter (all timestamps must be RFC 3339 with an offset):

```yaml
title: "Article title"
slug: article-title
description: "A concise factual description of the document"
author: "R.A. Jacob Martone"
language: en
written_at: "2026-11-24T01:21:26-08:00"
category: Correspondence
tags: [Patient rights]
citations: []
# published_at: "..."  # Only record an actual publication timestamp.
# modified_at: "..."   # Only record a genuine revision.
```

Status example (illustrative only; never copy example events into the live log):

```yaml
status: sent
sends:
  - at: "2026-11-25T09:00:00-08:00"
    recipient: "Recipient"
    method: "Email"
    reference: "Optional receipt identifier"
    public_record: "https://example.org/receipt"
```

Use `written` with no sends; switch to `sent` after a real transmission and
append later send records without rewriting the article. Reference and
public_record are optional. Response file names use lowercase ASCII slugs
(e.g. `2026-11-25-agency.md`). Response front matter:

```yaml
title: "Response title"
from: "Responding party"
received_at: "2026-11-25T12:00:00-08:00"
public_record: "https://example.org/record"
```

Store the response text below the closing delimiter. Omit public_record until
there is a real public record. Responses are separate from the original article
and from send history. Markdown body links must be absolute HTTP(S), mailto,
or root-relative site links; raw HTML is deliberately unsupported.
