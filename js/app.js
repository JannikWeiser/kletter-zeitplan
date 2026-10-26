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
  let results = [];

  function emptyComp() { return { name: '', date: today(), walls: [], rounds: [] }; }
  function load() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(comp)); } catch (e) { /* privater Modus */ } }

  /* ---------- Feld-Definitionen je Disziplin ---------- */
  const SEL = {
    phaseLead: [['quali', 'Qualifikation'], ['semi', 'Halbfinale'], ['final', 'Finale']],
    phaseSpeed: [['training', 'Training'], ['quali', 'Qualifikation'], ['final', 'Finale']],
    leadFormat: [['flash2', 'Flash · 2 Routen (versetzt)'], ['flash1', 'Flash · 1 Route'], ['onsight', 'On Sight · 1 Route']],
    boulderFormat: [['interval', 'Intervall (fix)'], ['flash2sets', 'Flash · 2 Sets (z. B. Jugendcup 2×3)'], ['parallel', 'Finale · Boulder parallel (Rotation frei)'], ['jam', 'JAM (Gesamtdauer)']],
    sight: [['onsight', 'On Sight (Isolation)'], ['flash', 'Flash (Routendemo)']],
    obsMode: [['none', 'Keine'], ['per', '2 min pro Boulder'], ['joint', '8 min gemeinsam']],
    lanes: [['2', 'Speed 2 (2 Lanes)'], ['4', 'Speed 4 (4 Lanes)']],
    bracket: [['4', '4'], ['8', '8'], ['16', '16'], ['32', '32 (nur Speed 4)']],
  };

  function fieldsFor(r) {
    const f = [];
    const d = r.discipline;
    if (d === 'lead') {
      f.push({ group: 'Format', items: [
        { k: 'leadFormat', l: 'Format', t: 'select', o: SEL.leadFormat, wide: true },
        { k: 'attempt', l: 'Ø Dauer pro Versuch (min)', t: 'num', step: 0.5 },
        r.leadFormat === 'flash2' && { k: 'route2Offset', l: 'Route 2 startet später um (min)', t: 'num', step: 5 },
      ] });
      if (Number(r.starters) > 22) f.push({ group: 'Routenreinigung (> 22 Starter)', items: [
        { k: 'cleanEvery', l: 'Reinigung alle … Starter', t: 'num' },
        { k: 'cleanDur', l: 'Dauer Reinigung (min)', t: 'num' },
      ] });
    } else if (d === 'boulder') {
      const bf = r.boulderFormat;
      f.push({ group: 'Format', items: [
        { k: 'boulderFormat', l: 'Format', t: 'select', o: SEL.boulderFormat, wide: true },
        { k: 'sight', l: 'Modus', t: 'select', o: SEL.sight },
        bf !== 'flash2sets' && bf !== 'jam' && { k: 'boulders', l: 'Anzahl Boulder', t: 'num' },
        (bf === 'interval' || bf === 'flash2sets') && { k: 'interval', l: 'Intervall (min, + 15 s Wechsel)', t: 'num', step: 0.5 },
        bf === 'flash2sets' && { k: 'setSize', l: 'Boulder pro Set', t: 'num' },
        bf === 'flash2sets' && { k: 'setGap', l: 'Leer-Rotationen zwischen Sets', t: 'num' },
        bf === 'parallel' && { k: 'active', l: 'Boulder gleichzeitig', t: 'num' },
        bf === 'parallel' && { k: 'rotation', l: 'Rotationszeit (min)', t: 'num', step: 0.25 },
        bf === 'parallel' && { k: 'blockBreak', l: 'Pause zwischen Blöcken (min)', t: 'num' },
        bf === 'jam' && { k: 'jamDur', l: 'Gesamtdauer (min)', t: 'num', step: 5 },
      ] });
    } else {
      const sf = r.speedFormat;
      f.push({ group: 'Format', items: [
        { k: 'lanes', l: 'Wand', t: 'select', o: SEL.lanes },
        { k: 'raceTime', l: 'Zeit pro Race inkl. Wechsel (min)', t: 'num', step: 0.25 },
        sf === 'training' && { k: 'trainDur', l: 'Feste Dauer (min, 0 = wie Quali)', t: 'num', step: 5 },
        sf === 'final' && { k: 'bracket', l: 'Wettkampfbaum', t: 'select', o: SEL.bracket },
        sf === 'final' && { k: 'phaseBreak', l: 'Pause zwischen Phasen (min)', t: 'num' },
      ] });
    }
    const onsight = (d === 'lead' && r.leadFormat === 'onsight') || (d === 'boulder' && r.sight === 'onsight');
    const hasObs = (d === 'lead' && r.leadFormat === 'onsight') || (d === 'boulder' && r.obsMode && r.obsMode !== 'none');
    const vor = [{ k: 'warmup', l: 'Aufwärmbereich öffnet … min vor Start', t: 'num', step: 5 }];
    if (onsight) vor.push({ k: 'isoClose', l: 'Isolation schließt … min vor Start', t: 'num', step: 5 });
    if (d === 'boulder') vor.push({ k: 'obsMode', l: 'Gemeinsame Besichtigung', t: 'select', o: SEL.obsMode });
    if (hasObs) vor.push({ k: 'obsBefore', l: 'Besichtigung beginnt … min vor Start', t: 'num' });
    if (d !== 'speed' || r.speedFormat === 'final') {
      vor.push({ k: 'presentation', l: d === 'speed' ? 'Präsentation vor Medal Races' : 'Präsentation der Finalisten', t: 'check' });
      if (r.presentation) { vor.push({ k: 'presDur', l: 'Dauer Präsentation (min)', t: 'num' }); vor.push({ k: 'presPause', l: 'Pause bis 1. Versuch (min)', t: 'num' }); }
    }
    if (r.phase !== 'training') vor.push({ k: 'resultBuffer', l: 'Ende → offizielles Ergebnis (min)', t: 'num', step: 5 });
    f.push({ group: 'Vorlauf und Ablauf', items: vor });
    return f.map((g) => Object.assign(g, { items: g.items.filter(Boolean) }));
  }

  function input(r, it) {
    const v = r[it.k];
    const attrs = `data-k="${it.k}" data-id="${r.id}"`;
    if (it.t === 'select') {
      return `<label class="${it.wide ? 'span2' : ''}">${esc(it.l)}<select ${attrs} data-struct="1">${it.o.map(([val, txt]) => `<option value="${val}"${String(v) === val ? ' selected' : ''}>${esc(txt)}</option>`).join('')}</select></label>`;
    }
    if (it.t === 'check') return `<label class="check"><input type="checkbox" ${attrs} data-struct="1"${v ? ' checked' : ''}> ${esc(it.l)}</label>`;
    return `<label>${esc(it.l)}<input type="number" inputmode="decimal" min="0" step="${it.step || 1}" value="${esc(v)}" ${attrs}></label>`;
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
    const c = { error: 0, rest: 0, should: 0, info: 0 };
    ws.forEach((w) => { c[w.level]++; });
    const lab = { error: '!', rest: '⏱', should: '?', info: 'i' };
    return Object.keys(c).filter((k) => c[k]).map((k) => `<span class="badge ${k}" title="${c[k]}">${lab[k]} ${c[k]}</span>`).join('');
  }

  function renderRounds() {
    const list = $('#roundList');
    $('#emptyRounds').hidden = comp.rounds.length > 0;
    list.innerHTML = comp.rounds.map((r) => {
      const phaseOpts = r.discipline === 'speed' ? SEL.phaseSpeed : SEL.phaseLead;
      const wallPick = comp.walls.length
        ? comp.walls.map((w) => `<label class="check"><input type="checkbox" data-wall="${w.id}" data-id="${r.id}"${(r.walls || []).includes(w.id) ? ' checked' : ''}> ${esc(w.name)}</label>`).join('')
        : '<span class="muted small">Lege oben Wände/Bereiche an, um Belegungen zu prüfen.</span>';
      return `<article class="card round d-${r.discipline}${open.has(r.id) ? ' open' : ''}" data-round="${r.id}" id="round-${r.id}">
        <div class="round-head" data-toggle="${r.id}">
          <span class="chev">▶</span>
          <div class="title"><b data-title>${esc(roundTitle(r))}</b><span data-sum></span></div>
          <div class="badges" data-badges></div>
        </div>
        <div class="round-body">
          <div class="fs"><div class="grid2">
            <label>Kategorie<input type="text" value="${esc(r.category)}" data-k="category" data-id="${r.id}" placeholder="z. B. U17 männlich"></label>
            <label>Runde<select data-k="phase" data-id="${r.id}" data-struct="1">${phaseOpts.map(([v, t]) => `<option value="${v}"${r.phase === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
          </div></div>
          <div class="fs"><div class="grid3">
            <label>Start of Play<input type="time" value="${esc(r.start)}" data-k="start" data-id="${r.id}"></label>
            <label>${r.discipline === 'speed' && r.phase === 'final' ? 'Starter (Info)' : 'Starter'}<input type="number" min="0" value="${esc(r.starters)}" data-k="starters" data-id="${r.id}" data-struct-num="1"></label>
            <label>Tag<input type="date" value="${esc(r.day || '')}" data-k="day" data-id="${r.id}" placeholder="${esc(comp.date)}"></label>
          </div>
          <label class="check" style="margin-top:8px"><input type="checkbox" data-k="youth" data-id="${r.id}"${r.youth ? ' checked' : ''}> Jugendkategorie (Ende bis 20:00 Uhr)</label></div>
          ${fieldsFor(r).map((g) => `<div class="fs"><p class="fs-title">${esc(g.group)}</p><div class="grid2">${g.items.map((it) => input(r, it)).join('')}</div></div>`).join('')}
          <div class="fs"><p class="fs-title">Wände / Bereiche</p><div class="wallpick">${wallPick}</div></div>
          <div class="warns" data-warns></div>
          <details class="detail" data-detail-wrap><summary>Startzeiten je Startplatz</summary><div class="detail-wrap" data-detail></div></details>
          <div class="round-actions">
            <button type="button" class="mini" data-dup="${r.id}">Duplizieren</button>
            <button type="button" class="mini" data-del="${r.id}">Löschen</button>
          </div>
        </div>
      </article>`;
    }).join('');
    // span2 für breite Selects
    list.querySelectorAll('label.span2').forEach((l) => { l.style.gridColumn = '1 / -1'; });
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
  function renderPlan() {
    const showMinor = $('#showMinor').checked;
    const wallName = (id) => (comp.walls.find((w) => w.id === id) || {}).name || '';
    const rows = [];
    results.forEach((res) => {
      const r = res.round;
      const day = r.day || comp.date || '';
      res.events.forEach((ev) => {
        const ws = res.warnings.filter((w) => w.at === ev.key);
        rows.push({ day, t: ev.t, ev, r, res, ws });
      });
      // Warnungen ohne passendes Ereignis an den Start hängen
      const keys = new Set(res.events.map((e) => e.key));
      const orphan = res.warnings.filter((w) => !keys.has(w.at));
      if (orphan.length) { const s = rows.find((x) => x.res === res && x.ev.key === 'sop'); if (s) s.ws = s.ws.concat(orphan); }
    });
    const ord = { warmup: 0, demo: 1, iso: 2, obs: 3, pres: 4, sop: 5 };
    rows.sort((a, b) => a.day.localeCompare(b.day) || a.t - b.t || ((ord[a.ev.key] ?? 9) - (ord[b.ev.key] ?? 9)));
    const visible = rows.filter((x) => showMinor || !x.ev.minor || x.ws.length);

    const cnt = { error: 0, rest: 0, should: 0, info: 0 };
    results.forEach((res) => res.warnings.forEach((w) => { cnt[w.level]++; }));
    const sum = [];
    if (cnt.error) sum.push(`<span class="pill err">${cnt.error} ${cnt.error > 1 ? 'Regelverstöße' : 'Regelverstoß'}</span>`);
    if (cnt.rest) sum.push(`<span class="pill rest">${cnt.rest} Ruhezeit-Warnung${cnt.rest > 1 ? 'en' : ''}</span>`);
    if (cnt.should) sum.push(`<span class="pill should">${cnt.should} Empfehlung${cnt.should > 1 ? 'en' : ''}</span>`);
    if (cnt.info) sum.push(`<span class="pill info">${cnt.info} Hinweis${cnt.info > 1 ? 'e' : ''}</span>`);
    if (!sum.length && results.length) sum.push('<span class="pill ok">Keine Konflikte gefunden</span>');
    $('#summary').innerHTML = sum.join('');

    $('#planTitle').textContent = comp.name ? comp.name : 'Ablaufplan';
    const days = [...new Set(rows.map((x) => x.day))];
    $('#planSub').textContent = results.length ? `Ablaufplan · ${days.map(fmtDay).join(', ')} · ${results.length} Runde${results.length > 1 ? 'n' : ''}` : '';

    if (!visible.length) { $('#planBody').innerHTML = '<p class="muted empty">Der Ablaufplan erscheint hier, sobald Runden angelegt sind.</p>'; return; }
    let html = '', curDay = null;
    visible.forEach((x) => {
      if (x.day !== curDay) {
        if (curDay !== null) html += '</tbody></table>';
        curDay = x.day;
        html += `<div class="day-title">${esc(fmtDay(x.day))}</div><table class="plan-table"><colgroup><col class="c-time"><col class="c-cat"><col><col class="c-wall"></colgroup><thead><tr><th>Zeit</th><th>Kategorie</th><th>Programmpunkt</th><th class="wallcol">Wand</th></tr></thead><tbody>`;
      }
      const walls = (x.r.walls || []).map(wallName).filter(Boolean).join(', ');
      const ws = x.ws.map((w) => `<span class="rowwarn ${w.level}">${esc(w.text)}</span>`).join('');
      html += `<tr class="${x.ev.minor ? 'minor' : 'main'} jump" data-jump="${x.r.id}">
        <td class="time">${C.fmt(x.t)}</td>
        <td class="cat"><span class="dot ${x.r.discipline}"></span>${esc(x.r.category || '–')}<small>${esc(C.DISC[x.r.discipline])} · ${esc(C.PHASES[x.r.phase])}</small></td>
        <td class="ev">${esc(x.ev.label)}${ws}</td>
        <td class="wallcol">${esc(walls)}</td></tr>`;
    });
    html += '</tbody></table>';
    $('#planBody').innerHTML = html;
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
    recompute();
  }

  /* ---------- Ereignisse ---------- */
  const findRound = (id) => comp.rounds.find((r) => r.id === id);

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'compName') { comp.name = t.value; recompute(); return; }
    if (t.id === 'compDate') { comp.date = t.value; recompute(); return; }
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
    if (t.dataset.wall) {
      const set = new Set(r.walls || []);
      t.checked ? set.add(t.dataset.wall) : set.delete(t.dataset.wall);
      r.walls = [...set]; recompute(); return;
    }
    const k = t.dataset.k;
    if (t.dataset.struct) {
      r[k] = t.type === 'checkbox' ? t.checked : (k === 'lanes' || k === 'bracket' ? Number(t.value) : t.value);
      if (k === 'phase') applyPhaseDefaults(r);
      renderRounds(); recompute();
    } else if (t.dataset.structNum) {
      // Reinigungsfelder erscheinen erst ab 23 Startern (Lead)
      const before = document.querySelector(`[data-k="cleanEvery"][data-id="${id}"]`) != null;
      if (r.discipline === 'lead' && before !== Number(r.starters) > 22) { renderRounds(); recompute(); }
    }
  });

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-toggle],[data-dup],[data-del],[data-apply],[data-add],[data-delwall],[data-jump]');
    if (!t) return;
    if (t.dataset.toggle) {
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
        R('boulder', 'quali', { category: 'U15', youth: true, start: '10:00', starters: 18, walls: ['wb'] }),
        R('boulder', 'final', { category: 'U15', youth: true, start: '14:00', starters: 6, isoClose: 20, walls: ['wb'] }),
        R('speed', 'training', { category: 'Alle', start: '16:00', starters: 16, walls: ['ws'] }),
        R('speed', 'quali', { category: 'Herren', start: '16:30', starters: 16, walls: ['ws'] }),
        R('speed', 'final', { category: 'Herren', start: '17:30', bracket: 8, presentation: true, walls: ['ws'] }),
      ],
    };
  }

  renderAll();
})();
