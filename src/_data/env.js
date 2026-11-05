// SENDA_BUILD=production builds only the launch scope: pages with `published: false`
// are skipped, draft sections and the preview helpers are left out.
// Previews (any other value) build everything and mark drafts.
export default { production: process.env.SENDA_BUILD === "production" };
