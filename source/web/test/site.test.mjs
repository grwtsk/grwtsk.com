import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createStaticServer } from '../server.mjs';

const source = fileURLToPath(new URL('../../', import.meta.url));
const parser = join(source, 'parser/build/markdown-parser');
const generator = join(source, 'generator/target/release/site-generator');
const dist = fileURLToPath(new URL('../dist/', import.meta.url));

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
  const dir = temporary(t), data = join(dir, 'data'), out = join(dir, 'site');
  fixture(data, 'older', '2026-11-24T00:00:00Z');
  fixture(data, 'newer', '2026-11-24T01:21:26-08:00', {
    title: 'Newest </script><script>alert(1)</script>',
    response: true,
    status: '---\nstatus: sent\nsends:\n  - at: "2026-11-24T12:00:00Z"\n    recipient: Agency\n    method: Email\n---\n'
  });
  const result = run(data, out);
  assert.equal(result.status, 0, result.stderr);
  const home = readFileSync(join(out, 'index.html'), 'utf8');
  const page = readFileSync(join(out, 'articles/newer/index.html'), 'utf8');
  assert.match(home, /<h1[^>]*>Newest /);
  assert.match(home, /Full <strong>article<\/strong> text/);
  assert.match(home, /<table>/);
  assert.match(home, /Past articles/);
  assert.match(home, /href="\/articles\/older\/"/);
  assert.doesNotMatch(home, /href="\/articles\/newer\/"/);
  assert.match(home, /github\.com\/grwtsk\/grwtsk\.com\/blob\/main\/source\/data\/newer\/responses\/agency\.md/);
  assert.match(page, /https:\/\/example\.org\/record/);
  assert.match(page, /<dt>Status<\/dt><dd>Sent<\/dd>/);
  assert.doesNotMatch(page, /Past articles/);
  assert.doesNotMatch(home, /<script>alert/);
  const json = home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
  assert.equal(JSON.parse(json)['@graph'][1].headline, 'Newest </script><script>alert(1)</script>');
});

test('single article omits archive and keeps empty correspondence fields', t => {
  const dir = temporary(t), data = join(dir, 'data'), out = join(dir, 'site');
  fixture(data, 'only', '2026-11-24T00:00:00Z');
  const result = run(data, out);
  assert.equal(result.status, 0, result.stderr);
  const home = readFileSync(join(out, 'index.html'), 'utf8');
  assert.doesNotMatch(home, /Past articles/);
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
test('real Vite distribution serves only generated pages and static assets', async t => {
  const server = createStaticServer(dist).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const response = await fetch(origin + '/');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
  const html = await response.text();
  assert.match(html, /FORMAL COMPLAINT AND DEMAND FOR INDEPENDENT INVESTIGATION/);
  assert.match(html, /No responses recorded/);
  assert.doesNotMatch(html, /Past articles/);
  assert.equal((html.match(/<h2>/g) ?? []).length, 11);
  const path = '/articles/formal-complaint-and-demand-for-independent-investigation/';
  assert.equal((await fetch(origin + path)).status, 200);
  assert.equal((await fetch(origin + '/healthz')).status, 200);
  assert.equal((await fetch(origin + '/not-a-route/')).status, 404);
  assert.equal((await fetch(origin + '/source/data/README.md')).status, 404);
  assert.equal((await fetch(origin + '/', { method: 'POST' })).status, 405);
  const head = await fetch(origin + '/', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});
