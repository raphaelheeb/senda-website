// Renders site pages as PDFs for design review (redlining in Acrobat).
//
// Usage:
//   npm run review                         -> pages from the local dev server (http://localhost:8080)
//   npm run review -- https://<preview-url> -> pages from a preview deployment
//
// Output: review/<YYYY-MM-DD>/<page>-desktop.pdf and <page>-mobile.pdf
// One PDF per page and width, one long sheet each, exactly as the browser shows it.

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const BASE = (process.argv[2] || "http://localhost:8080").replace(/\/$/, "");

// Pages to review: [file name, path]
const PAGES = [
  ["01-home", "/"],
  ["02-bikes", "/bikes/"],
  ["03-bike-road-announced", "/bikes/road/?state=announced"],
  ["04-bike-road-preorder", "/bikes/road/?state=preorder"],
  ["05-bike-gravel", "/bikes/gravel/"],
  ["06-configure", "/bikes/configure/"],
  ["07-wheelsets", "/wheelsets/"],
  ["08-orma-momentum-45", "/wheelsets/orma-momentum-45/"],
  ["09-components", "/components/"],
  ["10-orma-aero-bar", "/components/orma-aero-bar/"],
  ["11-clothing", "/clothing/"],
  ["12-jersey", "/clothing/jersey/"],
  ["13-journal", "/journal/"],
  ["14-journal-post", "/journal/geometry-first/"],
  ["15-about", "/about/"],
  ["16-orma", "/orma/"],
  ["17-service", "/service/"],
  ["18-styleguide", "/styleguide/"],
];

const WIDTHS = [
  ["desktop", 1440, 900],
  ["mobile", 390, 844],
];

const day = new Date().toISOString().slice(0, 10);
const outDir = `review/${day}`;
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();

for (const [label, width, height] of WIDTHS) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: label === "mobile",
    hasTouch: label === "mobile",
  });
  // No cookie banner, no analytics from review runs
  await context.addInitScript(() => {
    localStorage.setItem("senda_cookie_consent", "declined");
    localStorage.setItem("senda_analytics_excluded", "1");
  });

  for (const [name, path] of PAGES) {
    const page = await context.newPage();
    await page.goto(BASE + path, { waitUntil: "networkidle" });

    // Scroll through once so lazy images and scroll-in animations trigger
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
    });
    await page.addStyleTag({
      content: ".reveal{opacity:1!important;transform:none!important}.review-bar{display:none!important}",
    });
    await page.evaluate(() => Promise.all([...document.images].map((i) => { i.loading = "eager"; return i.decode().catch(() => {}); })));
    await page.waitForTimeout(800);

    const shot = await page.screenshot({ fullPage: true, type: "jpeg", quality: 85 });
    const { w, h } = await page.evaluate(() => ({
      w: document.documentElement.clientWidth,
      h: document.documentElement.scrollHeight,
    }));

    // Wrap the screenshot in a single-page PDF at its real size
    const sheet = await browser.newPage();
    await sheet.setContent(
      `<html><body style="margin:0"><img style="display:block;width:${w}px" src="data:image/jpeg;base64,${shot.toString("base64")}"></body></html>`
    );
    const pdf = await sheet.pdf({
      width: `${w}px`,
      height: `${h + 1}px`,
      printBackground: true,
      pageRanges: "1",
    });
    await writeFile(`${outDir}/${name}-${label}.pdf`, pdf);
    await sheet.close();
    await page.close();
    console.log(`${name}-${label}.pdf`);
  }
  await context.close();
}

await browser.close();
console.log(`Done: ${outDir}/`);
