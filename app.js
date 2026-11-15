/* ===== Konfigurasi Supabase (kunci publishable memang aman berada di kode) ===== */
const SUPABASE_URL = "https://mvhdzlcwwvgmlnmtqdhs.supabase.co";
const SUPABASE_KEY = "sb_publishable_yScH9FUHlc6_ycQwX8cTRw_9LefPz90";
const BUCKET = "documents";
const sb = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const $ = (id) => document.getElementById(id);
const DAY = 86400000;
let items = [];
let me = null;           // { id, email, name, role }
let people = {};         // id -> nama pemilik dokumen
const SKEY = "docutrack.settings.v1", NKEY = "docutrack.notified.v1";
let settings = (() => {
  try { return { notify: false, days: [30, 7, 1], ...JSON.parse(localStorage.getItem(SKEY)) }; }
  catch (e) { return { notify: false, days: [30, 7, 1] }; }
})();
const PROC = [["todo", "Belum diurus"], ["doing", "Sedang diproses"], ["done", "Selesai"]];
let view = "list";
let calY = new Date().getFullYear(), calM = new Date().getMonth();
const isAdmin = () => me?.role === "admin";
const canEdit = (it) => !!me && (isAdmin() || it.owner === me.id);

function uid() { return Math.random().toString(36).slice(2, 10); }

function today() { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }
function parse(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function daysLeft(it) { return Math.round((parse(it.expiry) - today()) / DAY); }
function status(it) {
  const n = daysLeft(it);
  return n < 0 ? "expired" : n <= (it.remind || 30) ? "soon" : "active";
}
function fmt(s) { return parse(s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }); }
function label(it) {
  const n = daysLeft(it);
  if (n < 0) return `Kedaluwarsa ${-n} hari lalu`;
  if (n === 0) return "Berakhir hari ini";
  if (n > 365) return `${Math.floor(n / 365)} th ${Math.floor((n % 365) / 30)} bln lagi`;
  return `${n} hari lagi`;
}
function elapsedPct(it) {
  const end = parse(it.expiry).getTime();
  const start = it.issue ? parse(it.issue).getTime() : end - 365 * DAY;
  const p = ((today().getTime() - start) / (end - start)) * 100;
  return Math.max(2, Math.min(100, p));
}
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function render() {
  renderAlert();
  const counts = { expired: 0, soon: 0, active: 0 };
  items.forEach((it) => counts[status(it)]++);
  $("stats").innerHTML = `
    <div class="stat"><b>${items.length}</b><span>Total dokumen</span></div>
    <div class="stat bad"><b>${counts.expired}</b><span>Kedaluwarsa</span></div>
    <div class="stat warn"><b>${counts.soon}</b><span>Segera berakhir</span></div>
    <div class="stat ok"><b>${counts.active}</b><span>Aktif</span></div>`;

  const cats = [...new Set(items.map((i) => i.cat))].sort();
  const cur = $("filterCat").value || "all";
  $("filterCat").innerHTML = `<option value="all">Semua kategori</option>` +
    cats.map((c) => `<option ${c === cur ? "selected" : ""}>${esc(c)}</option>`).join("");

  const q = $("search").value.trim().toLowerCase();
  const fp = $("filterProc").value, fs = $("filterStatus").value, fc = $("filterCat").value, sort = $("sort").value;
  let list = items.filter((it) =>
    (fs === "all" || status(it) === fs) &&
    (fp === "all" || (it.proc || "todo") === fp) &&
    (fc === "all" || it.cat === fc) &&
    (!q || [it.name, it.no, it.issuer].join(" ").toLowerCase().includes(q)));
  list.sort((a, b) =>
    sort === "name" ? a.name.localeCompare(b.name) :
      sort === "added" ? b.added - a.added :
        parse(a.expiry) - parse(b.expiry));

  renderCalendar(list);
  $("list").hidden = view !== "list";
  $("calendar").hidden = view !== "cal";
  $("list").innerHTML = list.length ? list.map((it) => {
    const st = status(it);
    return `<article class="card ${st}">
      <div class="card-head">
        <div>
          <h3>${esc(it.name)}</h3>
          <div class="meta">${esc(it.cat)}${it.no ? " • " + esc(it.no) : ""}${it.issuer ? " • " + esc(it.issuer) : ""}</div>
          <div class="meta owner">Ditambahkan oleh ${esc(people[it.owner] || "pengguna lain")}${it.owner === me?.id ? " (Anda)" : ""}</div>
        </div>
        <span class="badge">${label(it)}</span>
      </div>
      <div class="timeline" role="img" aria-label="${Math.round(elapsedPct(it))}% masa berlaku terpakai"><i style="width:${elapsedPct(it)}%"></i></div>
      <div class="dates"><span>${it.issue ? "Terbit " + fmt(it.issue) : "&nbsp;"}</span><span>Berakhir ${fmt(it.expiry)}</span></div>
      ${it.note ? `<div class="note">${esc(it.note)}</div>` : ""}
      <div class="card-actions">
        ${st !== "active" || (it.proc || "todo") !== "todo" ? `<select class="proc ${it.proc || "todo"}" data-proc="${it.id}"${canEdit(it) ? "" : " disabled"} aria-label="Status proses ${esc(it.name)}">${PROC.map(([v, l]) => `<option value="${v}"${(it.proc || "todo") === v ? " selected" : ""}>${l}</option>`).join("")}</select>` : ""}
        ${it.fileId ? `<button class="btn ghost small" data-view="${it.id}" type="button">Lihat dokumen</button>` : ""}
        ${canEdit(it) ? `<button class="btn ghost small" data-edit="${it.id}" type="button">Ubah</button>
        <button class="btn danger small" data-del="${it.id}" type="button">Hapus</button>` : ""}
      </div>
    </article>`;
  }).join("") : `<div class="empty">${items.length ? "Tidak ada dokumen yang cocok dengan filter." : "Belum ada dokumen. Klik “+ Tambah dokumen” untuk mulai, atau impor dari ZIP cadangan lama lewat tombol Impor."}</div>`;
}

