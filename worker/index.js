// SENDA website worker. Static pages come from the Eleventy build (ASSETS);
// only /api/* runs code here (see run_worker_first in wrangler.jsonc).
import { handleOrder, retryPending, OrderError } from "./order.js";
import { mailerliteSubscribe } from "./integrations.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
});

/** Requests from another site are refused: the forms only post same-origin. */
function sameOrigin(request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

async function subscribe(request, env) {
  if (!env.ML_TOKEN || !env.ML_GROUP) return json({ ok: false, message: "Sign-up is briefly unavailable." }, 503);
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) || email.length > 160) return json({ ok: false, message: "Please check the email address." }, 400);
  await mailerliteSubscribe(env, email, ["orma", "gravel"].includes(body.list) ? body.list : "senda");
  return json({ ok: true });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    if (request.method !== "POST") return json({ ok: false, message: "Method not allowed." }, 405);
    if (!sameOrigin(request)) return json({ ok: false, message: "Not allowed." }, 403);

    try {
      if (url.pathname === "/api/order") return json(await handleOrder(request, env, ctx));
      if (url.pathname === "/api/subscribe") return await subscribe(request, env);
      return json({ ok: false, message: "Not found." }, 404);
    } catch (e) {
      if (e instanceof OrderError) return json({ ok: false, message: e.message, fields: e.fields }, e.status);
      console.error(url.pathname, e);
      return json({ ok: false, message: "Something went wrong on our side." }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(retryPending(env));
  },
};
