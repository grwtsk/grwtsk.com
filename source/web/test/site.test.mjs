import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { parse } from 'parse5';
import { createStaticServer } from '../server.mjs';

const source = fileURLToPath(new URL('../../', import.meta.url));
const parser = join(source, 'parser/build/markdown-parser');
const generator = join(source, 'generator/target/release/site-generator');
const dist = fileURLToPath(new URL('../dist/', import.meta.url));

// Check the HTML5 tree rather than serialized entity spelling or whitespace.
function select(node, predicate) {
  return [...(predicate(node) ? [node] : []), ...(node.childNodes ?? []).flatMap(child => select(child, predicate))];
}
const attr = (node, name) => node.attrs?.find(a => a.name === name)?.value;
const text = node => node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('');
const elements = (node, tag) => select(node, x => x.tagName === tag);
const hrefs = node => elements(node, 'a').map(a => attr(a, 'href'));
function analyticsScripts(node) {
  const scripts = elements(node, 'script');
  assert.equal(scripts.length, 3, 'only the approved analytics pair and inert JSON-LD are permitted');
  const [bootstrap, loader, structured] = scripts;
  assert.equal(attr(bootstrap, 'src'), undefined);
  assert.equal(text(bootstrap).trim(), "window.dataLayer = window.dataLayer || [];\n    function gtag(){dataLayer.push(arguments);}\n    gtag('js', new Date());");
  assert.equal(attr(loader, 'src'), 'https://www.googletagmanager.com/gtm.js?id=GTM-TMB9CVJW');
  assert.notEqual(attr(loader, 'async'), undefined);
  assert.equal(attr(loader, 'referrerpolicy'), 'no-referrer');
  assert.equal(text(loader).trim(), '');
  assert.equal(attr(structured, 'type'), 'application/ld+json');
  assert.equal(attr(structured, 'src'), undefined);
  return { bootstrap, structured };
}
function articleSchema(node) {
  const { structured } = analyticsScripts(node);
  const data = JSON.parse(text(structured));
  assert.equal(data['@context'], 'https://schema.org');
  return data['@graph'].find(entry => entry['@type'] === 'Article');
}