function openForm(it) {
  if (it && !canEdit(it)) { toast("Dokumen ini milik " + (people[it.owner] || "pengguna lain") + ", hanya bisa dilihat."); return; }
  $("dlgTitle").textContent = it ? "Ubah dokumen" : "Tambah dokumen";
  $("fId").value = it?.id || "";
  $("fName").value = it?.name || "";
  $("fCat").value = it?.cat || "Identitas";
  $("fNo").value = it?.no || "";
  $("fIssuer").value = it?.issuer || "";
  $("fIssue").value = it?.issue || "";
  $("fExpiry").value = it?.expiry || "";
  $("fRemind").value = it?.remind || 30;
  $("fNote").value = it?.note || "";
  $("fProc").value = it?.proc || "todo";
  pending = null; scanning = false; $("fFile").value = "";
  $("dateChips").innerHTML = "";
  setStatus(it?.fileName ? `Berkas tersimpan: ${it.fileName}. Unggah lagi untuk menggantinya.` : "Data akan terisi otomatis dari hasil pemindaian.");
  $("dlg").showModal();
}

$("form").addEventListener("submit", async (e) => {
  if (scanning) { e.preventDefault(); toast("Tunggu pemindaian selesai"); return; }
  const row = {
    name: $("fName").value.trim(), cat: $("fCat").value, no: $("fNo").value.trim(),
    issuer: $("fIssuer").value.trim(), issue: $("fIssue").value || null, expiry: $("fExpiry").value,
    remind: Number($("fRemind").value) || 30, note: $("fNote").value.trim(), proc: $("fProc").value,
  };
  const id = $("fId").value;
  const old = id ? items.find((i) => i.id === id) : null;
  try {
    if (pending) {
      const path = `${old?.owner || me.id}/${uid()}_${safeName(pending.file.name)}`;
      const up = await sb.storage.from(BUCKET).upload(path, pending.file, { contentType: pending.file.type || "application/octet-stream" });
      if (up.error) throw up.error;
      Object.assign(row, { file_path: path, file_name: pending.file.name, file_type: pending.file.type, dates: pending.dates, ocr_text: pending.text });
      if (old?.fileId) await sb.storage.from(BUCKET).remove([old.fileId]);
    }
    const res = id ? await sb.from("documents").update(row).eq("id", id) : await sb.from("documents").insert(row);
    if (res.error) throw res.error;
    pending = null;
    toast(id ? "Perubahan disimpan" : "Dokumen ditambahkan");
    await loadAll();
  } catch (err) { console.error(err); toast("Gagal menyimpan: " + (err.message || err)); }
});

