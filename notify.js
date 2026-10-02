// Email alerts (Gmail or any SMTP server). Off unless SMTP_USER, SMTP_PASS and OWNER_EMAIL are set in .env.
import "dotenv/config";
import nodemailer from "nodemailer";
import { salonConfig } from "./public/js/config.js";

const { SMTP_USER, SMTP_PASS, OWNER_EMAIL, BREVO_API_KEY, BREVO_SENDER } = process.env;
// Two ways to send: Brevo's HTTPS API (works on free hosts that block SMTP, like Render) or normal SMTP (Gmail etc.).
const useApi = !!(BREVO_API_KEY && BREVO_SENDER);
export const enabled = !!(OWNER_EMAIL && (useApi || (SMTP_USER && SMTP_PASS)));
const port = +(process.env.SMTP_PORT || 465);
const transport = enabled && !useApi ? nodemailer.createTransport({ host: process.env.SMTP_HOST || "smtp.gmail.com", port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } }) : null;
const FROM = process.env.MAIL_FROM || `"${salonConfig.name}" <${SMTP_USER}>`;
const esc = s => String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const t12 = t => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
const validEmail = e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e || "");
const line = b => `${t12(b.time)} - ${b.name} - ${b.serviceName} - ${b.mobile}${b.status && b.status !== "Pending" ? ` [${b.status}]` : ""}`;
// Fire-and-forget: an email problem must never slow down or break a customer's booking.
function mail(to, subject, lines) {
  if (!enabled) return;
  const text = lines.join("\n"), html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6">${lines.map(esc).join("<br>")}</div>`;
  if (useApi) {
    fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: { name: salonConfig.name, email: BREVO_SENDER }, to: String(to).split(",").map(e => ({ email: e.trim() })), subject, textContent: text, htmlContent: html }) })
      .then(async r => { if (!r.ok) console.error("Email failed:", r.status, (await r.text()).slice(0, 200)); }).catch(e => console.error("Email failed:", e.message));
    return;
  }
  transport.sendMail({ from: FROM, to, subject, text, html }).catch(e => console.error("Email failed:", e.message));
}
const owner = (subject, lines) => mail(OWNER_EMAIL, subject, lines);
const footer = [``, salonConfig.name, salonConfig.address, `Phone: ${salonConfig.phone}`];

export function startNotifier({ C, todayIST }) {
  const ist = () => new Date(Date.now() + 5.5 * 3600e3);
  const day = d => C("bookings").find({ date: d, status: { $ne: "Cancelled" } }).sort({ time: 1 }).toArray();
  const sendSummary = async (d, label) => { const l = await day(d); owner(`${label}'s bookings: ${l.length} (${d})`, [`${label}'s bookings (${d})`, `Total: ${l.length}`, ``, ...(l.length ? l.map(line) : ["No bookings yet."])]); };
  const notify = {
    booking: async b => {
      if (!enabled) return;
      const n = (await day(b.date)).length, when = b.date === todayIST() ? "today" : b.date;
      owner(`New booking: ${b.name}, ${t12(b.time)} on ${b.date} (${n} for ${when})`, ["New online booking", ``, line(b), `Date: ${b.date}`, `Booking ID: ${b.id}`, `Total bookings for ${when}: ${n}`]);
      if (validEmail(b.email)) mail(b.email, `Booking received - ${salonConfig.name}`, [`Hi ${b.name},`, ``, "We have received your booking request.", `Service: ${b.serviceName}`, `Date: ${b.date}`, `Time: ${t12(b.time)}`, `Booking ID: ${b.id}`, "Status: Pending (we will confirm shortly)", ``, 'To check or cancel, use "Check my booking" on our website with your Booking ID and mobile number.', ...footer]);
    },
    // Called when the owner changes a status in admin: tells the customer if they gave an email.
    status: (b, status) => {
      if (!validEmail(b.email) || !["Confirmed", "Cancelled"].includes(status)) return;
      mail(b.email, status === "Confirmed" ? "Your booking is confirmed" : "Your booking was cancelled", [`Hi ${b.name},`, ``, `Your booking ${b._id} for ${b.serviceName} on ${b.date} at ${t12(b.time)} is now ${status.toLowerCase()}.`, ...footer]);
    },
    cancel: b => owner(`Customer cancelled: ${b.name}, ${t12(b.time)} on ${b.date}`, ["Customer cancelled a booking", ``, line(b), `Date: ${b.date}`, `Booking ID: ${b._id}`]),
    inquiry: i => owner(`New enquiry from ${i.name}`, [`Name: ${i.name}`, `Mobile: ${i.mobile}`, i.email ? `Email: ${i.email}` : "", ``, i.message]),
    review: r => owner(`New review (${r.rating}/5) waiting for approval`, [`${r.name} rated ${r.rating}/5`, ``, r.text, ``, "Approve or reject it in Admin > Reviews."]),
    test: () => owner("Test email from your salon website", ["Alerts are working. You will receive booking emails here."])
  };
  if (!enabled) { console.log("Owner email alerts: OFF (see README, Owner email alerts)"); return notify; }
  console.log("Owner email alerts: ON ->", OWNER_EMAIL);
  const [sh, sm] = (process.env.DAILY_SUMMARY_TIME || "09:00").split(":").map(Number), rem = +(process.env.REMINDER_MINUTES ?? 30);
  const hhmm = n => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  C("meta").updateOne({ _id: "summary" }, { $setOnInsert: { last: "" } }, { upsert: true }).catch(console.error);

  // Every minute: today's summary once per day, and "customer arriving soon" reminders.
  setInterval(async () => {
    try {
      const n = ist(), d = n.toISOString().slice(0, 10), mins = n.getUTCHours() * 60 + n.getUTCMinutes();
      if (mins >= sh * 60 + sm && (await C("meta").updateOne({ _id: "summary", last: { $ne: d } }, { $set: { last: d } })).matchedCount) await sendSummary(d, "Today");
      if (rem > 0) {
        const due = await C("bookings").find({ date: d, status: { $in: ["Pending", "Confirmed"] }, reminded: { $ne: true }, time: { $gte: hhmm(mins), $lte: hhmm(Math.min(mins + rem, 1439)) } }).toArray();
        for (const b of due) if ((await C("bookings").updateOne({ _id: b._id, reminded: { $ne: true } }, { $set: { reminded: true } })).matchedCount) owner(`Customer arriving soon: ${b.name} at ${t12(b.time)}`, ["Customer arriving soon", ``, line(b)]);
      }
    } catch (e) { console.error("Alert scheduler:", e.message); }
  }, 60e3);
  return notify;
}
