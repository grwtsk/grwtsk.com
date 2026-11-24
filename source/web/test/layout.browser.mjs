import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createStaticServer } from '../server.mjs';

// This is a browser-only verification tool, isolated from the production
// npm dependency graph. The workflow provisions the exact test tool version.
const modulePath = process.env.PLAYWRIGHT_MODULE;
assert.ok(modulePath, 'Set PLAYWRIGHT_MODULE to the installed playwright-core/index.mjs');
const { chromium } = await import(pathToFileURL(resolve(modulePath)).href);
const output = resolve(process.env.LAYOUT_ARTIFACT_DIR ?? '.layout-check');
mkdirSync(output, { recursive: true });
const server = createStaticServer().listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = 'http://127.0.0.1:' + server.address().port;
let browser;
const close = () => new Promise(resolve => server.close(resolve));
function near(actual, expected, label, tolerance = 0.15) {
  assert.ok(Math.abs(actual - expected) <= tolerance, label + ': expected ' + expected + ', got ' + actual);
}
async function inspect(page) {
  return page.evaluate(() => {
    const capture = selector => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const r = element.getBoundingClientRect();
      const css = getComputedStyle(element);
      return {
        x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom,
        font: css.fontFamily, size: parseFloat(css.fontSize), line: parseFloat(css.lineHeight),
        top: parseFloat(css.paddingTop), marginTop: parseFloat(css.marginTop),
        marginBottom: parseFloat(css.marginBottom), bottomPadding: parseFloat(css.paddingBottom),
        borderBottom: parseFloat(css.borderBottomWidth), borderTop: parseFloat(css.borderTopWidth),
        background: css.backgroundColor, color: css.color, display: css.display
      };
    };
    const metadata = [...document.querySelectorAll('.entry-meta dl > div')];
    return {
      viewport: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      body: capture('body'), main: capture('main'), meta: capture('.entry-meta'),
      title: capture('h1'), intro: capture('.letter-body h1 + p'),
      section: capture('.letter-body h2'), footer: capture('footer'),
      archive: capture('.archive'), back: capture('.return'),
      rows: metadata.map(row => {
        const rect = row.getBoundingClientRect();
        const dt = row.querySelector('dt'), dd = row.querySelector('dd');
        return { y: rect.y, bottom: rect.bottom, label: dt.textContent, value: dd.textContent.trim() };
      }),
      article: document.querySelector('article')?.dataset.slug ?? null,
      titleCount: document.querySelectorAll('h1').length,
      canonical: document.querySelector('link[rel=canonical]')?.href,
      mainEntity: JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@graph']
        .find(node => node['@type'] === 'Article')?.['@id']
    };
  });
}
function validate(m, mobile, dark) {
  const width = mobile ? m.viewport - 40 : Math.min(m.viewport - 48, 720);
  near(m.main.width, width, 'reading column');
  near(m.main.x, (m.viewport - width) / 2, 'centered reading column');
  near(m.footer.width, width, 'footer column');
  near(m.footer.x, m.main.x, 'aligned footer');
  near(m.main.top, mobile ? 30 : 64, 'top inset');
  near(m.body.size, mobile ? 17 : 19, 'body font size');
  near(m.body.line, mobile ? 17 * 1.65 : 19 * 1.68, 'body line height');
  assert.match(m.body.font, /Georgia/i);
  assert.equal(m.body.background, dark ? 'rgb(21, 21, 21)' : 'rgb(255, 255, 255)');
  assert.equal(m.body.color, dark ? 'rgb(237, 237, 237)' : 'rgb(32, 32, 32)');
  near(m.footer.size, 14, 'footer font size');
  near(m.footer.marginTop, 64, 'footer spacing');
  near(m.footer.top, 22, 'footer padding');
  near(m.footer.borderTop, 1, 'footer rule');
  assert.equal(m.titleCount, 1);
  assert.ok(m.scrollWidth <= m.viewport + 1, 'page must not horizontally overflow');
  if (!m.article) return;
  near(m.meta.x, m.main.x, 'metadata column');
  near(m.meta.y, m.main.top, 'metadata top');
  near(m.meta.size, 14, 'metadata font size');
  near(m.meta.line, 22.4, 'metadata line height');
  near(m.meta.bottomPadding, 20, 'metadata padding');
  near(m.meta.borderBottom, 1, 'metadata bottom rule');
  near(m.title.y - m.meta.bottom, mobile ? 28 : 38, 'metadata/title separation');
  near(m.title.size, Math.max(28, Math.min(m.viewport * .042, 36)), 'title size', 1);
  near(m.title.line, m.title.size * 1.2, 'title line height');
  near(m.title.marginBottom, 24, 'title margin');
  if (m.intro) {
    near(m.intro.line, m.body.size * 1.48, 'intro line height');
    near(m.intro.marginBottom, 32, 'intro margin');
  }
  if (m.section) {
    near(m.section.size, 21.6, 'section font size');
    near(m.section.marginTop, mobile ? 36 : 44, 'section spacing');
    near(m.section.marginBottom, 18, 'section margin');
  }
  assert.deepEqual(m.rows.map(row => row.label), ['Status:', 'Send history:', 'Responses:']);
  for (let i = 1; i < m.rows.length; i++) {
    assert.ok(m.rows[i].y >= m.rows[i-1].bottom - .15, 'metadata rows must be stacked without overlap');
  }
  assert.equal(m.mainEntity, 'https://grwtsk.com/articles/' + m.article + '/#article');
}
try {
  browser = await chromium.launch({ headless: true });
  for (const config of [
    { name: 'desktop-light', width: 1440, height: 1050, dark: false },
    { name: 'mobile-light', width: 390, height: 844, dark: false },
    { name: 'mobile-dark', width: 390, height: 844, dark: true },
    { name: 'narrow-dark', width: 320, height: 780, dark: true }
  ]) {
    const page = await browser.newPage({
      viewport: { width: config.width, height: config.height },
      colorScheme: config.dark ? 'dark' : 'light', deviceScaleFactor: 1,
      reducedMotion: 'reduce'
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(origin + '/', { waitUntil: 'load' });
    assert.equal(response.status(), 200);
    await page.evaluate(() => document.fonts.ready);
    const home = await inspect(page);
    validate(home, config.width <= 560, config.dark);
    assert.equal(home.canonical, 'https://grwtsk.com/');
    await page.screenshot({ path: join(output, config.name + '-home.png') });
    if (home.article) {
      const path = '/articles/' + home.article + '/';
      assert.equal((await page.goto(origin + path, { waitUntil: 'load' })).status(), 200);
      await page.evaluate(() => document.fonts.ready);
      const permalink = await inspect(page);
      validate(permalink, config.width <= 560, config.dark);
      assert.equal(permalink.canonical, 'https://grwtsk.com' + path);
      assert.equal(permalink.mainEntity, home.mainEntity);
      assert.equal(permalink.archive, null);
      for (const field of ['meta', 'title', 'intro', 'section']) {
        if (home[field]) {
          for (const dimension of ['x', 'y', 'width', 'height']) {
            near(permalink[field][dimension], home[field][dimension], 'shared ' + field + ' ' + dimension);
          }
        }
      }
      await page.screenshot({ path: join(output, config.name + '-article.png') });
      await page.emulateMedia({ media: 'print', colorScheme: 'light' });
      const print = await inspect(page);
      near(print.body.size, 11 * 96 / 72, 'print body font');
      near(print.main.top, 0, 'print top inset');
      assert.equal(print.back.display, 'none');
    }
    assert.deepEqual(errors, []);
    await page.close();
    console.log('Verified original visual contract: ' + config.name);
  }
} finally {
  if (browser) await browser.close();
  await close();
}
