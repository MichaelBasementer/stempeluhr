// Run with: node test-calc.js   (tests.html runs the same cases in the browser)
const C = typeof module !== "undefined" ? require("./calc.js") : window.Calc;
const S = C.DEFAULTS;
const W = (start, end, pause) => ({ type: "arbeit", start, end, pause });

const cases = [
  ["6:00 anwesend → 0 Pause", C.legalPause(360), 0],
  ["6:01 anwesend → 30 Pause", C.legalPause(361), 30],
  ["9:00 anwesend → 30 Pause", C.legalPause(540), 30],
  ["9:01 anwesend → 45 Pause", C.legalPause(541), 45],
  ["Manuelle Pause 15 bei 8 h → 30", C.effectivePause(480, 15), 30],
  ["Manuelle Pause 60 bei 8 h → 60", C.effectivePause(480, 60), 60],
  ["07:30–16:00 → 8:00 netto", C.netMinutes(W("07:30", "16:00"), S), 480],
  ["07:00–17:00 → 9:15 netto", C.netMinutes(W("07:00", "17:00"), S), 555],
  ["07:30–13:30 → 6:00 netto (keine Pause)", C.netMinutes(W("07:30", "13:30"), S), 360],
  ["Urlaub zählt 8:00", C.netMinutes({ type: "urlaub" }, S), 480],
  ["Woche 28 h → −4:00", C.weekDelta(28 * 60, S), -240],
  ["Woche 34 h → 0", C.weekDelta(34 * 60, S), 0],
  ["Woche 35:12 → 0", C.weekDelta(2112, S), 0],
  ["Woche 38 h → +2:48", C.weekDelta(38 * 60, S), 168],
  ["KW 19.10.2026 = 43", C.isoWeek("2026-10-19"), 43],
  ["KW 01.01.2026 = 1", C.isoWeek("2026-01-01"), 1],
  ["KW 31.12.2024 = 1", C.isoWeek("2024-12-31"), 1],
  ["Montag zu Sonntag 25.10.2026", C.mondayOf("2026-10-25"), "2026-10-19"],
];

// Balance over sample weeks: 38:00 (+2:48), 29:30 (−2:30), current week ignored.
const days = {};
["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"].forEach(k => days[k] = W("07:00", "17:15"));
days["2026-09-28"] = { type: "urlaub" };
days["2026-09-29"] = W("07:30", "15:00");
days["2026-09-30"] = W("07:30", "16:00");
days["2026-10-01"] = W("07:30", "14:30");
days["2026-10-05"] = W("07:30", "11:00");
const ws = C.weeks(days, S, "2026-10-06", "12:00");
cases.push(["Anzahl Wochen", ws.length, 3]);
cases.push(["Saldo +2:48 −2:30 = +0:18 (laufende Woche zählt nicht)", C.balance(ws), 18]);
cases.push(["Laufende Woche ohne Delta", ws[2].delta, null]);

let failed = 0;
const lines = cases.map(([name, got, want]) => {
  const ok = got === want; if (!ok) failed++;
  return (ok ? "OK   " : "FAIL ") + name + (ok ? "" : `  (erwartet ${want}, bekommen ${got})`);
});
if (typeof module !== "undefined") { console.log(lines.join("\n")); console.log(failed ? `${failed} FAILED` : "All passed"); process.exitCode = failed ? 1 : 0; }
else window.testResult = { lines, failed };
