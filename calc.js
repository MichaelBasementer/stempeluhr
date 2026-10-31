// Pure calculation rules. No DOM, no storage — tested by tests.html and test-calc.js.
(function (root) {
  const DEFAULTS = { weeklyH: 32, coveredPct: 10, offDayH: 8, bundesland: "HE", vacationDays: 0, vacationCarry: {} };
  const LANDS = { BW: "Baden-Württemberg", BY: "Bayern", BE: "Berlin", BB: "Brandenburg", HB: "Bremen", HH: "Hamburg",
    HE: "Hessen", MV: "Mecklenburg-Vorpommern", NI: "Niedersachsen", NW: "Nordrhein-Westfalen", RP: "Rheinland-Pfalz",
    SL: "Saarland", SN: "Sachsen", ST: "Sachsen-Anhalt", SH: "Schleswig-Holstein", TH: "Thüringen" };

  const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

  function fmt(m) {
    const sign = m < 0 ? "−" : "";
    m = Math.abs(Math.round(m));
    return sign + Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0");
  }
  const fmtSigned = m => (Math.round(m) > 0 ? "+" : "") + fmt(m);

  // § 4 ArbZG, hard steps on time present: > 6 h → 30 min, > 9 h → 45 min.
  const legalPause = presentMin => presentMin > 9 * 60 ? 45 : presentMin > 6 * 60 ? 30 : 0;

  // A manual pause can only raise the legal minimum, never lower it.
  const effectivePause = (presentMin, manual) => Math.max(legalPause(presentMin), manual || 0);

  // Net minutes for one day entry. endOverride is used for a running day ("now").
  function netMinutes(day, settings, endOverride) {
    if (!day || day.type === "abbau") return 0;
    if (day.type && day.type !== "arbeit") return settings.offDayH * 60;
    const end = day.end || endOverride;
    if (!day.start || !end) return 0;
    const present = toMin(end) - toMin(day.start);
    if (present <= 0) return 0;
    return present - effectivePause(present, day.pause);
  }

  // Under target → minus; target..target+covered% → 0; above → only the excess over that.
  // targetMin is the week's target (shortened in the start week), default the weekly target.
  function weekDelta(istMin, settings, targetMin) {
    const target = targetMin ?? settings.weeklyH * 60;
    const cap = target + target * settings.coveredPct / 100;
    if (istMin < target) return istMin - target;
    if (istMin <= cap) return 0;
    return istMin - cap;
  }

  // ---- date keys "YYYY-MM-DD", arithmetic at UTC noon so DST never shifts a day ----
  const D = k => new Date(k + "T12:00:00Z");
  const key = d => d.toISOString().slice(0, 10);
  const addDays = (k, n) => { const d = D(k); d.setUTCDate(d.getUTCDate() + n); return key(d); };
  const mondayOf = k => { const d = D(k); return addDays(k, -((d.getUTCDay() + 6) % 7)); };
  function isoWeek(k) {
    const d = D(k);
    const thu = new Date(d); thu.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
    const jan4 = new Date(Date.UTC(thu.getUTCFullYear(), 0, 4, 12));
    return 1 + Math.round(((thu - jan4) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  }

  // The week of the first entry only owes the weekdays Mo–Fr from that entry on × hours per day,
  // capped at the weekly target. Every other week owes the full weekly target.
  function weekTarget(monday, firstKey, settings) {
    const full = settings.weeklyH * 60;
    if (!firstKey || mondayOf(firstKey) !== monday) return full;
    let days = 0;
    for (let i = 0; i < 5; i++) if (addDays(monday, i) >= firstKey) days++;
    return Math.min(full, days * settings.offDayH * 60);
  }

  // ---- public holidays (statewide ones only; moving dates follow from Easter) ----
  function easter(year) { // anonymous Gregorian algorithm
    const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
    const g = Math.floor((8 * b + 13) / 25), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const n = h + l - 7 * m + 114;
    return `${year}-${String(Math.floor(n / 31)).padStart(2, "0")}-${String(n % 31 + 1).padStart(2, "0")}`;
  }

  const holidayCache = {};
  function holidays(year, land) {
    const id = year + land;
    if (holidayCache[id]) return holidayCache[id];
    const out = {}, os = easter(year);
    const add = (k, name, short, only) => { if (!only || only.split(" ").includes(land)) out[k] = { name, short }; };
    const fix = (mmdd, ...rest) => add(`${year}-${mmdd}`, ...rest);
    fix("01-01", "Neujahr", "Neujahr");
    fix("01-06", "Heilige Drei Könige", "3 Könige", "BW BY ST");
    fix("03-08", "Internationaler Frauentag", "Frauent", "BE MV");
    add(addDays(os, -2), "Karfreitag", "Karfr");
    add(os, "Ostersonntag", "Ostern", "BB HE");
    add(addDays(os, 1), "Ostermontag", "Osterm");
    fix("05-01", "Tag der Arbeit", "1. Mai");
    add(addDays(os, 39), "Christi Himmelfahrt", "Himmelf");
    add(addDays(os, 49), "Pfingstsonntag", "Pfingst", "BB HE");
    add(addDays(os, 50), "Pfingstmontag", "Pfingstm");
    add(addDays(os, 60), "Fronleichnam", "Fronl", "BW BY HE NW RP SL");
    fix("08-15", "Mariä Himmelfahrt", "M.Himm", "SL");
    fix("09-20", "Weltkindertag", "Kindert", "TH");
    fix("10-03", "Tag der Deutschen Einheit", "Einheit");
    fix("10-31", "Reformationstag", "Reform", "BB HB HH MV NI SN ST SH TH");
    fix("11-01", "Allerheiligen", "Allerh", "BW BY NW RP SL");
    let bb = `${year}-11-22`; // Buß- und Bettag: the Wednesday before 23 November
    while (D(bb).getUTCDay() !== 3) bb = addDays(bb, -1);
    add(bb, "Buß- und Bettag", "Bußtag", "SN");
    fix("12-25", "1. Weihnachtstag", "1.Weihn");
    fix("12-26", "2. Weihnachtstag", "2.Weihn");
    return holidayCache[id] = out;
  }
  const holidayOn = (k, land) => holidays(+k.slice(0, 4), land)[k] || null;

  const firstEntry = days => Object.keys(days).sort()[0] || null;
  const isWeekday = k => { const w = D(k).getUTCDay(); return w >= 1 && w <= 5; };

  // A Mo–Fr holiday counts from the day itself, and only from the first entry on.
  function holidayCounts(k, settings, ctx) {
    return !!holidayOn(k, settings.bundesland) && isWeekday(k) && !!ctx.firstKey && k >= ctx.firstKey && k <= ctx.todayKey;
  }

  // What a day counts. ctx = { firstKey, todayKey, now }. A counting holiday stays at one
  // workday even with times entered.
  function dayMinutes(k, day, settings, ctx) {
    if (holidayCounts(k, settings, ctx)) return settings.offDayH * 60;
    return netMinutes(day, settings, k === ctx.todayKey ? ctx.now : null);
  }

  function weekIst(days, monday, settings, todayKey, nowHHMM) {
    const ctx = { firstKey: firstEntry(days), todayKey, now: nowHHMM };
    let t = 0;
    for (let i = 0; i < 7; i++) { const k = addDays(monday, i); t += dayMinutes(k, days[k], settings, ctx); }
    return t;
  }

  // Abbau hours of a week. A counting holiday wins, so nothing is taken off on that day.
  function weekAbbau(days, monday, settings, todayKey) {
    const ctx = { firstKey: firstEntry(days), todayKey };
    let t = 0;
    for (let i = 0; i < 7; i++) {
      const k = addDays(monday, i), d = days[k];
      if (d && d.type === "abbau" && !holidayCounts(k, settings, ctx)) t += (d.hours ?? settings.offDayH) * 60;
    }
    return t;
  }

  const isWorkday = (k, land) => isWeekday(k) && !holidayOn(k, land);
  const isPlanned = d => !!d && d.type === "urlaub" && d.status === "geplant";

  // Vacation days of a year: only Mo–Fr that are no public holiday use up a day.
  // Geplant counts as planned whatever the date; entries without a status are confirmed.
  function vacationSummary(days, year, settings, todayKey) {
    const total = settings.vacationDays + ((settings.vacationCarry || {})[year] || 0);
    let used = 0, confirmed = 0, planned = 0;
    for (const k of Object.keys(days)) {
      if (days[k].type !== "urlaub" || !k.startsWith(year + "-") || !isWorkday(k, settings.bundesland)) continue;
      if (isPlanned(days[k])) planned++; else if (k <= todayKey) used++; else confirmed++;
    }
    return { total, used, confirmed, planned, left: total - used - confirmed - planned };
  }

  // Workdays marked geplant, oldest first: what a Urlaubsantrag can contain.
  const plannedVacation = (days, land) => Object.keys(days).sort().filter(k => isPlanned(days[k]) && isWorkday(k, land));

  // Groups days into periods. Weekends and holidays in between do not split a period.
  function vacationPeriods(keys, land) {
    const out = [];
    for (const k of [...keys].sort()) {
      const cur = out[out.length - 1];
      if (cur) {
        let gap = addDays(cur.to, 1);
        while (gap < k && !isWorkday(gap, land)) gap = addDays(gap, 1);
        if (gap === k) { cur.to = k; cur.days++; continue; }
      }
      out.push({ from: k, to: k, days: 1 });
    }
    return out;
  }

  // ArbZG hints only: over 10 h in a day, under 11 h rest. Nothing is calculated from these.
  function warnings(k, days, settings, now) {
    const d = days[k], out = [];
    if (!d || d.type !== "arbeit" || !d.start) return out;
    const net = netMinutes(d, settings, now || null);
    if (net > 600) out.push(`Über 10 h Arbeitszeit (${fmt(net)})`);
    const p = days[addDays(k, -1)];
    if (p && p.type === "arbeit" && p.end) {
      const rest = 1440 - toMin(p.end) + toMin(d.start);
      if (rest < 660) out.push(`Nur ${fmt(rest)} h Ruhezeit seit gestern (mind. 11 h)`);
    }
    return out;
  }

  // One row per day in [from, to] for the CSV and the PDF, including automatic holidays.
  function dayRows(days, settings, from, to, todayKey) {
    const ctx = { firstKey: firstEntry(days), todayKey, now: null }, out = [];
    for (let k = from; k <= to; k = addDays(k, 1)) {
      const d = days[k], counts = holidayCounts(k, settings, ctx);
      const worked = d && d.type === "arbeit" && d.end;
      if (!counts && (!d || (d.type === "arbeit" && !d.end))) continue;
      out.push({ key: k, type: counts ? "feiertag" : d.type, holiday: counts ? holidayOn(k, settings.bundesland).name : "",
        start: worked ? d.start : "", end: worked ? d.end : "",
        pause: worked ? effectivePause(toMin(d.end) - toMin(d.start), d.pause) : null,
        net: dayMinutes(k, d, settings, ctx),
        abbau: !counts && d.type === "abbau" ? (d.hours ?? settings.offDayH) * 60 : 0,
        planned: !counts && isPlanned(d) });
    }
    return out;
  }

  // All weeks from the first entry up to the current one. The current week has delta null
  // (shown live, added to the balance only once it is over).
  function weeks(days, settings, todayKey, nowHHMM) {
    const keys = Object.keys(days).sort();
    if (!keys.length) return [];
    const cur = mondayOf(todayKey);
    const out = [];
    for (let m = mondayOf(keys[0]); m <= cur; m = addDays(m, 7)) {
      const ist = weekIst(days, m, settings, todayKey, nowHHMM);
      // Abbau lowers the week's target and comes off the balance exactly, whatever else was worked.
      const abbau = weekAbbau(days, m, settings, todayKey);
      const target = Math.max(0, weekTarget(m, keys[0], settings) - abbau);
      out.push({ monday: m, kw: isoWeek(m), ist, target, abbau, delta: m === cur ? null : weekDelta(ist, settings, target) - abbau });
    }
    return out;
  }

  // Finished weeks plus manual corrections (starting balance, payouts).
  const balance = (ws, corrections = []) =>
    ws.reduce((a, w) => a + (w.delta ?? 0), 0) + corrections.reduce((a, c) => a + c.min, 0);

  // Remind after n days without a backup, counted from the first entry if there never was one.
  function backupDue(lastBackup, firstKey, todayKey, n = 7) {
    const ref = lastBackup || firstKey;
    return !!ref && (D(todayKey) - D(ref)) / 864e5 >= n;
  }

  // One entry per month. A finished week stays whole: its overtime goes to the month of its
  // Thursday. Corrections go to the month of their date. balance is the running total at month end.
  function yearOverview(days, corrections, settings, year, todayKey, now) {
    const ws = weeks(days, settings, todayKey, now), ctx = { firstKey: firstEntry(days), todayKey, now };
    const first = [ctx.firstKey, ...corrections.map(c => c.date)].filter(Boolean).sort()[0] || null;
    const jan1 = `${year}-01-01`, thu = w => addDays(w.monday, 3);
    let running = ws.filter(w => w.delta !== null && thu(w) < jan1).reduce((a, w) => a + w.delta, 0)
      + corrections.filter(c => c.date < jan1).reduce((a, c) => a + c.min, 0);
    const months = [];
    for (let m = 0; m < 12; m++) {
      const from = `${year}-${String(m + 1).padStart(2, "0")}-01`, to = key(new Date(Date.UTC(year, m + 1, 0, 12)));
      let ist = 0;
      for (let k = from; k <= to; k = addDays(k, 1)) ist += dayMinutes(k, days[k], settings, ctx);
      const inMonth = x => x >= from && x <= to;
      const overtime = ws.filter(w => w.delta !== null && inMonth(thu(w))).reduce((a, w) => a + w.delta, 0)
        + corrections.filter(c => inMonth(c.date)).reduce((a, c) => a + c.min, 0);
      running += overtime;
      const active = !!first && to >= first && from <= todayKey;
      months.push({ month: m, ist, overtime, active, balance: active ? running : null });
    }
    return months;
  }

  const api = { DEFAULTS, LANDS, easter, holidays, holidayOn, holidayCounts, firstEntry, isWeekday, dayMinutes, dayRows, toMin, fmt, fmtSigned, legalPause, effectivePause, netMinutes, weekDelta,
    D, key, addDays, mondayOf, isoWeek, weekTarget, weekAbbau, vacationSummary, plannedVacation, vacationPeriods, isPlanned, warnings, yearOverview, weekIst, weeks, balance, backupDue };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Calc = api;
})(this);
