# Embedded HTML templates

The site has exactly **two page templates**. The other two files are
shared components, not additional public pages.

| File | Intent |
| --- | --- |
| [homepage.html](homepage.html) | Newest full article, followed by a conditional archive of older article links; empty-site state |
| [article.html](article.html) | One full article at its permanent URL, with a return link |
| [full-article.html](full-article.html) | Shared timestamp, correspondence definition list, article title, rendered Markdown and response links |
| [layout.html](layout.html) | Shared HTML document shell, language, title, canonical link, metadata, stylesheet, main landmark and copyright/footer |

MiniJinja embeds these files into the Rust binary using include_str!.
Rebuild after editing them. Do not create individual templates per article.
Do not insert correspondence directly into HTML templates.

## Where to change a visible element

- Timestamp, status, sends, response display or article markup:
  full-article.html. Changes apply to both page types.
- Ordering and archive: generator chronology, then homepage.html for
  markup. The archive must not render when past articles are absent.
- Return link: article.html.
- Document head or footer: layout.html. Keep the site unbranded;
  footer contains only the copyright and grwtsk/math link.
- Visual appearance: [assets/style.css](../assets/style.css), not inline
  styles or extra client scripts.

## Semantic and security rules

Use one h1 for the full article. Markdown section headings begin at h2.
Maintain the article, header, main, nav, footer and time semantics, meaningful
link text, the correspondence definition list, and canonical URLs. Include
machine-readable timestamps in datetime attributes. Keep a single source for
shared markup so the homepage and permalink cannot drift apart.

Normal dynamic values must remain escaped by MiniJinja. The two intentional
safe insertions are the validated C++ renderer output for article HTML and
the Rust raw-text-escaped JSON-LD in the document head. Never use the safe
filter on arbitrary metadata. Structured-data claims must describe the
document, not declare a legal or medical finding.

Do not add a script dependency to read the article. Use the
[stylesheet guide](../assets/README.md) for accessible appearance.
After template changes, run the full test suite and preview both routes.

[Generator guide](../README.md).
