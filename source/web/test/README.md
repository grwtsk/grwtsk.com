# Verification

Run the entire verification suite from the repository root:

```sh
npm --prefix source/web test
```

This builds the native parser and Rust generator, generates the real
correspondence site, builds the Vite distribution, runs Rust unit tests
and runs Node integration tests. [site.test.mjs](site.test.mjs) uses
temporary synthetic Markdown fixtures for behavior that may not occur
in the current data, and parses HTML with parse5 to check its actual DOM
rather than raw escape spellings.

## What must be verified

| Area | Expected behavior |
| --- | --- |
| Chronology and page templates | Newest full article, older links only in the homepage archive, permanent article pages |
| Single article | No archive, accurate initial status and empty histories in the fixture |
| Responses | Both full-article views link to the repository response, plus optional public record |
| Invalid input | Raw HTML, dangerous destinations, duplicate metadata, invalid dates and inconsistent status fail before output |
| JSON-LD | Valid JSON, stable document identifiers and safe escaping |
| Real site | Every authored article's permalink is present; Vite preserves generated document semantics; the static server delivers current content and stylesheet |
| HTTP policy | GET/HEAD success, health endpoint, unknown path 404, unsupported method 405, security headers and no source-directory exposure |

The actual-data smoke test must remain independent of which letter is
latest, how many letters exist, and whether sends or responses have
been recorded. Never freeze today's live content as a test expectation
that makes ordinary correspondence changes fail. Use temporary fixtures
for exact dates, titles and state assertions. Test fixtures must never
be written into source/data.

GitHub Actions runs the same suite and uploads the built site only on
success. For a failed run, open the first failing step and reproduce it
locally; do not bypass the test. Production verification is a separate
obligation: inspect actual public HTML after deployment using the
[deployment procedure](../README.md#publish-and-verify).

[Rust unit tests](../../generator/README.md) · [Data contract](../../data/README.md).
