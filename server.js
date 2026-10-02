import "dotenv/config";
import express from "express";
import { MongoClient } from "mongodb";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { salonConfig as defaults } from "./public/js/config.js";
import { sampleServices } from "./public/js/seed-data.js";
import { startNotifier, enabled as alertsOn } from "./notify.js";
import { summarize, buildWorkbook } from "./report.js";

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
if (!process.env.JWT_SECRET) console.warn("JWT_SECRET missing in .env: admins must sign in again after every restart.");

const client = new MongoClient(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017", { serverSelectionTimeoutMS: 8000 });
try { await client.connect(); } catch (e) { console.error("Cannot reach MongoDB. Is it running? Check MONGODB_URI in .env.\n", e.message); process.exit(1); }
const db = client.db(process.env.DB_NAME || "rohit_salon"), C = n => db.collection(n);
// DOUBLE-BOOKING GUARD: every booking claims one key per 5 minutes of its service (e.g. 2026-10-02_17:00 ... 17:40).
// A unique index on those keys makes overlapping appointments impossible. Cancelling removes the keys, freeing the time.
await C("bookings").createIndex({ units: 1 }, { unique: true, partialFilterExpression: { units: { $exists: true } } });
await C("bookings").createIndex({ date: 1 }); await C("bookings").createIndex({ mobile: 1 });

const STATUS = ["Pending", "Confirmed", "Completed", "Cancelled", "No Show"];
const COLS = ["services", "offers", "gallery", "reviews", "inquiries"];
const rid = () => crypto.randomBytes(12).toString("hex");
const bookingId = () => Array.from(crypto.randomBytes(10), b => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");
const out = d => { if (!d) return d; const { _id, hash, ...r } = d; return { id: _id, ...r }; };
const str = (v, max) => typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;
const cleanMobile = v => String(v || "").replace(/[\s-]|^\+?91/g, "");
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v);
const istNow = () => new Date(Date.now() + 5.5 * 3600e3);
const todayIST = () => istNow().toISOString().slice(0, 10);
const mins = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const hhmm = n => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

const unitsFor = (date, time, dur) => { const u = []; for (let m = mins(time); m < mins(time) + dur; m += 5) u.push(`${date}_${hhmm(m)}`); return u; };
const endOf = (time, dur) => hhmm(mins(time) + dur);
// One-time upgrade of bookings made by the older one-slot-per-booking version.
for (const b of await C("bookings").find({ units: { $exists: false }, status: { $ne: "Cancelled" } }).toArray()) {
  try { await C("bookings").updateOne({ _id: b._id }, { $set: { units: unitsFor(b.date, b.time, b.duration || 30), endTime: endOf(b.time, b.duration || 30) }, $unset: { slotId: "" } }); }
  catch (e) { console.error("Upgrade skipped for", b._id, e.message); }
}
const notify = startNotifier({ C, todayIST });
let cache = null, cacheAt = 0;
async function getSettings() {
  if (cache && Date.now() - cacheAt < 60e3) return cache;
  const { _id, ...s } = (await C("settings").findOne({ _id: "main" })) || {};
  cache = { ...defaults, ...s, booking: { ...defaults.booking, ...s.booking }, hours: s.hours || defaults.hours }; cacheAt = Date.now();
  return cache;
}
const isOpenDay = (cfg, date) => { const h = cfg.hours[new Date(date + "T00:00:00Z").getUTCDay()]; return h && !h.closed && !cfg.booking.holidays?.includes(date) ? h : null; };
// Can a service of `dur` minutes start at `time`? It must finish before closing, avoid the break, and not be in the past.
function fits(cfg, date, time, dur) {
  const h = isOpenDay(cfg, date); if (!h || !/^\d{2}:\d{2}$/.test(time)) return false;
  const s = mins(time), e = s + dur, n = istNow(), nowMin = date === todayIST() ? n.getUTCHours() * 60 + n.getUTCMinutes() + 15 : -1;
  if (s % 5 || s < mins(h.open) || e > mins(h.close) || s <= nowMin) return false;
  const { breakStart: bs, breakEnd: be } = cfg.booking; if (bs && be && s < mins(be) && e > mins(bs)) return false;
  return true;
}
const hits = new Map();
const limit = (max, ms = 60e3) => (req, res, next) => {
  const k = req.ip + req.path, now = Date.now(), a = (hits.get(k) || []).filter(t => now - t < ms);
  if (a.length >= max) return res.status(429).json({ error: "Too many attempts. Please wait a minute." });
  a.push(now); hits.set(k, a); next();
};
const h = fn => (req, res) => fn(req, res).catch(e => { console.error(e); res.status(500).json({ error: "Something went wrong. Please try again." }); });

const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => { res.set({ "X-Content-Type-Options": "nosniff", "X-Frame-Options": "SAMEORIGIN", "Referrer-Policy": "strict-origin-when-cross-origin" }); next(); });
app.use(express.json({ limit: "50kb" }));

