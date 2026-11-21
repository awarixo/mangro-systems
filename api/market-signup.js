// POST /api/market-signup: record a sign-up in Notion and email the person their access link.
// The link is the only way in, so an email we can't deliver to never gets access.
import { json, readBody, notion, leadProps, LEADS_DB_ID, signToken, sendMail, SIGNATURE } from "./_market.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = new Set(["Searcher / ETA buyer", "Independent sponsor", "PE / family office / holdco", "Investor in searchers", "Student", "Advisor / broker", "Other"]);
const clean = (v, n = 200) => String(v || "").trim().slice(0, n);

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  const b = readBody(req);
  if (clean(b.website)) return json(res, 200, { ok: true });        // honeypot: bots fill every field
  const f = {
    name: clean(b.name, 120), email: clean(b.email, 200).toLowerCase(), role: clean(b.role, 60),
    linkedin: clean(b.linkedin, 300), organisation: clean(b.organisation), countries: clean(b.countries),
    sectors: clean(b.sectors), size: clean(b.size, 120), source: clean(b.source, 300)
  };
  if (!f.name || !EMAIL_RE.test(f.email)) return json(res, 400, { error: "Please give your name and a valid email." });
  if (!ROLES.has(f.role)) return json(res, 400, { error: "Please choose what describes you best." });
  if (f.linkedin && !/^https?:\/\/([a-z]+\.)?linkedin\.com\//i.test(f.linkedin)) {
    if (/linkedin\.com\//i.test(f.linkedin)) f.linkedin = "https://" + f.linkedin.replace(/^\/*/, "");
    else return json(res, 400, { error: "That LinkedIn link doesn't look right." });
  }

  try {
    await notion("pages", "POST", { parent: { database_id: LEADS_DB_ID }, properties: leadProps(f) });
    const token = signToken(f.email);
    // Until SMTP is configured on Vercel, hand the access straight back instead of emailing it (no address check, but nobody is locked out).
    if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) return json(res, 200, { ok: true, token });
    const link = `https://mangrosystems.com/market/?t=${encodeURIComponent(token)}`;
    const first = f.name.split(/\s+/)[0];
    await sendMail(f.email, "Your access to the European market map",
`Hello ${first},

Here is your access to the market map: every live business-for-sale listing we track across Europe, with the figures each one states, filterable by country, sector and size.

${link}

The link works for 90 days on any device. The map is refreshed every morning.

If you would like the links to any of the listings, select them in the map and start a free week: I will send you those, plus the new listings that match your criteria, twice a week.

${SIGNATURE}`);
    return json(res, 200, { ok: true });
  } catch (e) {
    console.error("market-signup failed", e.message);
    return json(res, 502, { error: "Something went wrong on our side. Please try again in a minute." });
  }
}
