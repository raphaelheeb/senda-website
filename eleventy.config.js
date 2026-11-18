// Eleventy build for sendabikes.com
//
// Site structure built from Liquid templates (src/_includes)
// and content files (content/). Liquid is the same template language Shopify
// themes use, so layouts and partials can move to the shop later.
//
// Every page is built in English and German (pagination over site.langs).
// Pages not yet redesigned (story, legal) are still copied through
// unchanged. The old index.html and orma/ are kept in the repo (the live site
// on GitHub Pages serves them) but replaced in the build.

import markdownIt from "markdown-it";

const production = process.env.SENDA_BUILD === "production";

export default function (eleventyConfig) {
  // Launch scope: pages marked `published: false` exist in previews only.
  eleventyConfig.addPreprocessor("launch-scope", "*", (data) => {
    if (production && data.published === false) return false;
  });

  const passthrough = [
    "story.html",
    "legal",
    "assets",
    "favicon.ico",
    "favicon.svg",
    "apple-touch-icon.png",
    "CNAME",
    "_redirects",
  ];
  for (const path of passthrough) {
    eleventyConfig.addPassthroughCopy(path);
  }
  eleventyConfig.addPassthroughCopy({ "src/styles": "styles" });
  eleventyConfig.addPassthroughCopy({ "src/scripts": "scripts" });

  // All products, in the order set by `order` in each file
  eleventyConfig.addCollection("products", (api) =>
    api
      .getFilteredByGlob("content/products/**/*.md")
      .sort((a, b) => (a.data.order || 99) - (b.data.order || 99))
  );
  eleventyConfig.addCollection("journal", (api) =>
    api.getFilteredByGlob("content/journal/*.md").sort((a, b) => b.date - a.date)
  );

  // Products of one category in one language:
  // {% assign items = collections.products | in_category: "wheelsets", lang %}
  eleventyConfig.addFilter("in_category", (items, category, lang = "en") =>
    (items || []).filter((p) => p.data.category === category && (p.data.lang || "en") === lang)
  );

  // Swiss number format with apostrophe: 5400 -> "5’400"
  eleventyConfig.addFilter("chf", (n) => String(Math.round(Math.abs(Number(n)))).replace(/\B(?=(\d{3})+(?!\d))/g, "’"));

  // Dates: "2026-12-31" -> "31 December 2026" / "31. Dezember 2026"
  const locale = (lang) => (lang === "de" ? "de-CH" : "en-GB");
  const at = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  eleventyConfig.addFilter("long_date", (iso, lang) =>
    at(iso).toLocaleDateString(locale(lang), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }));
  eleventyConfig.addFilter("day_month", (iso, lang) =>
    at(iso).toLocaleDateString(locale(lang), { day: "numeric", month: "long", timeZone: "UTC" }));
  eleventyConfig.addFilter("readable_date", (date, lang) =>
    new Date(date).toLocaleDateString(locale(lang), { day: "numeric", month: "long", year: "numeric" }));

  // "Hello {name}" | fill: "name", "Raphael"  (pairs of key, value)
  eleventyConfig.addFilter("fill", (str, ...pairs) => {
    let out = String(str ?? "");
    for (let i = 0; i < pairs.length; i += 2) out = out.replaceAll(`{${pairs[i]}}`, pairs[i + 1] ?? "");
    return out;
  });

  // Internal link in the page's language: "/bikes/" | lurl: lang -> "/de/bikes/"
  const shared = /^\/(legal|assets|scripts|styles|api|journal)\/|^\/story\.html/;
  const lurl = (url, lang) => {
    const u = String(url ?? "");
    if (lang !== "de" || !u.startsWith("/") || shared.test(u) || u.startsWith("/de/")) return u;
    return u === "/" ? "/de/" : `/de${u}`;
  };
  eleventyConfig.addFilter("lurl", lurl);

  // The same page in the other language, or that language's home page if there is none.
  eleventyConfig.addFilter("alt_url", (url, lang, all) => {
    const target = lang === "de" ? (url.replace(/^\/de(\/|$)/, "/") || "/") : lurl(url, "de");
    const exists = (all || []).some((p) => p.url === target);
    return exists ? target : lang === "de" ? "/" : "/de/";
  });

  // Markdown for translated body text kept in front matter (de.body)
  const md = markdownIt({ html: true });
  eleventyConfig.addFilter("md", (s) => (s ? md.render(String(s)) : ""));


  return {
    templateFormats: ["liquid", "md"],
    htmlTemplateEngine: "liquid",
    markdownTemplateEngine: "liquid",
    dir: {
      input: ".",
      includes: "src/_includes",
      data: "src/_data",
      output: "_site",
    },
  };
}
