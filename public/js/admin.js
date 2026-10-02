import { api } from "./api.js";
import { requireAdmin, logout } from "./auth.js";
import { salonConfig as defaults } from "./config.js";
import { $, inr, esc, toast, todayIST, to12h, mins, hhmm } from "./utils.js";

const STATUSES = ["Pending", "Confirmed", "Completed", "Cancelled", "No Show"];
const fail = (e, msg = "Something went wrong. Please try again.") => { console.error(e); toast(e.status === 409 ? e.message : msg, "err"); };
let bookings = [], services = [];

function tab(id) {
  document.querySelectorAll(".pane").forEach(p => p.hidden = p.id !== id);
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.t === id));
  ({ dash: loadDash, rep: loadReport, sched: loadSched, book: () => loadBookings(), svc: loadServices, set: loadSettings })[id]();
}

function countUp(el) {
  const to = +el.textContent; if (!to || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const t0 = performance.now(); (function f(t) { const p = Math.min((t - t0) / 800, 1); el.textContent = Math.round(to * (1 - (1 - p) ** 3)); if (p < 1) requestAnimationFrame(f); })(t0);
}
// ---- Dashboard + analytics (revenue = completed bookings at listed price, an estimate) ----
async function loadDash() {
  renderAvail();
  try {
    const s = await api("/admin/stats");
    $("#stats").innerHTML = [["Total bookings", s.total], ["Today", s.today], ["Revenue today (completed)", inr(s.todayRevenue)], ["Expected today", inr(s.todayExpected)], ...STATUSES.map(x => [x, s.byStatus[x] || 0])].map(([l, v]) => `<div class="stat s-${l.replace(" ", "")}"><b>${v}</b>${l}</div>`).join("");
    document.querySelectorAll("#stats b").forEach(countUp);
    $("#ana").innerHTML = `<h3>Last 30 days</h3><div class="stats"><div class="stat"><b>${s.last30}</b>Bookings</div><div class="stat"><b>${s.last7}</b>Last 7 days</div>
      <div class="stat"><b>${inr(s.revenue)}</b>Estimated revenue (completed bookings at listed prices)</div></div>
      <h3>Popular services</h3>${s.top.length ? "<ol>" + s.top.map(([n, c]) => `<li>${esc(n)}: ${c}</li>`).join("") + "</ol>" : "<p>No data yet.</p>"}`;
  } catch (e) { fail(e, "Could not load dashboard."); }
}

// ---- Day schedule ----
async function loadSched() {
  const d = $("#sd2").value || ($("#sd2").value = todayIST()), box = $("#day");
  try {
    const c = await api("/settings"), h = c.hours[new Date(d + "T00:00:00Z").getUTCDay()];
    if (!h || h.closed || c.booking.holidays?.includes(d)) { box.innerHTML = "<p class='empty'>Closed on this day.</p>"; return; }
    const list = (await api("/admin/bookings?date=" + d)).filter(b => b.status !== "Cancelled").sort((a, b) => a.time.localeCompare(b.time)), rows = []; let cur = mins(h.open);
    const free = (a, z) => { if (z - a >= 15) rows.push(`<tr><td>${to12h(hhmm(a))} to ${to12h(hhmm(z))}</td><td colspan="2"><span class="empty">Free (${z - a} min)</span></td></tr>`); };
    for (const b of list) {
      const s = mins(b.time), e = mins(b.endTime || hhmm(s + (b.duration || 30))); free(cur, s);
      rows.push(`<tr><td>${to12h(b.time)} to ${to12h(hhmm(e))}</td><td>${esc(b.name)} · ${esc(b.serviceName)} (${b.duration} min) · ${esc(b.mobile)}</td><td><span class="badge ${b.status}">${b.status}</span></td></tr>`); cur = Math.max(cur, e);
    }
    free(cur, mins(h.close));
    box.innerHTML = `<div class="tbl"><table><tbody>${rows.join("")}</tbody></table></div>`;
  } catch (e) { fail(e, "Could not load schedule."); }
}

// ---- Availability: Free / Busy switch ----
async function renderAvail() {
  try {
    const b = !!(await api("/settings")).busy;
    $("#avail").innerHTML = `<div class="availbox ${b ? "busy" : "free"}"><div><b>${b ? "BUSY: online booking is paused" : "FREE: customers can book online"}</b><small>${b ? "Customers see a notice and cannot book." : "Switch to Busy when you cannot take more customers."}</small></div>
      <div class="seg"><button data-busy="0" class="${b ? "" : "on"}">Free</button><button data-busy="1" class="${b ? "on" : ""}">Busy</button></div></div>`;
  } catch (e) { fail(e); }
}
async function setBusy(busy) { try { await api("/admin/settings", "PUT", { busy }); toast(busy ? "Online booking paused (Busy)." : "Online booking is open (Free)."); renderAvail(); } catch (e) { fail(e); } }

// ---- Reports: daily or any date range, with Excel download ----
const repRange = () => ({ from: $("#rf").value || ($("#rf").value = todayIST()), to: $("#rt").value || ($("#rt").value = $("#rf").value) });
async function loadReport() {
  try {
    const d = await api("/admin/report?" + new URLSearchParams(repRange())), t = d.totals;
    $("#repStats").innerHTML = [["Bookings", t.bookings], ["Customers", t.customers], ["Revenue (completed)", inr(t.revenue)], ["Expected revenue", inr(t.expected)], ["Completed", t.completed], ["Cancelled", t.cancelled], ["No show", t.noShow]].map(([l, v]) => `<div class="stat"><b>${v}</b>${l}</div>`).join("");
    $("#repDays").innerHTML = d.days.length ? d.days.map(x => `<tr><td>${x.date}</td><td>${x.bookings}</td><td>${x.completed}</td><td>${x.cancelled}</td><td>${x.noShow}</td><td>${inr(x.revenue)}</td><td>${inr(x.expected)}</td></tr>`).join("") : `<tr><td colspan="7">No bookings in this period.</td></tr>`;
    $("#repRows").innerHTML = d.rows.length ? d.rows.map(b => `<tr><td>${b.date}</td><td>${to12h(b.time)} to ${to12h(b.endTime || b.time)}</td><td>${esc(b.name)}</td><td>${esc(b.mobile)}</td><td>${esc(b.serviceName)}</td><td>${b.duration} min</td><td>${inr(b.price)}</td><td><span class="badge ${b.status}">${b.status}</span></td></tr>`).join("") : `<tr><td colspan="8">No bookings in this period.</td></tr>`;
  } catch (e) { fail(e, "Could not load report."); }
}
async function downloadExcel() {
  try {
    const r = repRange(), res = await fetch("/api/admin/export?" + new URLSearchParams(r), { headers: { Authorization: "Bearer " + localStorage.getItem("adminToken") } });
    if (!res.ok) throw new Error("export failed");
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(await res.blob()), download: `bookings_${r.from}_to_${r.to}.xlsx` }); a.click(); URL.revokeObjectURL(a.href);
  } catch (e) { fail(e, "Could not create the Excel file."); }
}