$("list").addEventListener("click", async (e) => {
  const ed = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]"), vw = e.target.closest("[data-view]");
  if (ed) openForm(items.find((i) => i.id === ed.dataset.edit));
  if (vw) openViewer(vw.dataset.view);
  if (del && confirm("Hapus dokumen ini untuk semua pengguna?")) {
    const it = items.find((i) => i.id === del.dataset.del);
    try {
      const r = await sb.from("documents").delete().eq("id", it.id);
      if (r.error) throw r.error;
      if (it.fileId) await sb.storage.from(BUCKET).remove([it.fileId]);
      toast("Dokumen dihapus"); await loadAll();
    } catch (err) { toast("Gagal menghapus: " + (err.message || err)); }
  }
});

$("list").addEventListener("change", async (e) => {
  const s = e.target.closest("[data-proc]");
  if (!s) return;
  const r = await sb.from("documents").update({ proc: s.value }).eq("id", s.dataset.proc);
  if (r.error) toast("Gagal memperbarui: " + r.error.message); else toast("Status proses diperbarui");
  await loadAll();
});
$("addBtn").onclick = () => openForm();
$("cancelBtn").onclick = () => $("dlg").close();
["search", "filterStatus", "filterProc", "filterCat", "sort"].forEach((id) => $(id).addEventListener("input", render));

let tt;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ================= Unggah, baca, dan lihat dokumen ================= */
let pending = null, scanning = false, viewerUrl = "";
const dropEl = document.querySelector(".drop");
const PDF_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER;

function setStatus(msg, err) {
  $("scanStatus").textContent = msg;
  $("scanStatus").className = "meta" + (err ? " err" : "");
}

$("pickBtn").onclick = () => $("fFile").click();
$("fFile").addEventListener("change", () => {
  const f = $("fFile").files[0];
  if (!f) return;
  if (f.size > 10 * 1024 * 1024) { setStatus("Ukuran berkas maksimal 10 MB.", true); return; }
  scanFile(f);
});

async function scanFile(file) {
  scanning = true;
  dropEl.classList.add("busy");
  $("dateChips").innerHTML = "";
  setStatus("Membaca dokumen…");
  try {
    const text = file.type === "application/pdf" ? await readPdf(file) : await ocr(file);
    const res = extract(text, file.name);
    pending = { file, text, dates: res.dates };
    applyResult(res);
  } catch (err) {
    console.error(err);
    pending = { file, text: "", dates: [] };
    setStatus(`Dokumen belum bisa dibaca otomatis (${err?.message || err}). Berkas tetap tersimpan, isi data secara manual.`, true);
  }
  scanning = false;
  dropEl.classList.remove("busy");
}

async function ocr(src) {
  if (!window.Tesseract) throw new Error("Tesseract gagal dimuat, cek koneksi internet");
  const { data } = await Tesseract.recognize(src, "eng+ind", {
    logger: (m) => { if (m.status === "recognizing text") setStatus(`Membaca teks… ${Math.round(m.progress * 100)}%`); },
  });
  return data.text;
}

async function readPdf(file) {
  if (!window.pdfjsLib) throw new Error("pdf.js gagal dimuat, cek koneksi internet");
  try {
    const code = await (await fetch(PDF_WORKER)).text();
    pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
  } catch (e) { /* pakai URL CDN langsung */ }
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  let out = "";
  for (let p = 1; p <= Math.min(pdf.numPages, 3); p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    let t = tc.items.map((i) => i.str).join(" ");
    if (t.trim().length < 30) { // PDF hasil scan: render lalu OCR
      const vp = page.getViewport({ scale: 2 });
      const cv = document.createElement("canvas");
      cv.width = vp.width; cv.height = vp.height;
      await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
      t = await ocr(cv);
    }
    out += "\n" + t;
  }
  return out;
}

