# Build, preview, publish and recover

This layer turns the Rust-generated files into a Vite multi-page static
distribution, then serves only that distribution. It does not interpret
Markdown or modify correspondence.

## First-time setup

Use a terminal at the repository root, the directory containing README.md
and Dockerfile. If needed, clone the repository:

```sh
git clone https://github.com/grwtsk/grwtsk.com.git
cd grwtsk.com
```

Use a clean checkout on the intended source branch. Once the implementation
has merged, the normal publishing branch is main. Do not discard local
changes when switching branches.

Required tools: CMake 3.20+, a C++20 compiler, cmark-gfm with its core
extensions, yaml-cpp, nlohmann-json, Rust 1.85+ (use current stable), and
Node.js 22.12+ with npm. Git is needed for repository operations.

For macOS with Homebrew and Xcode command-line tools:

```sh
xcode-select --install
brew install cmake cmark-gfm yaml-cpp nlohmann-json node
```

If the Xcode tools are already installed, skip the first line. Install
Rust through rustup if it is not present.

For Debian/Ubuntu:

```sh
sudo apt-get update
sudo apt-get install cmake g++ libcmark-gfm-dev \
  libcmark-gfm-extensions-dev libyaml-cpp-dev nlohmann-json3-dev
```

Install a supported Node.js release and Rust through their normal toolchain
managers if absent. Confirm prerequisites before building:

```sh
cmake --version
c++ --version
rustc --version
cargo --version
node --version
npm --version
npm --prefix source/web ci
```

The checked-in Cargo.lock and package-lock.json fix the Rust and npm
dependency resolutions. OS packages, toolchains and container base images
remain separate build inputs.

## Preview locally

From the repository root:

```sh
npm --prefix source/web run dev
```

