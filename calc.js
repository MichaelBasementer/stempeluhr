// Pure calculation rules. No DOM, no storage — tested by tests.html and test-calc.js.
(function (root) {
  const DEFAULTS = { weeklyH: 32, coveredPct: 10, offDayH: 8 };

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
    if (!day) return 0;
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
    const cap = target * (1 + settings.coveredPct / 100);
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

  function weekIst(days, monday, settings, todayKey, nowHHMM) {
    let t = 0;
    for (let i = 0; i < 7; i++) {
      const k = addDays(monday, i);
      t += netMinutes(days[k], settings, k === todayKey ? nowHHMM : null);
    }
    return t;
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
      const target = weekTarget(m, keys[0], settings);
      out.push({ monday: m, kw: isoWeek(m), ist, target, delta: m === cur ? null : weekDelta(ist, settings, target) });
    }
    return out;
  }

  const balance = ws => ws.reduce((a, w) => a + (w.delta ?? 0), 0);

  const api = { DEFAULTS, toMin, fmt, fmtSigned, legalPause, effectivePause, netMinutes, weekDelta,
    D, key, addDays, mondayOf, isoWeek, weekTarget, weekIst, weeks, balance };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Calc = api;
})(this);
