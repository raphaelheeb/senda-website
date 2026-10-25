// Eleventy build for sendabikes.com
//
// Phase 1 ("eleventy-port"): the existing hand-written pages are copied
// through unchanged, so the built site in _site/ is identical to today's.
// From "proposal-v1" on, pages move into Liquid layouts (src/_includes)
// and content files (content/), one template at a time.

export default function (eleventyConfig) {
  // Existing static pages and assets, copied as-is
  const passthrough = [
    "index.html",
    "story.html",
    "de",
    "orma",
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

  // Templates (Liquid, same language as Shopify themes) and Markdown content
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
