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

// Start week shortened: first entry Do 01.10.2026 → Do+Fr = 16:00 target, buffer 10 % → 17:36.
const T16 = C.weekTarget("2026-09-28", "2026-10-01", S);
cases.push(["Start Do → Soll 16:00", T16, 960]);
cases.push(["Start Di → Soll 32:00", C.weekTarget("2026-09-28", "2026-09-29", S), 1920]);
cases.push(["Start Sa → Soll 0", C.weekTarget("2026-09-28", "2026-10-03", S), 0]);
cases.push(["Woche nach Start → Soll 32:00", C.weekTarget("2026-10-05", "2026-10-01", S), 1920]);
cases.push(["Startwoche 16:00 gearbeitet → 0", C.weekDelta(960, S, T16), 0]);
cases.push(["Startwoche 17:36 gearbeitet → 0", C.weekDelta(1056, S, T16), 0]);
cases.push(["Startwoche 18:00 gearbeitet → +0:24", C.weekDelta(1080, S, T16), 24]);
cases.push(["Startwoche 12:00 gearbeitet → −4:00", C.weekDelta(720, S, T16), -240]);
const start = { "2026-10-01": W("07:30", "16:00"), "2026-10-02": W("07:30", "16:00") };
const ws2 = C.weeks(start, S, "2026-10-22", "12:00");
cases.push(["Beispiel Do+Fr je 8 h: KW 40 Delta 0", ws2[0].delta, 0]);
cases.push(["Beispiel: KW 41 (leer) zählt −32:00", ws2[1].delta, -1920]);

// Holidays (Hessen by default). 25.12.2026 is a Friday, 26.12. a Saturday, Fronleichnam 04.06.
cases.push(["Ostern 2026 = 05.04.", C.easter(2026), "2026-04-05"]);
cases.push(["Ostern 2027 = 28.03.", C.easter(2027), "2027-03-28"]);
cases.push(["Fronleichnam 2026 in HE", C.holidayOn("2026-06-04", "HE")?.name, "Fronleichnam"]);
cases.push(["Bußtag 2026 in SN", C.holidayOn("2026-11-18", "SN")?.name, "Buß- und Bettag"]);
cases.push(["Kein Bußtag in HE", C.holidayOn("2026-11-18", "HE"), null]);
cases.push(["Kein Reformationstag in HE", C.holidayOn("2026-10-31", "HE"), null]);
cases.push(["Reformationstag in NI", C.holidayOn("2026-10-31", "NI")?.short, "Reform."]);
cases.push(["3 Könige in BY", C.holidayOn("2027-01-06", "BY")?.name, "Heilige Drei Könige"]);
const hctx = (first, today, now) => ({ firstKey: first, todayKey: today, now: now || null });
cases.push(["Feiertag Fr ohne Eintrag → 8:00", C.dayMinutes("2026-12-25", undefined, S, hctx("2026-10-01", "2026-12-30")), 480]);
cases.push(["Feiertag mit 5 h Eintrag bleibt 8:00", C.dayMinutes("2026-12-25", W("08:00", "13:00"), S, hctx("2026-10-01", "2026-12-30")), 480]);
cases.push(["Feiertag Sa zählt nichts", C.dayMinutes("2026-12-26", undefined, S, hctx("2026-10-01", "2026-12-30")), 0]);
cases.push(["Arbeit an Sa-Feiertag zählt normal", C.dayMinutes("2026-12-26", W("08:00", "13:00"), S, hctx("2026-10-01", "2026-12-30")), 300]);
cases.push(["Feiertag vor erstem Eintrag zählt nichts", C.dayMinutes("2026-05-01", undefined, S, hctx("2026-10-01", "2026-12-30")), 0]);
cases.push(["Zukünftiger Feiertag zählt noch nicht", C.dayMinutes("2026-12-25", undefined, S, hctx("2026-10-01", "2026-12-24")), 0]);
const hw = C.weeks({ "2026-05-04": W("07:30", "16:00") }, S, "2026-05-20", "12:00");
cases.push(["Himmelfahrt Do 14.05. in Woche ohne Eintrag: Ist 8:00", hw[1].ist, 480]);
const rows = C.dayRows({ "2026-12-23": W("07:30", "16:00") }, S, "2026-12-23", "2026-12-26", "2026-12-30");
cases.push(["CSV-Zeilen: Arbeit + 25.12., nicht 26.12.", rows.map(r => r.key + "/" + r.type).join(), "2026-12-23/arbeit,2026-12-25/feiertag"]);

let failed = 0;
const lines = cases.map(([name, got, want]) => {
  const ok = got === want; if (!ok) failed++;
  return (ok ? "OK   " : "FAIL ") + name + (ok ? "" : `  (erwartet ${want}, bekommen ${got})`);
});
if (typeof module !== "undefined") { console.log(lines.join("\n")); console.log(failed ? `${failed} FAILED` : "All passed"); process.exitCode = failed ? 1 : 0; }
else window.testResult = { lines, failed };
