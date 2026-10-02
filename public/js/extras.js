// Offers, gallery, reviews and contact form. Each list is one limited query.
import { api } from "./api.js";
import { $, inr, esc, toast, validMobile, cleanMobile, todayIST } from "./utils.js";

const get = name => api("/" + name);
const safeSrc = u => /^(assets\/|uploads\/|https:\/\/)/.test(u || "") ? u : "";

async function offers() {
  try {
    const t = todayIST(), list = (await get("offers")).filter(o => (!o.startDate || o.startDate <= t) && (!o.endDate || o.endDate >= t));
    if (!list.length) return;
    $("#offerList").innerHTML = list.map(o => `<div class="offer">${o.image ? `<img src="${esc(safeSrc(o.image))}" alt="${esc(o.title)}" loading="lazy">` : ""}<h3>${esc(o.title)}</h3><p>${esc(o.description)}</p>
      <p>${o.originalPrice ? `<span class="old">${inr(o.originalPrice)}</span> ` : ""}<b>${inr(o.offerPrice)}</b></p>${o.endDate ? `<small>Valid till ${esc(o.endDate)}</small>` : ""}</div>`).join("");
    $("#offers").hidden = false;
  } catch (e) { console.error(e); }
}
async function gallery() {
  try {
    const list = (await get("gallery")).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    if (!list.length) return;
    $("#galleryList").innerHTML = list.map(g => `<img src="${esc(safeSrc(g.image))}" alt="${esc(g.title)}" data-cat="${esc(g.category || "")}" loading="lazy" data-zoom>`).join("");
    const cats = [...new Set(list.map(g => g.category).filter(Boolean))];
    if (cats.length > 1) {
      $("#galFilter").innerHTML = ["All", ...cats].map((c, i) => `<button class="btn sm ${i ? "ghost" : ""}" data-f="${i ? esc(c) : ""}">${esc(c)}</button>`).join("");
      $("#galFilter").onclick = e => { const b = e.target.closest("[data-f]"); if (!b) return;
        $("#galFilter").querySelectorAll("button").forEach(x => x.classList.toggle("ghost", x !== b));
        document.querySelectorAll("#galleryList img").forEach(im => im.hidden = b.dataset.f && im.dataset.cat !== b.dataset.f); };
    }
    $("#gallery").hidden = false;
  } catch (e) { console.error(e); }
}
async function reviews() {
  try {
    const list = await get("reviews");
    if (list.length) $("#reviewList").innerHTML = list.map(r => `<blockquote class="review"><p>${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</p><p>${esc(r.text)}</p><footer>${esc(r.name)}</footer></blockquote>`).join("");
  } catch (e) { console.error(e); }
}
async function send(form, col, data, ok) {
  const b = form.querySelector("button"); b.disabled = true;
  try { await api("/" + col, "POST", data); form.reset(); toast(ok); }
  catch (e) { console.error(e); toast("Something went wrong. Please try again.", "err"); }
  b.disabled = false;
}
$("#reviewForm").addEventListener("submit", e => { e.preventDefault();
  send(e.target, "reviews", { name: $("#rn").value.trim(), rating: +$("#rr").value, text: $("#rt").value.trim(), status: "pending" }, "Thank you! Your review will appear after approval."); });
$("#contactForm").addEventListener("submit", e => { e.preventDefault();
  if (!validMobile($("#cm").value)) return toast("Please enter a valid 10-digit mobile number.", "err");
  send(e.target, "inquiries", { name: $("#cn").value.trim(), mobile: cleanMobile($("#cm").value), email: $("#ce").value.trim(), message: $("#cg").value.trim(), status: "new" }, "Message sent. We'll get back to you soon."); });
// Visiting card: shown only if you add assets/images/branding/visiting-card.jpg
const card = new Image(); card.src = "assets/images/branding/visiting-card.jpg"; card.alt = "The Rohit Salon visiting card"; card.setAttribute("data-zoom", "");
card.onload = () => { $("#cardBox").append(card); $("#card").hidden = false; };
offers(); gallery(); reviews();