This compiles C++ and Rust, generates the HTML and CSS, then starts
Vite on the local address printed in the terminal (normally
http://localhost:5173/). Open that address and the article's permanent
path. Press Ctrl+C in the terminal to stop it.

After changing Markdown, templates or the stylesheet, stop and rerun
this command. Markdown-to-HTML regeneration is an explicit step, not a
background watcher. Vite's reload behavior applies to the generated
files, not arbitrary source Markdown.

For a production-like local preview:

```sh
npm --prefix source/web run build
npm --prefix source/web start
```

Open http://localhost:3000/. The server honors the PORT environment
variable. `npm --prefix source/web run preview` is also available
for Vite's local build preview; do not use that preview server in production.

## Commands I need to remember

| Command (from repository root) | Result |
| --- | --- |
| npm --prefix source/web ci | Install exactly the npm lockfile dependencies |
| npm --prefix source/web run generate | Build native tools and refresh .generated |
| npm --prefix source/web run dev | Generate and start local Vite |
| npm --prefix source/web test | Build, run Rust unit tests and integration/HTTP tests |
| npm --prefix source/web run build | Generate and build dist |
| npm --prefix source/web start | Serve existing dist; does not regenerate |
| npm --prefix source/web run preview | Vite local production-build preview |

The normal development loop is **edit source → test → preview → commit**.
The normal publishing loop is **verified commit → deploy → retrieve public HTML**.

## Publish and verify

The repository workflow [Build and verify static site](../../.github/workflows/site.yml)
runs on pull requests and main pushes. It uploads a static-site artifact
when successful. See the [Actions page](https://github.com/grwtsk/grwtsk.com/actions)
for the build result for the exact commit. A GitHub artifact is not a
public deployment.

### Hosting configuration (one-time setup)

Use a static host for the built `source/web/dist/` directory, or build and
run the root Dockerfile. The Docker image builds C++ and Rust, generates
the pages, runs Vite, and then copies only the built files and Node
production runtime into the final image. It runs as a non-root user.

```sh
docker build -t correspondence-site .
docker run --rm -p 3000:3000 correspondence-site
```

For Railway, connect the intended public site service to this repository's
main branch; use the repository root and Dockerfile with its default CMD.
Configure PORT (the image defaults to 3000), the custom domain grwtsk.com
and /healthz as the healthcheck path. Confirm the actual service identity
and source before applying any change. Do not reuse the legacy inline
start command, reuse an older deployment snapshot, attach a private
reader volume, or commit unrelated staged changes. If necessary, keep
the private reader separate and migrate the public domain deliberately.

This guide specifies the desired deployment, not a claim that the current
Railway service is configured this way. Check the actual host configuration.
Once repository-based automatic deployments are configured, a verified
main commit can trigger a new build. Otherwise deploy the exact verified
source or static artifact through the host.

### Confirm the public website after every publication

1. Confirm the merged commit and successful CI build.
2. Confirm the host deployed **that commit or artifact**, not an older
   build. Inspect its deployment ID, build result and routing.
3. Visit https://grwtsk.com/ in a fresh browser tab. Verify the expected
   title, full newest letter, status, sends, responses and conditional
   archive. Open its permanent article path and any newly added links.
4. Fetch the public HTML independently and inspect the actual content.
   The health endpoint only establishes that a server is responding.

For a terminal check, use:

```sh
curl -fsS https://grwtsk.com/healthz
curl -fsS -H 'Cache-Control: no-cache' https://grwtsk.com/ \
  -o /tmp/grwtsk-homepage.html
grep -n '<title>\|<h1\|<dt>Status\|<dt>Responses' /tmp/grwtsk-homepage.html
```

Compare the title and the actual correspondence fields with the expected
build. For a first article or new response, inspect the permanent article
URL too. If you still see the old homepage, publication is **not verified**.
A green deployment status, a certificate or HTTP 200 alone is insufficient.

## Recover from a problem

| Symptom | What to inspect |
| --- | --- |
| YAML or Markdown error | File named by the C++ parser; [data rules](../data/README.md) |
| Unknown field, invalid date or status | Rust validator; fix metadata, do not weaken it |
| CMake cannot find a library | Native packages and [parser instructions](../parser/README.md) |
| Cargo or npm dependency mismatch | Installed versions and checked-in lockfiles; do not regenerate locks casually |
| Local preview shows old content | Stop dev, regenerate with run dev, verify the correct local port |
| Vite missing HTML entry | Check .generated and the generator error; build before preview |
| Public page shows old content | Compare host source commit and actual served HTML, then request a fresh build of the intended source |
| Health check works but article missing | Inspect dist, server routing and the actual public document |

Keep the last working deployment until a replacement has been verified.
For rollback, use the host's known good deployment or revert the responsible
Git commit and rebuild. Do not manually rewrite the generated HTML or
delete authored correspondence as a recovery mechanism.

Generated files are ignored by Git. Build errors leave the previous
.generated generation intact when possible. A failed Vite production
build must not be deployed. Review the diagnostic before rebuilding.

## Technical details

- [scripts/generate.mjs](scripts/README.md) owns native compilation and
  generation staging.
- [vite.config.mjs](vite.config.mjs) uses .generated as root, discovers
  all article HTML entry points and produces dist; it has no publicDir or
  SPA catch-all.
- [server.mjs](server.mjs) uses sirv to serve dist only. It supports GET
  and HEAD, returns 404 for unknown paths and 405 for other methods,
  exposes /healthz and sends security headers.
- [test/README.md](test/README.md) describes the verification suite.
- package.json and package-lock.json define the Node service dependencies.
  Run npm ci for normal work. Update dependencies intentionally, commit
  both manifest and lock changes, and run tests.

[Root operating guide](../../README.md) · [Architecture](../README.md).

## Analytics

The site's Google Tag Manager container is **GTM-TMB9CVJW**. It is installed
in the shared [HTML layout](../generator/templates/layout.html), so both
page templates load it once. Manage the container's tags and triggers at
https://tagmanager.google.com/. Publish the desired analytics tag inside
that container; the container ID alone does not establish that Google
Analytics is receiving events.

The static server's Content Security Policy authorizes only the exact
hashed dataLayer bootstrap, Google Tag Manager's script origin and
the Google Analytics connection endpoints. It does not permit arbitrary
inline scripts, eval or additional advertising script/connection origins.
The original no-referrer policy remains in place. If you edit the bootstrap,
compute a new SHA-256 CSP hash over the exact script text (including
whitespace) and update the server policy and tests together.

This website contains sensitive correspondence. Do not configure the GTM
container to capture article contents, health information, personal
identifiers, form data or response records. Review URL/title collection,
consent settings, advertising features and retention in the analytics
account before enabling tags. The script installation does not configure
those account settings. The site's built-in bootstrap sends no custom
correspondence data, but tags configured in GTM may collect browser and
page information. Keep analytics optional to reading the public site.

Use Google's Tag Assistant or the actual analytics property's realtime
report to confirm reception after deployment. The automated tests verify
the generated markup, CSP and initialization order using a local stub;
they intentionally do not send production analytics events.
