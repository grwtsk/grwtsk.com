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
| JSON-LD | Valid JSON, linked WebSite/WebPage/Article identities, conditional ItemList, separate response Messages and safe escaping |
| Real site | Every authored article's permalink is present; Vite preserves generated document semantics; the static server delivers current content and stylesheet |
| Visual layout | Original column, font sizes, stacked metadata, mobile and dark-mode rules checked in a real browser |
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

## Browser layout regression

[layout.browser.mjs](layout.browser.mjs) checks the built static distribution,
not a copy of the initial HTML. Chromium evaluates computed styles and
geometry at desktop, mobile and narrow widths, in light/dark modes, and
checks print behavior. It verifies the exact shared article geometry on
the homepage and permalink, the stacked metadata lines, column width,
spacing, type scale and colors. It saves viewport screenshots as CI
artifacts, not as checked-in historical layouts. Assertions are based on
the approved design contract, not the length or number of current letters.

CI installs the explicitly pinned playwright-core test tool in an isolated
temporary directory and provisions its Chromium version. It is not a
dependency of the static production service. To run the same check locally
after a successful build, from the repository root:

```sh
browser_tools="$(mktemp -d)"
npm install --prefix "$browser_tools" --no-save --package-lock=false --ignore-scripts playwright-core@1.57.0
node "$browser_tools/node_modules/playwright-core/cli.js" install chromium
PLAYWRIGHT_MODULE="$browser_tools/node_modules/playwright-core/index.mjs" \
  LAYOUT_ARTIFACT_DIR="$browser_tools/previews" node source/web/test/layout.browser.mjs
```

Open the screenshot directory printed by your terminal variable
`$browser_tools/previews` for visual inspection. In GitHub Actions,
download the layout-previews artifact. A passing layout test is not
evidence that the public host has deployed the build.

## Analytics regression checks

The HTML5/HTTP suite requires exactly one analytics bootstrap, the approved
asynchronous GTM container loader and the inert JSON-LD block in each
generated page. It hashes the emitted bootstrap and checks that the server
CSP authorizes that exact text without permitting arbitrary inline code.
Chromium tests intercept the Google loader with a deterministic local stub,
check that dataLayer was initialized first and check CSP violations. No
actual analytics events are sent by CI. Live collection must be checked
separately with the configured analytics account.
