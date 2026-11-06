// Sends reservation reminders as phone notifications.
// Called every 5 minutes by a database timer (pg_cron) with a secret header; also lets a signed-in member
// send themselves a test notification. Reminders go out before things that happen at a fixed time:
// flights (3 hours and 1 hour before), and timed tickets such as entry tickets or hotel check-in (1 hour and 15 minutes before).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Sub = { endpoint: string; trip_id: string; user_id: string; p256dh: string; auth: string };
// deno-lint-ignore no-explicit-any
type Item = { kind: string; id: string; data: any };

// "2026-11-19" + day 2 + "10:20" in Japan/Korea time (UTC+9) → a Date
function at(start: string, day: number, hhmm: string): Date | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || "");
  if (!start || !day || !m) return null;
  const d = new Date(start + "T00:00:00+09:00");
  d.setUTCDate(d.getUTCDate() + day - 1);
  return new Date(d.getTime() + (+m[1] * 60 + +m[2]) * 60000);
}
const hm = (d: Date) => new Date(d.getTime() + 9 * 3600000).toISOString().slice(11, 16);

// the timed things of one trip, each with when to remind
function events(items: Item[]) {
  const info = items.find((i) => i.kind === "trip" && i.id === "info")?.data || {};
  const places = Object.fromEntries(items.filter((i) => i.kind === "place").map((i) => [i.id, i.data]));
  const out: { key: string; when: Date; before: number[]; title: string; body: (min: number) => string }[] = [];
  const seen = new Set<string>();
  for (const t of items.filter((i) => i.kind === "ticket").map((i) => ({ id: i.id, ...i.data }))) {
    if (t.type === "항공권" && t.fl && t.fl.dep) {
      const when = at(info.start, t.day, t.fl.dep);
      const key = `fl:${t.dir || t.slot}:${t.day}:${t.fl.dep}`; // one reminder per flight, not per passenger
      if (!when || seen.has(key)) continue;
      seen.add(key);
      const from = (t.fl.fromCity || "").split(" ")[0], to = (t.fl.toCity || "").split(" ")[0];
      out.push({
        key, when, before: [180, 60], title: `✈️ ${t.fl.no || "비행기"} ${hm(when)} 출발`,
        body: (min) => min >= 180 ? `${from}에서 ${hm(when)} 출발이에요. 공항으로 갈 준비를 해요.${t.fl.term ? ` (${t.fl.term}터미널)` : ""}`
          : `한 시간 뒤 출발 · ${from} → ${to}. 탑승구와 탑승권을 확인해요.`,
      });
      continue;
    }
    const time = t.type === "숙소" && t.stay ? t.stay.inTime : t.time;
    const day = t.type === "숙소" && t.stay ? t.stay.inDay : t.day;
    const when = at(info.start, day, time);
    if (!when) continue;
    const key = `tk:${t.id}:${day}:${time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = (t.place && places[t.place]?.n) || t.title || "예약";
    const what = t.type === "숙소" ? "체크인" : "예약";
    out.push({
      key, when, before: [60, 15], title: `⏰ ${hm(when)} ${name} ${what}`,
      body: (min) => `${min}분 뒤예요.${t.code ? ` 예약번호 ${t.code}` : ""}${t.type !== "숙소" ? " 티켓을 열어 두세요." : ""}`,
    });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: cfg } = await db.rpc("trip_push_config");
  if (!cfg) return json({ error: "no-config" }, 500);
  webpush.setVapidDetails("https://ceaser501.github.io/taebo-travel/", cfg.trip_vapid_public, cfg.trip_vapid_private);
  const send = async (s: Sub, payload: unknown) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 1800 });
      return true;
    } catch (e) {
      // the phone unsubscribed or the app was removed: forget it
      // deno-lint-ignore no-explicit-any
      const code = (e as any)?.statusCode;
      if (code === 404 || code === 410) await db.from("trip_push_subs").delete().eq("endpoint", s.endpoint);
      return false;
    }
  };

  // a member asks for a test notification on their own phones
  let body: { test?: boolean } = {};
  try { body = await req.json(); } catch { /* the timer sends {} */ }
  if (body.test) {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await db.auth.getUser(token);
    if (!u?.user) return json({ error: "not-signed-in" }, 401);
    const { data: subs } = await db.from("trip_push_subs").select("*").eq("user_id", u.user.id);
    let ok = 0;
    for (const s of (subs || []) as Sub[]) if (await send(s, { title: "🔔 딱복트립 알림", body: "알림이 잘 와요. 예약 시간 전에 이렇게 알려 드릴게요.", url: "./#home" })) ok++;
    return json({ sent: ok });
  }

  if (req.headers.get("x-cron-secret") !== cfg.trip_cron_secret) return json({ error: "forbidden" }, 403);
  const { data: subs } = await db.from("trip_push_subs").select("*");
  const byTrip = new Map<string, Sub[]>();
  for (const s of (subs || []) as Sub[]) byTrip.set(s.trip_id, [...(byTrip.get(s.trip_id) || []), s]);
  const now = Date.now();
  let sent = 0;
  for (const [trip, list] of byTrip) {
    const { data: items } = await db.from("trip_items").select("kind,id,data").eq("trip_id", trip).eq("deleted", false).in("kind", ["trip", "ticket", "place"]);
    for (const ev of events((items || []) as Item[])) {
      for (const min of ev.before) {
        const due = ev.when.getTime() - min * 60000;
        // due within the last 20 minutes (the timer runs every 5) and not sent yet
        if (now < due || now > due + 20 * 60000) continue;
        const key = `${trip}:${ev.key}:${min}`;
        const { error } = await db.from("trip_push_sent").insert({ key });
        if (error) continue; // already sent
        for (const s of list) if (await send(s, { title: ev.title, body: ev.body(min), url: "./#tickets" })) sent++;
      }
    }
  }
  return json({ sent });
});
