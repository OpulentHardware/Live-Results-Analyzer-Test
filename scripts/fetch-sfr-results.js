import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { parseSfrLiveText } from '../assets/parser.js';

const SOURCE_URL = process.env.SFR_SOURCE_URL || 'https://live.sfrautox.com/#N';

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const JSON_PATH = path.join(DATA_DIR, 'current-event.json');
const TEXT_PATH = path.join(DATA_DIR, 'source-text.txt');

async function waitForResults(page) {
  await page.waitForTimeout(4000);

  await page.evaluate(async () => {
    await new Promise(resolve => {
      let totalHeight = 0;
      const distance = 500;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 150);
    });
  });

  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
}

async function clickView(page, label) {
  console.log(`Switching to ${label} view...`);

  const candidates = [
    page.getByRole('button', { name: label, exact: true }),
    page.getByRole('link', { name: label, exact: true }),
    page.locator(`button:has-text("${label}")`).first(),
    page.locator(`a:has-text("${label}")`).first(),
    page.locator(`text="${label}"`).first()
  ];

  for (const locator of candidates) {
    try {
      const count = await locator.count();
      if (count > 0) {
        await locator.click({ timeout: 5000 });
        await page.waitForTimeout(2500);
        return true;
      }
    } catch {
      // Try next selector.
    }
  }

  console.warn(`Could not click ${label}. Continuing with current view.`);
  return false;
}

async function getBodyText(page, label) {
  await waitForResults(page);
  const text = await page.locator('body').innerText({ timeout: 30000 });
  console.log(`${label} text length: ${text.length}`);
  console.log(`${label} first 500 chars:\n${text.slice(0, 500)}`);
  return text;
}

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  const page = await browser.newPage({
    viewport: { width: 1600, height: 3000 }
  });

  console.log(`Opening ${SOURCE_URL}`);

  await page.goto(SOURCE_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });

  await waitForResults(page);

  const overallText = await getBodyText(page, 'OVERALL');

  await clickView(page, 'PAX');
  const paxText = await getBodyText(page, 'PAX');

  await clickView(page, 'Class');
  const classText = await getBodyText(page, 'CLASS');

  await browser.close();

  const combinedText = [
    '[[OVERALL_VIEW]]',
    overallText,
    '',
    '[[PAX_VIEW]]',
    paxText,
    '',
    '[[CLASS_VIEW]]',
    classText
  ].join('\n');

  if (!combinedText || combinedText.length < 100) {
    throw new Error('Visible source text was empty or too short. The live page may not have loaded results.');
  }

  const parsed = parseSfrLiveText(combinedText, {
    sourceUrl: SOURCE_URL,
    updatedAt: new Date().toISOString()
  });

  await fs.writeFile(TEXT_PATH, combinedText, 'utf8');
  await fs.writeFile(JSON_PATH, JSON.stringify(parsed, null, 2), 'utf8');

  const classCount = Object.keys(parsed.classes || {}).length;

  console.log(`Wrote ${JSON_PATH}`);
  console.log(`Parsed ${parsed.overall.length} overall, ${parsed.pax.length} PAX, ${classCount} class groups.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
