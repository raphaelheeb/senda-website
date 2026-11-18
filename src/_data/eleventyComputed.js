// Language-dependent values every template can use.
// `lang` comes from pagination over site.langs ("en", "de"); templates without it are English.
//   t           interface text for the page's language (src/_data/i18n/<lang>.json)
//   langPrefix  "" or "/de"
//   L           translated fields of a page or product (the `de:` block in its data),
//               used as {{ L.summary | default: summary }}; empty in English
//   C           a page's copy block for its language
export default {
  t: (data) => data.i18n[data.lang || "en"],
  langPrefix: (data) => (data.lang === "de" ? "/de" : ""),
  L: (data) => (data.lang === "de" && data.de ? data.de : {}),
  // Page copy kept side by side in a page's front matter as `en:` and `de:` blocks.
  C: (data) => (data.lang === "de" ? data.de : data.en) || {},
};
