// Visual effects only: scroll progress, header, reveal-on-scroll, card spotlight, hero tilt. The site works without it.
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const header = document.querySelector(".top"), bar = Object.assign(document.createElement("div"), { id: "prog" });
document.body.prepend(bar);
const onScroll = () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  header?.classList.toggle("scrolled", scrollY > 30); bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
  if (!reduce) document.querySelectorAll(".blob").forEach((b, i) => b.style.translate = `0 ${scrollY * (i ? -.12 : .15)}px`);
};
addEventListener("scroll", onScroll, { passive: true }); onScroll();

const io = new IntersectionObserver(entries => entries.forEach(e => {
  if (!e.isIntersecting) return;
  const el = e.target; el.classList.add("in"); io.unobserve(el);
  // Drop reveal classes afterwards so hover animations aren't slowed by the reveal transition.
  if (!el.matches("h2")) setTimeout(() => el.classList.remove("reveal", "in"), 1500);
}), { threshold: .12 });
const TARGETS = "main h2, main .note, .cat, .offer, .review, .cards img, .shop img, main .mini, .hours, #contact > div, .about p, .about .btn, footer";
let queued = false;
function scan() {
  queued = false;
  document.querySelectorAll(TARGETS).forEach(el => {
    if (el.dataset.fx) return; el.dataset.fx = 1;
    if (reduce) return;
    el.classList.add("reveal"); el.style.setProperty("--i", [...el.parentElement.children].indexOf(el) % 6); io.observe(el);
  });
}
new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(scan); } }).observe(document.body, { childList: true, subtree: true });
scan();

if (!reduce) {
  document.addEventListener("pointermove", e => {
    const c = e.target.closest?.(".cat, .offer, .review"); if (!c) return;
    const r = c.getBoundingClientRect(); c.style.setProperty("--mx", e.clientX - r.left + "px"); c.style.setProperty("--my", e.clientY - r.top + "px");
  });
  const img = document.querySelector("[data-tilt] img");
  if (img) {
    const box = img.parentElement;
    box.addEventListener("pointermove", e => { const r = box.getBoundingClientRect();
      img.style.setProperty("--rx", -((e.clientY - r.top) / r.height - .5) * 10 + "deg"); img.style.setProperty("--ry", ((e.clientX - r.left) / r.width - .5) * 12 + "deg"); });
    box.addEventListener("pointerleave", () => { img.style.setProperty("--rx", "0deg"); img.style.setProperty("--ry", "0deg"); });
  }
}
