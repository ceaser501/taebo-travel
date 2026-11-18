// Turns the lines of text found on a photo (menu, sign, leaflet...) into natural, short Korean, one answer per line,
// so the app can paint them back over the photo. Word-for-word machine translation reads menus badly
// (豚玉 → "돼지구슬"), so Claude translates them knowing what kind of thing was photographed.
// The Anthropic key stays on the server (secret ANTHROPIC_API_KEY).
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ko"],
  properties: { ko: { type: "array", items: { type: "string" } } },
};

const SYSTEM = `You translate text read off a photo taken by a Korean traveller in Japan (a menu, a sign, a leaflet, a notice, a package...).
You get the lines in reading order as a JSON array; the reading was done by OCR, so a line can be a fragment, a misread, or noise.
Return {"ko": [...]} with exactly one Korean string per input line, in the same order.
- Write what a Korean would naturally call it, not a word-for-word rendering. On a menu, name the dish the way Korean menus and travellers do (豚玉 → 돼지고기 오코노미야키, すじ → 소힘줄, ちから → 떡, 焼そば → 야키소바, 生ビール → 생맥주).
- Use the other lines to tell what the photo is and what each line means (a dish, a section heading, a price, a shop name, an opening time).
- Keep each answer short enough to fit where the original was: about as many characters as the original, at most twice as many. No explanations or brackets.
- Shop and place names: Korean pronunciation of the name (きじ → 키지), not a translation.
- A line that is only a number, a price or a time: give it as digits (九五〇 → 950, 11:30~14:00).
- A line that is noise or cannot be understood: return it unchanged.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "no-key" }, 503);
  let lines: unknown;
  try { lines = (await req.json()).lines; } catch { return json({ error: "bad-body" }, 400); }
  if (!Array.isArray(lines) || !lines.length || lines.length > 300 || !lines.every((l) => typeof l === "string" && l.length <= 500)) {
    return json({ error: "bad-lines" }, 400);
  }
  // members only: the call costs money, so a signed-in 딱복트립 account is required
  const auth = req.headers.get("Authorization") || "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!user) return json({ error: "sign-in" }, 401);
  const client = new Anthropic({ apiKey: key });
  try {
    // deno-lint-ignore no-explicit-any
    const msg: any = await client.beta.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 16000,
      // a short translation job: low effort answers fast
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      // if a safety check declines, the API retries on its default fallback model
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(lines) }],
    } as never);
    if (msg.stop_reason === "refusal") return json({ error: "refused" }, 502);
    const text = msg.content.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
    const ko = JSON.parse(text).ko;
    if (!Array.isArray(ko) || ko.length !== lines.length) return json({ error: "mismatch" }, 502);
    return json({ ko });
  } catch (e) {
    console.error("photo-text-ko", e);
    return json({ error: e instanceof Anthropic.APIError ? `api-${e.status}` : "failed" }, 502);
  }
});