// ---------- Ekstraksi data dari teks ----------
const MONTHS = { jan: 1, januari: 1, january: 1, feb: 2, februari: 2, pebruari: 2, february: 2, mar: 3, maret: 3, march: 3, apr: 4, april: 4, mei: 5, may: 5, jun: 6, juni: 6, june: 6, jul: 7, juli: 7, july: 7, agu: 8, agt: 8, agus: 8, agustus: 8, aug: 8, august: 8, sep: 9, sept: 9, september: 9, okt: 10, oct: 10, oktober: 10, october: 10, nov: 11, nop: 11, november: 11, des: 12, dec: 12, desember: 12, december: 12 };
const EXP = /berlaku|hingga|sampai|s\/d|expir|valid|until|kedaluwarsa|kadaluarsa|berakhir|\bexp\b|masa/;
const ISS = /terbit|issue|dikeluarkan|dibuat|diterbitkan/;
const BIRTH = /lahir|birth|\bdob\b/;
const TYPES = [
  [/kartu tanda penduduk|\bnik\b/i, "KTP", "Identitas"],
  [/surat izin mengemudi|driving licen[cs]e/i, "SIM", "Kendaraan"],
  [/passport|paspor/i, "Paspor", "Identitas"],
  [/npwp/i, "NPWP", "Identitas"],
  [/stnk|surat tanda nomor kendaraan/i, "STNK", "Kendaraan"],
  [/nomor induk berusaha|\bnib\b|\bsiup\b|\btdp\b/i, "NIB / Izin usaha", "Bisnis"],
  [/\bvisa\b/i, "Visa", "Identitas"],
  [/sertifikat|certificate/i, "Sertifikat", "Profesi"],
  [/licen[cs]e|lisensi/i, "Lisensi", "Lainnya"],
];

