// Opens a Google Maps share link (maps.app.goo.gl/...) and returns the full Google Maps address it points to,
// so the app can read the place name and position. Browsers can't follow these redirects themselves.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ALLOWED = /^(maps\.app\.goo\.gl|goo\.gl|(www\.)?google\.[a-z.]+|maps\.google\.[a-z.]+|consent\.google\.[a-z.]+)$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
  try {
    const { url } = await req.json();
    let u = new URL(String(url));
    for (let i = 0; i < 6; i++) {
      if (!ALLOWED.test(u.hostname)) return json({ error: "not-google" }, 400);
      // Google's cookie notice wraps the real address in ?continue=
      if (u.hostname.startsWith("consent.")) { const c = u.searchParams.get("continue"); if (c) { u = new URL(c); continue; } }
      if (u.pathname.startsWith("/maps") && !/goo\.gl$/.test(u.hostname)) break;
      const r = await fetch(u, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36", "Accept-Language": "ko,ja;q=0.8" } });
      const loc = r.headers.get("location");
      if (!loc) break;
      u = new URL(loc, u);
    }
    return json({ url: u.toString() });
  } catch (e) {
    return json({ error: "failed", detail: String(e) }, 500);
  }
});