// ---- Bookings ----
async function loadBookings() {
  try {
    bookings = await api("/admin/bookings?" + new URLSearchParams({ q: $("#q").value.trim(), date: $("#fd").value, status: $("#fs").value }));
    $("#rows").innerHTML = bookings.length ? bookings.map(b => `<tr><td>${esc(b.date)}<br>${to12h(b.time)} to ${to12h(b.endTime || b.time)}</td>
      <td>${esc(b.name)}<br><a href="tel:${esc(b.mobile)}">${esc(b.mobile)}</a> · <a href="https://wa.me/91${esc(b.mobile)}" target="_blank" rel="noopener">WhatsApp</a></td><td>${esc(b.serviceName)}<br>${inr(b.price)}</td><td>${esc(b.id)}</td>
      <td><select data-st="${esc(b.id)}" aria-label="Status">${STATUSES.map(s => `<option ${s === b.status ? "selected" : ""}>${s}</option>`).join("")}</select></td>
      <td><button class="btn sm ghost" data-del="${esc(b.id)}">Delete</button></td></tr>`).join("") : `<tr><td colspan="6">No bookings found.</td></tr>`;
  } catch (e) { fail(e, "Could not load bookings."); }
}
async function setStatus(id, status) {
  try { await api("/admin/bookings/" + id, "PATCH", { status }); toast(`Marked ${status}.`); } catch (e) { fail(e); }
  loadBookings();
}
async function delBooking(id) {
  if (!confirm("Delete this booking permanently?")) return;
  try { await api("/admin/bookings/" + id, "DELETE"); toast("Booking deleted."); loadBookings(); } catch (e) { fail(e); }
}

// ---- Services ----
async function loadServices() {
  try {
    services = await api("/admin/services");
    $("#svcRows").innerHTML = services.length ? services.map(s => `<tr><td>${esc(s.name)}</td><td>${esc(s.category)}</td><td>${inr(s.price)}${s.onlinePrice ? ` / online ${inr(s.onlinePrice)}` : ""}</td><td>${s.duration}</td>
      <td><input type="checkbox" data-tog="${s.id}" ${s.active ? "checked" : ""} aria-label="Active"></td>
      <td><button class="btn sm" data-edit="${s.id}">Edit</button> <button class="btn sm ghost" data-rm="${s.id}">Delete</button></td></tr>`).join("")
      : `<tr><td colspan="6">No services yet. Add one or load the sample services.</td></tr>`;
  } catch (e) { fail(e, "Could not load services."); }
}
function editSvc(s = {}) {
  $("#sid").value = s.id || ""; $("#sn").value = s.name || ""; $("#sc").value = s.category || ""; $("#sd").value = s.description || "";
  $("#sp").value = s.price ?? ""; $("#so").value = s.onlinePrice ?? ""; $("#sm").value = s.duration ?? 30;
  $("#sx").checked = !!s.startingPrice; $("#sf").checked = !!s.featured; $("#sa").checked = s.active ?? true; $("#svcDlg").showModal();
}
async function saveSvc(e) {
  e.preventDefault();
  const data = { name: $("#sn").value.trim(), category: $("#sc").value.trim(), description: $("#sd").value.trim(), price: +$("#sp").value, duration: +$("#sm").value,
    startingPrice: $("#sx").checked, featured: $("#sf").checked, active: $("#sa").checked, onlinePrice: $("#so").value ? +$("#so").value : null };
  try { const id = $("#sid").value; await api(id ? "/admin/services/" + id : "/admin/services", id ? "PUT" : "POST", data); $("#svcDlg").close(); toast("Service saved."); loadServices(); }
  catch (e) { fail(e); }
}
async function seed() {
  if (!confirm("Add the sample services from your price cards? Existing services stay.")) return;
  try { await api("/admin/seed-services", "POST", {}); toast("Sample services added."); loadServices(); } catch (e) { fail(e); }
}

