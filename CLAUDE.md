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
- Today the existing HTML pages are copied through unchanged (see `eleventy.config.js`).
- New pages and the redesign use Liquid templates in `src/_includes/` and content in `content/` (Markdown, DE and EN).
  Liquid is chosen on purpose: the same templates move to the Shopify theme later.
- `api/subscribe.js` is the newsletter endpoint (Vercel function, MailerLite). Keep it working.
- Never commit secrets (`api_token.txt` is ignored).

## Brand rules
- Tone: understated, precise, never loud. Tagline "QUIETLY FAST". No hype words, no exclamation marks.
- Site font: Hanken Grotesk (Google Fonts). The SENDA wordmark (Swiss 721) is used only as a logo graphic.
- Palette (from the current site):
  `--bg #faf9f6` · `--bg-warm #f4f1eb` · `--ink #1a1916` · `--ink-mid #5a574f` · `--ink-light #9b9890` ·
  `--charcoal #272420` · `--gold #c4a96b` · `--gold-muted #b5a280` · `--rose #dcc5be` · `--rule #e2dfd8` · `--rule-light #eeebe5`
- Finishes: Slate Blue (satin), Champagne Silver (pearl), Dusky Rose (satin), Graphite (matte).
- Layout specs: desktop 1440 px, content 1200 px, 12 columns, 24 px gutters; mobile 390 px, 20 px margins, 4 columns.
- Micha (co-founder) owns colours, fonts, image ratios, spacing and paragraph styles. Take these from his style sheet once delivered; do not invent new colours.

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
