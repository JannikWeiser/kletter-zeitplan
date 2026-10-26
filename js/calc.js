/* Rechenlogik Zeitplan Kletterwettkämpfe – Grundlage: Nationales Regelwerk Klettern 27.1
   Alle Zeiten intern in Minuten seit Mitternacht (Bruchteile erlaubt, z. B. 15 s = 0.25). */
(function (root) {
  'use strict';

  const PHASES = { quali: 'Qualifikation', semi: 'Halbfinale', final: 'Finale', training: 'Training' };
  const PHASE_ORDER = { training: 0, quali: 1, semi: 2, final: 3 };
  const DISC = { lead: 'Lead', boulder: 'Bouldern', speed: 'Speed' };
  const CH = 0.25; // 15 s Wechsel nach jedem Intervall (Boulder 4.4)

  const toMin = (hhmm) => {
    if (!hhmm) return null;
    const [h, m, s] = String(hhmm).split(':').map(Number);
    if (!isFinite(h)) return null;
    return h * 60 + (m || 0) + (s || 0) / 60;
  };
  const fmt = (min, withSec) => {
    if (min == null || !isFinite(min)) return '–';
    let total = Math.round(min * 60);
    const neg = total < 0; if (neg) total = -total;
    const h = Math.floor(total / 3600) % 24, m = Math.floor(total / 60) % 60, s = total % 60;
    const p = (n) => String(n).padStart(2, '0');
    return (neg ? '-' : '') + p(h) + ':' + p(m) + (withSec ? ':' + p(s) : '');
  };
  const dur = (min) => {
    const r = Math.round(min);
    if (Math.abs(r) < 60) return r + ' min';
    const h = Math.floor(Math.abs(r) / 60), m = Math.abs(r) % 60;
    return (r < 0 ? '-' : '') + h + ' h' + (m ? ' ' + m + ' min' : '');
  };
  const num = (v, d) => { const n = Number(v); return isFinite(n) && v !== '' && v != null ? n : d; };
  const pl = (n, one, many) => n + ' ' + (n === 1 ? one : many);

  /* ---------- Boulder-Formate ----------
     Jeder Startplatz beginnt ein Intervall nach dem vorherigen; zwischen zwei Bouldern
     eines Athleten liegen „gap“ Intervalle (Judge Guide 5.2 / TI-Rechner):
       Intervall: gap 2 (klettern, Pause, klettern …)
       World Series: gap = halbes Finalfeld (aufgerundet) → höchstens 2 Boulder gleichzeitig
       One by one: gap = ganzes Feld → Boulder für Boulder */
  const BOULDER_FORMATS = {
    interval: { label: 'Intervall', fixed: true },
    flash2sets: { label: '2 Kurse', fixed: true },
    jam: { label: 'JAM' },
    finInterval: { label: 'Intervall', fixed: true, gap: () => 2 },
    worldseries: { label: 'World Series', gap: (n) => Math.max(1, Math.ceil(n / 2)) },
    classic: { label: 'Classic', gap: () => 2 },
    onebyone: { label: 'One by one', gap: (n) => Math.max(1, n) },
  };

  /* Standardwerte je Disziplin/Runde */
  function defaults(discipline, phase) {
    const base = {
      starters: 20, warmup: 90, isoClose: 30, resultBuffer: 15, groups: 1,
      startMode: 'time', afterId: '', afterGap: 10,
      presentation: phase === 'final', presDur: 5, presPause: 2,
    };
    if (discipline === 'lead') {
      return Object.assign(base, {
        leadFormat: phase === 'quali' ? 'flash2' : 'onsight',
        attempt: 5, routeMode: 'par', cleanEvery: 20, cleanDur: 10, obsBefore: 20,
        starters: phase === 'quali' ? 30 : phase === 'semi' ? 24 : 8,
      });
    }
    if (discipline === 'boulder') {
      return Object.assign(base, { setSize: 3, setSize2: 2, jamDur: 120, obsBefore: 20 },
        boulderFormatDefaults(phase === 'final' ? 'worldseries' : 'interval', phase),
        { starters: phase === 'quali' ? 30 : phase === 'semi' ? 24 : 8 });
    }
    return Object.assign(base, {
      speedFormat: phase === 'final' ? 'final' : phase === 'training' ? 'training' : 'quali',
      lanes: 2, raceTime: 1, phaseBreak: 5, bracket: 'auto', presWhen: 'medal', trainDur: 0, pairWith: '',
      starters: phase === 'final' ? 8 : 20,
    });
  }

  /* Werte, die sich beim Wechsel des Boulder-Formats mitändern */
  function boulderFormatDefaults(f, phase) {
    switch (f) {
      case 'interval': return { boulderFormat: f, boulders: phase === 'semi' ? 4 : 5, interval: 5, sight: 'onsight', obsMode: 'none' };
      case 'flash2sets': return { boulderFormat: f, setSize: 3, setSize2: 3, interval: 4, sight: 'flash', obsMode: 'none' };
      case 'jam': return { boulderFormat: f, sight: 'flash', obsMode: 'none' };
      case 'finInterval': return { boulderFormat: f, boulders: 4, interval: 4, sight: 'onsight', obsMode: 'joint' };
      case 'worldseries': return { boulderFormat: f, boulders: 4, rotation: 5, sight: 'onsight', obsMode: 'per' };
      case 'classic': return { boulderFormat: f, boulders: 4, rotation: 5, sight: 'onsight', obsMode: 'per' };
      case 'onebyone': return { boulderFormat: f, boulders: 4, rotation: 5, sight: 'onsight', obsMode: 'per' };
      default: return { boulderFormat: f };
    }
  }

  function W(level, text, at) { return { level, text, at: at || 'sop' }; }
  const split2 = (n) => [Math.ceil(n / 2), Math.floor(n / 2)];

  /* ---------- Gemeinsame Vorlauf-Ereignisse ---------- */
  function preEvents(r, sop, res, opt) {
    const warm = num(r.warmup, 90);
    res.events.push({ key: 'warmup', t: sop - warm, label: 'Öffnung Aufwärmbereich' });
    if (warm < 60) res.warnings.push(W('error', `Aufwärmbereich öffnet nur ${dur(warm)} vor dem Start – nie später als 60 min (Allg. 6.4 A).`, 'warmup'));
    else if (warm < 90) res.warnings.push(W('should', `Aufwärmbereich öffnet nur ${dur(warm)} vor dem Start – sollte ≥ 90 min sein (Allg. 6.4 A).`, 'warmup'));
    if (opt.iso) {
      const iso = num(r.isoClose, 30);
      res.events.push({ key: 'iso', t: sop - iso, label: 'Schließung Isolationszone' });
      if (iso < 30) res.warnings.push(W('should', `Isolation schließt nur ${dur(iso)} vor dem Start – sollte ≥ 30 min sein (Allg. 6.4 B).`, 'iso'));
    }
  }

  /* Besichtigung + Präsentation vor dem Start; gibt frühesten Zeitpunkt auf der Wand zurück */
  function obsAndPres(r, sop, res, obsLen) {
    let first = sop;
    if (r.presentation && r.phase === 'final') {
      const pause = num(r.presPause, 2), pd = num(r.presDur, 5);
      const ps = sop - pause - pd;
      res.events.push({ key: 'pres', t: ps, label: `Präsentation (${dur(pd)})` });
      if (pause < 2) res.warnings.push(W('should', `Nur ${dur(pause)} zwischen Präsentation und erstem Versuch – mindestens 2 min (Allg. 6.4 C).`, 'pres'));
      first = Math.min(first, ps);
    }
    if (obsLen > 0) {
      const ob = num(r.obsBefore, 20);
      const os = sop - ob;
      res.events.push({ key: 'obs', t: os, label: `Gemeinsame Besichtigung (${dur(obsLen)})` });
      if (r.isOnsight && ob > num(r.isoClose, 30)) res.warnings.push(W('should', 'Besichtigung beginnt, bevor die Isolation schließt.', 'obs'));
      if (ob < obsLen) res.warnings.push(W('error', 'Besichtigung endet erst nach dem Start.', 'obs'));
      if (r.presentation && r.phase === 'final') {
        const ps = sop - num(r.presPause, 2) - num(r.presDur, 5);
        if (os + obsLen > ps) res.warnings.push(W('should', 'Besichtigung überschneidet sich mit der Präsentation.', 'obs'));
      }
      first = Math.min(first, os);
    }
    return first;
  }

  /* ---------- LEAD ---------- */
  function lead(r, sop, res) {
    const n = Math.max(0, Math.round(num(r.starters, 0)));
    const s = num(r.attempt, 5);
    const fmtL = r.leadFormat || 'flash2';
    const onsight = fmtL === 'onsight';
    const cleanEvery = Math.max(1, Math.round(num(r.cleanEvery, 20)));
    const cleanDur = num(r.cleanDur, 10);
    preEvents(r, sop, res, { iso: onsight });
    res.first = onsight ? obsAndPres(Object.assign({ isOnsight: true }, r), sop, res, 6) : sop;

    const twoGroups = fmtL === 'flash2' && Number(r.groups) === 2;
    const groups = twoGroups ? split2(n).map((m, i) => ({ n: m, name: i ? 'B' : 'A' })) : [{ n, name: '' }];
    let endRel = 0;
    const rows = [];
    const cols = twoGroups ? ['Gruppe'] : [];

    groups.forEach((g) => {
      const gn = g.n;
      const pre = g.name ? `Gruppe ${g.name}: ` : '';
      const cleaning = gn > 22;
      if (cleaning) {
        if (cleanEvery > 22) res.warnings.push(W('error', `${pre}Reinigungsintervall ${cleanEvery} Starter – darf nicht mehr als 22 sein (Lead 4.3).`));
        else if (cleanEvery > 20) res.warnings.push(W('should', `${pre}Reinigungsintervall ${cleanEvery} Starter – sollte nicht mehr als 20 sein (Lead 4.3).`));
      }
      const slot = (pos) => pos * s + (cleaning ? Math.floor(pos / cleanEvery) * cleanDur : 0);
      const routeLen = gn ? slot(gn - 1) + s : 0;
      const cleanEvents = (tf, routeName) => {
        if (!cleaning) return;
        for (let p = cleanEvery; p < gn; p += cleanEvery) {
          res.events.push({ key: 'clean', t: sop + tf(p) - cleanDur, label: `${pre}Reinigung ${routeName} (${dur(cleanDur)}) nach Startplatz ${p}`, minor: true });
        }
      };

      if (fmtL === 'flash2') {
        // Startreihenfolge Route 2 um die halbe Starterzahl versetzt (Lead 2.1)
        const k = Math.floor(gn / 2);
        const seq = r.routeMode === 'seq';
        const base = seq ? routeLen + (cleaning ? cleanDur : 0) : 0;
        // E = eingefügte Pause: parallel vor dem Routentausch, nacheinander vor Route 2
        const t1 = (p, E) => slot(p) + (!seq && p >= k ? E : 0);
        const t2 = (q, E) => (seq ? base + E : 0) + slot(q) + (!seq && q >= gn - k ? E : 0);
        const restFor = (E) => {
          let min = Infinity;
          for (let p = 0; p < gn; p++) {
            const a = t1(p, E), b = t2((p - k + gn) % gn, E);
            min = Math.min(min, a <= b ? b - (a + s) : a - (b + s));
          }
          return min;
        };
        // 50 min Ruhezeit (Lead 4.4) automatisch einfügen, 5-min-Raster
        let E = 0;
        const rest0 = gn > 1 ? restFor(0) : Infinity;
        if (rest0 < 50) {
          E = Math.ceil((50 - rest0) / 5) * 5;
          while (restFor(E) < 50) E += 5;
        }
        const T1 = (p) => t1(p, E), T2 = (q) => t2(q, E);
        if (seq) {
          res.events.push({ key: g.name === 'B' ? 'sopB' : 'sop', t: sop, label: `${pre}Start Route 1 (${gn} Starter)` });
          res.events.push({ key: 'r2' + g.name, t: sop + T2(0), label: `${pre}Start Route 2` });
          if (cleaning) res.events.push({ key: 'clean', t: sop + routeLen, label: `${pre}Reinigung (${dur(cleanDur)}) zwischen Route 1 und 2`, minor: true });
          if (E) res.warnings.push(W('auto', `${pre}50-min-Ruhezeit eingefügt: Route 2 startet ${dur(E)} nach Ende von Route 1 (${fmt(sop + T2(0))}), sonst nur ${dur(rest0)} Pause (Lead 4.4).`, 'r2' + g.name));
        } else {
          res.events.push({ key: g.name === 'B' ? 'sopB' : 'sop', t: sop, label: `${pre}Start Route 1 + 2 (${gn} Starter, ${gn - k} / ${k} je Durchgang)` });
          if (E) {
            const swap = sop + Math.min(T1(k), T2(gn - k));
            res.events.push({ key: 'pause', t: swap - E, label: `${pre}Pause (${dur(E)})` });
            res.events.push({ key: 'r2' + g.name, t: swap, label: `${pre}Routentausch: 2. Durchgang Route 1 + 2` });
            res.warnings.push(W('auto', `${pre}50-min-Ruhezeit eingefügt: ${dur(E)} Pause nach dem 1. Durchgang, danach Routentausch (${fmt(swap)}), sonst nur ${dur(rest0)} Pause (Lead 4.4).`, 'r2' + g.name));
          }
        }
        cleanEvents(T1, 'Route 1'); cleanEvents(T2, 'Route 2');
        for (let p = 0; p < gn; p++) {
          const q = (p - k + gn) % gn;
          const a = T1(p), b = T2(q);
          const rest = a <= b ? b - (a + s) : a - (b + s);
          endRel = Math.max(endRel, a + s, b + s);
          rows.push((g.name ? [g.name] : []).concat([p + 1, fmt(sop + a), q + 1, fmt(sop + b), { v: dur(rest), warn: rest < 50 }]));
        }
      } else {
        res.events.push({ key: 'sop', t: sop, label: `Start Route (${gn} Starter)` });
        cleanEvents(slot, 'Route');
        endRel = routeLen;
        for (let p = 0; p < gn; p++) rows.push([p + 1, fmt(sop + slot(p))]);
      }
    });
    res.end = sop + endRel;
    res.detail = { cols: fmtL === 'flash2' ? cols.concat(['Startplatz R1', 'Route 1', 'Startplatz R2', 'Route 2', 'Pause']) : ['Startplatz', 'Start'], rows };
  }

  /* ---------- BOULDER ---------- */
  function boulder(r, sop, res) {
    const n = Math.max(0, Math.round(num(r.starters, 0)));
    const bf = BOULDER_FORMATS[r.boulderFormat] ? r.boulderFormat : 'interval';
    const F = BOULDER_FORMATS[bf];
    const onsight = (r.sight || 'onsight') === 'onsight';
    preEvents(r, sop, res, { iso: onsight });
    const B = Math.max(1, Math.round(num(r.boulders, 4)));
    let obsLen = 0;
    if (r.obsMode === 'per') obsLen = 2 * B;
    else if (r.obsMode === 'joint') obsLen = 8;
    res.first = obsAndPres(Object.assign({ isOnsight: onsight }, r), sop, res, obsLen);

    if (bf === 'jam') {
      const d = num(r.jamDur, 120);
      res.events.push({ key: 'sop', t: sop, label: `Start JAM (${n} Starter · ${dur(d)})` });
      res.end = sop + d;
      return;
    }

    if (bf === 'flash2sets') { boulderTwoCourses(r, sop, res, n); return; }

    // Rotation: fixes Intervall + 15 s Wechsel, oder freie Rotationszeit (Finals World Series / Classic / One by one)
    const fixed = F.fixed;
    const I = fixed ? num(r.interval, 5) : num(r.rotation, 5);
    const cyc = fixed ? I + CH : I;
    const tail = fixed ? CH : 0;
    const rotTxt = fixed ? `${I} min + 15 s` : `${dur(I)} Rotation`;
    const twoGroups = bf === 'interval' && Number(r.groups) === 2;
    const groups = twoGroups ? split2(n).map((m, i) => ({ n: m, name: i ? 'B' : 'A' })) : [{ n, name: '' }];
    let maxR = 0;
    const rows = [];
    groups.forEach((g) => {
      const gap = F.gap ? F.gap(g.n) : 2;
      const R = g.n ? (g.n - 1) + gap * (B - 1) + 1 : 0;
      maxR = Math.max(maxR, R);
      for (let i = 0; i < g.n; i++) {
        const times = [];
        for (let j = 0; j < B; j++) times.push(fmt(sop + (i + gap * j) * cyc, true));
        rows.push((twoGroups ? [g.name] : []).concat([i + 1], fixed ? [fmt(sop + (i - 3) * cyc, true)] : [], times));
      }
    });
    const gapAll = F.gap ? F.gap(groups[0].n) : 2;
    const grpTxt = twoGroups ? ` · 2 Gruppen à ${groups[0].n}/${groups[1].n}` : '';
    res.events.push({ key: 'sop', t: sop, label: `Start ${F.label} (${n} Starter${grpTxt} · ${B} Boulder · ${rotTxt})` });
    res.end = n ? sop + maxR * cyc - tail : sop;
    res.info = `${pl(maxR, 'Rotation', 'Rotationen')} à ${rotTxt}${!twoGroups && gapAll !== 2 ? ` · Abstand ${gapAll}` : ''}`;
    const cols = (twoGroups ? ['Gruppe'] : []).concat(['Startplatz'], fixed ? ['Call Zone'] : []);
    for (let j = 1; j <= B; j++) cols.push('B' + j);
    res.detail = { cols, rows };
  }

  /* Zwei Kurse (Flash, z. B. Jugendcup 2×3 / BWJC 3+2): Feld in zwei Gruppen versetzt um die halbe
     Starterzahl, jede Gruppe beginnt auf einem Kurs und tauscht danach (Schema Running Order BWJC) */
  function boulderTwoCourses(r, sop, res, n) {
    const I = num(r.interval, 4), cyc = I + CH;
    const b1 = Math.max(1, Math.round(num(r.setSize, 3)));
    const b2 = Math.max(1, Math.round(num(r.setSize2, 3)));
    const step = 2; // Pausen-Rotation zwischen den Bouldern eines Kurses
    const k = Math.floor(n / 2);
    const s1 = (p, g) => p + (p >= k ? g : 0);
    const s2 = (q, g) => q + (q >= n - k ? g : 0);
    const span = (bb) => step * (bb - 1) + 1;
    const restFor = (g) => {
      let min = Infinity;
      for (let i = 0; i < n; i++) {
        const a1 = s1(i, g), a2 = s2((i - k + n) % n, g);
        min = Math.min(min, a1 < a2 ? a2 - (a1 + span(b1)) : a1 - (a2 + span(b2)));
      }
      return min;
    };
    // ≥ 3 Rotationen Erholung zwischen den Kursen (Boulder 4.7 C): Leer-Rotationen an der Gruppengrenze einfügen
    let g = 0;
    const rest0 = n > 1 ? restFor(0) : Infinity;
    while (n > 1 && restFor(g) < 3) g++;
    const rows = [];
    let maxEnd = 0;
    for (let i = 0; i < n; i++) {
      const q = (i - k + n) % n;
      const a1 = s1(i, g), a2 = s2(q, g);
      maxEnd = Math.max(maxEnd, a1 + span(b1), a2 + span(b2));
      const times = [];
      for (let j = 0; j < b1; j++) times.push(fmt(sop + (a1 + j * step) * cyc, true));
      for (let j = 0; j < b2; j++) times.push(fmt(sop + (a2 + j * step) * cyc, true));
      rows.push([i + 1, i < k ? 'A' : 'B', fmt(sop + (Math.min(a1, a2) - 3) * cyc, true)].concat(times));
    }
    res.events.push({ key: 'sop', t: sop, label: `Start 2 Kurse (${n} Starter · Kurs A ${b1} + Kurs B ${b2} Boulder · ${I} min + 15 s)` });
    if (g) {
      res.events.push({ key: 'gap', t: sop + Math.min(k, n - k) * cyc, label: `Pause (${pl(g, 'Rotation', 'Rotationen')}) an der Gruppengrenze` });
      res.warnings.push(W('auto', `Erholung zwischen den Kursen eingefügt: ${pl(g, 'Leer-Rotation', 'Leer-Rotationen')} an der Gruppengrenze, sonst nur ${pl(rest0, 'Rotation', 'Rotationen')} statt 3 (Boulder 4.7 C).`, 'gap'));
    }
    res.end = n ? sop + maxEnd * cyc - CH : sop;
    res.info = `${pl(maxEnd, 'Rotation', 'Rotationen')} à ${I} min + 15 s`;
    const cols = ['Startplatz', 'Gruppe', 'Call Zone'];
    for (let j = 1; j <= b1; j++) cols.push('A' + j);
    for (let j = 1; j <= b2; j++) cols.push('B' + j);
    res.detail = { cols, rows };
  }

  /* ---------- SPEED ---------- */
  /* Finalquote aus der Starterzahl der Quali (Speed 2.3) */
  function speedQuota(n, lanes) {
    if (lanes === 4 && n >= 32) return 32;
    if (n >= 16) return 16;
    if (n >= 8) return 8;
    if (n >= 4) return 4;
    return 0;
  }

  /* Quali/Training: jeder Athlet einmal je Lane, Startreihenfolge je Lane um n/L versetzt (Speed 2.2).
     n Starter → n Races. Fehlen die 5 min Ruhezeit (Speed 4.2 C), wird eine Pause eingefügt. */
  function speedQuali(r, sop, res, label) {
    const n = Math.max(0, Math.round(num(r.starters, 0)));
    const L = Number(r.lanes) === 4 ? 4 : 2;
    const rt = num(r.raceTime, 1);
    const shift = Math.floor(n / L);
    const racesOf = (a) => { const out = []; for (let l = 0; l < L; l++) out.push((a + l * shift) % n); return out; };
    const at = (j, p, E) => (j >= p ? j * rt + E : j * rt);
    const minGapFor = (p, E) => {
      let min = Infinity;
      for (let a = 0; a < n; a++) {
        const t = racesOf(a).map((j) => at(j, p, E)).sort((x, y) => x - y);
        for (let i = 1; i < t.length; i++) min = Math.min(min, t[i] - t[i - 1] - rt);
      }
      return min;
    };
    let P = n, E = 0;
    const gap0 = n > 1 ? minGapFor(n, 0) : Infinity;
    const check = label === 'Start';
    if (check && gap0 < 5) {
      // kleinste Pause (1-min-Raster) an der besten Stelle suchen
      search: for (E = 1; E <= 60; E++) for (let p = 1; p < n; p++) if (minGapFor(p, E) >= 5) { P = p; break search; }
      if (P === n) E = 0;
    }
    const rows = [];
    for (let a = 0; a < n; a++) rows.push([a + 1].concat(racesOf(a).map((j) => fmt(sop + at(j, P, E)))));
    res.events.push({ key: 'sop', t: sop, label: `${label} (${n} Starter · ${pl(n, 'Race', 'Races')} · ${dur(rt)}/Race)` });
    res.end = sop + n * rt + (P < n ? E : 0);
    if (check && P < n) {
      res.events.push({ key: 'pause', t: sop + P * rt, label: `Pause (${dur(E)}) nach Race ${P}` });
      res.warnings.push(W('auto', `5-min-Ruhezeit eingefügt: ${dur(E)} Pause nach Race ${P}, sonst nur ${dur(gap0)} zwischen zwei Races eines Athleten (Speed 4.2 C).`, 'pause'));
    } else if (check && gap0 < 5) {
      res.warnings.push(W('rest', `Pause zwischen zwei Races eines Athleten nur ${dur(gap0)} statt 5 min (Speed 4.2 C). Mehr Zeit pro Race einplanen.`));
    }
    res.detail = { cols: ['Startplatz Lane A'].concat(['A', 'B', 'C', 'D'].slice(0, L).map((x) => 'Lane ' + x)), rows };
  }

  function speedPhases(r) {
    const L = Number(r.lanes) === 4 ? 4 : 2;
    let size = Number(r._bracket || r.bracket) || 8;
    const phases = [];
    const names = { 32: 'Achtelfinale', 16: 'Viertelfinale', 8: 'Halbfinale' }; // Speed 4: Races à 4
    if (L === 2) {
      while (size > 4) { phases.push({ name: size === 32 ? '1/16-Finale' : size === 16 ? 'Achtelfinale' : 'Viertelfinale', races: size / 2 }); size /= 2; }
      phases.push({ name: 'Halbfinale', races: 2, semi: true });
      phases.push({ name: 'Kleines + großes Finale', races: 2, medal: true, fromAll: true });
    } else {
      // Speed 4: die besten 2 je Race kommen weiter, ein Medal Race
      while (size > 4) { phases.push({ name: names[size] || `Runde der ${size}`, races: size / 4, semi: size === 8 }); size /= 2; }
      phases.push({ name: 'Finale (Medal Race)', races: 1, medal: true, fromAll: true });
    }
    return phases;
  }

  /* Finale einer oder zweier verschränkter Kategorien (Phasen abwechselnd, am Finale ausgerichtet).
     Reicht die Pause zwischen zwei Phasen nicht für 5 min Ruhezeit, wird sie verlängert. */
  function speedFinals(items, sop) {
    const brk = num(items[0].r.phaseBreak, 5);
    items.forEach((it) => { it.phases = speedPhases(it.r); it.rt = num(it.r.raceTime, 1); it.ext = []; });
    const len = Math.max.apply(null, items.map((it) => it.phases.length));
    const seq = [];
    for (let i = 0; i < len; i++) {
      items.forEach((it) => {
        const idx = i - (len - it.phases.length);
        if (idx >= 0) seq.push({ it, ph: it.phases[idx], idx });
      });
    }
    const presAt = (r, ph) => r.presentation && ((r.presWhen === 'semi') ? ph.semi : ph.medal);
    let t = sop;
    seq.forEach((x, n) => {
      const { it, ph, idx } = x;
      const r = it.r, res = it.res;
      if (n > 0) t += brk;
      // gemeinsame Präsentation vor der ersten passenden Phase (bei Verschränkung einmal für beide)
      const due = items.filter((y) => !y.presDone && y.phases.some((p2) => presAt(y.r, p2)) && (y === it ? presAt(r, ph) : false));
      if (due.length) {
        const both = items.length > 1 && items.every((y) => !y.presDone && y.r.presentation && (y.r.presWhen || 'medal') === (r.presWhen || 'medal'));
        const pd = Math.max.apply(null, (both ? items : due).map((y) => num(y.r.presDur, 5)));
        const label = r.presWhen === 'semi' ? 'Präsentation Halbfinalisten' : 'Präsentation Finalisten';
        (both ? items : due).forEach((y) => { y.presDone = true; y.res.events.push({ key: 'pres', t, label: `${label} (${dur(pd)})` }); });
        t += pd + num(r.presPause, 2);
      }
      // 5 min Ruhezeit zur vorherigen Phase derselben Kategorie (Speed 4.2 C)
      if (idx > 0) {
        const prev = it.phases[idx - 1];
        let need = t;
        for (let j = 0; j < ph.races; j++) {
          const src = ph.fromAll ? prev.races - 1 : Math.min(prev.races - 1, 2 * j + 1);
          need = Math.max(need, prev.start + (src + 1) * it.rt + 5 - j * it.rt);
        }
        if (need > t + 0.001) { it.ext.push(`${ph.name} +${dur(need - t)}`); t = need; }
      }
      ph.start = t;
      if (idx === 0) { res.sop = t; res.events.push({ key: 'sop', t, label: `Start Finale (Wettkampfbaum ${Number(r._bracket || r.bracket) || 8}) · ${ph.name}` }); }
      else res.events.push({ key: 'phase' + idx, t, label: `${ph.name} (${pl(ph.races, 'Race', 'Races')})`, minor: !ph.medal && items.length === 1 });
      t += ph.races * it.rt;
      res.end = t;
    });
    items.forEach((it) => {
      if (it.ext.length) it.res.warnings.push(W('auto', `5-min-Ruhezeit eingefügt: Pause verlängert vor ${it.ext.join(', ')} (Speed 4.2 C).`));
      it.res.detail = { cols: ['Phase', 'Beginn', 'Races'], rows: it.phases.map((p) => [p.name, fmt(p.start), p.races]) };
      it.res.first = it.res.sop;
    });
  }

  function speed(r, sop, res) {
    const sf = r.speedFormat || 'quali';
    preEvents(r, sop, res, { iso: false });
    res.first = sop;
    if (sf === 'training') {
      if (num(r.trainDur, 0) > 0) {
        res.events.push({ key: 'sop', t: sop, label: `Start Training (${dur(num(r.trainDur, 0))})` });
        res.end = sop + num(r.trainDur, 0);
      } else {
        speedQuali(r, sop, res, 'Start Training');
        if (Number(r.lanes) === 4) res.warnings.push(W('info', 'Speed 4: Das Training findet nicht im Quali-Format statt (Speed 4.1) – bitte eine feste Dauer eingeben.'));
      }
    } else if (sf === 'quali') speedQuali(r, sop, res, 'Start');
    else speedFinals([{ r, res }], sop);
  }

  /* ---------- Einzelne Runde (Startzeit bereits aufgelöst) ---------- */
  function newRes(r) { return { id: r.id, round: r, events: [], warnings: [], detail: null, sop: null, end: null, result: null }; }

  function finish(r, res) {
    const n = Math.round(num(r.starters, 0));
    if (r.phase === 'quali' && n < 4) res.warnings.push(W('info', `Nur ${n} Starter – bei weniger als 4 Registrierten findet für die Kategorie kein Wettkampf statt (Allg. 6.2).`));
    res.result = res.end + (r.phase === 'training' ? 0 : num(r.resultBuffer, 15));
    res.events.push({ key: 'end', t: res.end, label: r.phase === 'training' ? 'Ende Training' : 'Ende der Runde (voraussichtlich)' });
    if (r.phase !== 'training') res.events.push({ key: 'result', t: res.result, label: 'Offizielles Ergebnis (voraussichtlich)', minor: true });
    const onWall = res.events.filter((e) => e.key !== 'warmup' && e.key !== 'iso').map((e) => e.t);
    res.occupy = [Math.min(res.first != null ? res.first : res.sop, Math.min.apply(null, onWall)), res.end];
    return res;
  }

  function computeRound(r, sop) {
    const res = newRes(r);
    if (sop == null) { res.warnings.push(W('error', 'Keine Startzeit angegeben.')); return res; }
    res.sop = sop;
    if (r.discipline === 'lead') lead(r, sop, res);
    else if (r.discipline === 'boulder') boulder(r, sop, res);
    else speed(r, sop, res);
    return finish(r, res);
  }

  /* Zwei verschränkte Speed-Finals: Vorlauf je Kategorie, Phasen gemeinsam */
  function computePaired(a, b, sop) {
    const ra = newRes(a), rb = newRes(b);
    if (sop == null) { ra.warnings.push(W('error', 'Keine Startzeit angegeben.')); return [ra, rb]; }
    [[a, ra], [b, rb]].forEach(([r, res]) => preEvents(r, sop, res, { iso: false }));
    speedFinals([{ r: a, res: ra }, { r: b, res: rb }], sop);
    rb.info = ra.info = 'verschränkt';
    return [finish(a, ra), finish(b, rb)];
  }

  /* ---------- Ganzer Wettkampf inkl. rundenübergreifender Prüfungen ---------- */
  function computeAll(comp) {
    const rounds = comp.rounds.map((r) => Object.assign({}, r, { day: r.day || comp.date }));
    const byId = {}; rounds.forEach((r) => { byId[r.id] = r; });
    const isSpeedFinal = (r) => r && r.discipline === 'speed' && r.phase === 'final';
    // Verschränkte Speed-Finals: die Runde mit „verschränkt mit“ hängt sich an die gewählte Haupt-Runde (deren Startzeit gilt)
    const partnerOf = {}, hasPartner = {};
    rounds.forEach((r) => {
      const p = byId[r.pairWith];
      if (isSpeedFinal(r) && isSpeedFinal(p) && p.id !== r.id && !partnerOf[r.id] && !partnerOf[p.id] && !hasPartner[p.id] && !hasPartner[r.id]) { partnerOf[r.id] = p.id; hasPartner[p.id] = true; }
    });
    // Wettkampfbaum „auto“: Quote aus der Speed-Quali derselben Kategorie (Speed 2.3)
    rounds.forEach((r) => {
      if (!isSpeedFinal(r)) return;
      const q = rounds.find((x) => x.discipline === 'speed' && x.phase === 'quali' && (x.category || '').trim().toLowerCase() === (r.category || '').trim().toLowerCase());
      const quota = q ? speedQuota(Math.round(num(q.starters, 0)), Number(q.lanes) === 4 ? 4 : 2) : null;
      r._bracket = (r.bracket === 'auto' || r.bracket == null) ? (quota || 8) : Number(r.bracket);
      r._quotaWarn = quota != null && r._bracket > quota ? quota : null;
      r._noQuali = (r.bracket === 'auto' || r.bracket == null) && !quota;
    });
    const out = {}, busy = new Set();

    function resolve(id) {
      if (out[id]) return out[id];
      if (partnerOf[id]) { resolve(partnerOf[id]); return out[id]; }
      const r = byId[id];
      const partner = rounds.find((x) => partnerOf[x.id] === id);
      if (busy.has(id)) return null;
      busy.add(id);
      let sop = toMin(r.start);
      let afterNote = null;
      if (r.startMode === 'after') {
        const ref = byId[r.afterId] ? resolve(r.afterId) : null;
        if (ref && ref.end != null) {
          // Vorlauf auf der Wand (Besichtigung, Präsentation) erst nach dem Wechsel beginnen lassen
          const probe = partner ? computePaired(r, partner, 0)[0] : computeRound(r, 0);
          const lead = probe.occupy ? -probe.occupy[0] : 0;
          const gap = num(r.afterGap, 10);
          sop = ref.end + gap + Math.max(0, lead);
          afterNote = { t: ref.end, gap, ref };
        } else sop = null;
      }
      let res;
      if (partner) { const pr = computePaired(r, partner, sop); res = pr[0]; out[partner.id] = pr[1]; }
      else res = computeRound(r, sop);
      if (afterNote) {
        res.events.push({ key: 'change', t: afterNote.t, label: `Wechsel / Reinigung (${dur(afterNote.gap)}) nach ${label(afterNote.ref.round)}`, minor: true });
        res.afterOf = afterNote.ref.id;
      } else if (r.startMode === 'after') res.warnings.push(W('error', 'Vorherige Runde für „im Anschluss an“ fehlt oder hat keine Startzeit.'));
      [res].concat(partner ? [out[partner.id]] : []).forEach((x) => {
        const rr = x.round;
        if (rr._quotaWarn) x.warnings.push(W('should', `Wettkampfbaum ${rr._bracket} ist größer als die Quote aus der Quali (${rr._quotaWarn}, Speed 2.3).`));
        if (rr._noQuali) x.warnings.push(W('info', 'Keine Speed-Quali dieser Kategorie gefunden – Wettkampfbaum 8 angenommen.'));
      });
      out[id] = res;
      busy.delete(id);
      return res;
    }
    rounds.forEach((r) => resolve(r.id));
    const results = rounds.map((r) => out[r.id] || Object.assign(newRes(r), { warnings: [W('error', 'Startzeit hängt im Kreis von anderen Runden ab.')] }));
    // Rundenfolge je Kategorie
    const groups = {};
    results.forEach((x) => {
      if (x.sop == null || x.round.phase === 'training') return;
      const k = [x.round.discipline, (x.round.category || '').trim().toLowerCase()].join('|');
      (groups[k] = groups[k] || []).push(x);
    });
    Object.values(groups).forEach((list) => {
      list.sort((a, b) => (PHASE_ORDER[a.round.phase] - PHASE_ORDER[b.round.phase]) || a.round.day.localeCompare(b.round.day) || (a.sop - b.sop));
      for (let i = 1; i < list.length; i++) {
        const p = list[i - 1], c = list[i];
        if (p.round.day !== c.round.day) continue;
        const gap = c.sop - p.result;
        if (gap < 0) c.warnings.push(W('error', `Start vor dem voraussichtlichen Ergebnis der ${PHASES[p.round.phase]} (${fmt(p.result)}).`));
        else if (c.round.discipline === 'lead' && gap < 60) c.warnings.push(W('error', `Nur ${dur(gap)} zwischen Ergebnis der ${PHASES[p.round.phase]} (${fmt(p.result)}) und Start – mindestens 1 Stunde (Lead 4.5).`));
        // National nicht geregelt → international: 2 h (World Climbing Event Regulations, Annex C 4.7)
        else if (c.round.discipline === 'boulder' && gap < 120) c.warnings.push(W('should', `Nur ${dur(gap)} zwischen Ergebnis der ${PHASES[p.round.phase]} (${fmt(p.result)}) und Start – international sind 2 Stunden vorgesehen (World Climbing, Boulder 4.7).`));
      }
    });
    // Aufwärmbereich öffnet einmal pro Tag (frühester Bedarf) und bleibt offen – spätere Kategorien nutzen diese Öffnung
    const firstWarm = {};
    results.forEach((x) => { const e = x.events.find((ev) => ev.key === 'warmup'); if (e && (firstWarm[x.round.day] == null || e.t < firstWarm[x.round.day])) firstWarm[x.round.day] = e.t; });
    results.forEach((x) => {
      const e = x.events.find((ev) => ev.key === 'warmup');
      if (!e || x.sop == null) return;
      e.t = firstWarm[x.round.day];
      const open = x.sop - e.t;
      x.warnings = x.warnings.filter((w) => w.at !== 'warmup');
      if (open < 60) x.warnings.push(W('error', `Aufwärmbereich öffnet nur ${dur(open)} vor dem Start – nie später als 60 min (Allg. 6.4 A).`, 'warmup'));
      else if (open < 90) x.warnings.push(W('should', `Aufwärmbereich öffnet nur ${dur(open)} vor dem Start – sollte ≥ 90 min sein (Allg. 6.4 A).`, 'warmup'));
    });
    results.forEach((x) => { x.partnerOf = partnerOf[x.id] || null; });
    return results;
  }

  function label(r) {
    return `${DISC[r.discipline] || ''} ${r.category || ''} ${PHASES[r.phase] || ''}`.replace(/\s+/g, ' ').trim();
  }

  const api = { computeAll, defaults, boulderFormatDefaults, BOULDER_FORMATS, toMin, fmt, dur, label, PHASES, PHASE_ORDER, DISC };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Calc = api;
})(this);
