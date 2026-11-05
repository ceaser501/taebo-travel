// Reads a photo of a Japanese menu or sign with Claude and returns it in Korean,
// with each dish paired with its price. The Anthropic key stays on the server (secret ANTHROPIC_API_KEY).
import Anthropic from "npm:@anthropic-ai/sdk";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ITEM_PROPS = {
  section_ko: { type: "string" },
  ja: { type: "string" },
  reading: { type: "string" },
  ko: { type: "string" },
  desc_ko: { type: "string" },
  price_yen: { type: ["integer", "null"] },
  caution_ko: { type: "string" },
};
const ITEM_KEYS = Object.keys(ITEM_PROPS);
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "title_ko", "summary_ko", "items", "unread_ko"],
  properties: {
    kind: { type: "string", enum: ["menu", "sign", "other"] },
    title_ko: { type: "string" },
    summary_ko: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [...ITEM_KEYS, "sure"],
        properties: { ...ITEM_PROPS, sure: { type: "boolean" } },
      },
    },
    unread_ko: { type: "array", items: { type: "string" } },
  },
};
// what Opus sends back when it re-reads only the doubtful parts
const FIX_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["fixes"],
  properties: {
    fixes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "item"],
        properties: {
          index: { type: "integer" },
          item: { type: "object", additionalProperties: false, required: ITEM_KEYS, properties: ITEM_PROPS },
        },
      },
    },
  },
};

const SYSTEM = `You help a Korean couple travelling in Japan read what is in front of them. The wife is pregnant.
You get one photo: usually a restaurant menu, sometimes a sign, notice or label. Answer in Korean.

- kind: "menu" for menus and price lists, "sign" for signs and notices, "other" otherwise.
- title_ko: the shop or sign name in Korean (with the Japanese in parentheses if it helps), or a short description.
- summary_ko: one or two plain sentences on what this is and anything worth knowing (e.g. prices include tax, what the shop serves).
- items: every meaningful entry, in the order a reader would go through it. Japanese menus are often written vertically, right to left, with the price below or beside the name; pair each dish with its own price. Prices may be in kanji numerals (九五〇 = 950, 一四〇〇 = 1400) - give them as integers in yen. Use null when an entry has no price (and for signs).
  - section_ko: the menu section in Korean (e.g. "오코노미야키", "야키소바", "토핑", "음료"); for signs, a short group name.
  - ja: the text exactly as printed. reading: its reading in hiragana.
  - ko: a natural Korean name a Korean diner would understand, not a word-by-word translation (豚玉 is "돼지고기 오코노미야키", not "돼지 구슬").
  - desc_ko: one short line on what it is or what the sign means.
  - caution_ko: a short note only if it matters for a pregnant woman (alcohol, raw or undercooked fish/meat/egg, unpasteurised cheese, high-mercury fish, a lot of caffeine); otherwise "".
  - sure: false when you are not confident about the text or which price belongs to it (small, blurred, handwritten, cut off); otherwise true.
- unread_ko: short Korean notes on parts you could not read at all (e.g. "오른쪽 아래 손글씨 3줄"); [] if none.
Do not invent entries you cannot read; leave them out and mention them in unread_ko.`;

const FIX_SYSTEM = SYSTEM.split("\n- kind:")[0] + `
Another reader already went through this photo. You get the entries it was unsure about (with their index) and notes on parts it could not read.
Look closely at only those parts and return fixes: for an unsure entry, its corrected item with the same index; for something in the unread parts, a new item with index -1.
Use the same rules for each item as the first reader: ja exactly as printed, reading in hiragana, a natural Korean name in ko, a short desc_ko, price_yen as an integer or null, caution_ko for a pregnant woman or "".
Return no fix for anything still unreadable. Do not repeat entries that are not in question.`;

