// POST /api/market-trial: a signed-up visitor asks for the links to listings they selected = a free-week request.
// Marks their Notion row "Trial requested", stores the keys, and emails Yusuf. Keys resolve to listings on the server:
//   python tools/publish_market.py --lookup KEY
// POST /api/market-trial with {confirm: true} only marks a sign-up as Confirmed (they opened their access link).
import { json, readBody, verifyToken, findLead, notion, rt, sendMail, snapshot } from "./_market.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  const email = verifyToken(req.headers["x-market-token"]);
  if (!email) return json(res, 401, { error: "signin" });
  const b = readBody(req);

  try {
    const lead = await findLead(email);
    if (b.confirm) {
      if (lead && lead.properties.Status?.select?.name === "Signed up") {
        await notion(`pages/${lead.id}`, "PATCH", { properties: { Status: { select: { name: "Confirmed" } } } });
      }
      return json(res, 200, { ok: true });
    }

    const keys = [...new Set((Array.isArray(b.keys) ? b.keys : []).map(String).filter((k) => /^[0-9a-f]{12}$/.test(k)))].slice(0, 25);
    if (!keys.length) return json(res, 400, { error: "Select at least one listing." });
    const note = String(b.note || "").slice(0, 1000);

    const snap = await snapshot();
    const byKey = new Map(snap.rows.map((r) => [r[0], r]));
    const lines = keys.map((k, i) => {
      const r = byKey.get(k);
      return r ? `${i + 1}. [${k}] ${r[4]} (${r[2] ? r[2] + ", " : ""}${r[1]}) ${r[7]}${r[9] ? " · " + r[9] : ""}` : `${i + 1}. [${k}]`;
    });

    const name = lead ? lead.properties.Name?.title?.map((t) => t.plain_text).join("") : "";
    if (lead) {
      const before = (lead.properties["Listings requested"]?.rich_text || []).map((t) => t.plain_text).join("");
      await notion(`pages/${lead.id}`, "PATCH", { properties: {
        Status: { select: { name: "Trial requested" } },
        "Listings requested": { rich_text: rt((before ? before + "\n" : "") + new Date().toISOString().slice(0, 10) + ": " + keys.join(", ")) }
      } });
    }

    const p = lead ? lead.properties : {};
    const txt = (k) => (p[k]?.rich_text || []).map((t) => t.plain_text).join("");
    await sendMail(process.env.NOTIFY_EMAIL || process.env.SMTP_USER, `Market map: free-week request from ${name || email}`,
`${name || "(no name)"} <${email}> asked for the links to ${keys.length} listing(s) and a free week.

Role: ${p.Role?.select?.name || "?"}
Organisation: ${txt("Organisation")}
LinkedIn: ${p.LinkedIn?.url || ""}
Countries: ${txt("Target countries")}
Sectors: ${txt("Target sectors")}
Deal size: ${txt("Deal size")}
Note: ${note}

Listings:
${lines.join("\n")}

Resolve a key on the server: python tools/publish_market.py --lookup KEY`);
    return json(res, 200, { ok: true });
  } catch (e) {
    console.error("market-trial failed", e.message);
    return json(res, 502, { error: "Something went wrong on our side. Please try again in a minute." });
  }
}
