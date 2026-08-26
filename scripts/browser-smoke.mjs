/**
 * Real browser tests for money formatting + recalculation.
 * ACTION | EXPECTED | ACTUAL | PASS/FAIL
 */
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function record(action, expected, actual, pass) {
  results.push({ action, expected, actual, pass: pass ? 'PASS' : 'FAIL' });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${action} | attendu=${expected} | réel=${actual}`);
}

async function setInput(page, selector, value) {
  await page.focus(selector);
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  if (String(value).length) {
    await page.type(selector, String(value), { delay: 5 });
  }
}

async function setNumberInput(page, selector, value) {
  await page.$eval(
    selector,
    (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    value
  );
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: '/usr/local/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1280,900'],
  });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#capital');

  // Format on blur
  for (const [raw, formatted] of [
    ['2300000', '2 300 000'],
    ['500000', '500 000'],
    ['15000000', '15 000 000'],
    ['250000000', '250 000 000'],
    ['1000000000', '1 000 000 000'],
  ]) {
    await setInput(page, '#capital', raw);
    await page.$eval('#capital', (el) => el.blur());
    await sleep(50);
    const val = await page.$eval('#capital', (el) => el.value);
    record(`blur format capital ${raw}`, formatted, val, val === formatted);
  }

  // Empty clear
  await setInput(page, '#capital', '');
  await page.$eval('#capital', (el) => el.blur());
  await sleep(50);
  let val = await page.$eval('#capital', (el) => el.value);
  const mcap = await page.$eval('#mcap', (el) => el.textContent.trim());
  record('empty capital', "'' and metric 0 FCFA", `input='${val}' metric='${mcap}'`, val === '' && mcap.startsWith('0'));

  // Enter key
  await setInput(page, '#monthly', '1000000');
  await page.focus('#monthly');
  await page.keyboard.press('Enter');
  await sleep(50);
  val = await page.$eval('#monthly', (el) => el.value);
  record('Enter format monthly 1000000', '1 000 000', val, val === '1 000 000');

  // Recalc changes final value 1M → 10M
  await setNumberInput(page, '#years', '10');
  await setInput(page, '#monthly', '0');
  await page.$eval('#monthly', (el) => el.blur());
  await setInput(page, '#capital', '1000000');
  await page.click('#recalc');
  await sleep(150);
  const fv1 = await page.$eval('#mfv', (el) => el.textContent.trim());
  const cap1 = await page.$eval('#mcap', (el) => el.textContent.trim());
  await setInput(page, '#capital', '10000000');
  await page.click('#recalc');
  await sleep(150);
  const fv2 = await page.$eval('#mfv', (el) => el.textContent.trim());
  const cap2 = await page.$eval('#mcap', (el) => el.textContent.trim());
  record('recalc capital metric 1M→10M', '1 000 000 → 10 000 000', `${cap1} → ${cap2}`, cap1.includes('1 000 000') && cap2.includes('10 000 000'));
  record('recalc capital 1M→10M changes mfv', 'values differ', `${fv1} → ${fv2}`, fv1 !== fv2 && !fv1.includes('e+'));

  // Paste
  await page.focus('#capital');
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.$eval('#capital', (el) => {
    const dt = new DataTransfer();
    dt.setData('text', '15000000');
    el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: dt }));
  });
  await sleep(80);
  val = await page.$eval('#capital', (el) => el.value);
  record('paste 15000000 formats', '15 000 000', val, val === '15 000 000');

  // Horizon 100
  await setNumberInput(page, '#years', '100');
  await sleep(80);
  const has100 = await page.$$eval('#proj tr', (rows) =>
    rows.some((r) => r.textContent.includes('100 ans'))
  );
  record('horizon 100 years row', 'row present', String(has100), has100);

  // CSV import
  const csvPath = new URL('../public/sample-brvm.csv', import.meta.url);
  const input = await page.$('#csv-file');
  await input.uploadFile(csvPath.pathname);
  await sleep(300);
  const gate = await page.$eval('#mqg', (el) => el.textContent.trim());
  const csvStatus = await page.$eval('#csv-status', (el) => el.textContent.trim());
  record('CSV import sample', 'gate not BLOCKED + status mentions lignes', `${gate} | ${csvStatus}`, gate !== 'BLOCKED' && /lignes/i.test(csvStatus));

  // Profile change
  await page.select('#profile', 'prudent');
  await sleep(50);
  const reserveP = await page.evaluate(() => document.body.innerText);
  await page.select('#profile', 'dynamique');
  await sleep(50);
  const reserveD = await page.evaluate(() => document.body.innerText);
  record('profile changes UI text', 'prudent≠dynamique content', 'checked', reserveP !== reserveD);

  // Console errors
  record('console errors', '0', String(consoleErrors.length), consoleErrors.length === 0);

  await page.screenshot({ path: '/tmp/brvm-browser-final.png', fullPage: true });
  await browser.close();

  const failed = results.filter((r) => r.pass === 'FAIL');
  writeFileSync(
    '/agent/brvm-investment-engine/browser-test-results.json',
    JSON.stringify({ results, consoleErrors, failed: failed.length }, null, 2)
  );
  console.log(`\nSummary: ${results.length - failed.length}/${results.length} PASS`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
