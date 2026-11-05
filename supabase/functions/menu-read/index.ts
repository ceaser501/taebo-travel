// Reads a photo of a Japanese menu or sign with Claude and returns it in Korean,
// with each dish paired with its price. The Anthropic key stays on the server (secret ANTHROPIC_API_KEY).
import Anthropic from "npm:@anthropic-ai/sdk";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "title_ko", "summary_ko", "items"],
  properties: {
    kind: { type: "string", enum: ["menu", "sign", "other"] },
    title_ko: { type: "string" },
    summary_ko: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["section_ko", "ja", "reading", "ko", "desc_ko", "price_yen", "caution_ko"],
        properties: {
          section_ko: { type: "string" },
          ja: { type: "string" },
          reading: { type: "string" },
          ko: { type: "string" },
          desc_ko: { type: "string" },
          price_yen: { type: ["integer", "null"] },
          caution_ko: { type: "string" },
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
Do not invent entries you cannot read; skip unreadable ones.`;

// The answer is streamed back as it is written, so the phone can show each dish as soon as it is read.
// Lines on the wire: "d:<json string>" a piece of the answer, "e:<code>" an error, "z:" the end.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "no-key" }, 503);
  let body: { image?: string; media_type?: string; stream?: boolean };
  try { body = await req.json(); } catch { return json({ error: "bad-body" }, 400); }
  const { image, media_type, stream: wantStream } = body;
  if (!image || typeof image !== "string") return json({ error: "no-image" }, 400);

  const client = new Anthropic({ apiKey: key });
  const base = {
    model: "claude-opus-5-5",
    max_tokens: 32000,
    fallbacks: "default",
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
  // Fast mode: the same model writing faster. If it is refused or busy, the normal speed is used instead.
  // deno-lint-ignore no-explicit-any
  const open = async (fast: boolean): Promise<{ stream: any; it: AsyncIterator<any>; first: IteratorResult<any> }> => {
    // deno-lint-ignore no-explicit-any
    const params: any = fast
      ? { ...base, speed: "fast", betas: ["server-side-fallback-2026-07-01", "fast-mode-2026-02-01"] }
      : { ...base, betas: ["server-side-fallback-2026-07-01"] };
    // no automatic retries on the fast try: on a refusal or a busy signal go straight to normal speed
    const stream = client.beta.messages.stream(params, fast ? { maxRetries: 0 } : undefined);
    const it = stream[Symbol.asyncIterator]();
    return { stream, it, first: await it.next() };
  };
  let opened;
  try {
    try { opened = await open(true); } catch (e) {
      if (e instanceof Anthropic.BadRequestError || e instanceof Anthropic.RateLimitError) opened = await open(false);
      else throw e;
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
        send("z:");
      } catch (e) {
        send("e:" + (e instanceof Anthropic.RateLimitError ? "busy" : e instanceof Anthropic.APIError ? "api" : "failed"));
      }
      ctl.close();
    },
  });
  return new Response(out, { headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
});