// The answer is streamed back as it is written, so the phone can show each dish as soon as it is read.
// Lines on the wire: "d:<json string>" a piece of the answer, "o:" Opus is re-reading the doubtful parts,
// "f:<json string>" its fixes, "e:<code>" an error, "z:" the end.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "no-key" }, 503);
  let body: { image?: string; media_type?: string; stream?: boolean; precise?: boolean };
  try { body = await req.json(); } catch { return json({ error: "bad-body" }, 400); }
  const { image, media_type, stream: wantStream, precise } = body;
  if (!image || typeof image !== "string") return json({ error: "no-image" }, 400);

  const client = new Anthropic({ apiKey: key });
  const base = {
    // Sonnet reads most menus well at half the price; "다시 정확하게 읽기" asks Opus instead
    model: precise ? "claude-opus-5-5" : "claude-sonnet-5-5",
    max_tokens: 32000,
    fallbacks: "default",
    // Sonnet answers straight away without thinking first (reading and translating needs little of it,
    // and Opus looks again at anything it marks as unsure); Opus keeps its normal thinking
    ...(precise ? {} : { thinking: { type: "between_tools" } }),
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: media_type || "image/jpeg", data: image } },
        { type: "text", text: "이 사진을 읽어 주세요." },
      ],
    }],
  };
  let opened;
  try {
    // deno-lint-ignore no-explicit-any
    const start = async (params: any) => {
      const stream = client.beta.messages.stream(params);
      const it = stream[Symbol.asyncIterator]();
      return { stream, it, first: await it.next() };
    };
    const params = { ...base, betas: ["server-side-fallback-2026-07-01"] };
    try { opened = await start(params); } catch (e) {
      // if the no-thinking setting is ever refused, read with the default thinking instead
      if (!(e instanceof Anthropic.BadRequestError) || precise) throw e;
      // deno-lint-ignore no-explicit-any
      const { thinking: _t, ...rest } = params as any;
      opened = await start(rest);
    }
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: "busy" }, 429);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: "bad-key" }, 503);
    if (e instanceof Anthropic.APIError) return json({ error: "api", status: e.status }, 502);
    return json({ error: "failed", detail: String(e) }, 500);
  }
  const { stream, it, first } = opened;
  // older app versions (not asking for a stream) still get the whole answer as one JSON
  if (!wantStream) {
    try {
      if (!first.done) for (let r = await it.next(); !r.done; r = await it.next()) { /* read to the end */ }
      const msg = await stream.finalMessage();
      if (msg.stop_reason === "refusal") return json({ error: "refusal" }, 422);
      // deno-lint-ignore no-explicit-any
      const text = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
      return json(JSON.parse(text));
    } catch (e) {
      if (e instanceof Anthropic.APIError) return json({ error: "api", status: e.status }, 502);
      return json({ error: "failed", detail: String(e) }, 500);
    }
  }
  const enc = new TextEncoder();
  const out = new ReadableStream({
    async start(ctl) {
      const send = (line: string) => ctl.enqueue(enc.encode(line + "\n"));
      // deno-lint-ignore no-explicit-any
      const take = (ev: any) => {
        if (ev && ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") send("d:" + JSON.stringify(ev.delta.text));
      };
      try {
        if (!first.done) take(first.value);
        for (let r = await it.next(); !r.done; r = await it.next()) take(r.value);
        const msg = await stream.finalMessage();
        if (msg.stop_reason === "refusal") send("e:refusal");
        else if (msg.stop_reason === "max_tokens") send("e:too-long");
        else if (!precise) {
          // Opus looks again only at what Sonnet was unsure of or could not read
          // deno-lint-ignore no-explicit-any
          let first: any = null;
          // deno-lint-ignore no-explicit-any
          try { first = JSON.parse(msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("")); } catch { /* keep Sonnet's answer as is */ }
          // deno-lint-ignore no-explicit-any
          const doubt = first ? first.items.map((it: any, index: number) => ({ index, ...it })).filter((it: any) => !it.sure) : [];
          const unread = first ? first.unread_ko : [];
          if (doubt.length || unread.length) {
            send("o:");
            try {
              // deno-lint-ignore no-explicit-any
              const fix: any = await client.beta.messages.create({
                model: "claude-opus-5-5",
                max_tokens: 16000,
                betas: ["server-side-fallback-2026-07-01"],
                fallbacks: "default",
                output_config: { effort: "medium", format: { type: "json_schema", schema: FIX_SCHEMA } },
                system: FIX_SYSTEM,
                messages: [{
                  role: "user",
                  content: [
                    base.messages[0].content[0],
                    { type: "text", text: JSON.stringify({ unsure_entries: doubt, unread_parts: unread }) },
                  ],
                }],
              // deno-lint-ignore no-explicit-any
              } as any);
              if (fix.stop_reason === "end_turn") {
                // deno-lint-ignore no-explicit-any
                const t = fix.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
                send("f:" + JSON.stringify(t));
              }
            } catch { /* the first answer stands */ }
          }
        }
        send("z:");
      } catch (e) {
        send("e:" + (e instanceof Anthropic.RateLimitError ? "busy" : e instanceof Anthropic.APIError ? "api" : "failed"));
      }
      ctl.close();
    },
  });
  return new Response(out, { headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
});
