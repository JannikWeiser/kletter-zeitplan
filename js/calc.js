/* Rechenlogik Zeitplan Kletterwettkämpfe – Grundlage: Nationales Regelwerk Klettern 27.1
   Alle Zeiten intern in Minuten seit Mitternacht (Bruchteile erlaubt, z. B. 15 s = 0.25). */
(function (root) {
  'use strict';

  const PHASES = { quali: 'Qualifikation', semi: 'Halbfinale', final: 'Finale', training: 'Training' };
  const PHASE_ORDER = { training: 0, quali: 1, semi: 2, final: 3 };
  const DISC = { lead: 'Lead', boulder: 'Bouldern', speed: 'Speed' };

  const toMin = (hhmm) => {
    if (!hhmm) return null;
    const [h, m, s] = String(hhmm).split(':').map(Number);
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

  /* Standardwerte je Disziplin/Runde */
  function defaults(discipline, phase) {
    const base = {
      starters: 20, warmup: 90, isoClose: 30, resultBuffer: 15,
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
      const fin = phase === 'final';
      return Object.assign(base, {
        boulderFormat: fin ? 'parallel' : 'interval',
        sight: phase === 'quali' ? 'flash' : 'onsight',
        boulders: fin ? 4 : 5, interval: fin ? 4 : 5, restRot: false, setRest: true, setSize: 3, setSize2: 2,
        active: 2, rotation: 5, blockBreak: 0, jamDur: 120,
        obsMode: fin ? 'per' : 'none', obsBefore: 20,
        starters: phase === 'quali' ? 30 : phase === 'semi' ? 24 : 8,
      });
    }
    return Object.assign(base, {
      speedFormat: phase === 'final' ? 'final' : phase === 'training' ? 'training' : 'quali',
      lanes: 2, raceTime: 1, phaseBreak: 5, bracket: 8, trainDur: 0,
      starters: phase === 'final' ? 8 : 20,
    });
  }

  function W(level, text, at) { return { level, text, at: at || 'sop' }; }

  /* ---------- Gemeinsame Vorlauf-Ereignisse ---------- */
  function preEvents(r, sop, res, opt) {
    const warm = num(r.warmup, 90);
    res.events.push({ key: 'warmup', t: sop - warm, label: 'Öffnung Aufwärmbereich' });
    if (warm < 60) res.warnings.push(W('error', `Aufwärmbereich öffnet nur ${dur(warm)} vor Start of Play – nie später als 60 min (Allg. 6.4 A).`, 'warmup'));
    else if (warm < 90) res.warnings.push(W('should', `Aufwärmbereich öffnet nur ${dur(warm)} vor Start of Play – sollte ≥ 90 min sein (Allg. 6.4 A).`, 'warmup'));
    if (opt.iso) {
      const iso = num(r.isoClose, 30);
      res.events.push({ key: 'iso', t: sop - iso, label: 'Schließung Isolationszone' });
      if (iso < 30) res.warnings.push(W('should', `Isolation schließt nur ${dur(iso)} vor Start of Play – sollte ≥ 30 min sein (Allg. 6.4 B).`, 'iso'));
    }
  }

  /* Besichtigung + Präsentation vor Start of Play; gibt frühesten Zeitpunkt auf der Wand zurück */
  function obsAndPres(r, sop, res, obsLen) {
    let first = sop;
    if (r.presentation) {
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
      const iso = num(r.isoClose, 30);
      if (ob > iso) res.warnings.push(W('should', 'Besichtigung beginnt, bevor die Isolation schließt.', 'obs'));
      if (ob < obsLen) res.warnings.push(W('error', 'Besichtigung endet erst nach Start of Play.', 'obs'));
      if (r.presentation) {
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
    const cleaning = n > 22;
    preEvents(r, sop, res, { iso: onsight });

    if (cleaning) {
      if (cleanEvery > 22) res.warnings.push(W('error', `Reinigungsintervall ${cleanEvery} Starter – darf nicht mehr als 22 sein (Lead 4.3).`));
      else if (cleanEvery > 20) res.warnings.push(W('should', `Reinigungsintervall ${cleanEvery} Starter – sollte nicht mehr als 20 sein (Lead 4.3).`));
    }
    const slot = (pos) => pos * s + (cleaning ? Math.floor(pos / cleanEvery) * cleanDur : 0);
    const routeLen = n ? slot(n - 1) + s : 0;
    const cleanEvents = (tf, routeName) => {
      if (!cleaning) return;
      for (let p = cleanEvery; p < n; p += cleanEvery) {
        res.events.push({ key: 'clean', t: sop + tf(p) - cleanDur, label: `Reinigung ${routeName} (${dur(cleanDur)}) nach Startplatz ${p}`, minor: true });
      }
    };

    let first = sop;
    if (onsight) first = obsAndPres(r, sop, res, 6);

    if (fmtL === 'flash2') {
      // Startreihenfolge Route 2 um die halbe Starterzahl versetzt (Lead 2.1)
      const k = Math.floor(n / 2);
      const seq = r.routeMode === 'seq';
      const base = seq ? routeLen + (cleaning ? cleanDur : 0) : 0;
      // E = eingefügte Pause: parallel zwischen 1. und 2. Durchgang (Routentausch), nacheinander vor Route 2
      const t1 = (p, E) => slot(p) + (!seq && p >= k ? E : 0);
      const t2 = (q, E) => (seq ? base + E : 0) + slot(q) + (!seq && q >= n - k ? E : 0);
      const restFor = (E) => {
        let min = Infinity;
        for (let p = 0; p < n; p++) {
          const a = t1(p, E), b = t2((p - k + n) % n, E);
          min = Math.min(min, a <= b ? b - (a + s) : a - (b + s));
        }
        return min;
      };
      // 50 min Ruhezeit (Lead 4.4) automatisch einfügen, 5-min-Raster
      let E = 0;
      const rest0 = n > 1 ? restFor(0) : Infinity;
      if (rest0 < 50) {
        E = Math.ceil((50 - rest0) / 5) * 5;
        while (restFor(E) < 50) E += 5;
      }
      const T1 = (p) => t1(p, E), T2 = (q) => t2(q, E);
      if (seq) {
        res.events.push({ key: 'sop', t: sop, label: `Start Route 1 (${n} Starter)` });
        res.events.push({ key: 'r2', t: sop + T2(0), label: 'Start Route 2' });
        if (cleaning) res.events.push({ key: 'clean', t: sop + routeLen, label: `Reinigung (${dur(cleanDur)}) zwischen Route 1 und 2`, minor: true });
        if (E) res.warnings.push(W('auto', `50-min-Ruhezeit eingefügt: Route 2 startet ${dur(E)} nach Ende von Route 1 (${fmt(sop + T2(0))}), sonst nur ${dur(rest0)} Pause (Lead 4.4).`, 'r2'));
      } else {
        res.events.push({ key: 'sop', t: sop, label: `Start Route 1 + 2 (${n} Starter, je ${n - k} / ${k} pro Durchgang)` });
        if (E) {
          const swap = sop + Math.min(T1(k), T2(n - k));
          res.events.push({ key: 'pause', t: swap - E, label: `Pause (${dur(E)})` });
          res.events.push({ key: 'r2', t: swap, label: 'Routentausch: 2. Durchgang Route 1 + 2' });
          res.warnings.push(W('auto', `50-min-Ruhezeit eingefügt: ${dur(E)} Pause nach dem 1. Durchgang, danach Routentausch (${fmt(swap)}), sonst nur ${dur(rest0)} Pause (Lead 4.4).`, 'r2'));
        }
      }
      cleanEvents(T1, 'Route 1'); cleanEvents(T2, 'Route 2');
      let endRel = 0;
      const rows = [];
      for (let p = 0; p < n; p++) {
        const q = (p - k + n) % n;
        const a = T1(p), b = T2(q);
        endRel = Math.max(endRel, a + s, b + s);
        rows.push([p + 1, fmt(sop + a), q + 1, fmt(sop + b), { v: dur(a <= b ? b - (a + s) : a - (b + s)), warn: (a <= b ? b - (a + s) : a - (b + s)) < 50 }]);
      }
      res.end = sop + endRel;
      res.detail = { cols: ['Startplatz R1', 'Route 1', 'Startplatz R2', 'Route 2', 'Pause'], rows };
    } else {
      res.events.push({ key: 'sop', t: sop, label: `Start Route (${n} Starter)` });
      cleanEvents(slot, 'Route');
      res.end = sop + routeLen;
      res.detail = { cols: ['Startplatz', 'Start'], rows: Array.from({ length: n }, (_, p) => [p + 1, fmt(sop + slot(p))]) };
    }
    res.first = Math.min(first, sop);
  }

  /* ---------- BOULDER ---------- */
  function boulder(r, sop, res) {
    const n = Math.max(0, Math.round(num(r.starters, 0)));
    const bf = r.boulderFormat || 'interval';
    const onsight = (r.sight || 'onsight') === 'onsight';
    preEvents(r, sop, res, { iso: onsight });
    const B = Math.max(1, Math.round(num(r.boulders, 4)));
    let obsLen = 0;
    if (r.obsMode === 'per') obsLen = 2 * B;
    else if (r.obsMode === 'joint') obsLen = 8;
    const first = obsAndPres(r, sop, res, obsLen);
    res.first = first;
    const CH = 0.25; // 15 s Wechselpause (Boulder 4.4)

    if (bf === 'interval') {
      const I = num(r.interval, 5), rot = I + CH;
      // Mit Pausen-Rotation: Boulder in jeder zweiten Rotation (Schema World Climbing / Judge Guide 5.2)
      const step = r.restRot ? 2 : 1;
      const R = n + (B - 1) * step;
      res.events.push({ key: 'sop', t: sop, label: `Start (${n} Starter · ${B} Boulder · ${I} min + 15 s${r.restRot ? ' · mit Pausen-Rotation' : ''})` });
      res.end = n ? sop + R * rot - CH : sop;
      res.info = `${R} Rotationen à ${I} min + 15 s`;
      const cols = ['Startplatz'];
      for (let b = 0; b < B; b++) cols.push('B' + (b + 1));
      cols.push('Ende');
      res.detail = { cols, rows: Array.from({ length: n }, (_, i) => [i + 1].concat(Array.from({ length: B }, (_, b) => fmt(sop + (i + b * step) * rot, true)), [fmt(sop + (i + (B - 1) * step + 1) * rot - CH, true)])) };
    } else if (bf === 'flash2sets') {
      // Zwei Sets, Feld in zwei Gruppen versetzt um die halbe Starterzahl (Schema Running Order Flash-Quali)
      const I = num(r.interval, 4), rot = I + CH;
      const b1 = Math.max(1, Math.round(num(r.setSize, 3)));
      const b2 = Math.max(1, Math.round(num(r.setSize2, 2)));
      const step = r.setRest === false ? 1 : 2; // Pausen-Rotation zwischen den Bouldern eines Sets
      const k = Math.floor(n / 2);
      const s1 = (p, g) => p + (p >= k ? g : 0);
      const s2 = (q, g) => q + (q >= n - k ? g : 0);
      const span = (bb) => step * (bb - 1) + 1; // Rotationen vom ersten bis Ende des letzten Boulders
      const restFor = (g) => {
        let min = Infinity;
        for (let i = 0; i < n; i++) {
          const a1 = s1(i, g), a2 = s2((i - k + n) % n, g);
          min = Math.min(min, a1 < a2 ? a2 - (a1 + span(b1)) : a1 - (a2 + span(b2)));
        }
        return min;
      };
      // ≥ 3 Rotationen Erholung zwischen den Sets (Boulder 4.7 C): Leer-Rotationen an der Gruppengrenze automatisch einfügen
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
        for (let j = 0; j < b1; j++) times.push(fmt(sop + (a1 + j * step) * rot, true));
        for (let j = 0; j < b2; j++) times.push(fmt(sop + (a2 + j * step) * rot, true));
        rows.push([i + 1, i < k ? 'A' : 'B', fmt(sop + (Math.min(a1, a2) - 3) * rot, true)].concat(times));
      }
      res.events.push({ key: 'sop', t: sop, label: `Start (${n} Starter · Sets ${b1} + ${b2} Boulder · ${I} min + 15 s)` });
      if (g) {
        res.events.push({ key: 'gap', t: sop + Math.min(k, n - k) * rot, label: `Pause (${g} Rotation${g > 1 ? 'en' : ''}) an der Gruppengrenze` });
        res.warnings.push(W('auto', `Erholung zwischen den Sets eingefügt: ${g} Leer-Rotation${g > 1 ? 'en' : ''} an der Gruppengrenze, sonst nur ${rest0} Rotation${rest0 === 1 ? '' : 'en'} statt 3 (Boulder 4.7 C).`, 'gap'));
      }
      res.end = n ? sop + maxEnd * rot - CH : sop;
      res.info = `${maxEnd} Rotationen à ${I} min + 15 s`;
      const cols = ['Startplatz', 'Gruppe', 'Call Zone'];
      for (let j = 1; j <= b1 + b2; j++) cols.push('B' + j);
      res.detail = { cols, rows };
    } else if (bf === 'parallel') {
      const P = Math.max(1, Math.round(num(r.active, 2)));
      const rot = num(r.rotation, 5);
      const brk = num(r.blockBreak, 0);
      const blocks = Math.ceil(B / P);
      const per = n ? (n + P - 1) * rot : 0;
      res.events.push({ key: 'sop', t: sop, label: `Start (${n} Starter · ${B} Boulder, ${P} parallel · ${dur(rot)} Rotation)` });
      for (let j = 1; j < blocks; j++) {
        res.events.push({ key: 'block', t: sop + j * (per + brk), label: `Start Boulder ${j * P + 1}${P > 1 ? '–' + Math.min(B, (j + 1) * P) : ''}`, minor: true });
      }
      res.end = sop + blocks * per + (blocks - 1) * brk;
      res.info = `${blocks} Block/Blöcke à ${n + P - 1} Rotationen · ${dur(rot)}`;
      const cols = ['Startplatz'];
      for (let j = 0; j < blocks; j++) cols.push(`Start B${j * P + 1}`);
      res.detail = { cols, rows: Array.from({ length: n }, (_, i) => [i + 1].concat(Array.from({ length: blocks }, (_, j) => fmt(sop + j * (per + brk) + i * rot, true)))) };
    } else {
      const d = num(r.jamDur, 120);
      res.events.push({ key: 'sop', t: sop, label: `Start JAM (${n} Starter · ${dur(d)})` });
      res.end = sop + d;
    }
  }

  /* ---------- SPEED ---------- */
  function speedQuali(r, sop, res, label) {
    const n = Math.max(0, Math.round(num(r.starters, 0)));
    const L = Number(r.lanes) === 4 ? 4 : 2;
    const rt = num(r.raceTime, 1);
    const shift = Math.floor(n / L);
    const times = Array.from({ length: n }, () => []);
    for (let a = 0; a < n; a++) for (let l = 0; l < L; l++) times[a].push(((a + l * shift) % n));
    let minGap = Infinity;
    const rows = times.map((races, a) => {
      const sorted = races.slice().sort((x, y) => x - y);
      for (let i = 1; i < sorted.length; i++) minGap = Math.min(minGap, (sorted[i] - sorted[i - 1]) * rt - rt);
      return [a + 1].concat(races.map((j) => fmt(sop + j * rt)));
    });
    res.events.push({ key: 'sop', t: sop, label: `${label} (${n} Starter · ${n} Races · ${dur(rt)}/Race)` });
    res.end = sop + n * rt;
    if (n > 1 && minGap < 5 && label !== 'Start Training') {
      res.warnings.push(W('rest', `Pause zwischen zwei Races eines Athleten nur ${dur(minGap)} statt 5 min (Speed 4.2 C). Mehr Zeit pro Race oder Pause einplanen.`));
    }
    const cols = ['Startplatz A'].concat(['A', 'B', 'C', 'D'].slice(0, L).map((x) => 'Lane ' + x));
    res.detail = { cols, rows };
  }

  function speedFinal(r, sop, res) {
    const L = Number(r.lanes) === 4 ? 4 : 2;
    const Q = Number(r.bracket) || 8;
    const rt = num(r.raceTime, 1), brk = num(r.phaseBreak, 5);
    const phases = [];
    let size = Q;
    if (L === 2) {
      while (size > 4) { phases.push({ name: size === 16 ? 'Achtelfinale' : size === 8 ? 'Viertelfinale' : `Runde der ${size}`, races: size / 2 }); size /= 2; }
      phases.push({ name: 'Halbfinale', races: 2 });
      phases.push({ name: 'Kleines + großes Finale', races: 2, medal: true, fromAll: true });
    } else {
      while (size > 4) { phases.push({ name: `Runde der ${size}`, races: size / 4 }); size /= 2; }
      phases.push({ name: 'Finale (Medal Race)', races: 1, medal: true, fromAll: true });
    }
    let t = sop, minGap = Infinity, prev = null;
    res.events.push({ key: 'sop', t: sop, label: `Start Finale (Wettkampfbaum ${Q})` });
    phases.forEach((ph, idx) => {
      if (idx > 0) {
        t += brk;
        if (ph.medal && r.presentation) {
          const pd = num(r.presDur, 5);
          res.events.push({ key: 'pres', t, label: `Präsentation Finalisten (${dur(pd)})` });
          t += pd + num(r.presPause, 2);
        }
      }
      ph.start = t;
      if (idx > 0) res.events.push({ key: 'phase', t, label: `${ph.name} (${ph.races} Race${ph.races > 1 ? 's' : ''})`, minor: !ph.medal });
      else res.events[res.events.length - 1].label += ` · ${ph.name}`;
      if (prev) {
        for (let j = 0; j < ph.races; j++) {
          const src = ph.fromAll ? prev.races - 1 : Math.min(prev.races - 1, 2 * j + 1);
          const gap = (t + j * rt) - (prev.start + (src + 1) * rt);
          minGap = Math.min(minGap, gap);
        }
      }
      t += ph.races * rt;
      prev = ph;
    });
    res.end = t;
    if (minGap < 5) res.warnings.push(W('rest', `Pause zwischen zwei Races eines Athleten im Wettkampfbaum nur ${dur(minGap)} statt 5 min (Speed 4.2 C). Pause zwischen den Phasen erhöhen.`));
    res.detail = { cols: ['Phase', 'Beginn', 'Races'], rows: phases.map((p) => [p.name, fmt(p.start), p.races]) };
  }

  function speed(r, sop, res) {
    const sf = r.speedFormat || 'quali';
    preEvents(r, sop, res, { iso: false });
    res.first = sop;
    if (sf === 'training') {
      if (num(r.trainDur, 0) > 0) {
        res.events.push({ key: 'sop', t: sop, label: `Start Training (${dur(num(r.trainDur, 0))})` });
        res.end = sop + num(r.trainDur, 0);
      } else speedQuali(r, sop, res, 'Start Training');
    } else if (sf === 'quali') speedQuali(r, sop, res, 'Start');
    else {
      res.first = obsAndPres(Object.assign({}, r, { presentation: false }), sop, res, 0);
      speedFinal(r, sop, res);
    }
  }

  /* ---------- Einzelne Runde ---------- */
  function computeRound(r) {
    const res = { id: r.id, round: r, events: [], warnings: [], detail: null, sop: null, end: null, result: null };
    const sop = toMin(r.start);
    if (sop == null) { res.warnings.push(W('error', 'Keine Startzeit angegeben.')); return res; }
    res.sop = sop;
    if (r.discipline === 'lead') lead(r, sop, res);
    else if (r.discipline === 'boulder') boulder(r, sop, res);
    else speed(r, sop, res);
    const n = Math.round(num(r.starters, 0));
    if (r.phase !== 'training' && n < 4 && r.phase === 'quali') res.warnings.push(W('info', `Nur ${n} Starter – bei weniger als 4 Registrierten findet für die Kategorie kein Wettkampf statt (Allg. 6.2).`));
    res.result = res.end + (r.phase === 'training' ? 0 : num(r.resultBuffer, 15));
    res.events.push({ key: 'end', t: res.end, label: r.phase === 'training' ? 'Ende Training' : 'Ende der Runde (voraussichtlich)' });
    if (r.phase !== 'training') res.events.push({ key: 'result', t: res.result, label: 'Offizielles Ergebnis (voraussichtlich)', minor: true });
    const firstEv = Math.min.apply(null, res.events.filter((e) => e.key !== 'warmup' && e.key !== 'demo' && e.key !== 'iso').map((e) => e.t));
    res.occupy = [Math.min(res.first != null ? res.first : sop, firstEv), res.end];
    return res;
  }

  /* ---------- Ganzer Wettkampf inkl. rundenübergreifender Prüfungen ---------- */
  function computeAll(comp) {
    const results = comp.rounds.map((r) => {
      const rr = Object.assign({}, r, { day: r.day || comp.date });
      return computeRound(rr);
    });
    const byId = {}; results.forEach((x) => { byId[x.id] = x; });
    const wallName = (id) => (comp.walls.find((w) => w.id === id) || {}).name || '?';

    // Wandbelegung
    for (let i = 0; i < results.length; i++) for (let j = i + 1; j < results.length; j++) {
      const a = results[i], b = results[j];
      if (a.sop == null || b.sop == null) continue;
      if ((a.round.day || comp.date) !== (b.round.day || comp.date)) continue;
      const shared = (a.round.walls || []).filter((w) => (b.round.walls || []).includes(w));
      if (!shared.length) continue;
      if (a.occupy[0] < b.occupy[1] && b.occupy[0] < a.occupy[1]) {
        const names = shared.map(wallName).join(', ');
        a.warnings.push(W('error', `Wand „${names}“ ist gleichzeitig mit ${label(b.round)} belegt (${fmt(b.occupy[0])}–${fmt(b.occupy[1])}).`));
        b.warnings.push(W('error', `Wand „${names}“ ist gleichzeitig mit ${label(a.round)} belegt (${fmt(a.occupy[0])}–${fmt(a.occupy[1])}).`));
      }
    }
    // Rundenfolge je Kategorie
    const groups = {};
    results.forEach((x) => {
      if (x.sop == null || x.round.phase === 'training') return;
      const k = [x.round.discipline, (x.round.category || '').trim().toLowerCase()].join('|');
      (groups[k] = groups[k] || []).push(x);
    });
    Object.values(groups).forEach((list) => {
      list.sort((a, b) => (PHASE_ORDER[a.round.phase] - PHASE_ORDER[b.round.phase]) || ((a.round.day || '').localeCompare(b.round.day || '')) || (a.sop - b.sop));
      for (let i = 1; i < list.length; i++) {
        const p = list[i - 1], c = list[i];
        const sameDay = (p.round.day || comp.date) === (c.round.day || comp.date);
        if (!sameDay) continue;
        const gap = c.sop - p.result;
        if (gap < 0) c.warnings.push(W('error', `Start vor dem voraussichtlichen Ergebnis der ${PHASES[p.round.phase]} (${fmt(p.result)}).`));
        else if (c.round.discipline === 'lead' && gap < 60) c.warnings.push(W('error', `Nur ${dur(gap)} zwischen Ergebnis der ${PHASES[p.round.phase]} (${fmt(p.result)}) und Start of Play – mindestens 1 Stunde (Lead 4.5).`));
        // National nicht geregelt → international: 2 h (World Climbing Event Regulations, Annex C 4.7)
        else if (c.round.discipline === 'boulder' && gap < 120) c.warnings.push(W('should', `Nur ${dur(gap)} zwischen Ergebnis der ${PHASES[p.round.phase]} (${fmt(p.result)}) und Start of Play – international sind 2 Stunden vorgesehen (World Climbing, Boulder 4.7).`));
      }
    });
    return results;
  }

  function label(r) {
    return `${DISC[r.discipline] || ''} ${r.category || ''} ${PHASES[r.phase] || ''}`.replace(/\s+/g, ' ').trim();
  }

  const api = { computeAll, computeRound, defaults, toMin, fmt, dur, label, PHASES, PHASE_ORDER, DISC };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Calc = api;
})(this);
