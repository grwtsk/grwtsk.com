# Generation orchestration

[generate.mjs](generate.mjs) is the bridge between the native build tools
and Vite. It is invoked by the npm generate, dev, build and test commands.

From the repository root, run:

```sh
npm --prefix source/web run generate
```

The script resolves paths from its own location, builds the C++ parser
with CMake in parser/build, builds the Rust release generator using the
Cargo lockfile, and calls the generator with the source/data/articles directory; shared organization and evidence data are not passed to the site generator.
It uses child processes with argument arrays rather than shell interpolation.

The candidate site is rendered into a fresh temporary directory under
web/.generation-*. Only a completed candidate replaces web/.generated.
The previous generation is retained on generation failure; if a
promotion fails the wrapper attempts to restore it. The script removes
only the temporary directory it created, not arbitrary source files.

Keep build orchestration in this layer. Keep document parsing and
metadata validation in the native programs. Vite reads the resulting
.generated files and writes dist separately. This script does not
perform external deployment, edit Git history or send letters.

If it fails, read the failing process's diagnostic. Repair input
or dependencies, then run the same command again. See
[web operation](../README.md) for preview and deployment.
