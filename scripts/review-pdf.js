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
// ?lang= stops the site's browser-language redirect from swapping DE and EN
const PAGES = [
  ["home-en", "/?lang=en"],
  ["home-de", "/de/?lang=de"],
  ["story-en", "/story.html?lang=en"],
  ["story-de", "/de/story.html?lang=de"],
  ["orma", "/orma/"],
  ["impressum", "/legal/impressum.html"],
  ["privacy", "/legal/privacy.html"],
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
      content: ".reveal{opacity:1!important;transform:none!important}",
    });
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
