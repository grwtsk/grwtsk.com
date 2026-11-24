# C++ Markdown parser

**Purpose:** convert a complete UTF-8 Markdown document with YAML front
matter into a versioned JSON representation that Rust can validate and render.
This component does not decide whether a letter was sent, select the homepage
or construct the site's templates.

## Dependencies

C++20, CMake 3.20+, yaml-cpp, nlohmann-json, cmark-gfm and the cmark-gfm
core extensions library. See [first-time setup](../web/README.md#first-time-setup)
for package installation. CMake owns native dependency discovery and linking.

## Build and inspect a document

Run from the repository root:

```sh
cmake -S source/parser -B source/parser/build -DCMAKE_BUILD_TYPE=Release
cmake --build source/parser/build --config Release --parallel
source/parser/build/markdown-parser \
  source/data/formal-complaint-and-demand-for-independent-investigation/article.md
```

This last command prints the parsed article as JSON. It does not write
a website or send anything. To read diagnostics, examine stderr and the
exit status.

## Parsing stages

1. Read a bounded UTF-8 document; reject NUL and invalid encoding; normalize
   newline conventions and remove a leading UTF-8 BOM.
2. Locate the delimited YAML front matter. Use yaml-cpp, with depth and
   traversal bounds, to create a JSON mapping. Preserve scalar spelling
   for the Rust type validator; reject duplicate and merge keys.
3. Let cmark-gfm tokenize and parse blocks and inline syntax into an AST.
   Enable tables, strikethrough, autolinks and task lists.
4. Walk the AST to extract headings (level, text, body line), links and
   images (label and URL), and plain text. Check heading hierarchy,
   raw HTML, destinations and image alt text.
5. Render the AST with unsafe HTML disabled. Emit one JSON object on
   stdout. Report parsing failures on stderr.

## Contract

`markdown-parser <document.md>` returns exit 0 and JSON on success,
1 for document or parser errors, and 2 for an incorrect argument count.
The top-level protocol-1 object contains:

| Key | Representation |
| --- | --- |
| protocol | Integer 1 |
| metadata | JSON mapping derived from the YAML |
| html | CommonMark/GFM-rendered HTML |
| plain_text | Text extracted from the syntax tree |
| headings | Array of level, text, line objects |
| links | Array of kind, label, url objects |

This is structural extraction, not independent fact-checking or automatic
legal/medical entity classification. Authored categories, tags and citations
remain explicit metadata. No site templates or correspondence-state logic
belong here.

[Implementation notes](src/README.md) explain where to make parser changes.
[Generator contract](../generator/README.md) explains the Rust consumer.
Run `npm --prefix source/web test` after changing parser behavior.

[Back to architecture](../README.md).
