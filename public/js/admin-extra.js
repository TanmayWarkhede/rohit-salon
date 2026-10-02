// Generic admin tables for offers, gallery, reviews, inquiries.
import { api } from "./api.js";
import { $, esc, toast } from "./utils.js";

const T = "text", N = "number", D = "date", C = "checkbox";
const DEF = {
  offers: { title: "Offers", cols: ["title", "offerPrice", "endDate", "active"], add: 1, fields: [["title", "Title", T], ["description", "Description", T], ["originalPrice", "Original price (₹)", N], ["offerPrice", "Offer price (₹)", N], ["startDate", "Start date", D], ["endDate", "End date", D], ["image", "Image path (assets/images/... or https://)", T], ["active", "Active", C]] },
  gallery: { title: "Gallery", cols: ["title", "category", "order", "active"], add: 1, fields: [["title", "Title", T], ["category", "Category", T], ["image", "Image path (e.g. assets/images/salon/salon-interior.png)", T], ["order", "Display order", N], ["active", "Active", C]] },
  reviews: { title: "Reviews", cols: ["name", "rating", "text", "status"], actions: [["approved", "Approve"], ["rejected", "Reject"]] },
  inquiries: { title: "Inquiries", cols: ["name", "mobile", "message", "status"], actions: [["read", "Mark read"], ["resolved", "Resolved"]] }
};
let cur = "offers", rows = [];

async function load(name) {
  cur = name; const d = DEF[name];
  document.querySelectorAll(".pane").forEach(p => p.hidden = p.id !== "gen");
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.g === name));
  $("#genT").textContent = d.title; $("#genAdd").hidden = !d.add;
  $("#genH").innerHTML = `<tr>${d.cols.map(c => `<th>${c}</th>`).join("")}<th></th></tr>`;
  try {
    rows = await api("/admin/" + name);
    $("#genB").innerHTML = rows.length ? rows.map(r => `<tr>${d.cols.map(c => `<td style="white-space:normal">${esc(r[c])}</td>`).join("")}<td>
      ${d.add ? `<button class="btn sm" data-ge="${r.id}">Edit</button> ` : d.actions.map(([v, l]) => `<button class="btn sm" data-ga="${r.id}|${v}">${l}</button> `).join("")}<button class="btn sm ghost" data-gd="${r.id}">Delete</button></td></tr>`).join("")
      : `<tr><td colspan="${d.cols.length + 1}">Nothing here yet.</td></tr>`;
  } catch (e) { console.error(e); toast("Could not load data.", "err"); }
}
function form(r = {}) {
  $("#genF").innerHTML = DEF[cur].fields.map(([k, l, t]) => t === C
    ? `<label><input type="checkbox" data-f="${k}" ${r[k] ?? true ? "checked" : ""}> ${l}</label>` : `<label>${l}<input type="${t}" data-f="${k}" value="${esc(r[k] ?? "")}"></label>`).join("");
  const im = $("#genF").querySelector('[data-f="image"]');
  if (im) im.insertAdjacentHTML("afterend", '<input type="file" id="up" accept="image/jpeg,image/png,image/webp" aria-label="Or upload an image">');
  $("#genForm").dataset.id = r.id || ""; $("#genDlg").showModal();
}
document.addEventListener("click", async e => {
  const g = a => e.target.closest(`[${a}]`)?.getAttribute(a);
  if (g("data-g")) load(g("data-g"));
  if (e.target.id === "genAdd") form();
  if (e.target.id === "genX") $("#genDlg").close();
  if (g("data-ge")) form(rows.find(r => r.id === g("data-ge")));
  try {
    if (g("data-ga")) { const [id, status] = g("data-ga").split("|"); await api(`/admin/${cur}/${id}`, "PATCH", { status }); toast("Updated."); load(cur); }
    if (g("data-gd") && confirm("Delete this item?")) { await api(`/admin/${cur}/${g("data-gd")}`, "DELETE"); toast("Deleted."); load(cur); }
  } catch (x) { console.error(x); toast("Something went wrong. Please try again.", "err"); }
});
document.addEventListener("change", async e => {
  if (e.target.id !== "up" || !e.target.files[0]) return; const f = e.target.files[0];
  if (f.size > 5 * 1024 * 1024) return toast("Image must be under 5 MB.", "err");
  try {
    const r = await fetch("/api/admin/upload", { method: "POST", headers: { "Content-Type": f.type, Authorization: "Bearer " + localStorage.getItem("adminToken") }, body: f });
    const d = await r.json(); if (!r.ok) throw new Error(d.error);
    $("#genF").querySelector('[data-f="image"]').value = d.path; toast("Image uploaded. Click Save.");
  } catch (x) { console.error(x); toast(x.message || "Upload failed.", "err"); }
});
$("#genForm").addEventListener("submit", async e => {
  e.preventDefault(); const data = {};
  document.querySelectorAll("[data-f]").forEach(i => data[i.dataset.f] = i.type === "checkbox" ? i.checked : i.type === "number" ? (i.value === "" ? null : +i.value) : i.value.trim());
  try { const id = e.target.dataset.id; if (id) await api(`/admin/${cur}/${id}`, "PUT", data); else await api("/admin/" + cur, "POST", data);
    $("#genDlg").close(); toast("Saved."); load(cur); } catch (x) { console.error(x); toast("Something went wrong. Please try again.", "err"); }
});
