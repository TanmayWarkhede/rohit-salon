import { salonConfig } from "./config.js";
export const $ = (s, r = document) => r.querySelector(s);
export const inr = n => new Intl.NumberFormat("en-IN", { style: "currency", currency: salonConfig.currency, maximumFractionDigits: 0 }).format(n);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const validMobile = v => /^[6-9]\d{9}$/.test(v.replace(/[\s-]|^\+?91/g, ""));
export const cleanMobile = v => v.replace(/[\s-]|^\+?91/g, "");
export function toast(msg, type = "ok") {
  const t = $("#toast"); t.textContent = msg; t.dataset.type = type; t.classList.add("show");
  clearTimeout(toast.id); toast.id = setTimeout(() => t.classList.remove("show"), 4000);
}
// Today's date in IST as YYYY-MM-DD, independent of the browser timezone.
export const todayIST = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
export const to12h = t => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
export const mins = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
export const hhmm = n => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
