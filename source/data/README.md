# Manage correspondence (no programming required)

This is the source of truth. Read this page when writing, sending or receiving
a letter. The three records are deliberately independent: the original letter,
its send history, and its responses. Publishing a letter on a website does
not mean it has been sent to anyone.

**Before changing anything:** open the relevant article's directory. Confirm
that the letter is the one intended. This is a public Git repository; do not
commit private medical records, private messages, credentials or unredacted
material that you have not chosen to publish. Git history retains earlier
commits even if a file is later deleted.

## 1. Add a letter

Create a directory under `source/data/` using a permanent lowercase ASCII
slug (letters, numbers and single hyphens, up to 120 characters). For example,
`request-for-records`. Once published, do not rename it: it determines the
permalink and response links.

Inside the directory create all three entries:

```text
request-for-records/
  article.md
  status.md
  responses/
    .gitkeep
```

Git cannot track an empty directory. The zero-content or blank
`responses/.gitkeep` file preserves that directory until responses exist.

### article.md

Copy the following complete format into the new file. Replace **every**
illustrative title, description, tag, slug and date with the actual facts.
The example timestamp is not an event to add to the log.

```markdown
---
title: "Request for records"
slug: request-for-records
description: "Request for access to specified records"
author: "R.A. Jacob Martone"
language: en
written_at: "2026-11-25T09:00:00-08:00"
category: Correspondence
tags:
  - Records access
citations: []
---

To the intended recipient:

Write the letter here.

## First section

Write the section here.

R.A. Jacob Martone
```

Both `---` lines are required. YAML front matter is the structured metadata
above the letter; the letter itself starts after the closing delimiter.
Use double quotes around timestamps and strings containing a colon followed
by a space. Use spaces, not tabs, for indentation. Do not duplicate the
title in the body: the template supplies its level-one heading. Begin
section headings with `##`; use `###` for subsections.

| Field | Meaning |
| --- | --- |
| title | Exact displayed article title |
| slug | Must exactly equal the directory name |
| description | Concise description of the document, not an independent verification of its claims |
| author | Authorship as it should appear in metadata |
| language | Language tag, e.g. en |
| written_at | Actual time the document was written |
| written_zone | Optional explicitly recorded display label: PST, PDT or UTC; must match the offset |
| category | Broad article category |
| tags | Optional list of relevant topics |
| citations | Optional list of actual HTTP(S) source URLs |
| published_at | Optional actual public publication timestamp |
| modified_at | Optional actual revision timestamp |

Use RFC 3339 timestamps: YYYY-MM-DD, T, hours:minutes:seconds, and the
actual UTC offset or Z. For California local time, -08:00 applies during
Pacific Standard Time and -07:00 during Pacific Daylight Time. Use the offset
that applied **at the event**, not necessarily today's offset. The optional
written_zone field preserves a known display label; use PST for -08:00,
PDT for -07:00, or UTC for zero. Omit it if uncertain. The numeric offset
is always retained in machine-readable time attributes. Unknown
publication or modification times should be omitted. Do not fabricate them.
The required written time is used for ordering; changing the send or
response history does not change that ordering.

### status.md for a new letter

Copy this exact initial state, including both delimiters:

```markdown
---
status: written
sends: []
---
```

Leave `responses/` empty except for .gitkeep. The site automatically shows
Written, No sends recorded, and No responses recorded.

### What happens after a verified build?

The most recently written article becomes the homepage. Every older article
moves into the index under it, without changing its permanent link
`https://grwtsk.com/articles/<slug>/`. Ties are resolved by slug. If only
one article exists, no past-articles index appears.

## 2. Record a send

A send is an actual dispatch to a specific recipient. Open the existing
article's `status.md`. Leave `article.md` alone. After the first actual send,
change status to `sent` and replace the empty list with the send record.

Example syntax (replace the illustrative date and recipient):

