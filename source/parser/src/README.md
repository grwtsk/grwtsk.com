# Native parser implementation

[main.cpp](main.cpp) is the C++ entry point. Keep the source for the
parser within this directory as the implementation grows.

| Concern | Function or implementation area |
| --- | --- |
| Size, encoding, newline checks | read_document |
| YAML delimiter handling | split_frontmatter |
| Bounded YAML-to-JSON traversal | convert_yaml, metadata |
| Plain-text extraction | plain_text |
| Link and image policy | safe_destination |
| CommonMark/GFM AST and HTML rendering | parse_markdown |
| Process protocol and diagnostics | main |

Use the existing parser libraries for lexical and syntactic analysis.
Do not add a parallel regex-based Markdown parser. Extend AST walking for
new semantic extraction. Preserve source order and avoid inferring facts
that are not present in the document.

Treat HTML as a trust boundary: only safe renderer output may pass through
to templates as trusted HTML. Keep raw HTML disabled; validate link
destinations and add adversarial tests for any new syntax or extensions.
Keep diagnostic output on stderr so stdout remains valid JSON.

If a new JSON field changes the process contract, update the Rust
`Parsed` structure and tests together; version incompatible changes
rather than allowing silent mismatch. Build commands and error meanings
are in the [parser guide](../README.md). Integration tests live in
[web/test](../../web/test/README.md).
