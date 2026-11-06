// Reads a photo of a receipt with Claude and returns what the expense form needs:
// shop name, total, currency, category and date. The Anthropic key stays on the server (secret ANTHROPIC_API_KEY).
import Anthropic from "npm:@anthropic-ai/sdk";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const CATS = ["식비", "교통", "관광", "쇼핑", "숙소", "항공", "기타"];
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_receipt", "shop_ko", "total", "currency", "category", "date", "summary_ko"],
  properties: {
    is_receipt: { type: "boolean" },
    shop_ko: { type: "string" },
    total: { type: ["number", "null"] },
    currency: { type: "string", enum: ["JPY", "KRW", "USD"] },
    category: { type: "string", enum: CATS },
    date: { type: "string" },
    summary_ko: { type: "string" },
  },
};
const SYSTEM = `You read receipts for a Korean couple travelling in Japan and fill in their expense record. Answer in Korean.
- is_receipt: false if the photo is not a receipt or bill (then leave the rest empty, total null).
- shop_ko: the shop's name in Korean as a Korean traveller would say it (e.g. "세븐일레븐", "스타벅스 긴자점"); keep it short.
- total: the amount actually paid, tax included (合計 / お会計 / 税込). Not the change (お釣り) or the amount handed over (お預り). A number, no commas.
- currency: JPY for yen (円, ¥), KRW for won, USD for dollars.
- category: one of ${CATS.join(", ")}. Restaurants, cafes, convenience-store food → 식비; trains, taxis, IC card top-ups → 교통; tickets, admissions → 관광; goods → 쇼핑; hotels → 숙소; flights → 항공.
- date: the date printed on the receipt as YYYY-MM-DD, or "" if none.
- summary_ko: a few words on what was bought (e.g. "라멘 2, 교자"), "" if unclear.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "no-key" }, 503);
  let body: { image?: string; media_type?: string };
  try { body = await req.json(); } catch { return json({ error: "bad-body" }, 400); }
  if (!body.image || typeof body.image !== "string") return json({ error: "no-image" }, 400);

  const client = new Anthropic({ apiKey: key });
  const params = {
    model: "claude-sonnet-5-5",
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    // reading a total off a receipt needs no thinking first
    thinking: { type: "between_tools" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: body.media_type || "image/jpeg", data: body.image } },
        { type: "text", text: "이 영수증을 읽어 주세요." },
      ],
    }],
  };
  try {
    // deno-lint-ignore no-explicit-any
    let res: any;
    try { res = await client.beta.messages.create(params as any); } catch (e) {
      // if the no-thinking setting is ever refused, read with the default thinking instead
      if (!(e instanceof Anthropic.BadRequestError)) throw e;
      const { thinking: _t, ...rest } = params;
      // deno-lint-ignore no-explicit-any
      res = await client.beta.messages.create(rest as any);
    }
    if (res.stop_reason === "refusal") return json({ error: "refusal" }, 422);
    // deno-lint-ignore no-explicit-any
    const text = res.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    return json(JSON.parse(text));
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: "busy" }, 429);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: "bad-key" }, 503);
    if (e instanceof Anthropic.APIError) return json({ error: "api", status: e.status }, 502);
    return json({ error: "failed", detail: String(e) }, 500);
  }
});