```markdown
---
status: sent
sends:
  - at: "2026-11-25T09:00:00-08:00"
    recipient: "Recipient or institution"
    method: "Email"
    reference: "Actual receipt or confirmation identifier"
    public_record: "https://example.org/actual-record"
---
```

Only `at`, `recipient` and `method` are required per send.
Omit `reference` or `public_record` if you do not have one; never publish a
placeholder URL. The public record must be an actual HTTP(S) URL.

For each subsequent send, append another item beginning with two spaces
and `- at:` under `sends:`. Keep the existing records in chronological
order (oldest first). Record distinct recipients or retransmissions as
distinct sends. Keep status `sent`. Use `written` only with an empty send
list. The generator rejects inconsistent status or sends dated before the
letter or out of chronological order.

## 3. Record a response

Create one Markdown file under that letter's `responses/` directory. Use
a stable lowercase ASCII filename such as `2026-11-25-agency.md`. Keep
the response text separate from the letter and the send history.

```markdown
---
title: "Acknowledgment of receipt"
from: "Actual responding party"
received_at: "2026-11-25T12:00:00-08:00"
---

Record the response text or an accurate public summary here.
```

Replace the example fields with facts. Only `title`, `from` and
`received_at` are required. The optional `public_record` field is
described below. Do not add an example file to the live directory.

The website links to each response file in this repository; it does not
copy the response body into the article. Responses are sorted by actual
receipt time. A response does not automatically create a send record or
change status: record any send independently if it occurred.
Do not put a README, PDF, private attachment or other non-Markdown file
in the response directory; use a public-record link to an appropriate
external record instead.

## 4. Attach a public record

When a public record exists, open the existing response's Markdown file.
Add the following optional field **inside the front matter**, above the
closing delimiter:

```yaml
public_record: "https://example.org/actual-record"
```

Replace that illustrative URL with the real public URL. If the public
record is not available yet, omit the field. The next build displays
both the repository-hosted response and the public-record link. Leave
the receipt date, original letter and send history unchanged.

## 5. Preview, verify and publish

From the repository root:

```sh
npm --prefix source/web test
npm --prefix source/web run dev
```

Alternatively, propose the data change through GitHub and check its
[build workflow](https://github.com/grwtsk/grwtsk.com/actions).
The test suite uses synthetic fixtures for status and response cases;
those fixtures are not published.

Check the actual article text, timestamp, status, send records and links.
Then follow the [web deployment guide](../web/README.md#publish-and-verify).
A passing build does not itself establish that the website has been updated.

## Markdown and validation rules

Use ordinary CommonMark/GFM syntax: headings, paragraphs, emphasis,
lists, blockquotes, code, tables and links. Raw HTML is rejected, as
are unsafe URL schemes and headings that skip levels. Body links must
be HTTP(S), mailto, fragment links, or root-relative site links;
images must use HTTPS or root-relative URLs and include alt text.
Do not depend on relative links to repository-only assets. Repository
response URLs are generated for you.

The parser bounds documents to 2 MiB, limits metadata complexity, requires
valid UTF-8 and rejects duplicate YAML keys. The generator rejects missing
or unknown fields, invalid times, duplicate or unsafe slugs, and invalid
status and response structures. Fix the indicated Markdown file rather
than disabling validation.

The existing first letter lives in
[its article directory](formal-complaint-and-demand-for-independent-investigation/).
These instructions govern all article directories. Do not store alternate
revisions in the data tree; use Git history.

## Reuse research across letters

Use the [shared knowledge library](../knowledge/README.md) for the nine [organization catalogs](../knowledge/organizations/README.md), separate historical and professional evidence, and stable themes. Store case-specific routing priorities, review questions and research-state values in the article's own outreach context rather than the shared catalogs. Refer to shared IDs from article-specific manifests rather than copying facts or importing prior case assertions. Keep the article's own evidence limits, source context and actual participation status separate. See the [offline writing proposal](../knowledge/OFFLINE-WRITING.md) for the review-only design. No draft or research record is a send.

[Return to the operating guide](../../README.md).
