# grwtsk.com — correspondence log

**Start here.** This repository is the record of my letters, when I sent them,
and the responses I received. The website is generated from that record. I do
not have to remember how to program the site in order to maintain it.

## What do I want to do?

| Task | Where to go |
| --- | --- |
| Review communication drafts or check operations | [Writing review #11](https://github.com/grwtsk/grwtsk.com/issues/11) and [operations #6](https://github.com/grwtsk/grwtsk.com/issues/6) |
| Write another letter | [Add an article](source/data/README.md#1-add-a-letter) |
| Record that I sent a letter | [Record a send](source/data/README.md#2-record-a-send) |
| Record a response | [Record a response](source/data/README.md#3-record-a-response) |
| Add a public-record link to a response | [Attach a public record](source/data/README.md#4-attach-a-public-record) |
| Preview the site | [Preview and verify](source/web/README.md#preview-locally) |
| Publish or check what is live | [Deployment and recovery](source/web/README.md#publish-and-verify) |
| Change the design | [Templates](source/generator/templates/README.md) and [stylesheet](source/generator/assets/README.md) |
| Understand how it works | [Architecture](source/README.md) |

Current first letter: [Formal Complaint and Demand for Independent Investigation](source/data/formal-complaint-and-demand-for-independent-investigation/article.md).
Its [status and send history](source/data/formal-complaint-and-demand-for-independent-investigation/status.md)
and [responses](source/data/formal-complaint-and-demand-for-independent-investigation/responses/) are separate from its authored text.

## The four rules to remember

1. Write and record facts in `source/data/`. Do not edit generated HTML.
2. Writing, publication, sending and receiving a response are distinct events.
   Record only events that actually occurred, with their actual timestamps.
3. Keep the original letter and its slug stable. Append sends and add response
   files; use Git history for revisions rather than duplicate versions in source.
4. This repository and the website are public. Review documents and linked
   records before committing. A no-index directive is not access control.

## Make an ordinary content change

On GitHub, open [source/data](https://github.com/grwtsk/grwtsk.com/tree/main/source/data).
Find the article by its directory name. Use the pencil to edit a file, or
**Add file → Create new file** to create one. A filename containing slashes
creates the required nested path. Follow the [data instructions](source/data/README.md)
for complete, copyable file formats. Propose changes on a branch and open a
pull request. Review the diff, check [Actions](https://github.com/grwtsk/grwtsk.com/actions),
then merge the verified change into main.

A green GitHub build means the source builds and the tests pass. It does **not**
mean the public host has deployed the new version. For publication, follow
the [public verification procedure](source/web/README.md#publish-and-verify).

## How the site behaves

- The homepage, `/`, shows the newest written article in full, including the
  timestamp, status, send history and response links.
- Older articles appear below that article, newest first. The archive is
  omitted entirely when there are no older articles.
- Each article, including the newest, has a permanent
  `/articles/<slug>/` page. These are the two page templates: homepage and article.
- There are no branding elements, advertisements, client-side app requirements
  or public editing controls. The footer is the copyright and the
  [grwtsk/math](https://github.com/grwtsk/math) link.

## Local commands

Run these from the repository root. The
[setup instructions](source/web/README.md#first-time-setup) explain the required
C++, Rust and Node tools.

```sh
npm --prefix source/web ci
npm --prefix source/web run dev
```

Open the local address printed by Vite. Press Ctrl+C to stop. After editing
Markdown, regenerate the site and restart the dev command.

```sh
npm --prefix source/web test
npm --prefix source/web run build
npm --prefix source/web start
```

The last command serves the built site on http://localhost:3000/ by default.
Stop it with Ctrl+C. The build output is `source/web/dist/`.

## Architecture at a glance

```
source/
  communications/  Headless communication service, separate deployment
  data/       Markdown documents and correspondence history
  parser/     C++20: YAML and CommonMark/GFM parsing
  generator/  Rust: validation, chronology, embedded HTML and CSS
  web/        Vite: multi-page build and static HTTP service
```

Read [source/README.md](source/README.md) for the exact maintained layout,
component responsibilities and links to detailed technical guides. The root
Dockerfile packages only the built site and production server. No live hosting
credentials, generated pages or compiler outputs belong in the repository.

If I forget the process, I can return here and select the task above. I can
also ask an assistant: "In grwtsk/grwtsk.com, follow source/data/README.md and
record the actual send or response described below. Show me the proposed
change and verification results. Do not invent facts or change the letter."

Software: [MIT license](LICENSE). Authored correspondence retains its
author's copyright.
