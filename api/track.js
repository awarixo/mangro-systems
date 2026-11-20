// Vercel serverless function: POST /api/track
// Writes one site event into the "Mangrosystems Site Events" Notion database
// (child of the "Mangro systems" project page). Same pattern as Upscore's
// functions/api/track.js, ported from Cloudflare Pages to Vercel.
//
// Env (Vercel project settings, production):
//   NOTION_TOKEN           internal integration secret with access to the database
//   NOTION_EVENTS_DB_ID    optional override of the default below

const DEFAULT_EVENTS_DB_ID = "41ec1acc-9ddb-817e-beff-ffec78e168ff";
const VALID_EVENTS = new Set(["pageview", "cta_click"]);
const VALID_PAGES = new Set(["/", "/deals/"]);
const BOT_RE = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python|vercel/i;

function text(value) {
  return [{ text: { content: String(value || "").slice(0, 1900) } }];
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const ua = req.headers["user-agent"] || "";
  if (BOT_RE.test(ua)) {
    res.status(204).end();
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body || !VALID_EVENTS.has(body.event_type)) {
    res.status(400).json({ error: "invalid_event_type" });
    return;
  }

  const page = VALID_PAGES.has(body.page) ? body.page : "/";
  if (!process.env.NOTION_TOKEN) {
    res.status(500).json({ error: "not_configured" });
    return;
  }

  const country = String(req.headers["x-vercel-ip-country"] || "unknown").slice(0, 10);
  const device = /Mobi|Android|iPhone|iPad/i.test(ua) ? "mobile" : "desktop";
  const label = `${body.event_type} ${page} @ ${new Date().toISOString()}`;

  const properties = {
    Event: { title: text(label) },
    "Event Type": { select: { name: body.event_type } },
    Page: { select: { name: page } },
    "Session Id": { rich_text: text(body.session_id) },
    Referrer: { rich_text: text(body.referrer) },
    "UTM Source": { rich_text: text(body.utm_source) },
    "UTM Medium": { rich_text: text(body.utm_medium) },
    "UTM Campaign": { rich_text: text(body.utm_campaign) },
    Country: { select: { name: country.replace(/,/g, "") || "unknown" } },
    Device: { select: { name: device } }
  };
  if (body.cta) properties.CTA = { rich_text: text(body.cta) };

  const r = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      parent: { database_id: process.env.NOTION_EVENTS_DB_ID || DEFAULT_EVENTS_DB_ID },
      properties
    })
  });

  if (!r.ok) {
    console.error("Notion event write failed", r.status, await r.text());
    res.status(502).json({ error: "upstream" });
    return;
  }
  res.status(200).json({ ok: true });
}
