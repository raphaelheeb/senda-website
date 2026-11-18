// Eleventy build for sendabikes.com
//
// Site structure built from Liquid templates (src/_includes)
// and content files (content/). Liquid is the same template language Shopify
// themes use, so layouts and partials can move to the shop later.
//
// Pages not yet redesigned (DE pages, story, legal) are still copied through
// unchanged. The old index.html and orma/ are kept in the repo (the live site
// on GitHub Pages serves them) but replaced in the build.

const production = process.env.SENDA_BUILD === "production";

export default function (eleventyConfig) {
  // Launch scope: pages marked `published: false` exist in previews only.
  eleventyConfig.addPreprocessor("launch-scope", "*", (data) => {
    if (production && data.published === false) return false;
  });

  const passthrough = [
    "story.html",
    "de",
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

  // Products of one category: {% assign items = collections.products | in_category: "wheelsets" %}
  eleventyConfig.addFilter("in_category", (items, category) =>
    (items || []).filter((p) => p.data.category === category)
  );
  // 5400 -> "5,400" (Swiss prices on the English site)
  eleventyConfig.addFilter("chf", (n) => String(Math.round(Math.abs(Number(n)))).replace(/\B(?=(\d{3})+(?!\d))/g, "’"));
  // "2026-12-31" -> "31 December 2026"
  eleventyConfig.addFilter("long_date", (iso) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }));
  eleventyConfig.addFilter("day_month", (iso) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }));
  eleventyConfig.addFilter("status_label", (status) => {
    return { announced: "Announced", preorder: "Pre-order", available: "Available" }[status] || status;
  });
  eleventyConfig.addFilter("readable_date", (date) =>
    new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  );

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
