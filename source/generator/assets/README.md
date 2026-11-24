# Stylesheet

[style.css](style.css) is the entire visual layer for both page templates.
It is embedded in the Rust binary, emitted during generation, and processed
by Vite into the production CSS asset.

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
