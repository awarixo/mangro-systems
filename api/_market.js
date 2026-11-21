// Shared helpers for the market map (/market). Files starting with "_" are not routes on Vercel.
//
// Env (Vercel, production):
//   MARKET_STATS_URL, MARKET_LISTINGS_URL  read-only signed links to the snapshot in Supabase Storage (bucket "market"),
//                                          written daily by tools/publish_market.py in the deal-listings-scraper repo.
//                                          The links expire ~2027-12; re-sign them before then (see the WORK_LOG).
//   MARKET_TOKEN_SECRET                    signs the access links we email to sign-ups
//   NOTION_TOKEN                           same integration as /api/track
//   SMTP_HOST, SMTP_USER, SMTP_PASSWORD    yusuf@mangrosystems.com (Gmail app password), port 465
//   NOTIFY_EMAIL                           where link requests are announced (Yusuf)

import crypto from "node:crypto";
import zlib from "node:zlib";
import nodemailer from "nodemailer";

export const LEADS_DB_ID = process.env.MARKET_LEADS_DB_ID || "41fc1acc-9ddb-8126-b276-cbc587e8bdc7";
const TOKEN_DAYS = 90;

// ---------- access tokens ----------
const b64u = (buf) => Buffer.from(buf).toString("base64url");

export function signToken(email) {
  const payload = b64u(JSON.stringify({ e: email.toLowerCase(), x: Date.now() + TOKEN_DAYS * 86400000 }));
  const sig = crypto.createHmac("sha256", process.env.MARKET_TOKEN_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyToken(token) {
  if (!token || !process.env.MARKET_TOKEN_SECRET) return null;
  const [payload, sig] = String(token).split(".");
  if (!payload || !sig) return null;
  const want = crypto.createHmac("sha256", process.env.MARKET_TOKEN_SECRET).update(payload).digest("base64url");
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try {
    const { e, x } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return x > Date.now() ? e : null;
  } catch { return null; }
}

// ---------- snapshot ----------
let cache = { at: 0, data: null };
const MAX_AGE = 30 * 60 * 1000;

export async function snapshot() {
  if (cache.data && Date.now() - cache.at < MAX_AGE) return cache.data;
  const r = await fetch(process.env.MARKET_LISTINGS_URL);
  if (!r.ok) {
    if (cache.data) return cache.data;          // keep serving the last good copy
    throw new Error(`snapshot fetch failed: ${r.status}`);
  }
  const data = JSON.parse(zlib.gunzipSync(Buffer.from(await r.arrayBuffer())).toString());
  cache = { at: Date.now(), data };
  return data;
}

// ---------- notion ----------
const rt = (v) => [{ text: { content: String(v || "").slice(0, 1900) } }];

export async function notion(path, method, body) {
  const r = await fetch(`https://api.notion.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.NOTION_TOKEN}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) throw new Error(`notion ${path} ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

export async function findLead(email) {
  const d = await notion(`databases/${LEADS_DB_ID}/query`, "POST", {
    filter: { property: "Email", email: { equals: email } }, page_size: 1,
    sorts: [{ timestamp: "created_time", direction: "descending" }]
  });
  return d.results[0] || null;
}

export function leadProps(f) {
  const props = {
    Name: { title: rt(f.name) },
    Email: { email: f.email },
    Role: { select: { name: f.role } },
    Organisation: { rich_text: rt(f.organisation) },
    "Target countries": { rich_text: rt(f.countries) },
    "Target sectors": { rich_text: rt(f.sectors) },
    "Deal size": { rich_text: rt(f.size) },
    Source: { rich_text: rt(f.source) },
    Status: { select: { name: "Signed up" } }
  };
  if (f.linkedin) props.LinkedIn = { url: f.linkedin };
  return props;
}
export { rt };

// ---------- mail ----------
export async function sendMail(to, subject, text) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) { console.warn("SMTP not configured; mail to", to, "not sent:", subject); return; }
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com", port: 465, secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
  });
  await t.sendMail({ from: `"Yusuf Awari" <${process.env.SMTP_USER}>`, to, subject, text });
}

export const SIGNATURE = "Yusuf\n--\nMangro Systems\nGrowth First Mindset\nwww.mangrosystems.com";

export function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export function readBody(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
  return b || {};
}
