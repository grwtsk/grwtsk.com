# grwtsk.com

An unbranded, static correspondence log. Markdown is the single source of truth.

```
source/
  data/          Published articles, send histories and repository-hosted responses
  parser/        C++20: YAML front matter + CommonMark/GFM AST → JSON
  generator/     Rust: strict schema, ordering, embedded HTML templates and JSON-LD
  web/           Vite multi-page build and static-only HTTP service
```

The homepage renders the most recent written timestamp in full; earlier articles
appear in a conditional archive. Every article has a stable
`/articles/<slug>/` permalink, including the newest one. Article bodies and
correspondence metadata are shared by the two page templates. Responses link
directly to their Markdown sources in this repository, optionally also to public
records. The site never invents a send, response, publication date or claim.

## Development

Requires CMake 3.20+, a C++20 compiler, yaml-cpp, nlohmann-json, cmark-gfm
and its core extensions, Rust 1.85+, and Node 22.12+.

On Debian/Ubuntu:

```sh
sudo apt-get install cmake g++ libyaml-cpp-dev nlohmann-json3-dev libcmark-gfm-dev libcmark-gfm-extensions-dev
npm --prefix source/web install
npm --prefix source/web run dev
```

On macOS use Homebrew packages `cmake`, `yaml-cpp`, `nlohmann-json`, and
`cmark-gfm`, with the Rust and Node toolchains installed.

Run `npm --prefix source/web test` to generate, build and test the site.
Run `npm --prefix source/web run build` to create the static distribution in
`source/web/dist`. Use `npm --prefix source/web start` for production HTTP
serving, or serve that directory with an ordinary static host. Vite's preview
command is for local preview only, not the production server. The production
server exposes `/healthz`, honors PORT, and does not expose repository sources,
private files, development servers or a catch-all SPA route.

Build and run the self-contained production image:

```sh
docker build -t correspondence-site .
docker run --rm -p 3000:3000 correspondence-site
```

For Railway, use the repository Dockerfile, its default CMD, and /healthz.
Do not reuse an old inline homepage start command or commit unrelated staged
configuration from another service. Confirm the actual public HTML after
deployment. This repository does not change live hosting by itself.

## Publishing

See [data contract](source/data/README.md). Add a directory containing
`article.md`, `status.md` and `responses/`, then rebuild. A new article
automatically becomes the homepage when it has the newest written timestamp.
Times are sorted by absolute instant, with slug tie-breaking. Markdown source
is not shipped in the distribution. The original approved no-index directive
is retained; schema.org metadata classifies documents without asserting that
their allegations are independently verified.

The C++ parser uses the CommonMark/GFM AST for structure and extracts headings,
links and text without regex parsing. Raw HTML is refused, links are constrained,
and images require alternative text. Rust validates the JSON boundary with
strict schemas, validates times and stable slugs, escapes template values, and
escapes JSON-LD for HTML raw-text context. The only trusted HTML is the safe
CommonMark renderer output. The generator renders all pages before writing and
the web wrapper promotes a completed generation. No browser JavaScript is
required for reading the site.

Software is distributed under the repository's MIT license. Correspondence
retains the author's copyright.