function mkDate(d, m, y) {
  d = +d; m = +m; y = +y;
  if (y < 1950 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function lastIdx(re, s) {
  const g = new RegExp(re.source, "g"); let i = -1, m;
  while ((m = g.exec(s))) i = m.index;
  return i;
}

function extract(text, filename) {
  const flat = text.replace(/\s+/g, " ");
  const pats = [
    [/(\d{1,2})\s*[-\/.]?\s*([A-Za-z]{3,9})\.?\s*[-\/.,]?\s*(\d{4})/g, (m) => MONTHS[m[2].toLowerCase()] ? mkDate(m[1], MONTHS[m[2].toLowerCase()], m[3]) : null],
    [/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/g, (m) => mkDate(m[1], m[2], m[3])],
    [/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m) => mkDate(m[3], m[2], m[1])],
  ];
  let dates = [];
  for (const [re, fn] of pats) {
    let m;
    while ((m = re.exec(flat))) {
      const iso = fn(m);
      if (!iso) continue;
      const ctx = flat.slice(Math.max(0, m.index - 40), m.index).toLowerCase();
      const sc = { birth: lastIdx(BIRTH, ctx), expiry: lastIdx(EXP, ctx), issue: lastIdx(ISS, ctx) };
      const best = Object.entries(sc).sort((a, b) => b[1] - a[1])[0];
      dates.push({ iso, raw: m[0], type: best[1] < 0 ? "other" : best[0] });
    }
  }
  dates = dates.filter((d, i) => dates.findIndex((x) => x.iso === d.iso && x.type === d.type) === i);

  let expiry = dates.find((d) => d.type === "expiry");
  let issue = dates.find((d) => d.type === "issue");
  const rest = dates.filter((d) => d.type === "other").sort((a, b) => a.iso.localeCompare(b.iso));
  if (!expiry && rest.length) { expiry = rest[rest.length - 1]; expiry.type = "expiry"; expiry.guess = true; }
  if (!issue) {
    const c = rest.find((d) => d !== expiry && (!expiry || d.iso < expiry.iso));
    if (c) { issue = c; issue.type = "issue"; issue.guess = true; }
  }

  const t = TYPES.find(([re]) => re.test(flat));
  const no = (flat.match(/\b\d{16}\b/) || flat.match(/\b[A-Z]\d{7}\b/) || flat.match(/\b\d{12}\b/) || [])[0] || "";
  const fallbackName = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return { dates, issue: issue?.iso || "", expiry: expiry?.iso || "", name: t ? t[1] : fallbackName, cat: t ? t[2] : "", no };
}

function applyResult(r) {
  if (!$("fName").value.trim()) $("fName").value = r.name;
  if (r.cat) $("fCat").value = r.cat;
  if (!$("fNo").value.trim() && r.no) $("fNo").value = r.no;
  if (r.issue) $("fIssue").value = r.issue;
  if (r.expiry) $("fExpiry").value = r.expiry;
  const usable = r.dates.filter((d) => d.type !== "birth");
  $("dateChips").innerHTML = usable.map((d) =>
    `<span class="chip">${fmt(d.iso)}<button type="button" data-set="issue" data-iso="${d.iso}">Terbit</button><button type="button" data-set="expiry" data-iso="${d.iso}">Berakhir</button></span>`).join("");
  setStatus(r.expiry
    ? `Terbaca: berakhir ${fmt(r.expiry)}. Periksa kembali sebelum menyimpan.`
    : "Tanggal tidak ditemukan. Isi manual atau coba foto yang lebih jelas.", !r.expiry);
}

$("dateChips").addEventListener("click", (e) => {
  const b = e.target.closest("[data-set]");
  if (b) $(b.dataset.set === "issue" ? "fIssue" : "fExpiry").value = b.dataset.iso;
});

// ---------- Penampil dokumen ----------
async function openViewer(id) {
  const it = items.find((i) => i.id === id);
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(it.fileId, 3600);
  if (error || !data) { toast("Berkas tidak dapat dibuka: " + (error?.message || "tidak ditemukan")); return; }
  viewerUrl = data.signedUrl;
  $("vTitle").textContent = it.name;
  $("vDoc").innerHTML = it.fileType === "application/pdf"
    ? `<iframe src="${viewerUrl}" title="Dokumen"></iframe>`
    : `<img src="${viewerUrl}" alt="Dokumen ${esc(it.name)}">`;
  $("vDownload").href = viewerUrl;
  $("vDownload").download = it.fileName || "dokumen";
  const L = { issue: "Tanggal terbit", expiry: "Tanggal berakhir", other: "Tanggal lain", birth: "Tanggal lahir" };
  const ds = it.dates || [];
  $("vDates").innerHTML = ds.length
    ? ds.map((d) => `<li class="${d.type}"><span>${L[d.type]}${d.guess ? " <small>(perkiraan)</small>" : ""}</span><b>${fmt(d.iso)}</b></li>`).join("")
    : "<li>Tidak ada tanggal terdeteksi.</li>";
  let html = esc(it.ocrText || "(tidak ada teks terbaca)");
  ds.forEach((d) => { html = html.split(esc(d.raw)).join(`<mark>${esc(d.raw)}</mark>`); });
  $("vText").innerHTML = html;
  $("viewer").showModal();
}
$("vClose").onclick = () => $("viewer").close();
$("viewer").addEventListener("close", () => { viewerUrl = ""; $("vDoc").innerHTML = ""; });


/* ================= Pengingat, kalender, cadangan ================= */
const pad2 = (n) => String(n).padStart(2, "0");
function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---- Banner perhatian ----
function renderAlert() {
  const need = items.filter((i) => status(i) !== "active" && i.proc !== "done").sort((a, b) => daysLeft(a) - daysLeft(b));
  const bar = $("alertBar");
  bar.hidden = !need.length;
  if (!need.length) return;
  bar.className = "alert" + (daysLeft(need[0]) < 0 ? " bad" : "");
  const txt = need.slice(0, 3).map((i) => `${i.name} (${label(i).toLowerCase()}${i.proc === "doing" ? ", sedang diproses" : ""})`).join(", ");
  bar.textContent = `${need.length} dokumen perlu perhatian: ${txt}${need.length > 3 ? `, dan ${need.length - 3} lainnya` : ""}.`;
}

// ---- Tampilan kalender ----
document.querySelector(".views").addEventListener("click", (e) => {
  const b = e.target.closest("[data-mode]");
  if (!b) return;
  view = b.dataset.mode;
  document.querySelectorAll(".views .btn").forEach((x) => {
    const on = x === b; x.classList.toggle("active", on); x.setAttribute("aria-pressed", on);
  });
  render();
});

function renderCalendar(list) {
  const first = new Date(calY, calM, 1);
  const offset = (first.getDay() + 6) % 7; // minggu dimulai Senin
  const days = new Date(calY, calM + 1, 0).getDate();
  const by = {};
  list.forEach((it) => (by[it.expiry] = by[it.expiry] || []).push(it));
  const prefix = `${calY}-${pad2(calM + 1)}`;
  const inMonth = list.filter((i) => i.expiry.startsWith(prefix)).length;
  const t = new Date();
  const todayIso = `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
  let cells = "";
  for (let i = 0; i < offset; i++) cells += '<div class="day off"></div>';
  for (let d = 1; d <= days; d++) {
    const iso = `${prefix}-${pad2(d)}`;
    const evs = (by[iso] || []).map((it) =>
      `<button type="button" class="ev ${status(it)}" data-edit="${it.id}" title="${esc(it.name)}">${esc(it.name)}</button>`).join("");
    cells += `<div class="day${iso === todayIso ? " today" : ""}"><span class="dn">${d}</span>${evs}</div>`;
  }
  const title = first.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  $("calendar").innerHTML = `
    <div class="cal-head">
      <button class="btn ghost small" type="button" data-cal="-1" aria-label="Bulan sebelumnya">&lsaquo;</button>
      <h2>${title}</h2>
      <button class="btn ghost small" type="button" data-cal="1" aria-label="Bulan berikutnya">&rsaquo;</button>
      <button class="btn ghost small" type="button" data-cal="0">Bulan ini</button>
      <span class="meta">${inMonth} dokumen berakhir bulan ini</span>
      <button class="btn ghost small" type="button" data-ics>Unduh .ics</button>
    </div>
    <div class="cal-grid">${["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((w) => `<div class="wd">${w}</div>`).join("")}${cells}</div>`;
}
$("calendar").addEventListener("click", (e) => {
  const nav = e.target.closest("[data-cal]"), ed = e.target.closest("[data-edit]");
  if (nav) {
    const n = Number(nav.dataset.cal);
    if (n === 0) { calY = new Date().getFullYear(); calM = new Date().getMonth(); }
    else { const d = new Date(calY, calM + n, 1); calY = d.getFullYear(); calM = d.getMonth(); }
    render();
  }
  if (ed) openForm(items.find((i) => i.id === ed.dataset.edit));
});

// ---- Ekspor kalender (.ics) ----
document.addEventListener("click", (e) => { if (e.target.closest("[data-ics]")) exportIcs(); });
function icsText(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/[,;]/g, (c) => "\\" + c).replace(/\r?\n/g, "\\n"); }
function exportIcs() {
  if (!items.length) { toast("Belum ada dokumen"); return; }
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const ymd = (d) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//DocuTrack//ID//", "CALSCALE:GREGORIAN", "X-WR-CALNAME:DocuTrack"];
  items.forEach((it) => {
    const start = parse(it.expiry), end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    L.push("BEGIN:VEVENT", `UID:${it.id}@docutrack`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(start)}`, `DTEND;VALUE=DATE:${ymd(end)}`,
      `SUMMARY:${icsText("Berakhir: " + it.name)}`,
      `DESCRIPTION:${icsText([it.cat, it.no && "No. " + it.no, it.issuer, it.note].filter(Boolean).join(" | "))}`);
    settings.days.forEach((t) => L.push("BEGIN:VALARM", `TRIGGER:-P${t - 1}DT15H`, "ACTION:DISPLAY", `DESCRIPTION:${icsText(it.name + " berakhir " + t + " hari lagi")}`, "END:VALARM"));
    L.push("END:VEVENT");
  });
  L.push("END:VCALENDAR");
  download(new Blob([L.join("\r\n")], { type: "text/calendar" }), "docutrack.ics");
  toast("File kalender diunduh");
}

// ---- Notifikasi browser ----
function saveSettings() { try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch (e) { } }
function remInfo() {
  $("remInfo").textContent = !("Notification" in window) ? "Browser ini tidak mendukung notifikasi."
    : Notification.permission === "denied" ? "Notifikasi diblokir di pengaturan browser. Izinkan dulu lewat ikon gembok di address bar."
      : Notification.permission === "granted" ? "Izin notifikasi sudah aktif."
        : "Izin notifikasi belum diberikan.";
}
$("remBtn").onclick = () => {
  $("remOn").checked = settings.notify;
  document.querySelectorAll('input[name="remDay"]').forEach((c) => (c.checked = settings.days.includes(Number(c.value))));
  remInfo();
  $("remDlg").showModal();
};
$("remDlg").addEventListener("change", async () => {
  settings.notify = $("remOn").checked;
  settings.days = [...document.querySelectorAll('input[name="remDay"]:checked')].map((c) => Number(c.value));
  if (settings.notify && "Notification" in window && Notification.permission === "default") await Notification.requestPermission();
  if (settings.notify && !("Notification" in window && Notification.permission === "granted")) { settings.notify = false; $("remOn").checked = false; }
  saveSettings(); remInfo(); checkReminders();
});
function notify(body) {
  try { new Notification("DocuTrack", { body }); } catch (e) { console.warn(e); }
}
$("remTest").onclick = () => {
  if (!("Notification" in window) || Notification.permission !== "granted") { toast("Aktifkan notifikasi dulu"); return; }
  notify("Ini contoh notifikasi dari DocuTrack.");
};
function checkReminders() {
  if (!settings.notify || !("Notification" in window) || Notification.permission !== "granted" || !settings.days.length) return;
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem(NKEY)) || {}; } catch (e) { }
  const ths = [...settings.days].sort((a, b) => a - b);
  const due = [];
  items.forEach((it) => {
    if (it.proc === "done") return;
    const n = daysLeft(it), k = `${it.id}|${it.expiry}`;
    const band = n < 0 ? -1 : ths.find((t) => n <= t);
    if (band === undefined) return;
    if (seen[k] === undefined || band < seen[k]) { seen[k] = band; due.push(it); }
  });
  try { localStorage.setItem(NKEY, JSON.stringify(seen)); } catch (e) { }
  if (!due.length) return;
  if (document.documentElement.classList.contains("locked")) { notify(`${due.length} dokumen perlu perhatian. Buka DocuTrack untuk melihat.`); return; }
  notify(due.length === 1 ? `${due[0].name}: ${label(due[0]).toLowerCase()}`
    : `${due.length} dokumen perlu perhatian: ${due.slice(0, 3).map((i) => i.name).join(", ")}${due.length > 3 ? ", …" : ""}`);
}

// ---- Cadangan (unduh ZIP) & impor (dari ZIP lama atau cadangan) ----
$("backupBtn").onclick = async () => {
  if (!window.JSZip) { toast("JSZip gagal dimuat, cek koneksi internet"); return; }
  try {
    toast("Menyiapkan cadangan…");
    const zip = new JSZip(), texts = {}, out = [];
    for (const it of items) {
      const rec = { id: it.id, name: it.name, cat: it.cat, no: it.no, issuer: it.issuer, issue: it.issue, expiry: it.expiry, remind: it.remind, note: it.note, proc: it.proc, fileName: it.fileName, fileType: it.fileType, dates: it.dates };
      if (it.fileId) {
        const d = await sb.storage.from(BUCKET).download(it.fileId);
        if (!d.error) { rec.fileId = it.id; zip.file(`files/${it.id}`, d.data); texts[it.id] = it.ocrText || ""; }
      }
      out.push(rec);
    }
    zip.file("docutrack.json", JSON.stringify({ app: "DocuTrack", version: 3, exported: new Date().toISOString(), items: out, texts }, null, 2));
    download(await zip.generateAsync({ type: "blob" }), `docutrack-backup-${new Date().toISOString().slice(0, 10)}.zip`);
    toast("Cadangan diunduh");
  } catch (e) { toast("Gagal membuat cadangan: " + e.message); }
};
$("restoreBtn").onclick = () => $("restoreFile").click();
$("restoreFile").addEventListener("change", async () => {
  const f = $("restoreFile").files[0];
  $("restoreFile").value = "";
  if (!f) return;
  try {
    let zip = null, data;
    if (/\.json$/i.test(f.name)) data = JSON.parse(await f.text());
    else { zip = await JSZip.loadAsync(f); data = JSON.parse(await zip.file("docutrack.json").async("string")); }
    const list = Array.isArray(data) ? data : data.items;
    if (!Array.isArray(list)) throw new Error("format file tidak dikenali");
    if (!confirm(`Impor ${list.length} dokumen sebagai milik Anda? Dokumen yang sudah ada (nama, nomor, dan tanggal sama) dilewati.`)) return;
    let added = 0, skipped = 0;
    for (const it of list) {
      if (!it.name || !it.expiry) continue;
      if (items.some((x) => x.name === it.name && x.expiry === it.expiry && (x.no || "") === (it.no || ""))) { skipped++; continue; }
      const row = { name: it.name, cat: it.cat || "Lainnya", no: it.no || "", issuer: it.issuer || "", issue: it.issue || null, expiry: it.expiry, remind: it.remind || 30, note: it.note || "", proc: it.proc || "todo", dates: it.dates || [] };
      const entry = zip && it.fileId ? zip.file(`files/${it.fileId}`) : null;
      if (entry) {
        const blob = new Blob([await entry.async("blob")], { type: it.fileType || "application/octet-stream" });
        const path = `${me.id}/${uid()}_${safeName(it.fileName || "dokumen")}`;
        const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: it.fileType || "application/octet-stream" });
        if (!up.error) Object.assign(row, { file_path: path, file_name: it.fileName, file_type: it.fileType, ocr_text: data.texts?.[it.fileId] || "" });
      }
      const r = await sb.from("documents").insert(row);
      if (r.error) throw r.error;
      added++;
    }
    await loadAll();
    toast(`${added} dokumen diimpor${skipped ? `, ${skipped} dilewati (sudah ada)` : ""}`);
  } catch (e) { toast("Gagal mengimpor: " + e.message); }
});

/* ================= Data bersama (Supabase) & login ================= */
function safeName(n) { return String(n).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80); }

function fromRow(r) {
  return {
    id: r.id, owner: r.owner_id, name: r.name, cat: r.cat || "Lainnya", no: r.no || "", issuer: r.issuer || "",
    issue: r.issue || "", expiry: r.expiry, remind: r.remind || 30, note: r.note || "", proc: r.proc || "todo",
    fileId: r.file_path || "", fileName: r.file_name || "", fileType: r.file_type || "", dates: r.dates || [],
    ocrText: r.ocr_text || "", added: Date.parse(r.created_at) || 0
  };
}
let loading = null;
async function loadAll() {
  if (!sb || !me) return;
  if (loading) return loading;
  loading = (async () => {
    try {
      const [d, p] = await Promise.all([
        sb.from("documents").select("*").order("expiry", { ascending: true }),
        sb.from("profiles").select("id, full_name, email"),
      ]);
      if (d.error) throw d.error;
      if (!p.error) people = Object.fromEntries((p.data || []).map((x) => [x.id, x.full_name || x.email]));
      items = (d.data || []).map(fromRow);
      render(); checkReminders();
    } catch (err) { console.error(err); toast("Gagal memuat data: " + (err.message || err)); }
    loading = null;
  })();
  return loading;
}

let channel = null, rtTimer;
function startRealtime() {
  if (channel || !sb) return;
  channel = sb.channel("docs-live").on("postgres_changes", { event: "*", schema: "public", table: "documents" }, () => {
    clearTimeout(rtTimer); rtTimer = setTimeout(loadAll, 300);
  }).subscribe();
}
function stopRealtime() { if (channel) { sb.removeChannel(channel); channel = null; } }

function showLogin(msg) {
  document.documentElement.classList.add("locked");
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  $("lock").hidden = false;
  $("lockErr").textContent = msg || "";
  $("loginPass").value = "";
  setTimeout(() => ($("loginEmail").value ? $("loginPass") : $("loginEmail")).focus(), 50);
}
async function enter(user) {
  const p = await sb.from("profiles").select("full_name, role").eq("id", user.id).maybeSingle();
  me = { id: user.id, email: user.email, name: p.data?.full_name || user.email, role: p.data?.role || "staff" };
  $("userName").textContent = me.name + (isAdmin() ? " (admin)" : "");
  $("userBar").hidden = false;
  document.documentElement.classList.remove("locked");
  $("lock").hidden = true;
  await loadAll();
  startRealtime();
}
async function leave(msg) {
  stopRealtime(); me = null; items = []; render();
  $("userBar").hidden = true;
  showLogin(msg);
}

$("lockForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("lockErr").textContent = "";
  const btn = $("loginBtn"); btn.disabled = true; btn.textContent = "Masuk…";
  const { data, error } = await sb.auth.signInWithPassword({ email: $("loginEmail").value.trim(), password: $("loginPass").value });
  btn.disabled = false; btn.textContent = "Masuk";
  if (error) { $("lockErr").textContent = /invalid/i.test(error.message) ? "Email atau kata sandi salah." : error.message; $("loginPass").value = ""; return; }
  await enter(data.user);
});
$("logoutBtn").onclick = async () => { await sb.auth.signOut(); await leave(); };

(async function init() {
  if (!sb) { showLogin("Library Supabase gagal dimuat. Periksa koneksi internet lalu muat ulang."); return; }
  render();
  sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT" && me) leave("Sesi berakhir, silakan masuk lagi."); });
  const { data } = await sb.auth.getSession();
  if (data.session) await enter(data.session.user); else showLogin();
})();
setInterval(checkReminders, 30 * 60 * 1000);

window.__docutrackReady = true;
