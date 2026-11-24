# Generator implementation

[main.rs](main.rs) is the current Rust implementation. Keep changes to
the typed model, validation and generation here. Move code into Rust modules
when there is a clear separation of responsibilities; do not introduce
additional languages for ordinary generator logic.

## Map of the code

| Symbol | Responsibility |
| --- | --- |
| Parsed, Heading, Link | C++ parser JSON contract |
| ArticleMeta, StatusMeta, Send, ResponseMeta | Typed authored metadata |
| Article, Response | Validated template-facing records |
| parse, typed | Invoke the parser, decode JSON, report errors |
| slug, timestamp, public_url | Input validation |
| responses, load_article, load_articles | Assemble and sort correspondence |
| article_schema, script_json | schema.org data and raw-text-safe JSON |
| templates, render_site | Embedded templates and page generation |
| generate, main | Validate, render, write and report result |

## Add a field or behavior safely

1. Determine whether the field belongs to authored metadata, extracted
   structure or a derived presentation value.
2. For authored metadata, extend the appropriate serde structure and the
   [data contract](../../data/README.md). Optional fields should have
   explicit omission/default behavior. Validate values before rendering.
3. For parser-extracted metadata, change the C++ producer and Rust
   consumer together. Reject incompatible protocol versions.
4. Update the relevant shared template or schema.org mapping. Keep
   normal HTML autoescaping enabled and do not pass arbitrary strings
   through the safe filter.
5. Add a synthetic fixture or Rust unit test and run the full site test.

Use the actual source timestamp for sorting, not the human-readable string.
Never derive a sent or published state from the existence of a file.
The repository URL and permalink are derived from validated stable slugs.
Do not introduce duplicate article content or manually maintained indexes.

[Generator guide](../README.md) · [Templates](../templates/README.md) ·
[Data contract](../../data/README.md).