// ---------- Public API ----------
app.get("/api/settings", h(async (q, r) => r.json(await getSettings())));
app.get("/api/services", h(async (q, r) => r.json((await C("services").find({ active: true }).sort({ name: 1 }).limit(100).toArray()).map(out))));
app.get("/api/slots", h(async (req, res) => {
  const { date, serviceId } = req.query; if (!isDate(date)) return res.status(400).json({ error: "Invalid date." });
  const svc = await C("services").findOne({ _id: String(serviceId), active: true }); if (!svc) return res.status(400).json({ error: "Please select a service first." });
  const cfg = await getSettings(), open = isOpenDay(cfg, date); if (!open) return res.json([]);
  const booked = await C("bookings").find({ date, units: { $exists: true } }).project({ endTime: 1, units: 1 }).toArray(), taken = new Set(booked.flatMap(b => b.units));
  // Start times: the regular grid, plus the exact minute each existing appointment ends (so the next customer can start right after).
  const cand = new Set(); for (let m = mins(open.open); m < mins(open.close); m += cfg.booking.slotMinutes) cand.add(m);
  booked.forEach(b => b.endTime && cand.add(mins(b.endTime)));
  res.json([...cand].sort((a, b) => a - b).map(hhmm).filter(t => fits(cfg, date, t, svc.duration) && unitsFor(date, t, svc.duration).every(u => !taken.has(u))));
}));
app.get("/api/offers", h(async (q, r) => { const t = todayIST();
  r.json((await C("offers").find({ active: true }).limit(20).toArray()).filter(o => (!o.startDate || o.startDate <= t) && (!o.endDate || o.endDate >= t)).map(out)); }));