// ---- Settings ----
const FIELDS = [["name", "Salon name"], ["tagline", "Tagline"], ["phone", "Phone"], ["whatsappNumber", "WhatsApp (91XXXXXXXXXX)"], ["email", "Email"], ["address", "Address"],
  ["googleMapsUrl", "Google Maps link"], ["instagramUrl", "Instagram URL"], ["facebookUrl", "Facebook URL"]];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
async function loadSettings() {
  let c = defaults;
  try { c = await api("/settings"); } catch (e) { fail(e); }
  $("#setFields").innerHTML = FIELDS.map(([k, l]) => `<label>${l}<input data-k="${k}" value="${esc(c[k])}"></label>`).join("") +
    `<label>Slot length (min)<input data-b="slotMinutes" type="number" min="10" step="5" value="${c.booking.slotMinutes}"></label>
     <label>Break start<input data-b="breakStart" type="time" value="${c.booking.breakStart}"></label><label>Break end<input data-b="breakEnd" type="time" value="${c.booking.breakEnd}"></label>
     <label>Holidays (YYYY-MM-DD, comma separated)<input data-b="holidays" value="${esc((c.booking.holidays || []).join(","))}"></label>`;
  $("#hrs").innerHTML = DAYS.map((d, i) => { const h = c.hours[i]; return `<div class="hrow"><b>${d}</b><input type="time" data-o="${i}" value="${h.open || "10:00"}" aria-label="${d} opens"><input type="time" data-c="${i}" value="${h.close || "20:00"}" aria-label="${d} closes"><label><input type="checkbox" data-x="${i}" ${h.closed ? "checked" : ""}> Closed</label></div>`; }).join("");
}
async function saveSettings(e) {
  e.preventDefault();
  const data = { booking: { maxDaysAhead: 30 }, hours: {} };
  document.querySelectorAll("[data-k]").forEach(i => data[i.dataset.k] = i.value.trim());
  document.querySelectorAll("[data-b]").forEach(i => data.booking[i.dataset.b] = i.dataset.b === "slotMinutes" ? +i.value : i.dataset.b === "holidays" ? i.value.split(",").map(x => x.trim()).filter(Boolean) : i.value);
  DAYS.forEach((_, i) => data.hours[i] = $(`[data-x="${i}"]`).checked ? { closed: true } : { open: $(`[data-o="${i}"]`).value, close: $(`[data-c="${i}"]`).value });
  try { await api("/admin/settings", "PUT", data); toast("Settings saved."); } catch (e) { fail(e); }
}

// ---- Wiring ----
await requireAdmin();
document.addEventListener("click", async e => {
  const t = e.target, g = a => t.closest(`[${a}]`)?.getAttribute(a);
  if (g("data-t")) tab(g("data-t"));
  if (t.closest("#out")) logout();
  if (t.id === "find") loadBookings();
  if (t.id === "repGo") loadReport();
  if (t.id === "repX") downloadExcel();
  const bz = t.closest("[data-busy]"); if (bz) setBusy(bz.dataset.busy === "1");
  if (t.id === "testAlert") try { const r = await api("/admin/test-alert", "POST", {}); toast(r.enabled ? "Test email sent. Check the owner's inbox (and spam)." : "Email alerts are not set up yet. See the README, section Owner email alerts.", r.enabled ? "ok" : "err"); } catch (x) { fail(x); }
  if (g("data-del")) delBooking(g("data-del"));
  if (t.id === "addSvc") editSvc();
  if (t.id === "seed") seed();
  if (g("data-edit")) editSvc(services.find(s => s.id === g("data-edit")));
  if (g("data-close2")) $("#svcDlg").close();
  if (g("data-rm") && confirm("Delete this service?")) try { await api("/admin/services/" + g("data-rm"), "DELETE"); loadServices(); } catch (x) { fail(x); }
});
document.addEventListener("change", async e => {
  if (e.target.dataset.st) setStatus(e.target.dataset.st, e.target.value);
  if (e.target.dataset.tog) try { await api("/admin/services/" + e.target.dataset.tog, "PATCH", { active: e.target.checked }); } catch (x) { fail(x); }
});
$("#svcForm").addEventListener("submit", saveSvc);
$("#setForm").addEventListener("submit", saveSettings);
$("#sd2").addEventListener("change", loadSched);
tab("dash");
