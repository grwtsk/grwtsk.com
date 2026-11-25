# Rust static generator

**Purpose:** turn parsed correspondence into a deterministic static website.
This binary validates the data, determines the latest article, embeds the
two page templates and shared components, generates semantic HTML and
schema.org metadata, and writes the complete candidate site.

Rust does not parse Markdown itself. It invokes the native C++ parser
for each document and deserializes the parser's protocol-1 JSON. The
generator owns the typed correspondence schema and output routes.

## Build and run

Run from the repository root:

```sh
cargo build --locked --release --manifest-path source/generator/Cargo.toml
npm --prefix source/web run generate
```

The latter is the normal entry point because it builds both native programs
and promotes the complete generated site. For an isolated generator run,
after building the C++ parser, use a new output directory:

```sh
source/generator/target/release/site-generator \
  source/parser/build/markdown-parser \
  source/data/articles \
  /tmp/grwtsk-site-check
```

Choose a fresh output directory if that name exists. The generator refuses
to overwrite an existing output directory. This command is a local
generation check, not publication. Do not pass a directory containing
authored data as the output.

The second argument is the article root, `source/data/articles/`. The generator does not traverse shared organization or evidence data. Repository response links point into each article's `in/` directory; `out/` is never read by the generator. Public article permalinks remain unchanged.

## What the generator guarantees

- Strict typed metadata; unknown fields are rejected.
- Directory names equal the validated slugs; response filenames are safe.
- RFC 3339 timestamps are interpreted as absolute instants; chronology
  and the status/send relationship are validated.
- All articles are ordered newest written instant first, with slug
  tie-breaking. Each gets a stable permalink. The homepage archive contains
  only older articles and is omitted when empty.
- All pages are rendered before the first output file is written.
  The web wrapper uses a temporary staging directory to retain the
  previous generated site when generation fails.
- MiniJinja embeds templates at compile time and escapes normal HTML
  values. The C++ safe-rendered body is the only authored HTML trusted
  by the template. JSON-LD is separately escaped for script context.

Structured data describes the **document** using schema.org WebSite, WebPage,
Article and conditional ItemList; response references appear as separate
Message works linked through subjectOf. The shared stable article ID
resolves to the permalink's #article.
Dates, author, category, tags, citations and word count come from the
validated model or parsed document. It does not assert the article's
allegations are verified findings.

The author and written time are distinct from publication/modification
times. Optional published_at and modified_at are emitted only when supplied.
The current no-index directive is a site policy, not access control.

## Where to make changes

- [src](src/README.md): typed model, validation, chronology and rendering.
- [templates](templates/README.md): HTML markup and reusable components.
- [assets](assets/README.md): site stylesheet.
- Cargo.toml and Cargo.lock: Rust dependency manifest and locked resolution.
  Do not hand-edit the lockfile. Use Cargo deliberately when updating
  dependencies and verify the result.

Run the unit tests with:

```sh
cargo test --locked --manifest-path source/generator/Cargo.toml
```

Run `npm --prefix source/web test` for the complete native-to-HTTP
verification. The generated site is not source code.

[Back to architecture](../README.md).
