// Daily/range summaries and the Excel (.xlsx) export of bookings.
import ExcelJS from "exceljs";
const OK = s => !["Cancelled", "No Show"].includes(s);
const hm = n => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const t12 = t => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
const endOf = b => b.endTime || hm(+b.time.slice(0, 2) * 60 + +b.time.slice(3) + (b.duration || 30));

export function summarize(rows) {
  const days = {}, totals = { bookings: 0, completed: 0, cancelled: 0, noShow: 0, revenue: 0, expected: 0, customers: 0 }, people = new Set();
  for (const b of rows) {
    const d = days[b.date] ??= { date: b.date, bookings: 0, completed: 0, cancelled: 0, noShow: 0, revenue: 0, expected: 0 };
    for (const t of [d, totals]) {
      t.bookings++; if (b.status === "Completed") { t.completed++; t.revenue += b.price; }
      if (b.status === "Cancelled") t.cancelled++; if (b.status === "No Show") t.noShow++; if (OK(b.status)) t.expected += b.price;
    }
    if (OK(b.status)) people.add(b.mobile);
  }
  totals.customers = people.size; return { totals, days: Object.values(days) };
}

export async function buildWorkbook(rows, { from, to }, salon) {
  const wb = new ExcelJS.Workbook(); wb.creator = salon;
  const money = '"₹"#,##0', day = s => new Date(s + "T00:00:00Z");
  const style = ws => { const r = ws.getRow(1); r.font = { bold: true, color: { argb: "FFFFFFFF" } }; r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A2A5E" } };
    r.height = 22; ws.views = [{ state: "frozen", ySplit: 1 }]; ws.autoFilter = { from: "A1", to: { row: 1, column: ws.columnCount } }; };
  const { totals, days } = summarize(rows);

  const ws = wb.addWorksheet("Bookings");
  ws.columns = [{ header: "Date", key: "date", width: 14, style: { numFmt: "dd-mmm-yyyy" } }, { header: "Start", key: "start", width: 10 }, { header: "End", key: "end", width: 10 },
    { header: "Booking ID", key: "id", width: 14 }, { header: "Customer", key: "name", width: 24 }, { header: "Mobile", key: "mobile", width: 14 }, { header: "Email", key: "email", width: 26 },
    { header: "Service", key: "service", width: 24 }, { header: "Duration (min)", key: "dur", width: 14 }, { header: "Price (₹)", key: "price", width: 12, style: { numFmt: money } },
    { header: "Status", key: "status", width: 12 }, { header: "Customer note", key: "note", width: 30 }, { header: "Booked on (IST)", key: "created", width: 20, style: { numFmt: "dd-mmm-yyyy hh:mm" } }];
  rows.forEach(b => ws.addRow({ date: day(b.date), start: t12(b.time), end: t12(endOf(b)), id: b._id, name: b.name, mobile: b.mobile, email: b.email || "", service: b.serviceName,
    dur: b.duration, price: b.price, status: b.status, note: b.message || "", created: b.createdAt ? new Date(new Date(b.createdAt).getTime() + 5.5 * 3600e3) : null }));
  style(ws);
  if (rows.length) {
    const n = rows.length + 1; ws.addRow({});
    const t = ws.addRow({ name: "TOTAL (excluding Cancelled and No show)", price: { formula: `SUMIFS(J2:J${n},K2:K${n},"<>Cancelled",K2:K${n},"<>No Show")`, result: totals.expected } }); t.font = { bold: true };
  }

  const ds = wb.addWorksheet("Daily summary");
  ds.columns = [{ header: "Date", key: "date", width: 14, style: { numFmt: "dd-mmm-yyyy" } }, { header: "Bookings", key: "b", width: 12 }, { header: "Completed", key: "c", width: 12 },
    { header: "Cancelled", key: "x", width: 12 }, { header: "No show", key: "n", width: 12 }, { header: "Revenue (completed)", key: "r", width: 20, style: { numFmt: money } }, { header: "Expected revenue", key: "e", width: 18, style: { numFmt: money } }];
  days.forEach(d => ds.addRow({ date: day(d.date), b: d.bookings, c: d.completed, x: d.cancelled, n: d.noShow, r: d.revenue, e: d.expected }));
  style(ds);
  if (days.length) {
    const n = days.length + 1, col = (c, res) => ({ formula: `SUM(${c}2:${c}${n})`, result: res });
    const t = ds.addRow({ date: "TOTAL", b: col("B", totals.bookings), c: col("C", totals.completed), x: col("D", totals.cancelled), n: col("E", totals.noShow), r: col("F", totals.revenue), e: col("G", totals.expected) }); t.font = { bold: true };
  }
  ds.addRow({}); ds.addRow({ date: `Period: ${from} to ${to}. Revenue is an estimate (completed bookings at listed prices).` });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
