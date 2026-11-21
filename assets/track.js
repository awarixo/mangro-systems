// Site tracking: one pageview per page load, plus a cta_click for every
// call-to-action link (cal.com, mailto, /deals). Posts to /api/track, which
// writes a row to the "Mangrosystems Site Events" Notion database.
// No cookies; a random session id lives in sessionStorage (cleared when the tab closes).
(function () {
  if (!/mangrosystems\.com$/.test(location.hostname)) return; // skip localhost and previews

  var path = location.pathname;
  var page = path.indexOf("/deals") === 0 ? "/deals/" : path.indexOf("/market") === 0 ? "/market/" : "/";
  var sid;
  try {
    sid = sessionStorage.getItem("mg_sid");
    if (!sid) {
      sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem("mg_sid", sid);
    }
  } catch (e) { sid = "no-storage"; }

  var q = new URLSearchParams(location.search);
  var base = {
    page: page,
    session_id: sid,
    referrer: document.referrer || "",
    utm_source: q.get("utm_source") || "",
    utm_medium: q.get("utm_medium") || "",
    utm_campaign: q.get("utm_campaign") || ""
  };

  function send(evt, extra) {
    var data = Object.assign({ event_type: evt }, base, extra || {});
    var payload = JSON.stringify(data);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon("/api/track", new Blob([payload], { type: "application/json" }))) return;
    } catch (e) {}
    fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(function () {});
  }

  window.mgTrack = send;
  send("pageview");

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a");
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (/cal\.com|^mailto:|wa\.me|^\/deals|^\/market/.test(href)) {
      send("cta_click", { cta: (a.textContent || "").trim().slice(0, 60) + " -> " + href.split("?")[0] });
    }
  });
})();
