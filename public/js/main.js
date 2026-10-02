import { api } from "./api.js";
import { salonConfig as defaults, images } from "./config.js";
import { $, inr, esc, toast, validMobile, cleanMobile, todayIST, to12h, mins, hhmm } from "./utils.js";

let cfg = defaults, services = [], selected = null;
const wa = (text) => `https://wa.me/${cfg.whatsappNumber}?text=${encodeURIComponent(text)}`;

// 1 read per visit, cached 1 hour (keeps Firestore reads low).
async function loadSettings() {
  try { cfg = { ...defaults, ...(await api("/settings")) }; } catch (e) { console.error(e); }
}
function applyConfig() {
  $("#busyBar").hidden = !cfg.busy;
  document.querySelectorAll("[data-cfg]").forEach(el => el.textContent = cfg[el.dataset.cfg]);
  document.querySelectorAll("[data-tel]").forEach(el => el.href = "tel:" + cfg.phone.replace(/\s/g, ""));
  document.querySelectorAll("[data-wa]").forEach(el => el.href = wa(el.dataset.wa || "Hi, I'd like to book an appointment."));
  document.querySelectorAll("[data-map]").forEach(el => el.href = cfg.googleMapsUrl);
  document.querySelectorAll("[data-img]").forEach(el => el.src = images[el.dataset.img]);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  $("#hours").innerHTML = days.map((d, i) => { const h = cfg.hours[i]; return `<li><span>${d}</span><span>${h.closed ? "Closed" : to12h(h.open) + " – " + to12h(h.close)}</span></li>`; }).join("");
}

async function loadServices() {
  const box = $("#serviceList");
  try {
    services = await api("/services");
  } catch (e) { console.error(e); box.innerHTML = `<p class="empty">Services could not be loaded. Please refresh or call us.</p>`; return; }
  if (!services.length) { box.innerHTML = `<p class="empty">No services added yet. Add them from the admin panel.</p>`; return; }
  const cats = [...new Set(services.map(s => s.category))];
  box.innerHTML = cats.map(c => `<div class="cat"><h3>${esc(c)}</h3>${services.filter(s => s.category === c).map(s => `
    <div class="svc"><div><strong>${esc(s.name)}</strong><small>${esc(s.description || "")} · ${s.duration} min</small></div>
    <span class="price">${inr(s.onlinePrice ?? s.price)}${s.startingPrice ? " onwards" : ""}</span>
    <button class="btn sm" data-book="${s.id}">Book</button></div>`).join("")}</div>`).join("");
  $("#service").innerHTML = `<option value="">Select a service</option>` + services.map(s => `<option value="${s.id}">${esc(s.name)} · ${inr(s.onlinePrice ?? s.price)}</option>`).join("");
}

// ---- Availability: the server returns start times that stay free for the chosen service's full duration ----
async function showSlots() {
  const date = $("#date").value, sid = $("#service").value, box = $("#slots"); $("#time").value = "";
  if (!sid) { box.innerHTML = `<p class="empty">Choose a service first, then a date.</p>`; return; }
  if (!date) { box.innerHTML = ""; return; }
  box.innerHTML = "Loading times…";
  try {
    const free = await api(`/slots?date=${date}&serviceId=${encodeURIComponent(sid)}`), s = services.find(x => x.id === sid);
    box.innerHTML = free.length ? `<p class="note" style="margin:0">This service takes about ${s.duration} minutes.</p>` + free.map(t => `<button type="button" class="slot" data-t="${t}">${to12h(t)}</button>`).join("")
      : `<p class="empty">No free time for this service on this day. Please pick another date.</p>`;
  } catch (e) { console.error(e); box.innerHTML = `<p class="empty">Could not load times. Please try again.</p>`; }
}

