# Stylesheet

[style.css](style.css) is the entire visual layer for both page templates.
It is embedded in the Rust binary, emitted during generation, and processed
by Vite into the production CSS asset.

## Approved visual contract

The initial public correspondence page is the reference, not a new
redesign. Preserve its 720px maximum reading column, 48px total desktop
gutter, 64px top inset, 19px Georgia body at 1.68 line height, 14px stacked
correspondence metadata, original heading scale and spacing, muted color
palette and footer. At 560px or narrower use the original 40px total
gutter, 30px top inset and 17px body. Maintain the original light/dark
and print rules. The definition list retains the visual appearance of
the original four lines; semantic changes must not introduce new borders,
cards or columns. New article types may use the additive table, image,
blockquote and code styles.

The intention is a quiet, readable, unbranded document: a single article
column, serif body text, compact correspondence metadata, responsive line
length, accessible links, automatic light/dark color schemes and a print
stylesheet. No logos, decoration, external fonts or client-side theme
controller are required.

Change this file for type size, spacing, widths, borders and contrast.
Keep focus outlines visible, allow text to wrap, make tables and code
scroll safely on small screens, and check zoom, dark mode and print.
Do not put different styles into different article data files or embed
remote trackers, scripts or fonts.

To review a change from the repository root:

```sh
npm --prefix source/web run dev
```

After an edit to the embedded stylesheet, restart generation/development
so Rust recompiles it. Check both the homepage and an article permalink.
Run the [site tests](../../web/test/README.md) before publishing.

[Templates](../templates/README.md) · [Generator guide](../README.md).