function fixture(root, slug, writtenAt, options = {}) {
  const dir = join(root, slug);
  mkdirSync(join(dir, 'responses'), { recursive: true });
  writeFileSync(join(dir, 'article.md'), [
    '---', 'title: ' + JSON.stringify(options.title ?? slug), 'slug: ' + slug,
    'description: "A test article"', 'author: Test Author', 'language: en',
    'written_at: ' + JSON.stringify(writtenAt), 'category: Correspondence', 'tags: [test]',
    '---', '', options.body ?? '## Section\n\nFull **article** text.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n'
  ].join('\n'));
  writeFileSync(join(dir, 'status.md'), options.status ?? '---\nstatus: written\nsends: []\n---\n');
  if (options.response) {
    writeFileSync(join(dir, 'responses/agency.md'), '---\ntitle: Agency response\nfrom: Agency\nreceived_at: "2026-11-25T10:00:00Z"\npublic_record: https://example.org/record\n---\n\nResponse.\n');
  }
  return dir;
}
function run(data, out) { return spawnSync(generator, [parser, data, out], { encoding: 'utf8' }); }
function temporary(t) {
  const dir = mkdtempSync(join(tmpdir(), 'correspondence-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('latest full article, deterministic archive, responses and stable canonical paths', t => {
  const dir = temporary(t), data = join(dir, 'data', 'articles'), out = join(dir, 'site');
  mkdirSync(join(dir, 'data', 'organizations'), { recursive: true });
  writeFileSync(join(dir, 'data', 'organizations', 'example.json'), '{"organization":"Synthetic test resource"}\n');
  mkdirSync(join(dir, 'data', 'evidence'), { recursive: true });
  writeFileSync(join(dir, 'data', 'evidence', 'example.json'), '{"evidence":"Synthetic test evidence"}\n');
  mkdirSync(data, { recursive: true });
  writeFileSync(join(data, 'README.md'), '# Articles\n');
  fixture(data, 'older', '2026-11-24T00:00:00Z');
  fixture(data, 'newer', '2026-11-24T01:21:26-08:00', {
    title: 'Newest </script><script>alert(1)</script>',
    response: true,
    status: '---\nstatus: sent\nsends:\n  - at: "2026-11-24T12:00:00Z"\n    recipient: Agency\n    method: Email\n---\n'
  });
  const result = run(data, out);
  assert.equal(result.status, 0, result.stderr);
  const home = readFileSync(join(out, 'index.html'), 'utf8');
  assert.deepEqual(readdirSync(join(out, 'articles')).sort(), ['newer', 'older']);
  assert.doesNotMatch(home, /Synthetic test (resource|evidence)/);
  const page = readFileSync(join(out, 'articles/newer/index.html'), 'utf8');
  const homeDoc = parse(home), articleDoc = parse(page);
  const full = elements(homeDoc, 'article')[0];
  assert.equal(elements(homeDoc, 'h1').length, 1);
  assert.equal(text(elements(homeDoc, 'h1')[0]), 'Newest </script><script>alert(1)</script>');
  assert.ok(text(full).includes('Full article text.'));
  assert.equal(elements(full, 'table').length, 1);
  const archive = elements(homeDoc, 'nav')[0];
  assert.ok(text(archive).includes('Past articles'));
  assert.deepEqual(hrefs(archive), ['/articles/older/']);
  const repoResponse = 'https://github.com/grwtsk/grwtsk.com/blob/main/source/data/articles/newer/responses/agency.md';
  assert.ok(hrefs(full).includes(repoResponse));
  assert.ok(hrefs(articleDoc).includes(repoResponse));
  assert.ok(hrefs(articleDoc).includes('https://example.org/record'));
  assert.ok(elements(articleDoc, 'dd').some(dd => text(dd) === 'Sent'));
  assert.equal(elements(articleDoc, 'nav').length, 0);
  const schema = articleSchema(homeDoc);
  assert.equal(schema.headline, 'Newest </script><script>alert(1)</script>');
  assert.equal(schema.url, 'https://grwtsk.com/articles/newer/');
  assert.equal(schema.subjectOf[0].url, repoResponse);
  assert.equal(schema.subjectOf[0]['@type'], 'Message');
  assert.equal(schema.subjectOf[0].dateReceived, '2026-11-25T10:00:00Z');
  assert.equal(schema.subjectOf[0].about['@id'], schema['@id']);
  assert.equal(schema.subjectOf[0].citation, 'https://example.org/record');
  assert.equal(schema.mainEntityOfPage['@id'], schema.url);
  assert.equal(attr(full, 'id'), 'article');
  assert.equal(attr(full, 'data-status'), 'sent');
  assert.equal(attr(full, 'data-slug'), 'newer');
  assert.equal(attr(elements(full, 'data')[0], 'value'), 'sent');
  assert.equal(text(elements(full, 'data')[0]), 'Sent');
  const graph = JSON.parse(text(analyticsScripts(homeDoc).structured))['@graph'];
  const homePage = graph.find(x => x['@id'] === 'https://grwtsk.com/');
  assert.equal(homePage.mainEntity['@id'], schema['@id']);
  assert.equal(homePage.hasPart.mainEntity.numberOfItems, 1);
  assert.equal(homePage.hasPart.mainEntity.itemListElement[0].item.url, 'https://grwtsk.com/articles/older/');
  assert.ok(graph.some(x => x['@type'] === 'WebSite'));
  assert.ok(graph.some(x => x['@type'] === 'WebPage' && x['@id'] === schema.url));
  assert.equal(text(elements(homeDoc, 'title')[0]), 'Correspondence log');
  assert.equal(attr(elements(homeDoc, 'meta').find(x => attr(x, 'property') === 'og:type'), 'content'), 'website');
  assert.equal(attr(elements(articleDoc, 'meta').find(x => attr(x, 'property') === 'og:type'), 'content'), 'article');
  assert.ok(!elements(articleDoc, 'meta').some(x => attr(x, 'property') === 'article:published_time'));
  assert.equal(schema.datePublished, undefined);
  assert.equal(articleSchema(articleDoc)['@id'], schema['@id']);
  assert.equal(attr(elements(articleDoc, 'link').find(link => attr(link, 'rel') === 'canonical'), 'href'), schema.url);
});

test('single article omits archive and keeps empty correspondence fields', t => {
  const dir = temporary(t), data = join(dir, 'data'), out = join(dir, 'site');
  fixture(data, 'only', '2026-11-24T00:00:00Z');
  const result = run(data, out);
  assert.equal(result.status, 0, result.stderr);
  const home = readFileSync(join(out, 'index.html'), 'utf8');
  assert.doesNotMatch(home, /Past articles/);
  const doc = parse(home);
  const full = elements(doc, 'article')[0];
  assert.equal(attr(full, 'data-status'), 'written');
  assert.equal(attr(elements(full, 'data')[0], 'value'), 'written');
  assert.equal(elements(full, 'dt').length, 3);
  assert.equal(elements(full, 'dd').length, 3);
  assert.equal(elements(full, 'time').length, 1);
  assert.equal(attr(elements(full, 'time')[0], 'datetime'), '2026-11-24T00:00:00Z');
  assert.equal(articleSchema(doc).subjectOf, undefined);
  assert.match(home, /No sends recorded/);
  assert.match(home, /No responses recorded/);
});
test('reject raw HTML, dangerous links, invalid dates and inconsistent status before output', t => {
  const dir = temporary(t);
  for (const [i, options] of [
    { body: '<script>alert(1)</script>' },
    { body: '[bad](javascript:alert%281%29)' },
    { writtenAt: 'not-a-date' },
    { status: '---\nstatus: sent\nsends: []\n---\n' },
    { status: '---\nstatus: written\nstatus: sent\nsends: []\n---\n' }
  ].entries()) {
    const data = join(dir, 'data' + i), out = join(dir, 'site' + i);
    fixture(data, 'bad', options.writtenAt ?? '2026-11-24T00:00:00Z', options);
    assert.notEqual(run(data, out).status, 0);
    assert.throws(() => readFileSync(join(out, 'index.html')));
  }
});
test('real Vite distribution preserves generated articles and serves only static files', async t => {
  const server = createStaticServer(dist).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const generated = fileURLToPath(new URL('../.generated/', import.meta.url));
  const authoredSlugs = readdirSync(join(source, 'data', 'articles'), { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();

  async function checkPage(path, generatedPath) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    const policy = response.headers.get('content-security-policy');
    assert.match(policy, /default-src 'none'/);
    const actual = parse(await response.text());
    const { bootstrap } = analyticsScripts(actual);
    const digest = createHash('sha256').update(text(bootstrap)).digest('base64');
    assert.ok(policy.includes("'sha256-" + digest + "'"), 'CSP hash must authorize the exact emitted bootstrap');
    assert.match(policy, /script-src [^;]*https:\/\/www\.googletagmanager\.com/);
    assert.match(policy, /connect-src [^;]*google-analytics\.com/);
    assert.doesNotMatch(policy, /'unsafe-inline'|'unsafe-eval'/);
    const expected = parse(readFileSync(join(generated, generatedPath), 'utf8'));
    assert.equal(elements(actual, 'h1').length, 1);
    assert.equal(text(elements(actual, 'h1')[0]), text(elements(expected, 'h1')[0]));
    const actualArticle = elements(actual, 'article'), expectedArticle = elements(expected, 'article');
    assert.equal(actualArticle.length, expectedArticle.length);
    if (expectedArticle.length) {
      assert.equal(text(actualArticle[0]), text(expectedArticle[0]), 'article text and metadata preserved');
      assert.deepEqual(hrefs(actualArticle[0]), hrefs(expectedArticle[0]), 'response and body links preserved');
      assert.deepEqual(articleSchema(actual), articleSchema(expected), 'structured data preserved');
    }
    const expectedArchive = elements(expected, 'nav');
    const actualArchive = elements(actual, 'nav');
    assert.equal(actualArchive.length, expectedArchive.length);
    assert.deepEqual(actualArchive.flatMap(hrefs), expectedArchive.flatMap(hrefs));
    return actual;
  }

  const home = await checkPage('/', 'index.html');
  assert.equal(elements(home, 'article').length, authoredSlugs.length ? 1 : 0);
  assert.equal(elements(home, 'nav').length, authoredSlugs.length > 1 ? 1 : 0);
  if (authoredSlugs.length) {
    const latest = articleSchema(home).url;
    const latestPath = new URL(latest).pathname;
    assert.ok(authoredSlugs.some(slug => latestPath === '/articles/' + slug + '/'));
    const archivePaths = elements(home, 'nav').flatMap(hrefs).sort();
    assert.deepEqual(archivePaths, authoredSlugs.map(slug => '/articles/' + slug + '/').filter(path => path !== latestPath).sort());
  }

  for (const slug of authoredSlugs) {
    const path = '/articles/' + slug + '/';
    const page = await checkPage(path, 'articles/' + slug + '/index.html');
    assert.equal(elements(page, 'nav').length, 0);
    assert.equal(articleSchema(page).url, 'https://grwtsk.com' + path);
  }

  const css = attr(elements(home, 'link').find(link => attr(link, 'rel') === 'stylesheet'), 'href');
  assert.ok(css);
  const stylesheet = await fetch(new URL(css, origin));
  assert.equal(stylesheet.status, 200);
  assert.match(stylesheet.headers.get('content-type'), /text\/css/);
  assert.equal((await fetch(origin + '/healthz')).status, 200);
  assert.equal((await fetch(origin + '/not-a-route/')).status, 404);
  assert.equal((await fetch(origin + '/source/data/README.md')).status, 404);
  assert.equal((await fetch(origin + '/source/data/organizations/outreach-registry.json')).status, 404);
  assert.equal((await fetch(origin + '/source/data/evidence/professional-evidence.json')).status, 404);
  assert.equal((await fetch(origin + '/articles/organizations/')).status, 404);
  assert.equal((await fetch(origin + '/articles/evidence/')).status, 404);
  assert.equal((await fetch(origin + '/', { method: 'POST' })).status, 405);
  const head = await fetch(origin + '/', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});