app.get("/api/gallery", h(async (q, r) => r.json((await C("gallery").find({ active: true }).sort({ order: 1 }).limit(30).toArray()).map(out))));
app.get("/api/reviews", h(async (q, r) => r.json((await C("reviews").find({ status: "approved" }).sort({ createdAt: -1 }).limit(12).toArray()).map(out))));
app.post("/api/reviews", limit(3), h(async (req, res) => {
  const b = req.body || {};
  if (!str(b.name, 60) || !str(b.text, 600) || ![1, 2, 3, 4, 5].includes(+b.rating)) return res.status(400).json({ error: "Please complete the review form." });
  const r = { _id: rid(), name: b.name.trim(), text: b.text.trim(), rating: +b.rating, status: "pending", createdAt: new Date() };
  await C("reviews").insertOne(r); notify.review(r); res.json({ ok: true });
}));
app.post("/api/inquiries", limit(5), h(async (req, res) => {
  const b = req.body || {}, mobile = cleanMobile(b.mobile);
  if (!str(b.name, 60) || !str(b.message, 800) || !/^[6-9]\d{9}$/.test(mobile)) return res.status(400).json({ error: "Please check your details." });
  const i = { _id: rid(), name: b.name.trim(), mobile, email: String(b.email || "").slice(0, 100), message: b.message.trim(), status: "new", createdAt: new Date() };
  await C("inquiries").insertOne(i); notify.inquiry(i); res.json({ ok: true });
}));
app.post("/api/bookings", limit(10), h(async (req, res) => {
  const b = req.body || {}, mobile = cleanMobile(b.mobile), cfg = await getSettings();
  if (cfg.busy) return res.status(423).json({ error: "We are busy right now and not taking online bookings. Please call or WhatsApp us.", code: "BUSY" });
  if (!str(b.name, 60) || b.name.trim().length < 2) return res.status(400).json({ error: "Please enter your full name." });
  if (!/^[6-9]\d{9}$/.test(mobile)) return res.status(400).json({ error: "Please enter a valid mobile number." });
  const svc = await C("services").findOne({ _id: String(b.serviceId), active: true });
  if (!svc) return res.status(400).json({ error: "Please select a valid service." });
  const t = todayIST(), max = new Date(Date.now() + (5.5 * 3600e3) + cfg.booking.maxDaysAhead * 864e5).toISOString().slice(0, 10);
  if (!isDate(b.date) || b.date < t || b.date > max) return res.status(400).json({ error: "Please choose a valid date." });
  if (!fits(cfg, b.date, b.time, svc.duration)) return res.status(400).json({ error: "That time is not available for this service. Please pick another." });
  const doc = { _id: bookingId(), name: b.name.trim(), mobile, email: String(b.email || "").slice(0, 100), message: String(b.message || "").slice(0, 500),
    serviceId: svc._id, serviceName: svc.name, price: svc.onlinePrice ?? svc.price, duration: svc.duration, date: b.date, time: b.time, endTime: endOf(b.time, svc.duration), units: unitsFor(b.date, b.time, svc.duration), status: "Pending", createdAt: new Date() };
  try { await C("bookings").insertOne(doc); }
  catch (e) { if (e.code === 11000) return res.status(409).json({ error: "This time is already booked or overlaps another appointment. Please select another time.", code: "SLOT_TAKEN" }); throw e; }
  notify.booking({ ...doc, id: doc._id });
  res.json({ id: doc._id, status: doc.status, endTime: doc.endTime });
}));
app.post("/api/bookings/lookup", limit(10), h(async (req, res) => {
  const b = await C("bookings").findOne({ _id: String(req.body?.id || "").toUpperCase() });
  // One message for "not found" and "wrong mobile" so IDs can't be probed.
  if (!b || b.mobile !== cleanMobile(req.body?.mobile)) return res.status(404).json({ error: "No booking found for these details." });
  const { name, serviceName, price, date, time, status } = b; res.json({ id: b._id, name, serviceName, price, date, time, endTime: b.endTime || endOf(time, b.duration || 30), status });
}));

app.post("/api/bookings/cancel", limit(5), h(async (req, res) => {
  const b = await C("bookings").findOne({ _id: String(req.body?.id || "").toUpperCase() });
  if (!b || b.mobile !== cleanMobile(req.body?.mobile)) return res.status(404).json({ error: "No booking found for these details." });
  if (!["Pending", "Confirmed"].includes(b.status)) return res.status(400).json({ error: "This booking can no longer be cancelled online. Please contact the salon." });
  if (new Date(`${b.date}T${b.time}:00+05:30`) - Date.now() < 2 * 3600e3) return res.status(400).json({ error: "Online cancellation closes 2 hours before the appointment. Please call the salon." });
  await C("bookings").updateOne({ _id: b._id }, { $set: { status: "Cancelled", cancelledBy: "customer" }, $unset: { units: "" } }); // frees the slot
  notify.cancel(b);
  res.json({ ok: true });
}));

