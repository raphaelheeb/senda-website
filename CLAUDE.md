# SENDA website (sendabikes.com)

Boutique Swiss road and gravel bike brand. ORMA is SENDA's wheel and component line.
This repo is the brand site; it becomes a Shopify shop later (theme in a separate repo).

## Branches and review
- Never commit to `main`. `main` is what is live.
- Work on a branch (`feature/<topic>`), open a pull request, check the preview on desktop and mobile, then merge.
- `legacy-static` is a snapshot of the hand-written site before Eleventy. Do not change it.
- Design review: `npm run review -- <preview-url>` writes PDFs to `review/<date>/` for redlining in Acrobat.
  When redlined PDFs come back, read every annotation and implement each one; list any you did not apply and why.

## Build
- Eleventy 3, output `_site/`. `npm run dev` (local server on :8080), `npm run build`.
- Liquid templates in `src/_includes/` (layouts: base, product, category, post; partials: header, footer, card, frame, badge, signup).
  Liquid is chosen on purpose: the same templates move to the Shopify theme later.
- Content in `content/`. One Markdown file per product in `content/products/<category>/`, with front matter
  (title, status, price, delivery, specs, compat, options...). Folder data files (`*.11tydata.json`) set the category defaults.
  Use `override:` in a folder data file when an array must replace, not extend, the parent value.
- Design tokens in `src/styles/tokens.css`, components in `src/styles/site.css`, behaviour in `src/scripts/site.js`.
- Images for the web go in `assets/img/web/` as `<name>-2000.jpg` and `<name>-1000.jpg`. Cards and menus use the 1000 version.
- Not yet rebuilt in templates and copied through unchanged: `de/`, `story.html`, `legal/`. The old `index.html` and `orma/` stay in the repo
  because the live site (GitHub Pages, serving `main` as-is) still uses them.
- Merging the redesign into `main` only changes the live site once production serves the Eleventy build (Vercel or Cloudflare Pages).
  Until that hosting move, review on Vercel previews only.
- Previews (any build without SENDA_BUILD=production) add noindex, the product state switch and draft markers.
- `api/subscribe.js` is the newsletter endpoint (Vercel function, MailerLite). Keep it working.
- Never commit secrets (`api_token.txt` is ignored).

## Brand rules
- Design reference: Micha's V22 concept (white, architectural, quiet). Proposal v3 reduces noise further: one idea per section (headline, at most one sentence, one link), no section numbers or labels above headlines, no drop-down menus, product tiles show name and one note only. Structure benchmark: ridefire.cc (structure only, not its look).
- Tone: understated, precise, never loud. Tagline "QUIETLY FAST". No hype words, no exclamation marks.
- Fonts: Inter (all statements and running text) and JetBrains Mono (labels, navigation, buttons, captions), both
  self-hosted from `assets/fonts/` (SIL OFL), so every visitor sees the same type. Never load fonts from Google.
  The SENDA wordmark is a logo graphic (`assets/logo/senda-wordmark-v22.png`).
- Colour: monochrome. Paper #fff, ink #151515, text #444, labels #666, rules #d2d2d2. No accent colour.
- Type scale (desktop/mobile): display 88/48, H1 64/40, H2 64/36, H3 32/24, text 18/17, labels 12 mono uppercase.
  Running text never below 16 px.
- Sections: headline, then at most one sentence. Space separates sections, not rules or labels.
- One solid button per screen for the commercial action; all other links are underlined mono links with ↗.
- Status: ○ announced, ◐ pre-order, ● available.
- Finishes: Slate Blue (satin), Champagne Silver (pearl), Dusky Rose (satin), Graphite (matte).
- Micha (co-founder) owns colours, fonts, image ratios, spacing and paragraph styles. Change tokens only on his input.

## Launch scope
- `published: false` (plus `eleventyExcludeFromCollections: true`) keeps a page in previews only.
- `{% unless env.production %}...{% endunless %}` wraps draft sections; give them `class="draft" data-draft="reason"`.
- `SENDA_BUILD=production npm run build` builds the launch scope only (set this env var for production on the host).
- Rule for publishing a page: real text, real images, no "to come" visible.

## Site structure (target)
- Header: Bikes · Wheelsets · Components · Clothing | Journal · About · Search · DE/EN · Cart (or "Join the list" before the shop).
- URLs: `/bikes`, `/wheelsets`, `/components`, `/clothing`, `/journal`, `/about`, `/orma` (keep `/orma/` working).
- Every product has a lifecycle status: `announced`, `preorder` or `available`. One template per product type handles all three.

## SENDA and ORMA
- ORMA is endorsed by SENDA, like Roval by Specialized or Syncros by Scott.
- Product names start with ORMA ("ORMA Momentum"); SENDA appears as "by SENDA", never in the product name.
- The header logo is always SENDA, also on ORMA pages.
- ORMA appears on the homepage below SENDA, and at the top of the Wheelsets and Components pages.
- Bike pages say which ORMA parts they are specced with; ORMA pages say "Standard on SENDA Road and Gravel".
