/* Oberfläche Zeitplan Kletterwettkampf – Eingabe in Blöcken (Tag + Disziplin + Kategorien + Vorlage) */
(function () {
  'use strict';
  const C = window.Calc;
  const KEY = 'zeitplan.v2';
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 9);
  const today = () => new Date().toISOString().slice(0, 10);

  let comp = load() || emptyComp();
  const open = new Set();
  const openMore = new Set();
  let results = [];

  function emptyComp() { return { version: 2, name: '', date: today(), walls: [], blocks: [], items: [] }; }
  function load() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(comp)); } catch (e) { /* privater Modus */ } }

  const PHASE_SHORT = { training: 'Training', quali: 'Quali', semi: 'Halbfinale', final: 'Finale' };
  const DEFAULT_TEMPLATE = { lead: 'djc', boulder: 'bwjc', speed: 's2' };

  /* ---------- Werte eines Blocks ---------- */
  const tpl = (b) => C.TEMPLATES[b.discipline][b.template];
  const phaseVal = (b, ph, k) => {
    const o = (b.phases || {})[ph] || {};
    return o[k] !== undefined ? o[k] : C.blockPhaseSettings(b.discipline, b.template, ph)[k];
  };
  const setPhaseVal = (b, ph, k, v) => { b.phases = b.phases || {}; b.phases[ph] = b.phases[ph] || {}; b.phases[ph][k] = v; };
  const nextOf = (b, ph) => { b.next = b.next || {}; b.next[ph] = b.next[ph] || { mode: 'auto', time: '', gap: '' }; return b.next[ph]; };

  /* ---------- Bausteine ---------- */
  const OPT = {
    leadFormat: [['flash2', 'Flash · 2 Routen'], ['flash1', 'Flash · 1 Route'], ['onsight', 'On Sight']],
    routeMode: [['par', 'parallel'], ['seq', 'nacheinander']],
    boulderQuali: [['interval', 'Intervall'], ['flash2sets', '2 Kurse'], ['jam', 'JAM']],
    boulderSemi: [['interval', 'Intervall']],
    boulderFinal: [['worldseries', 'World Series'], ['finInterval', 'Intervall'], ['classic', 'Classic'], ['onebyone', 'One by one']],
    sight: [['onsight', 'On Sight'], ['flash', 'Flash']],
    obsMode: [['none', 'keine'], ['per', '2 min je Boulder'], ['joint', '8 min gemeinsam']],
    groups: [[1, '1 Gruppe'], [2, '2 Startgruppen']],
    lanes: [[2, 'Speed 2'], [4, 'Speed 4']],
    bracket: [['auto', 'auto'], [4, '4'], [8, '8'], [16, '16'], [32, '32']],
    presWhen: [['medal', 'vor den Medal Races'], ['semi', 'vor dem Halbfinale']],
    layout: [['seq', 'nacheinander'], ['par', 'parallel']],
    nextMode: [['auto', 'automatisch'], ['time', 'Uhrzeit']],
  };

  // Segment-Knöpfe und Zahlenfelder für Phasen-Einstellungen (data-ph) oder Block-Einstellungen (ohne data-ph)
  function seg(b, ph, k, opts, cur) {
    const v = cur !== undefined ? cur : phaseVal(b, ph, k);
    return `<div class="seg" role="group">${opts.map(([val, t]) => `<button type="button" class="${String(v) === String(val) ? 'on' : ''}" data-seg="${k}" data-val="${val}" data-b="${b.id}"${ph ? ` data-ph="${ph}"` : ''}>${esc(t)}</button>`).join('')}</div>`;
  }
  function numf(b, ph, k, label, unit, step) {
    return `<label class="nf">${esc(label)}<span class="num"><input type="number" inputmode="decimal" min="0" step="${step || 1}" value="${esc(phaseVal(b, ph, k))}" data-b="${b.id}" data-ph="${ph}" data-k="${k}">${unit ? `<em>${unit}</em>` : ''}</span></label>`;
  }
  const row = (html) => `<div class="frow">${html}</div>`;
  const lab = (t, html) => `<div class="lab">${esc(t)}${html}</div>`;

  /* Einstellungen einer Phase (unter „Details aus der Vorlage“) */
  function phaseDetails(b, ph) {
    const d = b.discipline, v = (k) => phaseVal(b, ph, k);
    let h = '', f = '';
    if (d === 'lead') {
      h += row(seg(b, ph, 'leadFormat', OPT.leadFormat));
      if (v('leadFormat') === 'flash2') h += row(lab('Routen', seg(b, ph, 'routeMode', OPT.routeMode)) + lab('Startgruppen', seg(b, ph, 'groups', OPT.groups)));
      f += numf(b, ph, 'attempt', 'Ø Versuch', 'min', 0.5);
      f += numf(b, ph, 'cleanEvery', 'Reinigung ab 23 Startern alle', 'Starter') + numf(b, ph, 'cleanDur', 'Dauer Reinigung', 'min');
      if (v('leadFormat') === 'onsight') f += numf(b, ph, 'isoClose', 'Isolation schließt vorher', 'min', 5) + numf(b, ph, 'obsBefore', 'Besichtigung (6 min) beginnt vorher', 'min');
    } else if (d === 'boulder') {
      const bf = v('boulderFormat');
      const F = C.BOULDER_FORMATS[bf] || {};
      const opts = ph === 'final' ? OPT.boulderFinal : ph === 'semi' ? OPT.boulderSemi : OPT.boulderQuali;
      h += row(seg(b, ph, 'boulderFormat', opts) + (ph === 'quali' ? seg(b, ph, 'sight', OPT.sight) : ''));
      if (bf === 'interval' && ph === 'quali') h += row(lab('Startgruppen', seg(b, ph, 'groups', OPT.groups)));
      if (bf === 'flash2sets') f += numf(b, ph, 'setSize', 'Kurs A', 'Boulder') + numf(b, ph, 'setSize2', 'Kurs B', 'Boulder');
      else if (bf !== 'jam') f += numf(b, ph, 'boulders', 'Boulder', '');
      if (F.fixed) f += numf(b, ph, 'interval', 'Intervall', 'min + 15 s', 0.5);
      else if (bf !== 'jam') f += numf(b, ph, 'rotation', 'Rotation', 'min', 0.25);
      if (bf === 'jam') f += numf(b, ph, 'jamDur', 'Dauer', 'min', 5);
      if (v('sight') === 'onsight') f += numf(b, ph, 'isoClose', 'Isolation schließt vorher', 'min', 5);
      h += row(lab('Gemeinsame Besichtigung', seg(b, ph, 'obsMode', OPT.obsMode)));
      if (v('obsMode') !== 'none') f += numf(b, ph, 'obsBefore', 'Besichtigung beginnt vorher (leer = auto)', 'min');
    } else {
      h += row(seg(b, ph, 'lanes', OPT.lanes));
      f += numf(b, ph, 'raceTime', 'Zeit pro Race', 'min', 0.25);
      if (ph === 'training') f += numf(b, ph, 'trainDur', 'feste Dauer (0 = wie Quali)', 'min', 5);
      if (ph === 'final') {
        h += row(lab('Wettkampfbaum', seg(b, ph, 'bracket', OPT.bracket.filter(([x]) => x !== 32 || Number(v('lanes')) === 4))));
        f += numf(b, ph, 'phaseBreak', 'Pause zw. Phasen', 'min');
      }
    }
    if (ph === 'final') {
      h += row(`<label class="check"><input type="checkbox" data-b="${b.id}" data-ph="${ph}" data-k="presentation"${v('presentation') ? ' checked' : ''}> ${d === 'speed' ? 'Präsentation der Finalisten' : 'Vorstellung der Finalist*innen'}</label>` + (d === 'speed' && v('presentation') ? seg(b, ph, 'presWhen', OPT.presWhen) : ''));
      if (v('presentation')) f += numf(b, ph, 'presDur', 'Dauer Vorstellung', 'min') + numf(b, ph, 'presPause', 'Pause bis Start', 'min');
    }
    f += numf(b, ph, 'warmup', 'Aufwärmen öffnet vorher', 'min', 5);
    if (ph !== 'training') f += numf(b, ph, 'resultBuffer', 'Ende → Ergebnis', 'min', 5);
    return `<div class="phase-detail"><p class="fs-title">${esc(C.PHASES[ph])}</p>${h}<div class="fgrid">${f}</div></div>`;
  }

  /* ---------- Blöcke ---------- */
  function newBlock(discipline) {
    const lastDay = comp.blocks.length ? comp.blocks[comp.blocks.length - 1].day : '';
    return { id: uid(), discipline, template: DEFAULT_TEMPLATE[discipline], day: lastDay || comp.date, start: '09:00',
      cats: [{ id: uid(), name: '', starters: 20, lane: comp.walls[0] ? comp.walls[0].id : '' }], phases: {}, next: {}, layout: '', laneGap: '', pairFinals: false };
  }

  function catsSummary(b) {
    const names = (b.cats || []).map((c) => c.name).filter(Boolean);
    return names.length ? names.join(', ') : 'keine Kategorie';
  }

  function blockResults(b) { return results.filter((x) => x.round.block === b.id); }

  function badgeHtml(ws) {
    const c = { error: 0, rest: 0, auto: 0, should: 0, info: 0 };
    ws.forEach((w) => { c[w.level]++; });
    const labT = { error: '!', rest: '⏱', auto: '⏱', should: '?', info: 'i' };
    return Object.keys(c).filter((k) => c[k]).map((k) => `<span class="badge ${k}">${labT[k]} ${c[k]}</span>`).join('');
  }

  function renderBlocks() {
    results = C.computeAll(Object.assign({}, comp, { rounds: C.compileBlocks(comp) }));
    $('#emptyBlocks').hidden = comp.blocks.length > 0;
    $('#blockList').innerHTML = comp.blocks.map((b) => {
      const t = tpl(b);
      const tplOpts = Object.entries(C.TEMPLATES[b.discipline]).map(([k, x]) => `<option value="${k}"${b.template === k ? ' selected' : ''}>${esc(x.label)}</option>`).join('');
      const quotaCols = t.phases.filter((p) => p === 'semi' || (p === 'final' && b.discipline !== 'speed'));
      const lanes = comp.walls.length > 0;
      const head = `<tr><th>Kategorie</th><th class="n">Starter</th>${quotaCols.map((p) => `<th class="n">${PHASE_SHORT[p]}</th>`).join('')}${lanes ? '<th>Wand / Set</th>' : ''}<th></th></tr>`;
      const rows = b.cats.map((c) => `<tr>
          <td><input type="text" value="${esc(c.name)}" data-b="${b.id}" data-cat="${c.id}" data-ck="name" placeholder="z. B. U17 w" aria-label="Kategorie"></td>
          <td class="n"><input type="number" min="0" value="${esc(c.starters)}" data-b="${b.id}" data-cat="${c.id}" data-ck="starters" aria-label="Starter"></td>
          ${quotaCols.map((p) => `<td class="n"><input type="number" min="0" value="${esc(c[p] != null && c[p] !== '' ? c[p] : (t.quota[p] || ''))}" data-b="${b.id}" data-cat="${c.id}" data-ck="${p}" aria-label="Quote ${PHASE_SHORT[p]}"></td>`).join('')}
          ${lanes ? `<td><select data-b="${b.id}" data-cat="${c.id}" data-ck="lane" aria-label="Wand"><option value="">–</option>${comp.walls.map((w) => `<option value="${w.id}"${c.lane === w.id ? ' selected' : ''}>${esc(w.name)}</option>`).join('')}</select></td>` : ''}
          <td><button type="button" class="icon" data-delcat="${c.id}" data-b="${b.id}" aria-label="Kategorie entfernen">×</button></td></tr>`).join('');
      // Startzeiten: erste Runde fest, weitere automatisch oder Uhrzeit
      let starts = `<label class="nf">${esc(PHASE_SHORT[t.phases[0]])} ab<input type="time" value="${esc(b.start)}" data-b="${b.id}" data-bk="start"></label>`;
      t.phases.slice(1).forEach((ph) => {
        const nx = nextOf(b, ph);
        const base = t.phases[0] === 'training' && ph === 'quali' ? 'end' : 'result';
        const gapDef = base === 'end' ? 15 : C.NEXT_GAP[b.discipline];
        starts += `<div class="lab">${esc(PHASE_SHORT[ph])}${seg(b, '', 'nextMode:' + ph, OPT.nextMode, nx.mode)}</div>`;
        starts += nx.mode === 'time'
          ? `<label class="nf">Uhrzeit<input type="time" value="${esc(nx.time)}" data-b="${b.id}" data-next="${ph}" data-nk="time"></label>`
          : `<label class="nf">${base === 'end' ? 'nach Ende' : 'nach Ergebnis'}<span class="num"><input type="number" min="0" step="5" value="${esc(nx.gap !== '' && nx.gap != null ? nx.gap : gapDef)}" data-b="${b.id}" data-next="${ph}" data-nk="gap"><em>min</em></span></label>`;
      });
      const hasLater = t.phases.some((p) => p === 'semi' || p === 'final');
      let extra = '';
      if (hasLater && b.discipline !== 'speed' && b.cats.length > 1) extra += lab('Halbfinale / Finale der Kategorien', seg(b, '', 'layout', OPT.layout, b.layout || (b.discipline === 'boulder' ? 'par' : 'seq')));
      if (b.discipline === 'speed' && b.cats.length > 1) extra += `<label class="check"><input type="checkbox" data-b="${b.id}" data-bk="pairFinals"${b.pairFinals ? ' checked' : ''}> Finals paarweise verschränken</label>`;
      const laneGap = `<label class="nf">Wechsel zwischen Kategorien<span class="num"><input type="number" min="0" step="5" value="${esc(b.laneGap !== '' && b.laneGap != null ? b.laneGap : C.LANE_GAP[b.discipline])}" data-b="${b.id}" data-bk="laneGap"><em>min</em></span></label>`;
      return `<article class="card round d-${b.discipline}${open.has(b.id) ? ' open' : ''}" id="block-${b.id}">
        <div class="round-head" data-toggle="${b.id}">
          <span class="chev">▶</span>
          <div class="title"><b data-title></b><span data-sum></span></div>
          <div class="badges" data-badges></div>
        </div>
        <div class="round-body">
          ${row(`<label class="nf">Tag<input type="date" value="${esc(b.day)}" data-b="${b.id}" data-bk="day"></label><label class="nf grow">Vorlage<select data-b="${b.id}" data-bk="template">${tplOpts}</select></label>`)}
          <table class="cats"><thead>${head}</thead><tbody>${rows}</tbody></table>
          <button type="button" class="mini" data-addcat="${b.id}">+ Kategorie</button>
          ${row(starts)}
          ${extra ? row(extra) : ''}
          <div class="warns" data-warns></div>
          <details class="more" data-more="${b.id}:adv"${openMore.has(b.id + ':adv') ? ' open' : ''}><summary>Details aus der Vorlage <span class="muted small">(Formate, Zeiten – Standard nach Regelwerk)</span></summary>
            <div class="fgrid">${laneGap}</div>
            ${t.phases.map((ph) => phaseDetails(b, ph)).join('')}
          </details>
          <details class="more" data-more="${b.id}:det"${openMore.has(b.id + ':det') ? ' open' : ''}><summary>Startzeiten je Kategorie</summary><div data-detail></div></details>
          <div class="round-actions">
            <button type="button" class="mini" data-dup="${b.id}">Duplizieren</button>
            <button type="button" class="mini" data-del="${b.id}">Löschen</button>
          </div>
        </div>
      </article>`;
    }).join('');
    updateBlockDynamic();
  }

  function updateBlockDynamic() {
    comp.blocks.forEach((b) => {
      const el = document.getElementById('block-' + b.id);
      if (!el) return;
      const rs = blockResults(b).filter((x) => x.sop != null);
      $('[data-title]', el).textContent = `${C.DISC[b.discipline]} · ${catsSummary(b)}`;
      const span = rs.length ? `${C.fmt(Math.min.apply(null, rs.map((x) => x.sop)))} – ${C.fmt(Math.max.apply(null, rs.map((x) => x.end)))}` : 'Startzeit fehlt';
      $('[data-sum]', el).textContent = `${fmtDayShort(b.day || comp.date)} · ${span} · ${tpl(b).label}`;
      const ws = blockResults(b).flatMap((x) => x.warnings.map((w) => Object.assign({ who: `${x.round.category} ${PHASE_SHORT[x.round.phase]}` }, w)));
      $('[data-badges]', el).innerHTML = badgeHtml(ws);
      $('[data-warns]', el).innerHTML = ws.map((w) => `<div class="warn ${w.level}"><span><b>${esc(w.who)}:</b> ${esc(w.text)}</span></div>`).join('');
      $('[data-detail]', el).innerHTML = blockResults(b).map((x) => {
        const det = x.detail;
        if (!det || !det.rows.length) return '';
        return `<p class="fs-title" style="margin-top:10px">${esc(x.round.category)} · ${esc(C.PHASES[x.round.phase])} · ${C.fmt(x.sop)}–${C.fmt(x.end)}</p><div class="detail-wrap"><table><thead><tr>${det.cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${det.rows.map((r) => `<tr>${r.map((c) => typeof c === 'object' && c ? `<td class="${c.warn ? 'warncell' : ''}">${esc(c.v)}</td>` : `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      }).join('');
    });
  }

  /* ---------- Ablaufplan ---------- */
  const fmtDay = (iso) => {
    if (!iso) return 'Ohne Datum';
    const d = new Date(iso + 'T12:00:00');
    return isNaN(d) ? iso : d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  };
  const fmtDayShort = (iso) => {
    const d = new Date((iso || '') + 'T12:00:00');
    return isNaN(d) ? '' : d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  };
  const joinAnd = (a) => (a.length > 1 ? a.slice(0, -1).join(', ') + ' und ' + a[a.length - 1] : a.join(''));
  const wallName = (id) => (comp.walls.find((w) => w.id === id) || {}).name || '';

  /* Zusammenfassung je Tag wie in einer Ausschreibung: nur Eckzeiten je Block und Runde */
  function summaryLines(day) {
    const lines = [];
    (comp.items || []).filter((it) => (it.day || comp.date) === day).forEach((it) => {
      const t = C.toMin(it.time); if (t == null || !it.title) return;
      const u = C.toMin(it.until);
      lines.push({ t, label: it.title + (it.note ? ` (${it.note})` : ''), time: u != null ? `${C.fmt(t)} bis ${C.fmt(u)} Uhr` : `${C.fmt(t)} Uhr`, item: it.id });
    });
    const dayRes = results.filter((x) => x.round.day === day && x.sop != null);
    const warm = dayRes.map((x) => (x.events.find((e) => e.key === 'warmup') || {}).t).filter((t) => t != null);
    if (warm.length) lines.push({ t: Math.min.apply(null, warm) - 0.001, label: 'Öffnung Warm-up', time: `${C.fmt(Math.min.apply(null, warm))} Uhr` });
    const blocks = comp.blocks.filter((b) => (b.day || comp.date) === day);
    const tag = (b) => (blocks.length > 1 ? ` ${C.DISC[b.discipline]} (${catsSummary(b)})` : '');
    blocks.forEach((b) => {
      tpl(b).phases.forEach((ph) => {
        const rs = dayRes.filter((x) => x.round.block === b.id && x.round.phase === ph);
        if (!rs.length) return;
        const pre = (key, labelT) => {
          const evs = rs.map((x) => ({ x, e: x.events.find((e) => e.key === key) })).filter((y) => y.e);
          if (!evs.length) return;
          const times = [...new Set(evs.map((y) => C.fmt(y.e.t)))];
          const tm = times.length === 1 ? `${times[0]} Uhr` : evs.map((y) => `${C.fmt(y.e.t)} (${y.x.round.category})`).join(', ');
          lines.push({ t: Math.min.apply(null, evs.map((y) => y.e.t)), label: labelT + tag(b), time: tm, block: b.id });
        };
        pre('iso', 'Isolation schließt');
        pre('pres', b.discipline === 'speed' ? 'Präsentation der Finalisten' : 'Vorstellung der Finalist*innen');
        pre('obs', 'Besichtigung');
        const s0 = Math.min.apply(null, rs.map((x) => x.sop)), e0 = Math.max.apply(null, rs.map((x) => x.end));
        lines.push({ t: s0, label: C.PHASES[ph] + tag(b), time: `${C.fmt(s0)} bis ${C.fmt(e0)} Uhr`, main: true, block: b.id });
      });
    });
    lines.sort((a, b) => a.t - b.t);
    return lines;
  }

  function detailRows(day) {
    const MERGE = new Set(['iso', 'pres', 'obs']);
    const rows = [];
    results.filter((x) => x.round.day === day).forEach((res) => {
      res.events.forEach((ev) => {
        if (ev.key === 'warmup' || ev.key === 'change') return;
        rows.push({ t: ev.t, key: ev.key, label: ev.label, minor: ev.minor, rounds: [res.round] });
      });
    });
    rows.sort((a, b) => a.t - b.t);
    const merged = [];
    rows.forEach((x) => {
      const prev = merged.find((m) => MERGE.has(x.key) && m.key === x.key && Math.abs(m.t - x.t) < 0.01 && m.label === x.label);
      if (prev) prev.rounds = prev.rounds.concat(x.rounds); else merged.push(x);
    });
    return merged;
  }

  function renderPlan() {
    const showDetail = $('#showDetail').checked;
    const all = results.flatMap((x) => x.warnings.map((w) => Object.assign({ who: `${C.DISC[x.round.discipline]} ${x.round.category} ${PHASE_SHORT[x.round.phase]}`, day: x.round.day }, w)));
    const cnt = { error: 0, rest: 0, auto: 0, should: 0, info: 0 };
    all.forEach((w) => { cnt[w.level]++; });
    const sum = [];
    if (cnt.error) sum.push(`<span class="pill err">${cnt.error} ${cnt.error > 1 ? 'Regelverstöße' : 'Regelverstoß'}</span>`);
    if (cnt.rest) sum.push(`<span class="pill rest">${cnt.rest} Ruhezeit-Warnung${cnt.rest > 1 ? 'en' : ''}</span>`);
    if (cnt.auto) sum.push(`<span class="pill auto">${cnt.auto}× Ruhezeit automatisch eingefügt</span>`);
    if (cnt.should) sum.push(`<span class="pill should">${cnt.should} Empfehlung${cnt.should > 1 ? 'en' : ''}</span>`);
    if (cnt.info) sum.push(`<span class="pill info">${cnt.info} Hinweis${cnt.info > 1 ? 'e' : ''}</span>`);
    if (!cnt.error && !cnt.rest && !cnt.should && !cnt.info && results.length) sum.unshift('<span class="pill ok">Keine Konflikte gefunden</span>');
    $('#summary').innerHTML = sum.join('');
    $('#planTitle').textContent = comp.name || 'Zeitplan';
    $('#planSub').textContent = '';

    const days = [...new Set(comp.blocks.map((b) => b.day || comp.date).concat((comp.items || []).filter((i) => i.title && i.time).map((i) => i.day || comp.date)))].sort();
    if (!days.length) { $('#planBody').innerHTML = '<p class="muted empty">Der Zeitplan erscheint hier, sobald ein Block angelegt ist.</p>'; return; }
    $('#planBody').innerHTML = days.map((day) => {
      const cats = [...new Set(comp.blocks.filter((b) => (b.day || comp.date) === day).flatMap((b) => b.cats.map((c) => c.name).filter(Boolean)))];
      const lines = summaryLines(day);
      const ws = all.filter((w) => w.day === day);
      let h = `<section class="day"><h3 class="day-title">${esc(fmtDay(day))}${cats.length ? ': ' + esc(joinAnd(cats)) : ''}</h3>
        <table class="sched">${lines.map((l) => `<tr class="${l.main ? 'main' : ''} jump" ${l.item ? `data-jumpitem="${l.item}"` : l.block ? `data-jump="${l.block}"` : ''}><td>${esc(l.label)}</td><td class="tm">${esc(l.time)}</td></tr>`).join('')}</table>`;
      if (ws.length) h += `<div class="day-warns">${ws.map((w) => `<span class="rowwarn ${w.level}">${esc(w.who)}: ${esc(w.text)}</span>`).join('')}</div>`;
      if (showDetail) {
        const rows = detailRows(day);
        h += `<table class="plan-table"><colgroup><col class="c-time"><col class="c-cat"><col><col class="c-wall"></colgroup><thead><tr><th>Zeit</th><th>Kategorie</th><th>Programmpunkt</th><th class="wallcol">Wand</th></tr></thead><tbody>${rows.map((x) => {
          const names = [...new Set(x.rounds.map((r) => r.category))].join(', ');
          const walls = [...new Set(x.rounds.flatMap((r) => r.walls || []))].map(wallName).filter(Boolean).join(', ');
          return `<tr class="${x.minor ? 'minor' : 'main'} jump" data-jump="${x.rounds[0].block}"><td class="time">${C.fmt(x.t)}</td><td class="cat"><span class="dot ${x.rounds[0].discipline}"></span>${esc(names)}<small>${esc(C.PHASES[x.rounds[0].phase])}</small></td><td class="ev">${esc(x.label)}</td><td class="wallcol">${esc(walls)}</td></tr>`;
        }).join('')}</tbody></table>`;
      }
      return h + '</section>';
    }).join('');
  }

  /* ---------- Wände und Programmpunkte ---------- */
  function renderWalls() {
    $('#wallList').innerHTML = comp.walls.map((w) => `<span class="chip">${esc(w.name)}<button type="button" data-delwall="${w.id}" aria-label="${esc(w.name)} entfernen">×</button></span>`).join('') || '<span class="muted small">Optional – z. B. Boulder Set 1, Set 2. Kategorien auf derselben Wand laufen nacheinander, auf verschiedenen parallel.</span>';
  }
  const PRESETS = ['Registration', 'Technical Meeting'];
  function renderItems() {
    comp.items = comp.items || [];
    $('#itemList').innerHTML = comp.items.map((it) => `<div class="item" id="item-${it.id}">
        <input type="time" value="${esc(it.time)}" data-item="${it.id}" data-ik="time" aria-label="Beginn">
        <input type="time" value="${esc(it.until || '')}" data-item="${it.id}" data-ik="until" aria-label="Ende (optional)" title="Ende (optional)">
        <input type="text" value="${esc(it.title)}" data-item="${it.id}" data-ik="title" placeholder="Programmpunkt" aria-label="Programmpunkt">
        <button type="button" class="icon" data-delitem="${it.id}" aria-label="Programmpunkt entfernen">×</button>
        <input type="date" value="${esc(it.day || '')}" data-item="${it.id}" data-ik="day" aria-label="Tag" title="Tag (leer = erster Tag)">
        <input type="text" value="${esc(it.note || '')}" data-item="${it.id}" data-ik="note" placeholder="Für wen / Ort (optional)" aria-label="Für wen oder Ort">
      </div>`).join('');
    $('#itemPresets').innerHTML = PRESETS.map((p) => `<button type="button" class="wchip" data-additem="${esc(p)}">+ ${esc(p)}</button>`).join('') + '<button type="button" class="wchip" data-additem="">+ Eigener Punkt</button>';
  }
  function addItem(title) {
    const it = { id: uid(), time: '', until: '', title, note: '', day: '' };
    comp.items.push(it);
    renderItems(); recompute();
    const el = document.getElementById('item-' + it.id);
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('input[data-ik="time"]', el).focus();
  }

  function recompute() {
    results = C.computeAll(Object.assign({}, comp, { rounds: C.compileBlocks(comp) }));
    updateBlockDynamic();
    renderPlan();
    save();
  }
  function renderAll() {
    $('#compName').value = comp.name || '';
    $('#compDate').value = comp.date || '';
    renderWalls(); renderItems(); renderBlocks(); renderPlan(); save();
  }

  /* ---------- Ereignisse ---------- */
  const findBlock = (id) => comp.blocks.find((b) => b.id === id);
  const toVal = (t) => (t.type === 'checkbox' ? t.checked : t.type === 'number' ? (t.value === '' ? '' : Number(t.value)) : t.value);

  document.addEventListener('toggle', (e) => {
    const k = e.target.dataset && e.target.dataset.more;
    if (k) e.target.open ? openMore.add(k) : openMore.delete(k);
  }, true);

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'compName') { comp.name = t.value; recompute(); return; }
    if (t.id === 'compDate') { comp.date = t.value; recompute(); return; }
    if (t.dataset.item) {
      const it = comp.items.find((x) => x.id === t.dataset.item);
      if (it) { it[t.dataset.ik] = t.value; recompute(); }
      return;
    }
    if (t.tagName === 'SELECT' || t.type === 'checkbox') return; // über „change“
    const b = findBlock(t.dataset.b); if (!b) return;
    if (t.dataset.cat) { const c = b.cats.find((x) => x.id === t.dataset.cat); if (c) c[t.dataset.ck] = toVal(t); }
    else if (t.dataset.next) nextOf(b, t.dataset.next)[t.dataset.nk] = t.value;
    else if (t.dataset.ph) setPhaseVal(b, t.dataset.ph, t.dataset.k, toVal(t));
    else if (t.dataset.bk) b[t.dataset.bk] = toVal(t);
    recompute();
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!(t.tagName === 'SELECT' || t.type === 'checkbox')) return;
    const b = findBlock(t.dataset.b); if (!b) return;
    if (t.dataset.cat) { const c = b.cats.find((x) => x.id === t.dataset.cat); if (c) c[t.dataset.ck] = t.value; recompute(); return; }
    if (t.dataset.ph) setPhaseVal(b, t.dataset.ph, t.dataset.k, toVal(t));
    else if (t.dataset.bk === 'template') { b.template = t.value; b.phases = {}; b.next = {}; }
    else if (t.dataset.bk) b[t.dataset.bk] = toVal(t);
    renderBlocks(); renderPlan(); save();
  });

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-additem],[data-delitem],[data-jumpitem],[data-seg],[data-toggle],[data-dup],[data-del],[data-addblock],[data-addcat],[data-delcat],[data-delwall],[data-jump]');
    if (!t) return;
    if (t.dataset.additem !== undefined) { addItem(t.dataset.additem); return; }
    if (t.dataset.delitem) { comp.items = comp.items.filter((x) => x.id !== t.dataset.delitem); renderItems(); recompute(); return; }
    if (t.dataset.jumpitem) { const el = document.getElementById('item-' + t.dataset.jumpitem); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (t.dataset.seg) {
      const b = findBlock(t.dataset.b); if (!b) return;
      const k = t.dataset.seg, raw = t.dataset.val;
      const v = raw === 'true' ? true : raw === 'false' ? false : /^\d+$/.test(raw) ? Number(raw) : raw;
      if (k.startsWith('nextMode:')) nextOf(b, k.split(':')[1]).mode = v;
      else if (t.dataset.ph) {
        setPhaseVal(b, t.dataset.ph, k, v);
        if (k === 'boulderFormat') Object.entries(C.boulderFormatDefaults(v, t.dataset.ph)).forEach(([kk, vv]) => setPhaseVal(b, t.dataset.ph, kk, vv));
      } else b[k] = v;
      renderBlocks(); renderPlan(); save();
      return;
    }
    if (t.dataset.toggle) {
      const id = t.dataset.toggle;
      open.has(id) ? open.delete(id) : open.add(id);
      document.getElementById('block-' + id).classList.toggle('open');
    } else if (t.dataset.addblock) {
      const b = newBlock(t.dataset.addblock);
      comp.blocks.push(b); open.add(b.id); renderBlocks(); renderPlan(); save();
      document.getElementById('block-' + b.id).scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (t.dataset.addcat) {
      const b = findBlock(t.dataset.addcat);
      const last = b.cats[b.cats.length - 1];
      b.cats.push({ id: uid(), name: '', starters: 20, lane: last ? last.lane : '' });
      renderBlocks(); renderPlan(); save();
      const inputs = document.querySelectorAll(`#block-${b.id} input[data-ck="name"]`);
      if (inputs.length) inputs[inputs.length - 1].focus();
    } else if (t.dataset.delcat) {
      const b = findBlock(t.dataset.b);
      b.cats = b.cats.filter((c) => c.id !== t.dataset.delcat);
      renderBlocks(); renderPlan(); save();
    } else if (t.dataset.dup) {
      const src = findBlock(t.dataset.dup);
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = uid(); copy.cats.forEach((c) => { c.id = uid(); });
      comp.blocks.splice(comp.blocks.indexOf(src) + 1, 0, copy); open.add(copy.id); renderBlocks(); renderPlan(); save();
    } else if (t.dataset.del) {
      const b = findBlock(t.dataset.del);
      if (confirm(`Block „${C.DISC[b.discipline]} · ${catsSummary(b)}“ löschen?`)) { comp.blocks = comp.blocks.filter((x) => x !== b); renderBlocks(); renderPlan(); save(); }
    } else if (t.dataset.delwall) {
      const id = t.dataset.delwall;
      comp.walls = comp.walls.filter((w) => w.id !== id);
      comp.blocks.forEach((b) => b.cats.forEach((c) => { if (c.lane === id) c.lane = ''; }));
      renderWalls(); renderBlocks(); renderPlan(); save();
    } else if (t.dataset.jump) {
      const id = t.dataset.jump;
      open.add(id);
      const el = document.getElementById('block-' + id);
      if (el) { el.classList.add('open'); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }
  });

  $('#wallForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#wallInput').value.trim();
    if (!name) return;
    comp.walls.push({ id: 'w' + uid(), name });
    $('#wallInput').value = '';
    renderWalls(); renderBlocks(); renderPlan(); save();
  });
  $('#showDetail').addEventListener('change', renderPlan);
  $('#printWarn').addEventListener('change', (e) => document.body.classList.toggle('print-warn', e.target.checked));
  $('#btnPrint').addEventListener('click', () => window.print());
  $('#btnNew').addEventListener('click', () => {
    if (comp.blocks.length && !confirm('Aktuellen Wettkampf verwerfen und neu beginnen? Vorher ggf. exportieren.')) return;
    comp = emptyComp(); open.clear(); renderAll();
  });
  $('#btnExample').addEventListener('click', () => {
    if (comp.blocks.length && !confirm('Aktuellen Wettkampf durch das Beispiel ersetzen?')) return;
    comp = example(); open.clear(); renderAll();
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
      if (!data || !Array.isArray(data.blocks)) throw new Error('format');
      data.walls = data.walls || []; data.items = data.items || [];
      comp = data; open.clear(); renderAll();
    }).catch(() => alert('Die Datei konnte nicht gelesen werden. Bitte eine exportierte Zeitplan-Datei (.json) dieser Version wählen.'));
    e.target.value = '';
  });

  /* ---------- Beispiel (angelehnt an die Ausschreibung BWJC 2026, Boulder) ---------- */
  function example() {
    const d1 = '2026-02-07', d2 = '2026-02-08';
    const walls = [{ id: 'set1', name: 'Set 1' }, { id: 'set2', name: 'Set 2' }];
    const cat = (name, starters, final, lane) => ({ id: uid(), name, starters, final, lane });
    const B = (day, cats) => ({ id: uid(), discipline: 'boulder', template: 'bwjc', day, start: '09:00', cats, phases: {}, next: {}, layout: 'par', laneGap: '', pairFinals: false });
    const item = (day, time, until, title) => ({ id: uid(), day, time, until, title, note: '' });
    return {
      version: 2, name: 'BW Jugendcup Bouldern (B1)', date: d1, walls,
      blocks: [
        B(d1, [cat('U15+ w', 44, 10, 'set1'), cat('U17 w', 24, 8, 'set2'), cat('U21 w', 9, 8, 'set2')]),
        B(d2, [cat('U15+ m', 52, 10, 'set1'), cat('U17 m', 27, 8, 'set2'), cat('U21 m', 14, 8, 'set2')]),
      ],
      items: [item('', '08:00', '08:15', 'Registration'), item('', '08:30', '', 'Technical Meeting'),
        item(d2, '08:00', '08:15', 'Registration'), item(d2, '08:30', '', 'Technical Meeting')],
    };
  }

  renderAll();
})();
