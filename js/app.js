/* Oberfläche Zeitplan Kletterwettkampf */
(function () {
  'use strict';
  const C = window.Calc;
  const KEY = 'zeitplan.v1';
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 9);
  const today = () => new Date().toISOString().slice(0, 10);

  let comp = load() || emptyComp();
  const open = new Set();
  const openMore = new Set();
  let results = [];

  function emptyComp() { return { name: '', date: today(), walls: [], rounds: [], items: [] }; }
  function load() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(comp)); } catch (e) { /* privater Modus */ } }

  /* ---------- Bausteine der Eingabe ---------- */
  const OPT = {
    phaseLead: [['quali', 'Quali'], ['semi', 'Halbfinale'], ['final', 'Finale']],
    phaseSpeed: [['training', 'Training'], ['quali', 'Quali'], ['final', 'Finale']],
    leadFormat: [['flash2', 'Flash · 2 Routen'], ['flash1', 'Flash · 1 Route'], ['onsight', 'On Sight']],
    routeMode: [['par', 'parallel'], ['seq', 'nacheinander']],
    boulderFormat: [['interval', 'Intervall'], ['flash2sets', '2 Sets'], ['parallel', 'Parallel'], ['jam', 'JAM']],
    sight: [['onsight', 'On Sight'], ['flash', 'Flash']],
    restRot: [[false, 'ohne Pause'], [true, 'mit Pausen-Rotation']],
    obsMode: [['none', 'keine'], ['per', '2 min je Boulder'], ['joint', '8 min gemeinsam']],
    lanes: [[2, 'Speed 2'], [4, 'Speed 4']],
    bracket: [[4, '4'], [8, '8'], [16, '16'], [32, '32']],
  };
  const HINT = {
    interval: 'Fixes Intervall + 15 s Wechsel, ein Starter pro Rotation neu',
    flash2sets: 'Zwei Gruppen tauschen die Sets, ≥ 3 Rotationen Erholung',
    parallel: 'Finale: mehrere Boulder gleichzeitig, Rotationszeit frei',
    jam: 'Feste Gesamtdauer, keine Rotationen',
  };

  function seg(r, k, opts) {
    return `<div class="seg" role="group">${opts.map(([v, t]) => `<button type="button" class="${String(r[k]) === String(v) ? 'on' : ''}" data-seg="${k}" data-val="${v}" data-id="${r.id}">${esc(t)}</button>`).join('')}</div>`;
  }
  function numf(r, k, label, unit, step) {
    return `<label class="nf">${esc(label)}<span class="num"><input type="number" inputmode="decimal" min="0" step="${step || 1}" value="${esc(r[k])}" data-k="${k}" data-id="${r.id}"${k === 'starters' ? ' data-struct-num="1"' : ''}>${unit ? `<em>${unit}</em>` : ''}</span></label>`;
  }
  const row = (html) => `<div class="frow">${html}</div>`;

  function essentials(r) {
    const d = r.discipline;
    let h = '';
    if (d === 'lead') {
      h += row(seg(r, 'leadFormat', OPT.leadFormat));
      h += row((r.leadFormat === 'flash2' ? `<div class="lab">Routen${seg(r, 'routeMode', OPT.routeMode)}</div>` : '') + numf(r, 'attempt', 'Ø Versuch', 'min', 0.5));
    } else if (d === 'boulder') {
      const bf = r.boulderFormat;
      h += row(seg(r, 'boulderFormat', OPT.boulderFormat) + seg(r, 'sight', OPT.sight));
      h += `<p class="hint">${esc(HINT[bf] || '')}</p>`;
      let f = '';
      if (bf === 'interval' || bf === 'parallel') f += numf(r, 'boulders', 'Boulder', '');
      if (bf === 'interval' || bf === 'flash2sets') f += numf(r, 'interval', 'Intervall', 'min', 0.5);
      if (bf === 'flash2sets') f += numf(r, 'setSize', 'Boulder/Set', '') + numf(r, 'setGap', 'Leer-Rot.', '');
      if (bf === 'parallel') f += numf(r, 'active', 'gleichzeitig', '') + numf(r, 'rotation', 'Rotation', 'min', 0.25);
      if (bf === 'jam') f += numf(r, 'jamDur', 'Dauer', 'min', 5);
      h += row(f);
      if (bf === 'interval') h += row(seg(r, 'restRot', OPT.restRot));
    } else {
      let f = seg(r, 'lanes', OPT.lanes) + numf(r, 'raceTime', 'Zeit/Race', 'min', 0.25);
      if (r.phase === 'training') f += numf(r, 'trainDur', 'feste Dauer', 'min', 5);
      h += row(f);
      if (r.phase === 'final') h += row(`<div class="lab">Wettkampfbaum${seg(r, 'bracket', OPT.bracket)}</div>`);
    }
    return h;
  }

  function advanced(r) {
    const d = r.discipline;
    const onsight = (d === 'lead' && r.leadFormat === 'onsight') || (d === 'boulder' && r.sight === 'onsight');
    const hasObs = (d === 'lead' && r.leadFormat === 'onsight') || (d === 'boulder' && r.obsMode && r.obsMode !== 'none');
    let f = numf(r, 'warmup', 'Aufwärmen öffnet vorher', 'min', 5);
    if (onsight) f += numf(r, 'isoClose', 'Isolation schließt vorher', 'min', 5);
    if (hasObs) f += numf(r, 'obsBefore', 'Besichtigung beginnt vorher', 'min');
    if (r.phase !== 'training') f += numf(r, 'resultBuffer', 'Ende → Ergebnis', 'min', 5);
    if (d === 'lead' && Number(r.starters) > 22) f += numf(r, 'cleanEvery', 'Reinigung alle', 'Starter') + numf(r, 'cleanDur', 'Dauer Reinigung', 'min');
    if (d === 'boulder' && r.boulderFormat === 'parallel') f += numf(r, 'blockBreak', 'Pause zw. Blöcken', 'min');
    if (d === 'speed' && r.phase === 'final') f += numf(r, 'phaseBreak', 'Pause zw. Phasen', 'min');
    if (r.presentation) f += numf(r, 'presDur', 'Präsentation', 'min') + numf(r, 'presPause', 'Pause bis Start', 'min');
    f += `<label class="nf">Tag (falls abweichend)<input type="date" value="${esc(r.day || '')}" data-k="day" data-id="${r.id}"></label>`;
    let h = '';
    if (d === 'boulder') h += row(`<div class="lab">Gemeinsame Besichtigung${seg(r, 'obsMode', OPT.obsMode)}</div>`);
    if (d !== 'speed' || r.phase === 'final') h += row(`<label class="check"><input type="checkbox" data-k="presentation" data-id="${r.id}" data-struct="1"${r.presentation ? ' checked' : ''}> ${d === 'speed' ? 'Präsentation vor den Medal Races' : 'Präsentation der Finalisten'}</label>`);
    return h + `<div class="fgrid">${f}</div>`;
  }

  /* ---------- Runden ---------- */
  function newRound(discipline) {
    const phase = 'quali';
    const r = Object.assign({ id: uid(), discipline, phase, category: '', youth: false, day: '', start: '10:00', walls: [] }, C.defaults(discipline, phase));
    if (comp.walls.length === 1) r.walls = [comp.walls[0].id];
    return r;
  }

  function applyPhaseDefaults(r) {
    const d = C.defaults(r.discipline, r.phase);
    const keys = { lead: ['leadFormat'], boulder: ['boulderFormat', 'sight', 'boulders', 'interval', 'obsMode'], speed: ['speedFormat'] }[r.discipline];
    keys.concat(['presentation']).forEach((k) => { r[k] = d[k]; });
  }

  function roundTitle(r) {
    const name = r.category ? r.category : 'Ohne Kategorie';
    return `${C.DISC[r.discipline]} · ${name} · ${C.PHASES[r.phase]}`;
  }

  function badgeHtml(ws) {
    const c = { error: 0, rest: 0, auto: 0, should: 0, info: 0 };
    ws.forEach((w) => { c[w.level]++; });
    const lab = { error: '!', rest: '⏱', auto: '⏱', should: '?', info: 'i' };
    return Object.keys(c).filter((k) => c[k]).map((k) => `<span class="badge ${k}">${lab[k]} ${c[k]}</span>`).join('');
  }

  function renderRounds() {
    const list = $('#roundList');
    $('#emptyRounds').hidden = comp.rounds.length > 0;
    list.innerHTML = comp.rounds.map((r) => {
      const phaseOpts = r.discipline === 'speed' ? OPT.phaseSpeed : OPT.phaseLead;
      const walls = comp.walls.length
        ? comp.walls.map((w) => `<button type="button" class="wchip${(r.walls || []).includes(w.id) ? ' on' : ''}" data-wall="${w.id}" data-id="${r.id}">${esc(w.name)}</button>`).join('')
        : '<span class="muted small">Wände oben anlegen, dann hier zuordnen.</span>';
      const showStarters = !(r.discipline === 'speed' && r.phase === 'final');
      return `<article class="card round d-${r.discipline}${open.has(r.id) ? ' open' : ''}" id="round-${r.id}">
        <div class="round-head" data-toggle="${r.id}">
          <span class="chev">▶</span>
          <div class="title"><b data-title>${esc(roundTitle(r))}</b><span data-sum></span></div>
          <div class="badges" data-badges></div>
        </div>
        <div class="round-body">
          ${row(`<input type="text" class="cat-in" value="${esc(r.category)}" data-k="category" data-id="${r.id}" placeholder="Kategorie, z. B. U17 männlich" aria-label="Kategorie">
            <button type="button" class="wchip${r.youth ? ' on' : ''}" data-seg="youth" data-val="${!r.youth}" data-id="${r.id}" title="Jugend: Ende bis 20:00 Uhr">Jugend</button>`)}
          ${row(seg(r, 'phase', phaseOpts) + `<label class="nf">Start of Play<input type="time" value="${esc(r.start)}" data-k="start" data-id="${r.id}"></label>` + (showStarters ? numf(r, 'starters', 'Starter', '') : ''))}
          ${essentials(r)}
          <div class="frow walls-row"><span class="lab-inline">Wand</span>${walls}</div>
          <div class="warns" data-warns></div>
          <details class="more" data-more="${r.id}:adv"${openMore.has(r.id + ':adv') ? ' open' : ''}><summary>Weitere Einstellungen <span class="muted small">(Standard nach Regelwerk)</span></summary>${advanced(r)}</details>
          <details class="more" data-detail-wrap data-more="${r.id}:det"${openMore.has(r.id + ':det') ? ' open' : ''}><summary>Startzeiten je Startplatz</summary><div class="detail-wrap" data-detail></div></details>
          <div class="round-actions">
            <button type="button" class="mini" data-dup="${r.id}">Duplizieren</button>
            <button type="button" class="mini" data-del="${r.id}">Löschen</button>
          </div>
        </div>
      </article>`;
    }).join('');
  }

  function updateRoundDynamic() {
    results.forEach((res) => {
      const el = document.getElementById('round-' + res.id);
      if (!el) return;
      const r = res.round;
      $('[data-title]', el).textContent = roundTitle(r);
      $('[data-sum]', el).textContent = res.sop != null ? `${C.fmt(res.sop)} – ${C.fmt(res.end)} · ${C.dur(res.end - res.sop)}${res.info ? ' · ' + res.info : ''}` : 'Startzeit fehlt';
      $('[data-badges]', el).innerHTML = badgeHtml(res.warnings);
      $('[data-warns]', el).innerHTML = res.warnings.map((w, i) => {
        const sug = w.level === 'rest' && res.suggest ? `<button type="button" class="mini" data-apply="${res.id}">Übernehmen: ${esc(res.suggest.label)}</button>` : '';
        return `<div class="warn ${w.level}"><span>${esc(w.text)}</span>${sug}</div>`;
      }).join('');
      const det = res.detail;
      const wrap = $('[data-detail-wrap]', el);
      wrap.hidden = !det || !det.rows.length;
      if (det) {
        $('[data-detail]', el).innerHTML = `<table><thead><tr>${det.cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${det.rows.map((row) => `<tr>${row.map((c) => typeof c === 'object' && c ? `<td class="${c.warn ? 'warncell' : ''}">${esc(c.v)}</td>` : `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      }
    });
  }

  /* ---------- Ablaufplan ---------- */
  const MERGE = new Set(['warmup', 'iso']);

  function planRows() {
    const rows = [];
    results.forEach((res) => {
      const r = res.round;
      const day = r.day || comp.date || '';
      const keys = new Set(res.events.map((e) => e.key));
      const orphan = res.warnings.filter((w) => !keys.has(w.at));
      res.events.forEach((ev) => {
        let ws = res.warnings.filter((w) => w.at === ev.key);
        if (ev.key === 'sop') ws = ws.concat(orphan);
        rows.push({ day, t: ev.t, key: ev.key, label: ev.label, minor: ev.minor, rounds: [r], ws: ws.map((w) => Object.assign({ cat: r.category }, w)) });
      });
    });
    (comp.items || []).forEach((it) => {
      const t = C.toMin(it.time);
      if (t == null || !it.title) return;
      rows.push({ day: it.day || comp.date || '', t, key: 'item', label: it.title, rounds: [], item: it, ws: [] });
    });
    const ord = { item: -1, warmup: 0, iso: 2, obs: 3, pres: 4, sop: 5 };
    rows.sort((x, y) => x.day.localeCompare(y.day) || x.t - y.t || ((ord[x.key] ?? 9) - (ord[y.key] ?? 9)));
    // Gleiche Punkte mehrerer Kategorien zur selben Zeit zusammenfassen (z. B. Öffnung Aufwärmbereich)
    const merged = [];
    rows.forEach((x) => {
      const prev = merged.find((m) => MERGE.has(x.key) && m.key === x.key && m.day === x.day && Math.abs(m.t - x.t) < 0.01 && m.label === x.label);
      if (prev) { prev.rounds = prev.rounds.concat(x.rounds); prev.ws = prev.ws.concat(x.ws); } else merged.push(x);
    });
    return merged;
  }

  function renderPlan() {
    const showMinor = $('#showMinor').checked;
    const wallName = (id) => (comp.walls.find((w) => w.id === id) || {}).name || '';
    const rows = planRows();
    const visible = rows.filter((x) => showMinor || !x.minor || x.ws.length);

    const cnt = { error: 0, rest: 0, auto: 0, should: 0, info: 0 };
    results.forEach((res) => res.warnings.forEach((w) => { cnt[w.level]++; }));
    const sum = [];
    if (cnt.error) sum.push(`<span class="pill err">${cnt.error} ${cnt.error > 1 ? 'Regelverstöße' : 'Regelverstoß'}</span>`);
    if (cnt.rest) sum.push(`<span class="pill rest">${cnt.rest} Ruhezeit-Warnung${cnt.rest > 1 ? 'en' : ''}</span>`);
    if (cnt.auto) sum.push(`<span class="pill auto">${cnt.auto}× Ruhezeit automatisch eingefügt</span>`);
    if (cnt.should) sum.push(`<span class="pill should">${cnt.should} Empfehlung${cnt.should > 1 ? 'en' : ''}</span>`);
    if (cnt.info) sum.push(`<span class="pill info">${cnt.info} Hinweis${cnt.info > 1 ? 'e' : ''}</span>`);
    if (!cnt.error && !cnt.rest && !cnt.should && !cnt.info && results.length) sum.unshift('<span class="pill ok">Keine Konflikte gefunden</span>');
    $('#summary').innerHTML = sum.join('');

    $('#planTitle').textContent = comp.name ? comp.name : 'Ablaufplan';
    const days = [...new Set(rows.map((x) => x.day))];
    $('#planSub').textContent = rows.length ? `Ablaufplan · ${days.map(fmtDay).join(', ')} · ${results.length} Runde${results.length !== 1 ? 'n' : ''}` : '';

    if (!visible.length) { $('#planBody').innerHTML = '<p class="muted empty">Der Ablaufplan erscheint hier, sobald Runden angelegt sind.</p>'; return; }
    let html = '', curDay = null;
    visible.forEach((x) => {
      if (x.day !== curDay) {
        if (curDay !== null) html += '</tbody></table>';
        curDay = x.day;
        html += `<div class="day-title">${esc(fmtDay(x.day))}</div><table class="plan-table"><colgroup><col class="c-time"><col class="c-cat"><col><col class="c-wall"></colgroup><thead><tr><th>Zeit</th><th>Kategorie</th><th>Programmpunkt</th><th class="wallcol">Wand</th></tr></thead><tbody>`;
      }
      const multi = x.rounds.length > 1;
      const walls = [...new Set(x.rounds.flatMap((r) => r.walls || []))].map(wallName).filter(Boolean).join(', ');
      const ws = x.ws.map((w) => `<span class="rowwarn ${w.level}">${multi && w.cat ? esc(w.cat) + ': ' : ''}${esc(w.text)}</span>`).join('');
      let cat;
      if (x.item) cat = `<span class="dot item"></span>${esc(x.item.note || 'Allgemein')}`;
      else {
        const dots = [...new Set(x.rounds.map((r) => r.discipline))].map((d) => `<span class="dot ${d}"></span>`).join('');
        const names = [...new Set(x.rounds.map((r) => r.category || '–'))].join(', ');
        const sub = [...new Set(x.rounds.map((r) => `${C.DISC[r.discipline]} · ${C.PHASES[r.phase]}`))].join(' / ');
        cat = `${dots}${esc(names)}<small>${esc(sub)}</small>`;
      }
      const jump = x.item ? `data-jumpitem="${x.item.id}"` : `data-jump="${x.rounds[0].id}"`;
      html += `<tr class="${x.minor ? 'minor' : 'main'}${x.item ? ' item-row' : ''} jump" ${jump}>
        <td class="time">${C.fmt(x.t)}</td>
        <td class="cat">${cat}</td>
        <td class="ev">${esc(x.label)}${ws}</td>
        <td class="wallcol">${esc(walls)}</td></tr>`;
    });
    html += '</tbody></table>';
    $('#planBody').innerHTML = html;
  }

  /* ---------- Eigene Programmpunkte ---------- */
  const PRESETS = ['Registration', 'Technical Meeting', 'Eröffnung', 'Mittagspause', 'Siegerehrung'];
  function renderItems() {
    comp.items = comp.items || [];
    $('#itemList').innerHTML = comp.items.map((it) => `<div class="item" id="item-${it.id}">
        <input type="time" value="${esc(it.time)}" data-item="${it.id}" data-ik="time" aria-label="Uhrzeit">
        <input type="text" value="${esc(it.title)}" data-item="${it.id}" data-ik="title" placeholder="Programmpunkt" aria-label="Programmpunkt">
        <input type="text" value="${esc(it.note || '')}" data-item="${it.id}" data-ik="note" placeholder="Für wen / Ort" aria-label="Für wen oder Ort">
        <input type="date" value="${esc(it.day || '')}" data-item="${it.id}" data-ik="day" aria-label="Tag (falls abweichend)" title="Tag (falls abweichend)">
        <button type="button" class="icon" data-delitem="${it.id}" aria-label="Programmpunkt entfernen">×</button>
      </div>`).join('');
    $('#itemPresets').innerHTML = PRESETS.map((p) => `<button type="button" class="wchip" data-additem="${esc(p)}">+ ${esc(p)}</button>`).join('') + '<button type="button" class="wchip" data-additem="">+ Eigener Punkt</button>';
  }
  function addItem(title) {
    comp.items = comp.items || [];
    const it = { id: uid(), time: '', title, note: '', day: '' };
    comp.items.push(it);
    renderItems(); recompute();
    const el = document.getElementById('item-' + it.id);
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('input[data-ik="time"]', el).focus();
  }

  function fmtDay(iso) {
    if (!iso) return 'Ohne Datum';
    const d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function renderWalls() {
    $('#wallList').innerHTML = comp.walls.map((w) => `<span class="chip">${esc(w.name)}<button type="button" data-delwall="${w.id}" aria-label="${esc(w.name)} entfernen">×</button></span>`).join('') || '<span class="muted small">Noch keine Wände angelegt.</span>';
  }

  function recompute() {
    results = C.computeAll(comp);
    updateRoundDynamic();
    renderPlan();
    save();
  }
  function renderAll() {
    $('#compName').value = comp.name || '';
    $('#compDate').value = comp.date || '';
    renderWalls();
    renderRounds();
    renderItems();
    recompute();
  }

  /* ---------- Ereignisse ---------- */
  document.addEventListener('toggle', (e) => {
    const k = e.target.dataset && e.target.dataset.more;
    if (k) e.target.open ? openMore.add(k) : openMore.delete(k);
  }, true);
  const findRound = (id) => comp.rounds.find((r) => r.id === id);

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'compName') { comp.name = t.value; recompute(); return; }
    if (t.id === 'compDate') { comp.date = t.value; recompute(); return; }
    if (t.dataset.item) {
      const it = (comp.items || []).find((x) => x.id === t.dataset.item);
      if (it) { it[t.dataset.ik] = t.value; recompute(); }
      return;
    }
    const id = t.dataset.id, k = t.dataset.k;
    if (!id || !k || t.dataset.struct) return;
    const r = findRound(id); if (!r) return;
    if (t.type === 'checkbox') r[k] = t.checked;
    else if (t.type === 'number') r[k] = t.value === '' ? '' : Number(t.value);
    else r[k] = t.value;
    recompute();
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    const id = t.dataset.id;
    if (!id) return;
    const r = findRound(id); if (!r) return;
    const k = t.dataset.k;
    if (t.dataset.struct) {
      r[k] = t.checked;
      renderRounds(); recompute();
    } else if (t.dataset.structNum) {
      // Reinigungsfelder erscheinen erst ab 23 Startern (Lead)
      const before = document.querySelector(`[data-k="cleanEvery"][data-id="${id}"]`) != null;
      if (r.discipline === 'lead' && before !== Number(r.starters) > 22) { renderRounds(); recompute(); }
    }
  });

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-additem],[data-delitem],[data-jumpitem],[data-seg],[data-wall],[data-toggle],[data-dup],[data-del],[data-apply],[data-add],[data-delwall],[data-jump]');
    if (!t) return;
    if (t.dataset.additem !== undefined) { addItem(t.dataset.additem); return; }
    if (t.dataset.delitem) { comp.items = comp.items.filter((x) => x.id !== t.dataset.delitem); renderItems(); recompute(); return; }
    if (t.dataset.jumpitem) { const el = document.getElementById('item-' + t.dataset.jumpitem); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (t.dataset.seg) {
      const r = findRound(t.dataset.id); if (!r) return;
      const k = t.dataset.seg, raw = t.dataset.val;
      r[k] = raw === 'true' ? true : raw === 'false' ? false : /^\d+$/.test(raw) && k !== 'phase' ? Number(raw) : raw;
      if (k === 'phase') applyPhaseDefaults(r);
      renderRounds(); recompute();
    } else if (t.dataset.wall) {
      const r = findRound(t.dataset.id); if (!r) return;
      const set = new Set(r.walls || []);
      set.has(t.dataset.wall) ? set.delete(t.dataset.wall) : set.add(t.dataset.wall);
      r.walls = [...set];
      t.classList.toggle('on');
      recompute();
    } else if (t.dataset.toggle) {
      const id = t.dataset.toggle;
      open.has(id) ? open.delete(id) : open.add(id);
      document.getElementById('round-' + id).classList.toggle('open');
    } else if (t.dataset.add) {
      const r = newRound(t.dataset.add);
      comp.rounds.push(r); open.add(r.id); renderRounds(); recompute();
      document.getElementById('round-' + r.id).scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (t.dataset.dup) {
      const src = findRound(t.dataset.dup);
      const copy = Object.assign(JSON.parse(JSON.stringify(src)), { id: uid() });
      comp.rounds.splice(comp.rounds.indexOf(src) + 1, 0, copy); open.add(copy.id); renderRounds(); recompute();
    } else if (t.dataset.del) {
      const r = findRound(t.dataset.del);
      if (confirm(`„${roundTitle(r)}“ löschen?`)) { comp.rounds = comp.rounds.filter((x) => x !== r); renderRounds(); recompute(); }
    } else if (t.dataset.apply) {
      const res = results.find((x) => x.id === t.dataset.apply);
      const r = findRound(t.dataset.apply);
      if (res && res.suggest && r) { r[res.suggest.field] = res.suggest.value; renderRounds(); recompute(); }
    } else if (t.dataset.delwall) {
      const id = t.dataset.delwall;
      comp.walls = comp.walls.filter((w) => w.id !== id);
      comp.rounds.forEach((r) => { r.walls = (r.walls || []).filter((w) => w !== id); });
      renderWalls(); renderRounds(); recompute();
    } else if (t.dataset.jump) {
      const id = t.dataset.jump;
      open.add(id);
      const el = document.getElementById('round-' + id);
      if (el) { el.classList.add('open'); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }
  });

  $('#wallForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#wallInput').value.trim();
    if (!name) return;
    comp.walls.push({ id: 'w' + uid(), name });
    $('#wallInput').value = '';
    renderWalls(); renderRounds(); recompute();
  });
  $('#showMinor').addEventListener('change', renderPlan);
  $('#printWarn').addEventListener('change', (e) => document.body.classList.toggle('print-warn', e.target.checked));
  $('#btnPrint').addEventListener('click', () => window.print());
  $('#btnNew').addEventListener('click', () => {
    if (comp.rounds.length && !confirm('Aktuellen Wettkampf verwerfen und neu beginnen? Vorher ggf. exportieren.')) return;
    comp = emptyComp(); open.clear(); renderAll();
  });
  $('#btnExample').addEventListener('click', () => {
    if (comp.rounds.length && !confirm('Aktuellen Wettkampf durch das Beispiel ersetzen?')) return;
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
      if (!data || !Array.isArray(data.rounds) || !Array.isArray(data.walls)) throw new Error('format');
      comp = data; open.clear(); renderAll();
    }).catch(() => alert('Die Datei konnte nicht gelesen werden. Bitte eine exportierte Zeitplan-Datei (.json) wählen.'));
    e.target.value = '';
  });

  /* ---------- Beispiel ---------- */
  function example() {
    const date = today();
    const walls = [{ id: 'wl', name: 'Lead-Wand' }, { id: 'wb', name: 'Boulderbereich' }, { id: 'ws', name: 'Speed-Wand' }];
    const R = (discipline, phase, o) => Object.assign({ id: uid(), discipline, phase, category: '', youth: false, day: '', walls: [] }, C.defaults(discipline, phase), o);
    return {
      name: 'Beispiel Landesmeisterschaft', date, walls,
      rounds: [
        R('lead', 'quali', { category: 'U17 männlich', youth: true, start: '09:30', starters: 4, walls: ['wl'] }),
        R('lead', 'quali', { category: 'Damen', start: '11:00', starters: 26, walls: ['wl'] }),
        R('lead', 'final', { category: 'U17 männlich', youth: true, start: '15:00', starters: 4, walls: ['wl'] }),
        R('boulder', 'quali', { category: 'U15', youth: true, start: '09:30', starters: 18, walls: ['wb'] }),
        R('boulder', 'final', { category: 'U15', youth: true, start: '14:00', starters: 6, isoClose: 20, walls: ['wb'] }),
        R('speed', 'training', { category: 'Alle', start: '16:00', starters: 16, walls: ['ws'] }),
        R('speed', 'quali', { category: 'Herren', start: '16:30', starters: 16, walls: ['ws'] }),
        R('speed', 'final', { category: 'Herren', start: '17:30', bracket: 8, presentation: true, walls: ['ws'] }),
      ],
      items: [
        { id: uid(), time: '07:30', title: 'Registration', note: 'Alle Kategorien', day: '' },
        { id: uid(), time: '08:15', title: 'Technical Meeting', note: 'Trainer und Betreuer', day: '' },
        { id: uid(), time: '18:30', title: 'Siegerehrung', note: 'Alle Kategorien', day: '' },
      ],
    };
  }

  renderAll();
})();