// ---------- Admin API ----------
const pwOk = (pw, stored) => { const [salt, hx] = stored.split(":"), x = crypto.scryptSync(pw, salt, 64), y = Buffer.from(hx, "hex"); return x.length === y.length && crypto.timingSafeEqual(x, y); };
app.post("/api/admin/login", limit(5), h(async (req, res) => {
  const a = await C("admins").findOne({ _id: String(req.body?.email || "").toLowerCase() });
  if (!a || !pwOk(String(req.body?.password || ""), a.hash)) return res.status(401).json({ error: "Wrong email or password." });
  res.json({ token: jwt.sign({ sub: a._id }, JWT_SECRET, { expiresIn: "12h" }) });
}));
const requireAdmin = async (req, res, next) => {
  try { const { sub } = jwt.verify((req.headers.authorization || "").replace("Bearer ", ""), JWT_SECRET);
    if (await C("admins").findOne({ _id: sub })) return next(); } catch {}
  res.status(401).json({ error: "Not authorized." });
};
const admin = express.Router();
app.use("/api/admin", requireAdmin, admin);
admin.get("/me", (q, r) => r.json({ ok: true }));
admin.get("/stats", h(async (req, res) => {
  const B = C("bookings"), d30 = new Date(Date.now() + 5.5 * 3600e3 - 30 * 864e5).toISOString().slice(0, 10), d7 = new Date(Date.now() + 5.5 * 3600e3 - 7 * 864e5).toISOString().slice(0, 10);
  const [total, today, groups, recent] = await Promise.all([B.countDocuments(), B.countDocuments({ date: todayIST() }), B.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]).toArray(),
    B.find({ date: { $gte: d30 } }).project({ serviceName: 1, price: 1, status: 1, date: 1 }).limit(2000).toArray()]);
  const tod = await B.find({ date: todayIST() }).project({ price: 1, status: 1 }).toArray();
  const pop = {}; recent.forEach(x => pop[x.serviceName] = (pop[x.serviceName] || 0) + 1);
  res.json({ total, today, todayRevenue: tod.filter(x => x.status === "Completed").reduce((s, x) => s + x.price, 0), todayExpected: tod.filter(x => !["Cancelled", "No Show"].includes(x.status)).reduce((s, x) => s + x.price, 0), byStatus: Object.fromEntries(groups.map(g => [g._id, g.n])), last30: recent.length, last7: recent.filter(x => x.date >= d7).length,
    revenue: recent.filter(x => x.status === "Completed").reduce((s, x) => s + x.price, 0), top: Object.entries(pop).sort((a, b) => b[1] - a[1]).slice(0, 5) });
}));
admin.get("/bookings", h(async (req, res) => {
  const { date = "", status = "" } = req.query, q = String(req.query.q || "").trim(), f = {};
  const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  if (/^\d{10}$/.test(q)) f.mobile = q; else if (/^[A-Za-z0-9]{10}$/.test(q)) f.$or = [{ _id: q.toUpperCase() }, { name: rx }]; else if (q) f.name = rx;
  if (isDate(date)) f.date = date; if (STATUS.includes(status)) f.status = status;
  res.json((await C("bookings").find(f).sort({ date: -1, time: -1 }).limit(100).toArray()).map(out));
}));
admin.patch("/bookings/:id", h(async (req, res) => {
  const status = req.body?.status, b = await C("bookings").findOne({ _id: req.params.id });
  if (!STATUS.includes(status)) return res.status(400).json({ error: "Invalid status." }); if (!b) return res.status(404).json({ error: "Not found." });
  // Cancelling releases the slot; re-opening a cancelled booking re-claims it (fails if someone else booked it).
  const upd = status === "Cancelled" ? { $set: { status }, $unset: { units: "" } } : { $set: { status, units: unitsFor(b.date, b.time, b.duration || 30), endTime: b.endTime || endOf(b.time, b.duration || 30) } };
  try { await C("bookings").updateOne({ _id: b._id }, upd); }
  catch (e) { if (e.code === 11000) return res.status(409).json({ error: "That time is now booked by someone else.", code: "SLOT_TAKEN" }); throw e; }
  notify.status(b, status);
  res.json({ ok: true });
}));
admin.delete("/bookings/:id", h(async (req, res) => { await C("bookings").deleteOne({ _id: req.params.id }); res.json({ ok: true }); }));
admin.put("/settings", h(async (req, res) => { const { _id, id, ...s } = req.body || {}; if ("busy" in s) s.busy = !!s.busy; await C("settings").updateOne({ _id: "main" }, { $set: s }, { upsert: true }); cache = null; res.json({ ok: true }); }));
admin.post("/seed-services", h(async (req, res) => { // adds only services whose name does not exist yet, so clicking twice never duplicates
  const have = new Set((await C("services").find().project({ name: 1 }).toArray()).map(s => s.name)), add = sampleServices.filter(s => !have.has(s.name));
  if (add.length) await C("services").insertMany(add.map(s => ({ _id: rid(), ...s, createdAt: new Date() }))); res.json({ ok: true, added: add.length }); }));
