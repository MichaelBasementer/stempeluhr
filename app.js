// UI + storage. All rules live in calc.js.
const C = window.Calc;
const STORE = "zeit.v1";
const TYPES = { arbeit: "Arbeit", urlaub: "Urlaub", krank: "Krank", feiertag: "Feiertag", abbau: "Abbau" };
const WARN = "\u26A0\uFE0E";
const DOW = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const DOW_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MON = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

// ---------- state ----------
let state = load();
// Older data and backups lack the newer fields, so every load goes through here.
function normalize(s) {
  return { settings: { ...C.DEFAULTS, ...s.settings }, days: s.days, corrections: s.corrections || [], lastBackup: s.lastBackup || null };
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    if (s && s.days) return normalize(s);
  } catch (e) { /* fall through to empty */ }
  return normalize({ days: {} });
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); }
  catch (e) { toast("Speichern fehlgeschlagen: " + e.message); }
}

// ---------- clock ----------
const pad = n => String(n).padStart(2, "0");
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const nowHHMM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const dateDE = k => { const d = C.D(k); return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`; };

// A day before today that was checked in but never checked out.
function forgottenDay() {
  const t = todayKey();
  return Object.keys(state.days).sort().reverse()
    .find(k => k < t && state.days[k].type === "arbeit" && state.days[k].start && !state.days[k].end);
}

// ---------- Heute ----------
function renderHeute() {
  const el = document.getElementById("t-heute");
  const t = todayKey(), now = nowHHMM(), S = state.settings;
  const d = state.days[t];
  const off = d && d.type !== "arbeit";
  const running = d && !off && d.start && !d.end;
  const done = d && !off && d.end;
  const end = done ? d.end : now;
  const present = d && !off && d.start ? Math.max(0, C.toMin(end) - C.toMin(d.start)) : 0;
  const pause = d && !off && d.start ? C.effectivePause(present, d.pause) : 0;
  const wk = C.weekIst(state.days, C.mondayOf(t), S, t, now);
  const target = Math.max(0, C.weekTarget(C.mondayOf(t), C.firstEntry(state.days), S) - C.weekAbbau(state.days, C.mondayOf(t), S, t));
  const cap = target * (1 + S.coveredPct / 100);
  const lost = forgottenDay();
  const ctx = { firstKey: C.firstEntry(state.days), todayKey: t, now };
  const hol = C.holidayOn(t, S.bundesland), holCounts = C.holidayCounts(t, S, ctx);

  let button;
  if (off) button = `<button class="big done" disabled>Heute: ${TYPES[d.type]}</button><button class="link" data-open="${t}">Ändern</button>`;
  else if (done) button = `<button class="big done" disabled>Tag erledigt</button><button class="link" id="undo">Auschecken rückgängig</button>`;
  else button = `<button class="big ${running ? "out" : ""}" id="stamp">${running ? "Auschecken" : "Einchecken"}</button>`;

  el.innerHTML = `
    ${lost ? `<div class="warn"><span>${DOW[C.D(lost).getUTCDay()]}, ${dateDE(lost)}: nicht ausgecheckt</span><button data-open="${lost}">Ende nachtragen</button></div>` : ""}
    ${C.backupDue(state.lastBackup, ctx.firstKey, t) ? `<div class="warn"><span>${state.lastBackup ? "Dein letztes Backup ist über 7 Tage her." : "Du hast noch kein Backup gespeichert."}</span><button id="backupNow">Backup speichern</button></div>` : ""}
    ${C.warnings(t, state.days, S, now).map(w => `<div class="warn"><span>${WARN} ${w}</span></div>`).join("")}
    <div class="clock"><div class="now">${now}</div>
      <div class="state">${running ? `<span class="dot"></span>Eingecheckt seit ${d.start}` : done ? "Ausgecheckt" : off ? TYPES[d.type] : "Noch nicht eingecheckt"}${hol ? ` · ${hol.name}` : ""}</div></div>
    ${button}
    ${off ? "" : `<div class="panel">
      <div class="row tap" data-time="start"><span>Beginn</span><span class="num tapval">${d && d.start || "eintragen"}</span><input type="time" tabindex="-1" aria-label="Beginn" value="${d && d.start || ""}"></div>
      <div class="row ${d && d.start ? "tap" : ""}" data-time="end"><span>Ende</span><span class="num ${d && d.start ? "tapval" : ""}">${done ? d.end : running ? "läuft" : "–"}</span><input type="time" tabindex="-1" aria-label="Ende" value="${done ? d.end : ""}" ${d && d.start ? "" : "disabled"}></div>
      <div class="row"><span>Pause</span><span class="num">${pause} min<span class="hint">${d && d.pause > C.legalPause(present) ? "von Hand" : pause ? "automatisch, § 4 ArbZG" : "ab 6 h Anwesenheit"}</span></span></div>
      <div class="row total"><span>${holCounts ? "Zählt (Feiertag)" : "Arbeitszeit"}</span><span class="num">${C.fmt(holCounts ? S.offDayH * 60 : present - pause)}</span></div>
    </div>`}
    <div class="week">
      <div class="lbl"><span>Diese Woche (KW ${C.isoWeek(t)})</span><span class="num">${C.fmt(wk)} / ${C.fmt(target)}</span></div>
      <div class="bar"><i style="width:${cap ? Math.min(100, wk / cap * 100) : 100}%"></i><b style="left:${cap ? target / cap * 100 : 0}%"></b></div>
    </div>`;

  const st = document.getElementById("stamp");
  if (st) st.onclick = () => {
    const k = todayKey(), n = nowHHMM();
    if (!state.days[k]) state.days[k] = { type: "arbeit", start: n, end: null };
    else state.days[k].end = n;
    save(); renderAll();
  };
  // Tap Beginn / Ende to set the time by hand. The invisible time input covers the whole row,
  // so the tap lands on it directly and the phone opens its own time picker.
  el.querySelectorAll(".row.tap").forEach(row => {
    const inp = row.querySelector("input");
    inp.onpointerdown = inp.onfocus = () => { pickerOpenUntil = Date.now() + 120000; };
    // Desktop browsers don't open the picker on a plain click; touch phones do it themselves.
    inp.onclick = () => { if (matchMedia("(pointer: fine)").matches) try { inp.showPicker(); } catch (e) { /* not supported */ } };
    inp.onblur = () => { pickerOpenUntil = 0; };
    inp.onchange = () => { pickerOpenUntil = 0; setTodayTime(row.dataset.time, inp.value); };
  });
  const bn = document.getElementById("backupNow");
  if (bn) bn.onclick = () => { saveBackup(); renderAll(); };
  const u = document.getElementById("undo");
  if (u) u.onclick = () => { state.days[todayKey()].end = null; save(); renderAll(); };
  el.querySelectorAll("[data-open]").forEach(b => b.onclick = () => openDay(b.dataset.open));
}

let pickerOpenUntil = 0;
function setTodayTime(field, v) {
  const k = todayKey(), d = state.days[k];
  if (field === "start") {
    if (!v) { if (d && !d.end) delete state.days[k]; }          // cleared before check-out → no entry
    else if (!d) state.days[k] = { type: "arbeit", start: v, end: null };
    else if (d.end && C.toMin(v) >= C.toMin(d.end)) { toast("Der Beginn muss vor dem Ende liegen."); return renderAll(); }
    else d.start = v;
  } else {
    if (!d || !d.start) return renderAll();
    if (!v) d.end = null;                                         // cleared → back to "läuft"
    else if (C.toMin(v) <= C.toMin(d.start)) { toast("Das Ende muss nach dem Beginn liegen."); return renderAll(); }
    else d.end = v;
  }
  save(); renderAll();
}

// ---------- Kalender ----------
let viewMonth = (() => { const d = new Date(); return [d.getFullYear(), d.getMonth()]; })();
function renderKalender() {
  const [y, m] = viewMonth, el = document.getElementById("t-kalender"), S = state.settings;
  const t = todayKey(), ctx = { firstKey: C.firstEntry(state.days), todayKey: t, now: nowHHMM() };
  const lead = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
  let cells = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map(w => `<div class="wd">${w}</div>`).join("");
  for (let i = 0; i < lead; i++) cells += `<button class="empty" tabindex="-1" aria-hidden="true"></button>`;
  let month = 0;
  for (let i = 1; i <= days; i++) {
    const k = `${y}-${pad(m + 1)}-${pad(i)}`, d = state.days[k], dow = (lead + i - 1) % 7;
    const net = C.dayMinutes(k, d, S, ctx), hol = C.holidayOn(k, S.bundesland);
    month += net;
    let sub = "";
    if (hol) sub = hol.short;
    else if (d) sub = d.type !== "arbeit" ? TYPES[d.type] : d.end ? C.fmt(net) : "offen";
    const warned = C.warnings(k, state.days, S, k === t ? nowHHMM() : null).length > 0;
    cells += `<button data-day="${k}" class="${dow > 4 ? "we" : ""} ${k === t ? "today" : ""} ${hol || (d && d.type !== "arbeit") ? "off" : ""}" aria-label="${i}. ${MON[m]}${hol ? ", " + hol.name : ""}${warned ? ", Warnung" : ""}">${warned ? `<i class="wmark" aria-hidden="true">${WARN}</i>` : ""}<span>${i}</span><small>${sub || "&nbsp;"}</small></button>`;
  }
  el.innerHTML = `
    <div class="monthbar"><button class="icon-btn" id="prev" aria-label="Vorheriger Monat">‹</button><h2>${MON[m]} ${y}</h2><button class="icon-btn" id="next" aria-label="Nächster Monat">›</button></div>
    <div class="cal">${cells}</div>
    <div class="legend"><span style="--c:var(--accent)">Heute</span><span style="--c:var(--off)">Urlaub/Krank/Feiertag = ${C.fmt(S.offDayH * 60)}</span></div>
    <div class="panel"><div class="row total"><span>Summe ${MON[m]}</span><span class="num">${C.fmt(month)}</span></div></div>
    <p class="rule">Tippe auf einen Tag, um Zeiten einzutragen oder zu ändern.</p>`;
  el.querySelectorAll("[data-day]").forEach(b => b.onclick = () => openDay(b.dataset.day));
  document.getElementById("prev").onclick = () => { viewMonth = m ? [y, m - 1] : [y - 1, 11]; renderKalender(); };
  document.getElementById("next").onclick = () => { viewMonth = m < 11 ? [y, m + 1] : [y + 1, 0]; renderKalender(); };
}

// ---------- Überstunden ----------
let ueberView = "wochen", viewYear = +todayKey().slice(0, 4);

// Single series: balance at each month end. The month list below is the table view of the same data.
function balanceChart(months) {
  const W = 340, H = 170, L = 40, R = 14, T = 12, B = 24;
  const active = months.filter(m => m.active), vals = [0, ...active.map(m => m.balance)];
  const min = Math.min(...vals), max = Math.max(...vals), range = Math.max(max - min, 60);
  const step = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].map(h => h * 60).find(s => Math.ceil(range / s) <= 4) || 120000;
  const lo = Math.floor(min / step) * step, hi = Math.max(Math.ceil(max / step) * step, lo + step);
  const x = m => L + m * (W - L - R) / 11, y = v => T + (hi - v) * (H - T - B) / (hi - lo);
  let grid = "";
  for (let v = lo; v <= hi; v += step) {
    const label = (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v / 60);
    grid += `<line class="${v === 0 ? "zero" : "grid"}" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"></line><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${label} h</text>`;
  }
  const path = active.map((m, i) => `${i ? "L" : "M"}${x(m.month).toFixed(1)} ${y(m.balance).toFixed(1)}`).join(" ");
  const last = active[active.length - 1];
  const hits = active.map(m => `<rect class="hit" data-m="${m.month}" x="${x(m.month) - (W - L - R) / 22}" y="0" width="${(W - L - R) / 11}" height="${H}"></rect>`).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Überstunden-Saldo am Monatsende">
    ${grid}
    ${"JFMAMJJASOND".split("").map((c, i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${c}</text>`).join("")}
    <path class="line" d="${path}"></path>
    <line class="cross" id="yr-cross" x1="${x(last.month)}" x2="${x(last.month)}" y1="${T}" y2="${H - B}"></line>
    <circle class="dot" id="yr-dot" r="4" cx="${x(last.month)}" cy="${y(last.balance)}"></circle>
    ${hits}
  </svg>`;
}

function yearHtml(cls) {
  const S = state.settings, t = todayKey();
  const months = C.yearOverview(state.days, state.corrections, S, viewYear, t, nowHHMM());
  const active = months.filter(m => m.active), last = active[active.length - 1];
  const vac = C.vacationSummary(state.days, viewYear, S, t);
  return `
    <div class="monthbar"><button class="icon-btn" id="yprev" aria-label="Vorheriges Jahr">‹</button><h2>${viewYear}</h2><button class="icon-btn" id="ynext" aria-label="Nächstes Jahr">›</button></div>
    ${active.length ? `<div class="panel">
      <p class="tip" id="yr-tip">${MON[last.month]}: Saldo <span class="num">${C.fmtSigned(last.balance)}</span></p>
      ${balanceChart(months)}
    </div>
    <div class="panel">${active.slice().reverse().map(m => `
      <div class="wk"><span class="k">${MON_SHORT[m.month]}</span><span class="d">Ist <span class="num">${C.fmt(m.ist)}</span></span>
        <span class="x ${cls(m.overtime)}">${C.fmtSigned(m.overtime)}</span></div>`).join("")}</div>
    <p class="rule">Plus/Minus pro Monat inklusive Korrekturen. Eine Woche über zwei Monate zählt ganz zu dem Monat, in dem ihr Donnerstag liegt.</p>`
    : `<p class="empty-state">Für ${viewYear} gibt es keine Einträge.</p>`}
    <div class="panel">
      <div class="row"><span>Urlaub ${viewYear}</span><span class="num">${vac.total} Tage</span></div>
      <div class="row"><span>Genommen</span><span class="num">${vac.used}</span></div>
      <div class="row"><span>Geplant</span><span class="num">${vac.planned}</span></div>
      <div class="row total"><span>Übrig</span><span class="num">${vac.left}</span></div>
    </div>
    ${vac.total ? "" : `<p class="rule">Trage deine Urlaubstage in den Einstellungen ein (Zahnrad oben rechts).</p>`}`;
}

function bindYear() {
  const prev = document.getElementById("yprev");
  if (!prev) return;
  prev.onclick = () => { viewYear--; renderUeber(); };
  document.getElementById("ynext").onclick = () => { viewYear++; renderUeber(); };
  const svg = document.querySelector(".chart");
  if (!svg) return;
  const months = C.yearOverview(state.days, state.corrections, state.settings, viewYear, todayKey(), nowHHMM());
  const show = r => {
    const m = months[+r.dataset.m], cx = +r.getAttribute("x") + +r.getAttribute("width") / 2;
    const path = svg.querySelector(".line"), dot = document.getElementById("yr-dot"), cross = document.getElementById("yr-cross");
    const pts = path.getAttribute("d").split(/[ML]/).filter(Boolean).map(p => p.trim().split(" ").map(Number));
    const pt = pts.find(p => Math.abs(p[0] - cx) < 1);
    dot.setAttribute("cx", pt[0]); dot.setAttribute("cy", pt[1]);
    cross.setAttribute("x1", pt[0]); cross.setAttribute("x2", pt[0]);
    document.getElementById("yr-tip").innerHTML = `${MON[m.month]}: Saldo <span class="num">${C.fmtSigned(m.balance)}</span>`;
  };
  svg.querySelectorAll(".hit").forEach(r => { r.onclick = () => show(r); r.onpointerenter = () => show(r); });
}

function renderUeber() {
  const el = document.getElementById("t-ueber"), S = state.settings;
  const ws = C.weeks(state.days, S, todayKey(), nowHHMM());
  const bal = C.balance(ws, state.corrections);
  const cls = v => v > 0 ? "pos" : v < 0 ? "neg" : "zero";
  const target = S.weeklyH * 60, cap = target * (1 + S.coveredPct / 100);
  el.innerHTML = `
    <div class="saldo"><div class="v ${cls(bal)}">${C.fmtSigned(bal)}</div><div class="cap">Überstunden-Saldo (Std:Min)</div></div>
    <div class="seg two"><button data-v="wochen" aria-pressed="${ueberView === "wochen"}">Wochen</button><button data-v="jahr" aria-pressed="${ueberView === "jahr"}">Jahr</button></div>
    ${ueberView === "jahr" ? yearHtml(cls) : `<p class="rule">Soll ${C.fmt(target)} pro Woche. Bis ${C.fmt(cap)} (+${S.coveredPct} %) ist mit dem Gehalt abgegolten, nur darüber zählt als Überstunden. Unter ${C.fmt(target)} zählt als Minusstunden. Die laufende Woche zählt erst, wenn sie vorbei ist. In der Woche deines ersten Eintrags zählen nur die Werktage ab diesem Tag. Feiertage von Mo–Fr zählen automatisch.</p>
    <div class="actions"><button id="addCorr">Korrektur eintragen</button></div>
    ${state.corrections.length ? `<div class="panel">${state.corrections.slice().sort((a, b) => b.date.localeCompare(a.date)).map(c => `
      <div class="wk corr" role="button" tabindex="0" data-corr="${esc(c.id)}"><span class="k">Korrektur</span>
        <span class="d">${dateDE(c.date)}${c.note ? " · " + esc(c.note) : ""}</span>
        <span class="x ${cls(c.min)}">${C.fmtSigned(c.min)}</span></div>`).join("")}</div>` : ""}
    ${ws.length ? `<div class="panel">${ws.slice().reverse().map(w => `
      <div class="wk"><span class="k">KW ${w.kw}${w.delta === null ? '<span class="pill">läuft</span>' : ""}</span>
        <span class="d">ab ${dateDE(w.monday).slice(0, 6)}${w.target !== target ? ` · Soll <span class="num">${C.fmt(w.target)}</span>` : ""} · Ist <span class="num">${C.fmt(w.ist)}</span>${w.abbau ? ` · Abbau <span class="num">${C.fmt(w.abbau)}</span>` : ""}</span>
        <span class="x ${w.delta === null ? "zero" : cls(w.delta)}">${w.delta === null ? "–" : C.fmtSigned(w.delta)}</span></div>`).join("")}
    </div>` : `<p class="empty-state">Noch keine Einträge. Checke im Tab „Heute“ ein, dann erscheinen hier deine Wochen.</p>`}`}`;
  el.querySelectorAll("[data-v]").forEach(b => b.onclick = () => { ueberView = b.dataset.v; renderUeber(); });
  bindYear();
  const add = document.getElementById("addCorr");
  if (add) add.onclick = () => openCorrection(null);
  el.querySelectorAll("[data-corr]").forEach(r => {
    r.onclick = () => openCorrection(r.dataset.corr);
    r.onkeydown = ev => { if (ev.key === "Enter") openCorrection(r.dataset.corr); };
  });
}

// ---------- Korrektur (Startsaldo, Auszahlung) ----------
function openCorrection(id) {
  const old = state.corrections.find(c => c.id === id);
  const host = document.getElementById("sheetHost");
  const c = { date: old ? old.date : todayKey(), sign: old && old.min < 0 ? -1 : 1, h: old ? Math.floor(Math.abs(old.min) / 60) : "",
    m: old ? Math.abs(old.min) % 60 : "", note: old ? old.note : "" };
  let error = "";
  const close = () => { host.innerHTML = ""; };
  const draw = () => {
    host.innerHTML = `<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-label="Korrektur">
      <h3>Korrektur</h3>
      <p class="rule">Für deinen Startsaldo (Plus oder Minus) oder ausgezahlte Stunden (Minus). Zählt sofort im Saldo.</p>
      <div class="seg two"><button data-s="1" aria-pressed="${c.sign > 0}">+ Stunden</button><button data-s="-1" aria-pressed="${c.sign < 0}">− Stunden</button></div>
      <div class="fields">
        <label class="full">Datum<input id="c-date" type="date" value="${esc(c.date)}"></label>
        <label>Stunden<input id="c-h" type="number" inputmode="numeric" min="0" value="${esc(c.h)}"></label>
        <label>Minuten<input id="c-m" type="number" inputmode="numeric" min="0" max="59" value="${esc(c.m)}"></label>
        <label class="full">Notiz<input id="c-note" type="text" maxlength="60" value="${esc(c.note)}"></label>
      </div>
      ${error ? `<p class="error">${error}</p>` : ""}
      <div class="actions">${old ? '<button class="danger" id="c-del">Löschen</button>' : ""}<button id="c-cancel">Abbrechen</button><button class="primary" id="c-save">Speichern</button></div>
    </div></div>`;
    const v = i => document.getElementById(i);
    const read = () => { c.date = v("c-date").value; c.h = v("c-h").value; c.m = v("c-m").value; c.note = v("c-note").value; };
    host.querySelectorAll("[data-s]").forEach(b => b.onclick = () => { read(); c.sign = +b.dataset.s; draw(); });
    v("c-cancel").onclick = close;
    v("scrim").onclick = ev => { if (ev.target.id === "scrim") close(); };
    if (old) v("c-del").onclick = () => { state.corrections = state.corrections.filter(x => x !== old); save(); close(); renderAll(); };
    v("c-save").onclick = () => {
      read();
      const hours = parseInt(c.h, 10) || 0, mins = parseInt(c.m, 10) || 0, total = hours * 60 + mins;
      if (!c.date) { error = "Bitte ein Datum eintragen."; return draw(); }
      if (hours < 0 || mins < 0 || mins > 59 || !total) { error = "Bitte Stunden und Minuten (0–59) eintragen."; return draw(); }
      const entry = { id: old ? old.id : Date.now().toString(36), date: c.date, min: c.sign * total, note: c.note.trim() };
      state.corrections = old ? state.corrections.map(x => x === old ? entry : x) : [...state.corrections, entry];
      save(); close(); renderAll();
    };
  };
  draw();
}

// ---------- Tag bearbeiten ----------
function openDay(k) {
  const d = JSON.parse(JSON.stringify(state.days[k] || { type: "arbeit", start: "", end: "" }));
  const host = document.getElementById("sheetHost"), dt = C.D(k), S = state.settings, hol = C.holidayOn(k, S.bundesland);
  let error = "";
  const close = () => { host.innerHTML = ""; };
  const draw = () => {
    const work = d.type === "arbeit";
    const present = work && d.start && d.end ? C.toMin(d.end) - C.toMin(d.start) : 0;
    const legal = C.legalPause(present), pause = C.effectivePause(present, d.pause);
    host.innerHTML = `<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-label="Tag bearbeiten">
      <h3>${DOW_LONG[dt.getUTCDay()]}, ${dateDE(k)} · KW ${C.isoWeek(k)}</h3>
      ${hol ? `<p class="holiday-note">${hol.name}${C.isWeekday(k) ? ` · zählt immer ${C.fmt(S.offDayH * 60)}` : ""}</p>` : ""}
      <div class="seg five">${Object.keys(TYPES).map(t => `<button data-t="${t}" aria-pressed="${d.type === t}">${TYPES[t]}</button>`).join("")}</div>
      ${work ? `<div class="fields">
        <label>Beginn<input id="f-start" type="time" value="${d.start || ""}"></label>
        <label>Ende<input id="f-end" type="time" value="${d.end || ""}"></label>
        <label class="full">Pause in Minuten (gesetzlich mind. ${legal})<input id="f-pause" type="number" inputmode="numeric" min="${legal}" step="5" value="${pause}"></label>
      </div>
      <div class="result"><span>Arbeitszeit</span><b>${present > 0 ? C.fmt(present - pause) : "–"}</b></div>`
      : d.type === "abbau" ? `<div class="fields"><label class="full">Stunden abbauen<input id="f-hours" inputmode="decimal" value="${String(d.hours ?? S.offDayH).replace(".", ",")}"></label></div>
      <div class="result"><span>Geht vom Saldo ab</span><b>${hol && C.isWeekday(k) ? "0:00" : C.fmt(-(d.hours ?? S.offDayH) * 60)}</b></div>`
      : `<div class="result"><span>Zählt als</span><b>${C.fmt(S.offDayH * 60)}</b></div>`}
      ${C.warnings(k, { ...state.days, [k]: d }, S).map(w => `<p class="holiday-note">${WARN} ${w}</p>`).join("")}
      ${error ? `<p class="error">${error}</p>` : ""}
      <div class="actions"><button class="danger" id="del">Löschen</button><button id="cancel">Abbrechen</button><button class="primary" id="save">Speichern</button></div>
    </div></div>`;
    host.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { d.type = b.dataset.t; error = ""; draw(); });
    const s = document.getElementById("f-start"), e = document.getElementById("f-end"), p = document.getElementById("f-pause");
    if (s) {
      s.onchange = () => { d.start = s.value; error = ""; draw(); };
      e.onchange = () => { d.end = e.value; error = ""; draw(); };
      // Only a value above the legal minimum is stored as a manual pause.
      p.onchange = () => { const v = Math.max(0, parseInt(p.value, 10) || 0); d.pause = v > legal ? v : null; draw(); };
    }
    const h = document.getElementById("f-hours");
    if (h) h.onchange = () => {
      const v = parseFloat(h.value.replace(",", "."));
      if (isFinite(v) && v > 0 && v <= 24) { d.hours = v; error = ""; } else error = "Bitte Stunden zwischen 0 und 24 eintragen.";
      draw();
    };
    document.getElementById("cancel").onclick = close;
    document.getElementById("scrim").onclick = ev => { if (ev.target.id === "scrim") close(); };
    document.getElementById("del").onclick = () => { delete state.days[k]; save(); close(); renderAll(); };
    document.getElementById("save").onclick = () => {
      if (d.type === "arbeit") {
        if (!d.start) { error = "Bitte einen Beginn eintragen."; return draw(); }
        if (d.end && C.toMin(d.end) <= C.toMin(d.start)) { error = "Das Ende muss nach dem Beginn liegen."; return draw(); }
        if (!d.end && k !== todayKey()) { error = "Bitte ein Ende eintragen."; return draw(); }
        state.days[k] = { type: "arbeit", start: d.start, end: d.end || null, pause: d.pause || null };
      } else if (d.type === "abbau") {
        if (error) return draw();
        state.days[k] = { type: "abbau", hours: d.hours ?? S.offDayH };
      } else state.days[k] = { type: d.type };
      save(); close(); renderAll();
    };
  };
  draw();
}

// ---------- Einstellungen ----------
function openSettings() {
  const host = document.getElementById("sheetHost"), S = state.settings, thisYear = +todayKey().slice(0, 4);
  const close = () => { host.innerHTML = ""; renderAll(); };
  host.innerHTML = `<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-label="Einstellungen">
    <h3>Einstellungen</h3>
    <div class="panel">
      <div class="row set-row"><span>Bundesland</span><select id="s-land" aria-label="Bundesland">${Object.entries(C.LANDS).map(([c, n]) => `<option value="${c}" ${c === S.bundesland ? "selected" : ""}>${n}</option>`).join("")}</select></div>
      <div class="row set-row"><span>Soll pro Woche (h)</span><input id="s-weeklyH" value="${S.weeklyH}" inputmode="decimal"></div>
      <div class="row set-row"><span>Mit Gehalt abgegolten (%)</span><input id="s-coveredPct" value="${S.coveredPct}" inputmode="decimal"></div>
      <div class="row set-row"><span>Stunden pro Arbeitstag<small style="display:block;font-size:12px">auch für Urlaub/Krank/Feiertag</small></span><input id="s-offDayH" value="${S.offDayH}" inputmode="decimal"></div>
    </div>
    <div class="panel">
      <div class="row set-row"><span>Urlaubstage pro Jahr</span><input id="s-vacationDays" value="${S.vacationDays}" inputmode="decimal"></div>
      <div class="row set-row"><span>Resturlaub aus ${thisYear - 1}</span><input id="s-carry" value="${(S.vacationCarry || {})[thisYear] || 0}" inputmode="decimal"></div>
    </div>
    <div class="actions"><button class="primary" id="csv">CSV exportieren</button></div>
    <div class="actions"><button id="backup">Backup speichern</button><button id="restore">Backup laden</button></div>
    <p class="rule">Deine Daten liegen nur auf diesem Handy. Speichere ab und zu ein Backup, denn wenn Chrome seine Daten löscht, sind die Zeiten weg.</p>
    <div class="actions"><button id="close">Schließen</button></div>
  </div></div>`;
  ["weeklyH", "coveredPct", "offDayH", "vacationDays"].forEach(f => {
    const inp = document.getElementById("s-" + f);
    inp.onchange = () => {
      const v = parseFloat(inp.value.replace(",", "."));
      if (isFinite(v) && v >= 0 && v <= 100) { state.settings[f] = v; save(); toast("Gespeichert"); }
      else { inp.value = state.settings[f]; toast("Bitte eine Zahl zwischen 0 und 100 eingeben."); }
    };
  });
  const carry = document.getElementById("s-carry");
  carry.onchange = () => {
    const v = parseFloat(carry.value.replace(",", "."));
    if (isFinite(v) && v >= 0 && v <= 100) { state.settings.vacationCarry = { ...S.vacationCarry, [thisYear]: v }; save(); toast("Gespeichert"); }
    else { carry.value = (S.vacationCarry || {})[thisYear] || 0; toast("Bitte eine Zahl zwischen 0 und 100 eingeben."); }
  };
  document.getElementById("s-land").onchange = ev => { state.settings.bundesland = ev.target.value; save(); toast("Gespeichert"); };
  document.getElementById("close").onclick = close;
  document.getElementById("scrim").onclick = ev => { if (ev.target.id === "scrim") close(); };
  document.getElementById("csv").onclick = exportCsv;
  document.getElementById("backup").onclick = saveBackup;
  document.getElementById("restore").onclick = () => document.getElementById("restoreFile").click();
}

function saveBackup() {
  state.lastBackup = todayKey(); save();
  download(`stempeluhr-backup_${todayKey()}.json`, JSON.stringify({ app: "stempeluhr", version: 1, ...state }, null, 1), "application/json");
}

document.getElementById("restoreFile").onchange = async ev => {
  const f = ev.target.files[0]; ev.target.value = "";
  if (!f) return;
  try {
    const s = JSON.parse(await f.text());
    if (!s || s.app !== "stempeluhr" || typeof s.days !== "object") throw new Error("Keine Stempeluhr-Backup-Datei.");
    const n = Object.keys(s.days).length;
    if (!confirm(`Backup mit ${n} Tagen laden? Die aktuellen Einträge werden ersetzt.`)) return;
    state = normalize(s);
    save(); document.getElementById("sheetHost").innerHTML = ""; renderAll(); toast(`${n} Tage geladen`);
  } catch (e) { toast("Laden fehlgeschlagen: " + e.message); }
};

function exportCsv() {
  const S = state.settings;
  const rows = ["Datum;Tag;KW;Art;Beginn;Ende;Pause (min);Netto (h)"];
  const keys = Object.keys(state.days).sort(), t = todayKey();
  if (keys.length) C.dayRows(state.days, S, keys[0], keys[keys.length - 1] > t ? keys[keys.length - 1] : t, t).forEach(r => {
    rows.push([dateDE(r.key), DOW[C.D(r.key).getUTCDay()], C.isoWeek(r.key), r.holiday ? `Feiertag (${r.holiday})` : r.abbau ? `Abbau (${C.fmt(r.abbau)} h)` : TYPES[r.type],
      r.start, r.end, r.pause ?? "", (r.net / 60).toFixed(2).replace(".", ",")].join(";"));
  });
  // BOM + semicolons + decimal comma so German Excel opens it correctly.
  download(`zeiten_${todayKey()}.csv`, "﻿" + rows.join("\r\n"), "text/csv;charset=utf-8");
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast(name + " gespeichert");
}

function toast(t) {
  const e = document.createElement("div"); e.className = "toast"; e.textContent = t;
  document.body.appendChild(e); setTimeout(() => e.remove(), 2400);
}

// ---------- tabs + lifecycle ----------
const MON_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const TITLES = { heute: "Heute", kalender: "Kalender", ueber: "Überstunden" };
function go(tab) {
  document.querySelectorAll("section[data-tab]").forEach(s => s.hidden = s.dataset.tab !== tab);
  document.querySelectorAll("[data-go]").forEach(b => b.setAttribute("aria-selected", b.dataset.go === tab));
  document.getElementById("hdr").textContent = TITLES[tab];
}
function renderAll() {
  const t = todayKey(), d = C.D(t);
  document.getElementById("sub").textContent = `${DOW_LONG[d.getUTCDay()]}, ${d.getUTCDate()}. ${MON[d.getUTCMonth()]} · KW ${C.isoWeek(t)}`;
  renderHeute(); renderKalender(); renderUeber();
}
document.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
document.getElementById("gear").onclick = openSettings;
// Refresh the live clock unless a sheet is open (it would wipe unsaved input).
// Also skip while a time picker is open, or the re-render would drop the picked value.
const canRefresh = () => !document.getElementById("sheetHost").innerHTML && Date.now() > pickerOpenUntil;
setInterval(() => { if (canRefresh()) renderAll(); }, 20000);
document.addEventListener("visibilitychange", () => { if (!document.hidden && canRefresh()) renderAll(); });
renderAll();

if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
if ("serviceWorker" in navigator) {
  // When a new version takes over, reload once so the phone shows it right away.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController && !reloaded && canRefresh()) { reloaded = true; location.reload(); }
  });
  navigator.serviceWorker.register("sw.js").then(r => r.update()).catch(() => {});
}
