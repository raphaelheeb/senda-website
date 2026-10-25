// Eleventy build for sendabikes.com
//
// proposal-v1: new site structure built from Liquid templates (src/_includes)
// and content files (content/). Liquid is the same template language Shopify
// themes use, so layouts and partials can move to the shop later.
//
// Pages not yet redesigned (DE pages, story, legal) are still copied through
// unchanged. The old index.html and orma/ are kept in the repo (the live site
// on GitHub Pages serves them) but replaced in the build.

export default function (eleventyConfig) {
  const passthrough = [
    "story.html",
    "de",
    "legal",
    "assets",
    "favicon.ico",
    "favicon.svg",
    "apple-touch-icon.png",
    "CNAME",
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