// Image upload: raw bytes, max 5 MB, type checked by file signature. Stored in MongoDB, so it survives free hosts that wipe the local disk.
admin.post("/upload", express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "5mb" }), h(async (req, res) => {
  const b = req.body; if (!Buffer.isBuffer(b) || b.length < 12) return res.status(400).json({ error: "Please choose a JPG, PNG or WebP image under 5 MB." });
  const ext = b.subarray(0, 3).toString("hex") === "ffd8ff" ? "jpg" : b.subarray(0, 4).toString("hex") === "89504e47" ? "png" : b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP" ? "webp" : null;
  if (!ext) return res.status(400).json({ error: "That file is not a valid image." });
  const name = rid() + "." + ext; await C("uploads").insertOne({ _id: name, type: ext === "jpg" ? "image/jpeg" : "image/" + ext, data: b, createdAt: new Date() });
  res.json({ path: "uploads/" + name });
}));
const range = q => { const f = isDate(q.from) ? q.from : todayIST(), t = isDate(q.to) ? q.to : f; return t < f || (new Date(t) - new Date(f)) / 864e5 > 366 ? null : { from: f, to: t }; };
const inRange = r => C("bookings").find({ date: { $gte: r.from, $lte: r.to } }).sort({ date: 1, time: 1 }).limit(5000).toArray();
admin.get("/report", h(async (req, res) => { const r = range(req.query); if (!r) return res.status(400).json({ error: "Choose a valid date range (up to one year)." });
  const rows = await inRange(r); res.json({ ...r, ...summarize(rows), rows: rows.map(out) }); }));
admin.get("/export", h(async (req, res) => { const r = range(req.query); if (!r) return res.status(400).json({ error: "Choose a valid date range (up to one year)." });
  const buf = await buildWorkbook(await inRange(r), r, defaults.name);
  res.set({ "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="bookings_${r.from}_to_${r.to}.xlsx"` }); res.send(buf); }));
admin.post("/test-alert", (q, r) => { notify.test(); r.json({ enabled: alertsOn }); });
admin.param("col", (req, res, next, col) => COLS.includes(col) ? next() : res.status(404).json({ error: "Unknown collection." }));
admin.get("/:col", h(async (req, res) => res.json((await C(req.params.col).find().sort(req.params.col === "services" ? { name: 1 } : { createdAt: -1 }).limit(200).toArray()).map(out))));
admin.post("/:col", h(async (req, res) => { const { id, _id, ...d } = req.body || {}; await C(req.params.col).insertOne({ _id: rid(), ...d, createdAt: new Date() }); res.json({ ok: true }); }));
admin.route("/:col/:id").put(h(async (req, res) => { const { id, _id, ...d } = req.body || {}; await C(req.params.col).updateOne({ _id: req.params.id }, { $set: d }); res.json({ ok: true }); }))
  .patch(h(async (req, res) => { const { id, _id, ...d } = req.body || {}; await C(req.params.col).updateOne({ _id: req.params.id }, { $set: d }); res.json({ ok: true }); }))
  .delete(h(async (req, res) => { await C(req.params.col).deleteOne({ _id: req.params.id }); res.json({ ok: true }); }));

app.use("/api", (q, r) => r.status(404).json({ error: "Not found." }));
app.get("/healthz", (q, r) => r.send("ok")); // for uptime monitors
app.get("/uploads/:name", async (req, res, next) => { // images uploaded from admin
  try { const f = await C("uploads").findOne({ _id: req.params.name }); if (!f) return next();
    res.set({ "Content-Type": f.type, "Cache-Control": "public, max-age=31536000, immutable" }); res.send(Buffer.from(f.data.buffer)); } catch (e) { next(e); }
});
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), "public"), { extensions: ["html"] }));
app.listen(PORT, () => console.log(`Salon site running: http://localhost:${PORT}`));
