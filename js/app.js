/* Oberfläche Zeitplan Kletterwettkampf
   1. Kategorien und Format je Disziplin  2. Zeitplan Zeile für Zeile wie in der Ausschreibung
   Das Tool berechnet nur die Rundenenden und prüft die eingetippten Zeiten gegen das Regelwerk. */
(function () {
  'use strict';
  const C = window.Calc;
  const KEY = 'zeitplan.v3';
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 9);
  const today = () => new Date().toISOString().slice(0, 10);

  let comp = load() || emptyComp();
  const openMore = new Set();
  let results = [], checks = { warn: {}, okay: {} };

  function emptyComp() { return { version: 3, name: '', date: today(), disciplines: [], days: [] }; }
  function load() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(comp)); } catch (e) { /* privater Modus */ } }

  const PHASE_SHORT = { training: 'Training', quali: 'Quali', semi: 'Halbfinale', final: 'Finale', all: 'Komplett' };
  const DEFAULT_TEMPLATE = { boulder: 'regional', lead: 'djc', speed: 's2' };
  const ADD_KINDS = [['open', 'Hallenöffnung'], ['reg', 'Registrierung'], ['tm', 'Technical Meeting'], ['round', 'Runde'], ['iso', 'Isolation'], ['pres', 'Präsentation'], ['obs', 'Besichtigung'], ['ceremony', 'Siegerehrung'], ['custom', 'Punkt']];
  const CAT_KINDS = new Set(['round', 'iso', 'pres', 'obs']);
  const RANGE_KINDS = new Set(['open', 'reg', 'iso', 'pres', 'obs', 'custom', 'ceremony', 'tm']);

  /* ---------- Hilfen ---------- */
  const tpl = (d) => C.TEMPLATES[d.discipline][d.template];
  const allCats = () => comp.disciplines.flatMap((d) => d.cats.map((c) => Object.assign({ disc: d }, c)));
  const catById = (id) => allCats().find((c) => c.id === id);
  const joinAnd = (a) => (a.length > 1 ? a.slice(0, -1).join(', ') + ' und ' + a[a.length - 1] : a.join(''));
  const fmtDay = (iso) => {
    const d = new Date((iso || '') + 'T12:00:00');
    return isNaN(d) ? 'Ohne Datum' : d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  };
  const sortLines = (day) => {
    // nach Uhrzeit; Zeilen ohne Uhrzeit („im Anschluss“) bleiben hinter ihrer Vorgängerzeile
    let last = -1;
    const keyed = day.lines.map((l, i) => { const t = C.toMin(l.time); if (t != null) last = t; return { l, k: t != null ? t : last + 0.0001 * (i + 1), i }; });
    keyed.sort((a, b) => a.k - b.k || a.i - b.i);
    day.lines = keyed.map((x) => x.l);
  };
  const lineDisc = (ln) => comp.disciplines.find((d) => d.id === ln.disc) || comp.disciplines[0];

  /* Bezeichnung einer Zeile, falls nichts eingetragen ist */
  function autoLabel(ln) {
    const names = (ln.cats || []).map((id) => (catById(id) || {}).name).filter(Boolean);
    const multiDisc = comp.disciplines.length > 1;
    if (ln.kind === 'round') {
      const d = lineDisc(ln);
      const catNames = names.length ? names : (d ? d.cats.map((c) => c.name).filter(Boolean) : []);
      const dtxt = multiDisc && d ? ` ${C.DISC[d.discipline]}` : '';
      if (ln.phase === 'all') return `Wettkampf${dtxt} ${joinAnd(catNames)} (Training, Qualifikation, Finale)`.replace(/\s+/g, ' ');
      return `${C.PHASES[ln.phase] || 'Runde'}${dtxt} ${joinAnd(catNames)}`.trim();
    }
    const base = C.KIND_LABEL[ln.kind] || '';
    return names.length ? `${base} ${joinAnd(names)}` : base;
  }
  const labelOf = (ln) => ln.label || autoLabel(ln);

  /* ---------- Rechnen ---------- */
  function recompute() {
    const rounds = C.compileSchedule(comp);
    results = C.computeAll(Object.assign({}, comp, { rounds }), { plain: true });
    checks = C.checkSchedule(comp, results);
  }
  const lineResults = (ln) => results.filter((r) => r.round.line === ln.id && r.sop != null);
  const lineEnd = (ln) => { const rs = lineResults(ln); return rs.length ? Math.max.apply(null, rs.map((r) => r.end)) : null; };

  /* ---------- Bausteine ---------- */
  function seg(attrs, key, opts, cur) {
    return `<div class="seg" role="group">${opts.map(([v, t]) => `<button type="button" class="${String(cur) === String(v) ? 'on' : ''}" data-seg="${key}" data-val="${v}" ${attrs}>${esc(t)}</button>`).join('')}</div>`;
  }
  const row = (html) => `<div class="frow">${html}</div>`;
  const lab = (t, html) => `<div class="lab">${esc(t)}${html}</div>`;

  /* ---------- 1. Kategorien und Format ---------- */
  const OPT = {
    leadFormat: [['flash2', 'Flash · 2 Routen'], ['flash1', 'Flash · 1 Route'], ['onsight', 'On Sight']],
    routeMode: [['par', 'parallel'], ['seq', 'nacheinander']],
    boulderQuali: [['interval', 'Intervall'], ['flash2sets', '2 Gruppen'], ['jam', 'JAM']],
    boulderSemi: [['interval', 'Intervall']],
    boulderFinal: [['finInterval', 'Intervall'], ['worldseries', 'World Series'], ['classic', 'Classic'], ['onebyone', 'One by one']],
    sight: [['flash', 'Flash'], ['onsight', 'On Sight']],
    obsMode: [['joint', '8 min gemeinsam'], ['per', '2 min je Boulder']],
    lanes: [[2, 'Speed 2'], [4, 'Speed 4']],
    bracket: [['auto', 'auto'], [4, '4'], [8, '8'], [16, '16'], [32, '32']],
  };
  function phaseVal(d, ph, k) { return C.discSettings(d, ph)[k]; }
  function pnum(d, ph, k, label, unit, step) {
    return `<label class="nf">${esc(label)}<span class="num"><input type="number" inputmode="decimal" min="0" step="${step || 1}" value="${esc(phaseVal(d, ph, k))}" data-disc="${d.id}" data-ph="${ph}" data-k="${k}">${unit ? `<em>${unit}</em>` : ''}</span></label>`;
  }
  function dnum(d, k, label, unit, step) {
    return `<label class="nf">${esc(label)}<span class="num"><input type="number" min="0" step="${step || 1}" value="${esc(C.discVal(d, k))}" data-disc="${d.id}" data-dk="${k}">${unit ? `<em>${unit}</em>` : ''}</span></label>`;
  }
  function pseg(d, ph, k, opts) { return seg(`data-disc="${d.id}" data-ph="${ph}"`, k, opts, phaseVal(d, ph, k)); }

  function phaseFormat(d, ph) {
    const v = (k) => phaseVal(d, ph, k);
    let h = '', f = '';
    if (d.discipline === 'lead') {
      h += row(pseg(d, ph, 'leadFormat', OPT.leadFormat) + (v('leadFormat') === 'flash2' ? lab('Routen', pseg(d, ph, 'routeMode', OPT.routeMode)) : ''));
      f += pnum(d, ph, 'attempt', 'Ø Versuch', 'min', 0.5);
      f += pnum(d, ph, 'cleanEvery', 'Reinigung (ab 23) alle', 'Starter') + pnum(d, ph, 'cleanDur', 'Dauer Reinigung', 'min');
    } else if (d.discipline === 'boulder') {
      const bf = v('boulderFormat'), F = C.BOULDER_FORMATS[bf] || {};
      const opts = ph === 'final' ? OPT.boulderFinal : ph === 'semi' ? OPT.boulderSemi : OPT.boulderQuali;
      h += row(pseg(d, ph, 'boulderFormat', opts) + (ph === 'quali' ? pseg(d, ph, 'sight', OPT.sight) : ''));
      if (bf === 'flash2sets') f += pnum(d, ph, 'setSize', 'Gruppe A', 'Boulder') + pnum(d, ph, 'setSize2', 'Gruppe B', 'Boulder');
      else if (bf !== 'jam') f += pnum(d, ph, 'boulders', 'Boulder', '');
      if (F.fixed) f += pnum(d, ph, 'interval', 'Intervall', 'min + 15 s', 0.5);
      else if (bf !== 'jam') f += pnum(d, ph, 'rotation', 'Rotation', 'min', 0.25);
      if (bf === 'jam') f += pnum(d, ph, 'jamDur', 'Dauer', 'min', 5);
      if (ph === 'final') h += row(lab('Besichtigung', pseg(d, ph, 'obsMode', OPT.obsMode)));
    } else {
      h += row(pseg(d, ph, 'lanes', OPT.lanes));
      f += pnum(d, ph, 'raceTime', 'Zeit pro Race', 'min', 0.25);
      if (ph === 'training') f += pnum(d, ph, 'trainDur', 'feste Dauer (0 = wie Quali)', 'min', 5);
      if (ph === 'final') {
        h += row(lab('Wettkampfbaum', pseg(d, ph, 'bracket', OPT.bracket.filter(([x]) => x !== 32 || Number(v('lanes')) === 4))));
        f += pnum(d, ph, 'phaseBreak', 'Pause zw. Phasen', 'min');
        h += row(`<label class="check"><input type="checkbox" data-disc="${d.id}" data-ph="${ph}" data-k="presentation"${v('presentation') ? ' checked' : ''}> Präsentation vor den Medal Races</label>`);
      }
    }
    return `<div class="phase-detail"><p class="fs-title">${esc(C.PHASES[ph])}</p>${h}<div class="fgrid">${f}</div></div>`;
  }

  function renderDiscs() {
    $('#emptyDisc').hidden = comp.disciplines.length > 0;
    $('#discList').innerHTML = comp.disciplines.map((d) => {
      const t = tpl(d);
      const quotaCols = t.phases.filter((p) => p === 'semi' || (p === 'final' && d.discipline !== 'speed'));
      const tplOpts = Object.entries(C.TEMPLATES[d.discipline]).map(([k, x]) => `<option value="${k}"${d.template === k ? ' selected' : ''}>${esc(x.label)}</option>`).join('');
      const rows = d.cats.map((c) => `<tr>
          <td><input type="text" value="${esc(c.name)}" data-disc="${d.id}" data-cat="${c.id}" data-ck="name" placeholder="z. B. Damen" aria-label="Kategorie"></td>
          <td class="n"><input type="number" min="0" value="${esc(c.starters)}" data-disc="${d.id}" data-cat="${c.id}" data-ck="starters" aria-label="Starter"></td>
          ${quotaCols.map((p) => `<td class="n"><input type="number" min="0" value="${esc(c[p] != null && c[p] !== '' ? c[p] : (t.quota[p] || ''))}" data-disc="${d.id}" data-cat="${c.id}" data-ck="${p}" aria-label="Quote ${PHASE_SHORT[p]}"></td>`).join('')}
          <td><button type="button" class="icon" data-delcat="${c.id}" data-disc="${d.id}" aria-label="Kategorie entfernen">×</button></td></tr>`).join('');
      const general = (d.discipline === 'speed' ? dnum(d, 'stageGap', 'Pause Training → Quali → Finale', 'min') : '')
        + dnum(d, 'laneGap', 'Wechsel bei „nacheinander“', 'min') + dnum(d, 'resultBuffer', 'Ende → Ergebnis', 'min', 5)
        + (d.discipline !== 'speed' ? dnum(d, 'presDur', 'Präsentation dauert', 'min') : '')
        + (d.discipline === 'boulder' ? dnum(d, 'callZone', 'Call Zone vor Start', 'min') : '');
      return `<article class="card disc d-${d.discipline}" id="disc-${d.id}">
        <div class="disc-head"><span class="pill tag-${d.discipline}">${esc(C.DISC[d.discipline])}</span>
          <select data-disc="${d.id}" data-dk="template" aria-label="Format-Vorlage">${tplOpts}</select>
          <button type="button" class="icon" data-deldisc="${d.id}" aria-label="Disziplin entfernen">×</button></div>
        <ul class="fmt-sum">${t.phases.map((p) => `<li><b>${esc(C.PHASES[p])}:</b> ${esc(C.phaseSummary(d, p))}</li>`).join('')}</ul>
        <table class="cats"><thead><tr><th>Kategorie</th><th class="n">Starter</th>${quotaCols.map((p) => `<th class="n">${PHASE_SHORT[p]}</th>`).join('')}<th></th></tr></thead><tbody>${rows}</tbody></table>
        <button type="button" class="mini" data-addcat="${d.id}">+ Kategorie</button>
        <details class="more" data-more="${d.id}:fmt"${openMore.has(d.id + ':fmt') ? ' open' : ''}><summary>Format anpassen</summary>
          <div class="fgrid">${general}</div>${t.phases.map((p) => phaseFormat(d, p)).join('')}
        </details>
      </article>`;
    }).join('');
  }

  /* ---------- 2. Zeitplan-Zeilen ---------- */
  function lineHtml(day, ln) {
    const isRound = ln.kind === 'round';
    const d = isRound ? lineDisc(ln) : null;
    let sub = '';
    if (CAT_KINDS.has(ln.kind) && allCats().length > 1) {
      const pool = isRound && d ? d.cats.map((c) => Object.assign({ disc: d }, c)) : allCats();
      const eff = (ln.cats || []).length ? ln.cats : pool.map((c) => c.id);
      sub += `<div class="chips-row"><span class="lab-inline">für</span>${pool.map((c) => `<button type="button" class="wchip${eff.includes(c.id) ? ' on' : ''}" data-chip="${c.id}" data-line="${ln.id}" data-day="${day.id}">${esc(c.name || '?')}</button>`).join('')}</div>`;
    }
    if (isRound) {
      if (comp.disciplines.length > 1) sub += row(seg(`data-line="${ln.id}" data-day="${day.id}"`, 'disc', comp.disciplines.map((x) => [x.id, C.DISC[x.discipline]]), ln.disc));
      if (d) {
        const phases = tpl(d).phases.map((p) => [p, C.PHASES[p]]);
        if (d.discipline === 'speed') phases.push(['all', 'Training + Quali + Finale']);
        const nCats = (ln.cats || []).length || d.cats.length;
        const lay = [['par', 'parallel'], ['seq', 'nacheinander']].concat(d.discipline === 'speed' && ln.phase === 'final' ? [['pair', 'verschränkt']] : []);
        sub += row(seg(`data-line="${ln.id}" data-day="${day.id}"`, 'phase', phases, ln.phase) + (nCats > 1 ? seg(`data-line="${ln.id}" data-day="${day.id}"`, 'layout', lay, ln.layout || (d.discipline === 'speed' ? 'seq' : 'par')) : ''));
      }
      sub += `<div class="calc" data-calc="${ln.id}"></div><details class="more starts" data-more="${ln.id}:st"${openMore.has(ln.id + ':st') ? ' open' : ''}><summary>Startzeiten</summary><div data-starts="${ln.id}"></div></details>`;
    }
    sub += `<div class="warns" data-warns="${ln.id}"></div>`;
    return `<div class="line k-${ln.kind}" id="line-${ln.id}">
      <input type="time" value="${esc(ln.time)}" data-line="${ln.id}" data-day="${day.id}" data-lk="time" aria-label="Uhrzeit" title="leer = im Anschluss">
      ${RANGE_KINDS.has(ln.kind) ? `<input type="time" value="${esc(ln.until)}" data-line="${ln.id}" data-day="${day.id}" data-lk="until" aria-label="bis (optional)" title="bis (optional)">` : '<span class="until-calc" data-endcell="' + ln.id + '"></span>'}
      <input type="text" value="${esc(ln.label)}" placeholder="${esc(autoLabel(ln))}" data-line="${ln.id}" data-day="${day.id}" data-lk="label" aria-label="Bezeichnung">
      <button type="button" class="icon" data-delline="${ln.id}" data-day="${day.id}" aria-label="Zeile entfernen">×</button>
      <div class="line-sub">${sub}</div>
    </div>`;
  }

  function renderDays() {
    $('#dayList').innerHTML = comp.days.map((day) => {
      const cats = dayCats(day);
      return `<article class="card day-card" id="day-${day.id}">
        <div class="day-head">
          <input type="date" value="${esc(day.date)}" data-day="${day.id}" data-dk="date" aria-label="Datum">
          <input type="text" value="${esc(day.title)}" placeholder="${esc(cats.length ? joinAnd(cats) : 'Überschrift (optional)')}" data-day="${day.id}" data-dk="title" aria-label="Überschrift des Tages">
          <button type="button" class="icon" data-delday="${day.id}" aria-label="Tag entfernen">×</button>
        </div>
        <div class="lines">${day.lines.map((ln) => lineHtml(day, ln)).join('') || '<p class="muted small">Noch keine Zeile – unten hinzufügen.</p>'}</div>
        <div class="chips add-lines">${ADD_KINDS.map(([k, t]) => `<button type="button" class="wchip" data-addline="${k}" data-day="${day.id}">+ ${esc(t)}</button>`).join('')}</div>
      </article>`;
    }).join('') || '<p class="muted small">Noch kein Tag. „Zeitplan vorschlagen“ füllt einen regelkonformen Plan vor – oder lege mit „+ Tag“ selbst los.</p>';
    updateLines();
  }

  function dayCats(day) {
    const ids = new Set();
    day.lines.filter((l) => l.kind === 'round').forEach((l) => {
      const d = lineDisc(l); if (!d) return;
      ((l.cats || []).length ? l.cats : d.cats.map((c) => c.id)).forEach((id) => ids.add(id));
    });
    return allCats().filter((c) => ids.has(c.id)).map((c) => c.name).filter(Boolean);
  }

  /* berechnete Werte, Hinweise und Startzeiten je Zeile aktualisieren (ohne die Eingabe neu zu zeichnen) */
  function updateLines() {
    comp.days.forEach((day) => day.lines.forEach((ln) => {
      const ws = checks.warn[ln.id] || [], ok = checks.okay[ln.id] || [];
      const wEl = document.querySelector(`[data-warns="${ln.id}"]`);
      if (wEl) wEl.innerHTML = ws.map((w) => `<div class="warn ${w.level}">${esc(w.text)}</div>`).join('') + (ln.kind === 'round' && !ws.some((w) => w.level === 'error' || w.level === 'should') && ok.length ? `<div class="okline">✓ ${esc(ok.join(' · '))}</div>` : '');
      const inp = document.querySelector(`input[data-line="${ln.id}"][data-lk="label"]`);
      if (inp) inp.placeholder = autoLabel(ln);
      if (ln.kind !== 'round') return;
      const rs = lineResults(ln), end = lineEnd(ln);
      const cEl = document.querySelector(`[data-calc="${ln.id}"]`);
      const parts = [...new Set(rs.map((r) => `${r.round.category}: ${C.fmt(r.sop)}–${C.fmt(r.end)}`))];
      if (cEl) cEl.textContent = rs.length ? `Dauer ${C.dur(end - C.toMin(ln.time))}${rs.length > 1 ? ' · ' + parts.join(' · ') : rs[0].info ? ' · ' + rs[0].info : ''}` : (ln.time ? 'Kategorien und Format oben eintragen' : 'Startzeit eintragen');
      const eEl = document.querySelector(`[data-endcell="${ln.id}"]`);
      if (eEl) eEl.textContent = end != null ? '– ' + C.fmt(end) : '';
      const sEl = document.querySelector(`[data-starts="${ln.id}"]`);
      if (sEl) sEl.innerHTML = startsHtml(rs);
    }));
  }

  function startsHtml(rs) {
    return rs.map((x) => {
      const det = x.detail;
      if (!det || !det.rows.length) return '';
      return `<p class="fs-title" style="margin-top:8px">${esc(x.round.category)} · ${esc(C.PHASES[x.round.phase])} · ${C.fmt(x.sop)}–${C.fmt(x.end)}</p><div class="detail-wrap"><table><thead><tr>${det.cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${det.rows.map((r) => `<tr>${r.map((c) => (typeof c === 'object' && c ? `<td class="${c.warn ? 'warncell' : ''}">${esc(c.v)}</td>` : `<td>${esc(c)}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
    }).join('');
  }

  /* ---------- Ausgabe wie Ausschreibung ---------- */
  function timeText(ln) {
    const t = C.toMin(ln.time);
    if (t == null) return 'im Anschluss';
    if (ln.kind === 'round') { const e = lineEnd(ln); return e != null ? `${C.fmt(t)} bis ca. ${C.fmt(e)} Uhr` : `${C.fmt(t)} Uhr`; }
    const u = C.toMin(ln.until);
    return u != null ? `${C.fmt(t)} bis ${C.fmt(u)} Uhr` : `${C.fmt(t)} Uhr`;
  }

  function renderPlan() {
    const allW = Object.entries(checks.warn).flatMap(([id, ws]) => ws.map((w) => Object.assign({ id }, w)));
    const cnt = { error: 0, rest: 0, auto: 0, should: 0, info: 0 };
    allW.forEach((w) => { cnt[w.level]++; });
    const sum = [];
    if (cnt.error) sum.push(`<span class="pill err">${cnt.error} ${cnt.error > 1 ? 'Regelverstöße' : 'Regelverstoß'}</span>`);
    if (cnt.rest) sum.push(`<span class="pill rest">${cnt.rest} Ruhezeit-Warnung${cnt.rest > 1 ? 'en' : ''}</span>`);
    if (cnt.should) sum.push(`<span class="pill should">${cnt.should} Empfehlung${cnt.should > 1 ? 'en' : ''}</span>`);
    if (cnt.auto) sum.push(`<span class="pill auto">${cnt.auto}× Ruhezeit automatisch eingeplant</span>`);
    if (cnt.info) sum.push(`<span class="pill info">${cnt.info} Hinweis${cnt.info > 1 ? 'e' : ''}</span>`);
    const hasRounds = comp.days.some((d) => d.lines.some((l) => l.kind === 'round'));
    if (!cnt.error && !cnt.should && !cnt.rest && hasRounds) sum.unshift('<span class="pill ok">✓ Alle Regeln eingehalten</span>');
    $('#summary').innerHTML = sum.join('');
    $('#planTitle').textContent = comp.name || 'Zeitplan';
    const showStart = $('#showStart').checked;
    const days = comp.days.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    $('#planBody').innerHTML = days.map((day) => {
      const cats = dayCats(day);
      const title = day.title || joinAnd(cats);
      const marks = (ln) => { const ws = (checks.warn[ln.id] || []).filter((w) => w.level === 'error' || w.level === 'should'); return ws.length ? ` <span class="mark ${ws.some((w) => w.level === 'error') ? 'error' : 'should'}" title="${esc(ws.map((w) => w.text).join(' | '))}">!</span>` : ''; };
      let h = `<section class="day"><h3 class="day-title">${esc(fmtDay(day.date))}${title ? ': ' + esc(title) : ''}</h3>
        <table class="sched">${day.lines.map((ln) => `<tr class="${ln.kind === 'round' ? 'main' : ''} jump" data-jumpline="${ln.id}"><td>${esc(labelOf(ln))}${marks(ln)}</td><td class="tm">${esc(timeText(ln))}</td></tr>`).join('')}</table>`;
      const dayW = day.lines.flatMap((ln) => (checks.warn[ln.id] || []).map((w) => ({ w, ln })));
      if (dayW.length) h += `<div class="day-warns">${dayW.map(({ w, ln }) => `<span class="rowwarn ${w.level}">${esc(labelOf(ln))}: ${esc(w.text)}</span>`).join('')}</div>`;
      if (showStart) h += day.lines.filter((l) => l.kind === 'round').map((l) => startsHtml(lineResults(l))).join('');
      return h + '</section>';
    }).join('') || '<p class="muted empty">Der Zeitplan erscheint hier, sobald Zeilen eingetragen sind.</p>';
  }

  function renderAll() {
    $('#compName').value = comp.name || '';
    $('#compDate').value = comp.date || '';
    recompute(); renderDiscs(); renderDays(); renderPlan(); save();
  }
  function refresh() { recompute(); updateLines(); renderPlan(); save(); }

  /* ---------- Ereignisse ---------- */
  const findDisc = (id) => comp.disciplines.find((d) => d.id === id);
  const findDay = (id) => comp.days.find((d) => d.id === id);
  const findLine = (day, id) => (day ? day.lines.find((l) => l.id === id) : null);
  const toVal = (t) => (t.type === 'checkbox' ? t.checked : t.type === 'number' ? (t.value === '' ? '' : Number(t.value)) : t.value);
  const setPhase = (d, ph, k, v) => { d.phases = d.phases || {}; d.phases[ph] = d.phases[ph] || {}; d.phases[ph][k] = v; };

  document.addEventListener('toggle', (e) => {
    const k = e.target.dataset && e.target.dataset.more;
    if (k) e.target.open ? openMore.add(k) : openMore.delete(k);
  }, true);

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'compName') { comp.name = t.value; refresh(); return; }
    if (t.id === 'compDate') { comp.date = t.value; refresh(); return; }
    if (t.tagName === 'SELECT' || t.type === 'checkbox') return;
    if (t.dataset.line) {
      const ln = findLine(findDay(t.dataset.day), t.dataset.line); if (!ln) return;
      ln[t.dataset.lk] = t.value; refresh(); return;
    }
    if (t.dataset.day && t.dataset.dk) { const day = findDay(t.dataset.day); if (day) { day[t.dataset.dk] = t.value; refresh(); } return; }
    const d = findDisc(t.dataset.disc); if (!d) return;
    if (t.dataset.cat) { const c = d.cats.find((x) => x.id === t.dataset.cat); if (c) c[t.dataset.ck] = toVal(t); refresh(); renderDayChipsLabels(); return; }
    if (t.dataset.ph) setPhase(d, t.dataset.ph, t.dataset.k, toVal(t));
    else if (t.dataset.dk) d[t.dataset.dk] = toVal(t);
    refresh();
    const sum = document.querySelector(`#disc-${d.id} .fmt-sum`);
    if (sum) sum.innerHTML = tpl(d).phases.map((p) => `<li><b>${esc(C.PHASES[p])}:</b> ${esc(C.phaseSummary(d, p))}</li>`).join('');
  });
  // Kategorienamen in den Zeitplan-Chips nachziehen, ohne das Eingabefeld zu verlieren
  function renderDayChipsLabels() {
    allCats().forEach((c) => document.querySelectorAll(`[data-chip="${c.id}"]`).forEach((b) => { b.textContent = c.name || '?'; }));
  }

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.line && t.dataset.lk === 'time') { const day = findDay(t.dataset.day); sortLines(day); renderDays(); renderPlan(); save(); return; }
    if (t.dataset.day && t.dataset.dk === 'date') { renderDays(); renderPlan(); save(); return; }
    if (!(t.tagName === 'SELECT' || t.type === 'checkbox')) return;
    const d = findDisc(t.dataset.disc); if (!d) return;
    if (t.dataset.ph) setPhase(d, t.dataset.ph, t.dataset.k, toVal(t));
    else if (t.dataset.dk === 'template') { d.template = t.value; d.phases = {}; }
    recompute(); renderDiscs(); renderDays(); renderPlan(); save();
  });

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-seg],[data-chip],[data-addline],[data-delline],[data-delday],[data-adddisc],[data-deldisc],[data-addcat],[data-delcat],[data-jumpline]');
    if (!t) return;
    if (t.dataset.seg) {
      const k = t.dataset.seg, raw = t.dataset.val;
      const v = /^\d+$/.test(raw) ? Number(raw) : raw;
      if (t.dataset.line) {
        const ln = findLine(findDay(t.dataset.day), t.dataset.line); if (!ln) return;
        ln[k] = v;
        if (k === 'disc') ln.cats = [];
        if (k === 'phase' && v !== 'final' && ln.layout === 'pair') ln.layout = '';
      } else {
        const d = findDisc(t.dataset.disc); if (!d) return;
        setPhase(d, t.dataset.ph, k, v);
        if (k === 'boulderFormat') Object.entries(C.boulderFormatDefaults(v, t.dataset.ph)).forEach(([kk, vv]) => { if (!['sight', 'obsMode'].includes(kk) || t.dataset.ph !== 'quali') setPhase(d, t.dataset.ph, kk, vv); });
        recompute(); renderDiscs();
      }
      recompute(); renderDays(); renderPlan(); save();
      return;
    }
    if (t.dataset.chip) {
      const ln = findLine(findDay(t.dataset.day), t.dataset.line); if (!ln) return;
      // keine Auswahl = alle Kategorien; ein Klick nimmt eine Kategorie heraus bzw. wieder hinein
      const d = ln.kind === 'round' ? lineDisc(ln) : null;
      const pool = (d ? d.cats : allCats()).map((c) => c.id);
      const set = new Set((ln.cats || []).length ? ln.cats : pool);
      set.has(t.dataset.chip) ? set.delete(t.dataset.chip) : set.add(t.dataset.chip);
      if (!set.size) return;
      ln.cats = set.size === pool.length ? [] : pool.filter((id) => set.has(id));
      recompute(); renderDays(); renderPlan(); save();
    } else if (t.dataset.addline) {
      const day = findDay(t.dataset.day);
      const k = t.dataset.addline;
      const ln = { id: uid(), kind: k, time: '', until: '', label: '', cats: [] };
      if (k === 'round') {
        const d = comp.disciplines[0];
        ln.disc = d ? d.id : '';
        const used = day.lines.filter((l) => l.kind === 'round').map((l) => l.phase);
        const phases = d ? tpl(d).phases : ['quali'];
        ln.phase = phases.find((p) => !used.includes(p)) || phases[phases.length - 1];
      }
      day.lines.push(ln);
      recompute(); renderDays(); renderPlan(); save();
      const el = $(`#line-${ln.id} input[data-lk="time"]`);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); }
    } else if (t.dataset.delline) {
      const day = findDay(t.dataset.day);
      day.lines = day.lines.filter((l) => l.id !== t.dataset.delline);
      recompute(); renderDays(); renderPlan(); save();
    } else if (t.dataset.delday) {
      const day = findDay(t.dataset.delday);
      if (day.lines.length && !confirm(`${fmtDay(day.date)} mit allen Zeilen löschen?`)) return;
      comp.days = comp.days.filter((d) => d !== day);
      recompute(); renderDays(); renderPlan(); save();
    } else if (t.dataset.adddisc) {
      const k = t.dataset.adddisc;
      comp.disciplines.push({ id: uid(), discipline: k, template: DEFAULT_TEMPLATE[k], phases: {}, cats: [{ id: uid(), name: '', starters: 20 }] });
      recompute(); renderDiscs(); renderDays(); renderPlan(); save();
      const inp = document.querySelectorAll('#discList input[data-ck="name"]');
      if (inp.length) inp[inp.length - 1].focus();
    } else if (t.dataset.deldisc) {
      const d = findDisc(t.dataset.deldisc);
      if (!confirm(`${C.DISC[d.discipline]} mit allen Kategorien entfernen? Runden im Zeitplan verlieren ihre Zuordnung.`)) return;
      comp.disciplines = comp.disciplines.filter((x) => x !== d);
      recompute(); renderDiscs(); renderDays(); renderPlan(); save();
    } else if (t.dataset.addcat) {
      const d = findDisc(t.dataset.addcat);
      d.cats.push({ id: uid(), name: '', starters: 20 });
      recompute(); renderDiscs(); renderDays(); renderPlan(); save();
      const inp = document.querySelectorAll(`#disc-${d.id} input[data-ck="name"]`);
      if (inp.length) inp[inp.length - 1].focus();
    } else if (t.dataset.delcat) {
      const d = findDisc(t.dataset.disc);
      d.cats = d.cats.filter((c) => c.id !== t.dataset.delcat);
      comp.days.forEach((day) => day.lines.forEach((l) => { l.cats = (l.cats || []).filter((id) => id !== t.dataset.delcat); }));
      recompute(); renderDiscs(); renderDays(); renderPlan(); save();
    } else if (t.dataset.jumpline) {
      const el = document.getElementById('line-' + t.dataset.jumpline);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200); }
    }
  });

  $('#btnAddDay').addEventListener('click', () => {
    const last = comp.days.length ? comp.days[comp.days.length - 1].date : '';
    let date = comp.date;
    if (last) { const d = new Date(last + 'T12:00:00'); d.setDate(d.getDate() + 1); date = d.toISOString().slice(0, 10); }
    comp.days.push({ id: uid(), date, title: '', lines: [] });
    renderDays(); renderPlan(); save();
  });
  $('#btnSuggest').addEventListener('click', () => {
    if (!comp.disciplines.some((d) => d.cats.length)) { alert('Bitte zuerst oben die Disziplin und die Kategorien eintragen.'); return; }
    if (comp.days.some((d) => d.lines.length) && !confirm('Den bisherigen Zeitplan durch einen Vorschlag ersetzen?')) return;
    comp.days = C.suggestSchedule(comp, $('#suggestStart').value || '09:00');
    renderAll();
  });
  $('#showStart').addEventListener('change', renderPlan);
  $('#printWarn').addEventListener('change', (e) => document.body.classList.toggle('print-warn', e.target.checked));
  $('#btnPrint').addEventListener('click', () => window.print());
  $('#btnNew').addEventListener('click', () => {
    if ((comp.days.length || comp.disciplines.length) && !confirm('Aktuellen Wettkampf verwerfen und neu beginnen? Vorher ggf. exportieren.')) return;
    comp = emptyComp(); renderAll();
  });
  $('#btnExample').addEventListener('click', () => {
    if ((comp.days.length || comp.disciplines.length) && !confirm('Aktuellen Wettkampf durch das Beispiel ersetzen?')) return;
    comp = example(); renderAll();
  });
  $('#btnExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(comp, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (comp.name || 'zeitplan').replace(/[^\wäöüÄÖÜß-]+/g, '_') + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#btnImport').addEventListener('click', () => $('#fileImport').click());
  $('#fileImport').addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then((txt) => {
      const data = JSON.parse(txt);
      if (!data || !Array.isArray(data.days) || !Array.isArray(data.disciplines)) throw new Error('format');
      comp = data; renderAll();
    }).catch(() => alert('Die Datei konnte nicht gelesen werden. Bitte eine exportierte Zeitplan-Datei (.json) dieser Version wählen.'));
    e.target.value = '';
  });

  /* ---------- Beispiel: Süddeutsche Meisterschaft Bouldern 2026 (Ausschreibung Rosenheim) ---------- */
  function example() {
    const D = uid(), H = uid(), disc = uid();
    const L = (kind, time, until, extra) => Object.assign({ id: uid(), kind, time: time || '', until: until || '', label: '', cats: [] }, extra);
    return {
      version: 3, name: 'Süddeutsche Meisterschaft Bouldern', date: '2026-03-07',
      disciplines: [{ id: disc, discipline: 'boulder', template: 'regional', phases: {},
        cats: [{ id: D, name: 'Damen', starters: 61, semi: 20, final: 10 }, { id: H, name: 'Herren', starters: 76, semi: 20, final: 10 }] }],
      days: [
        { id: uid(), date: '2026-03-07', title: '', lines: [
          L('reg', '10:00', '10:30', { label: 'Registrierung Bouldern Damen und Herren' }), L('tm', '11:00'),
          L('round', '11:30', '', { disc, phase: 'quali' })] },
        { id: uid(), date: '2026-03-08', title: '', lines: [
          L('iso', '08:00', '09:00', { label: 'Isolation Halbfinale' }), L('round', '10:00', '', { disc, phase: 'semi' }),
          L('iso', '13:00', '13:30', { label: 'Isolation Finale' }), L('pres', '14:30', '', { label: 'Präsentation Finale' }),
          L('round', '14:45', '', { disc, phase: 'final' }), L('ceremony', '', '')] },
      ],
    };
  }

  renderAll();
})();