// ---- Booking: one transaction creates the slot lock AND the booking; if the slot exists, it aborts ----
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), b => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");
async function submitBooking(e) {
  e.preventDefault();
  const svc = services.find(s => s.id === $("#service").value), date = $("#date").value, time = $("#time").value;
  const name = $("#name").value.trim(), mobile = $("#mobile").value;
  if (!svc) return toast("Please select a service.", "err");
  if (!date || date < todayIST()) return toast("Please choose a valid future date.", "err");
  if (!time) return toast("Please pick a time.", "err");
  if (name.length < 2) return toast("Please enter your full name.", "err");
  if (!validMobile(mobile)) return toast("Please enter a valid 10-digit mobile number.", "err");
  const btn = $("#confirm"); btn.disabled = true; btn.textContent = "Booking…";
  try {
    const { id, endTime } = await api("/bookings", "POST", { name, mobile, email: $("#email").value.trim(), message: $("#message").value.trim(), serviceId: svc.id, date, time });
    $("#bookForm").hidden = true;
    $("#done").hidden = false;
    $("#doneBody").innerHTML = `<dl><dt>Booking ID</dt><dd><b>${id}</b></dd><dt>Name</dt><dd>${esc(name)}</dd><dt>Service</dt><dd>${esc(svc.name)}</dd><dt>Date</dt><dd>${date}</dd><dt>Time</dt><dd>${to12h(time)} to ${to12h(endTime)}</dd><dt>Status</dt><dd>Pending</dd></dl>`;
    $("#doneWa").href = wa(`Hi, I booked ${svc.name} on ${date} at ${to12h(time)}. Booking ID: ${id}`);
  } catch (err) {
    console.error(err);
    if (err.code === "SLOT_TAKEN") { toast("This time is no longer free. Please select another time.", "err"); showSlots(); }
    else if (err.code === "BUSY") toast(err.message, "err");
    else toast(err.status === 400 ? err.message : "Something went wrong. Please try again.", "err");
  } finally { btn.disabled = false; btn.textContent = "Confirm booking"; }
}

function openBooking(serviceId) {
  if (cfg.busy) return toast("We are busy right now and not taking online bookings. Please call or WhatsApp us.", "err");
  $("#bookForm").reset(); $("#bookForm").hidden = false; $("#done").hidden = true; $("#slots").innerHTML = "";
  const d = $("#date"); d.min = todayIST(); d.max = new Date(Date.now() + (5.5 + 24 * cfg.booking.maxDaysAhead) * 3600e3).toISOString().slice(0, 10);
  if (serviceId) $("#service").value = serviceId;
  $("#bookDialog").showModal();
}

// Lightbox: prev/next cycle through visible images in the same group.
let zList = [], zIdx = 0;
function zShow(i) { zIdx = (i + zList.length) % zList.length; const im = zList[zIdx]; $("#zoomImg").src = im.src; $("#zoomImg").alt = im.alt; }
document.addEventListener("keydown", e => { if ($("#zoomDialog").open && zList.length > 1) { if (e.key === "ArrowRight") zShow(zIdx + 1); if (e.key === "ArrowLeft") zShow(zIdx - 1); } });
let tx = 0;
$("#zoomDialog").addEventListener("touchstart", e => tx = e.touches[0].clientX, { passive: true });
$("#zoomDialog").addEventListener("touchend", e => { const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 50 && zList.length > 1) zShow(zIdx + (dx < 0 ? 1 : -1)); });

document.addEventListener("click", e => {
  const nav = e.target.closest("[data-nav]"); if (nav) { zShow(zIdx + +nav.dataset.nav); return; }
  const b = e.target.closest("[data-book]"); if (b) { e.preventDefault(); openBooking(b.dataset.book); }
  const s = e.target.closest(".slot"); if (s && !s.disabled) { document.querySelectorAll(".slot").forEach(x => x.classList.remove("on")); s.classList.add("on"); $("#time").value = s.dataset.t; }
  if (e.target.closest("[data-close]")) e.target.closest("dialog").close();
  if (e.target.closest("#menuBtn")) document.body.classList.toggle("menu-open");
  const z = e.target.closest("[data-zoom]");
  if (z) { zList = [...z.parentElement.querySelectorAll("[data-zoom]:not([hidden])")]; zShow(zList.indexOf(z)); $("#zoomDialog").querySelectorAll(".prev,.next").forEach(b => b.hidden = zList.length < 2); $("#zoomDialog").showModal(); }
});

(async function init() {
  $("#date").addEventListener("change", showSlots); $("#service").addEventListener("change", showSlots);
  $("#bookForm").addEventListener("submit", submitBooking);
  await loadSettings(); applyConfig(); document.title = `${cfg.name} | Hair, Beard & Skin Care in Chalisgaon`;
  loadServices().then(() => { const id = new URLSearchParams(location.search).get("book"); if (id) openBooking(id); });
})();
