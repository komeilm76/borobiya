// Interactive capture harness for Stage F.
// Usage: node capture.mjs scenarios.json [only-ref-id]
// Scenario shape:
// { ref, route, persona?, anon?, width, height, dsf?,
//   steps?: [ {click?, clickText?, type?, wait?, scroll?, offline?, dark?, light?, reducedMotion?, hold?, hover?} ... ], darkStart?, reducedMotionStart?,
//   shots?: [{name, steps?}]   // multiple screenshots from one page session
// }
import chromiumPkg from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';

const scenariosFile = process.argv[2];
const only = process.argv[3];
const scenarios = JSON.parse(readFileSync(scenariosFile, 'utf8'));
const executablePath = await chromiumPkg.executablePath();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runStep(page, step) {
  if (step.clickAt !== undefined) { const { x, y } = step.clickAt; await page.mouse.click(x, y); return; }
  if (step.click !== undefined) {
    await page.waitForSelector(step.click, { timeout: 8000 });
    await page.click(step.click);
    return;
  }
  if (step.clickText !== undefined) {
    const { tag = 'button', contains } = step.clickText;
    const handle = await page.evaluateHandle((tagName, text) => {
      return [...document.querySelectorAll(tagName)].find((el) => el.innerText.includes(text)) ?? null;
    }, tag, contains);
    const el = handle.asElement();
    if (!el) throw new Error(`clickText: no <${tag}> containing "${contains}"`);
    await el.click();
    return;
  }
  if (step.type !== undefined) {
    const { selector, text, clear = true } = step.type;
    await page.waitForSelector(selector, { timeout: 8000 });
    if (clear) await page.$eval(selector, (el) => { el.value = ''; });
    await page.click(selector);
    await page.type(selector, text, { delay: 8 });
    if (step.type.enter) await page.keyboard.press('Enter');
    return;
  }
  if (step.focusText !== undefined) {
    await page.evaluate((text) => {
      const el = [...document.querySelectorAll('input,textarea')].find((e) => (e.placeholder || '').includes(text) || (e.getAttribute('aria-label') || '').includes(text));
      if (el) el.focus({ preventScroll: false });
    }, step.focusText);
    return;
  }
  if (step.wait !== undefined) { await sleep(step.wait); return; }
  if (step.scroll !== undefined) { await page.evaluate((y) => window.scrollTo(0, y), step.scroll); return; }
  if (step.scrollEl !== undefined) { const { selector, y } = step.scrollEl; await page.evaluate((sel, dy) => { const el = document.querySelector(sel); if (el) el.scrollTop = dy; }, selector, y); return; }
  if (step.offline !== undefined) { await page.setOfflineMode(step.offline); await sleep(400); return; }
  if (step.dark) { await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]); await sleep(300); return; }
  if (step.reducedMotion) { await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]); await sleep(300); return; }
  if (step.light) { await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]); await sleep(300); return; }
  if (step.hover !== undefined) { await page.hover(step.hover); return; }
  if (step.mouseDown !== undefined) { await page.waitForSelector(step.mouseDown, { timeout: 8000 }); const box = await (await page.$(step.mouseDown)).boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); return; }
  if (step.mouseUp) { await page.mouse.up(); return; }
  if (step.hold !== undefined) { const { selector, ms } = step.hold; await page.waitForSelector(selector, { timeout: 8000 }); const box = await (await page.$(selector)).boundingBox(); const dx = box.x + box.width / 2, dy = box.y + box.height / 2; await page.mouse.move(dx, dy); await page.mouse.down(); await sleep(ms ?? 900); await page.mouse.up(); return; }
  if (step.network !== undefined) {
    const { latencyMs = 0 } = step.network;
    await page.emulateNetworkConditions({ offline: false, latency: latencyMs, downloadThroughput: -1, uploadThroughput: -1 });
    return;
  }
  if (step.upload !== undefined) {
    const { selector, path } = step.upload;
    const handle = await page.$(selector);
    if (!handle) throw new Error(`upload: no element matches ${selector}`);
    await handle.uploadFile(path);
    return;
  }
  if (step.clickPrefix !== undefined) {
    const el = await page.$(step.clickPrefix);
    if (!el) throw new Error(`clickPrefix: nothing matches ${step.clickPrefix}`);
    await el.click();
    return;
  }
  if (step.mouseClick !== undefined) { const { x, y } = step.mouseClick; await page.mouse.click(x, y); return; }
  if (step.scrollInto !== undefined) { await page.$eval(step.scrollInto, (el) => el.scrollIntoView({ block: 'start', inline: 'nearest' })); await sleep(300); return; }
}

async function shoot(page, file) {
  await sleep(350);
  await page.screenshot({ path: file, fullPage: false });
}

let failures = 0;
for (const scenario of scenarios) {
  if (only && scenario.ref !== only && !scenario.ref.startsWith(only)) continue;
  const glue = scenario.route.includes('?') ? '&' : '?';
  const personaParam = scenario.anon ? `${glue}anon=1` : scenario.persona ? `${glue}persona=${scenario.persona}` : '';
  const url = `http://127.0.0.1:4173/app${scenario.route}${personaParam}`;
  const width = scenario.width ?? 393, height = scenario.height ?? 852, dsf = scenario.dsf ?? 2;
  const browser = await puppeteer.launch({
    executablePath,
    args: [...chromiumPkg.args, `--window-size=${width},${height}`, '--lang=fa-IR'],
    headless: 'shell',
    defaultViewport: { width, height, deviceScaleFactor: dsf }
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(9000);
    if (scenario.darkStart) await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  if (scenario.reducedMotionStart) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    const resp = await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    const baseStatus = resp?.status() ?? 0;
    const outBase = `${process.env.OUT_DIR ?? 'docs/visual-acceptance/screens'}/${scenario.ref}`;
    if (scenario.shots && scenario.shots.length) {
      for (const shot of scenario.shots) {
        for (const step of shot.steps ?? []) {
          try { await runStep(page, step); } catch (e) { console.warn(`[${scenario.ref}] step failed: ${e.message}`); }
        }
        const file = `${outBase}-${shot.name}.png`;
        if (shot.clip) await page.screenshot({ path: file, clip: shot.clip });
        else await shoot(page, file);
        console.log(`[${scenario.ref}] shot -> ${shot.name}.png (http ${baseStatus})`);
      }
    } else {
      for (const step of scenario.steps ?? []) {
        try { await runStep(page, step); } catch (e) { failures++; console.warn(`[${scenario.ref}] step failed: ${e.message}`); }
      }
      if (scenario.clip) await page.screenshot({ path: `${outBase}-impl.png`, clip: scenario.clip });
      else await shoot(page, `${outBase}-impl.png`);
      console.log(`[${scenario.ref}] shot (http ${baseStatus})`);
    }
  } catch (error) {
    failures++;
    console.error(`[${scenario.ref}] FAILED: ${error.message}`);
  }
  await browser.close();
}
console.log(failures ? `done with ${failures} step/capture failure(s)` : 'all captures done');
process.exit(failures ? 2 : 0);
