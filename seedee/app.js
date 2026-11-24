// O.E. SeeDee explorable: sign-in, the ridge stepper and one renderer per step.
(function () {
  'use strict';
  const D = window.SeeDee, store = window.SeeDeeStore;
  const { ICON, LANES, CASES, ROLES, TEAMS, ANCHORS } = D;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = id => document.getElementById(id);
  const QUESTION = 'Can the transfer price be set or tested with CPM / TNMM, with Company B as the tested party?';
  const ANSWERS = [['yes', 'Yes'], ['no', 'No'], ['unc', 'Unclear']];
  const LETTER = { y: 'yes', n: 'no', u: 'unc' };

  /* ---------- small DOM helpers ---------- */
  function fill(el, attrs, kids) {
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.setAttribute('class', v);
      else if (k === 'on') for (const ev in v) el.addEventListener(ev, v[ev]);
      else el.setAttribute(k, v);
    }
    for (const kid of kids) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
    return el;
  }
  const h = (tag, attrs, ...kids) => fill(document.createElement(tag), attrs, kids);
  const s = (tag, attrs, ...kids) => fill(document.createElementNS(SVGNS, tag), attrs, kids);
  function icon(name, cls) {
    return s('svg', { viewBox: '0 0 24 24', class: 'i' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' }, s('path', { d: ICON[name] }));
  }
  // An icon placed inside a larger SVG drawing, centred on (x, y).
  function sicon(name, x, y, size, cls) {
    return s('svg', { viewBox: '0 0 24 24', x: x - size / 2, y: y - size / 2, width: size, height: size, class: cls || null, 'aria-hidden': 'true' },
      s('path', { class: 'ip', d: ICON[name] }));
  }
  // Makes any element (including SVG groups) behave like a button.
  function pressable(el, label, fn) {
    el.setAttribute('tabindex', '0'); el.setAttribute('role', 'button');
    if (label) el.setAttribute('aria-label', label);
    el.addEventListener('click', fn);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); } });
    return el;
  }

  /* ---------- detail card ---------- */
  let detailEl = null;
  function detailCard(hint) {
    detailEl = h('section', { class: 'card detail', 'aria-live': 'polite' });
    detailEl.dataset.hint = hint || 'Tap anything in the picture.';
    showDetail(null);
    return detailEl;
  }
  function showDetail(d) {
    if (!detailEl) return;
    detailEl.replaceChildren();
    if (!d) { detailEl.append(h('div', { class: 'hint' }, icon('tap'), detailEl.dataset.hint)); return; }
    detailEl.append(h('h2', null, d.title));
    if (d.tag) {
      const sw = h('i', { class: 'sw' });
      if (d.loc) sw.style.background = 'var(--' + d.loc.toLowerCase() + ')';
      detailEl.append(h('div', { class: 'where' }, sw, d.tag));
    }
    (d.lines || []).forEach(t => detailEl.append(h('p', null, t)));
    if (d.extra) detailEl.append(d.extra);
  }
  // Wires every [data-key] inside root to show map[key] in the detail card.
  function wire(root, map) {
    root.querySelectorAll('[data-key]').forEach(el => {
      const key = el.dataset.key, d = map[key];
      if (!d) return;
      const act = () => {
        const on = !el.classList.contains('sel');
        document.querySelectorAll('#stage [data-key].sel').forEach(x => x.classList.remove('sel'));
        if (on) document.querySelectorAll('#stage [data-key="' + key + '"]').forEach(x => x.classList.add('sel'));
        showDetail(on ? d : null);
      };
      if (el.tagName === 'BUTTON') el.addEventListener('click', act);
      else pressable(el, d.title, act);
    });
  }
  function tile(key, ic, label) {
    return h('button', { class: 'tile', type: 'button', 'data-key': key, id: 'tile-' + key }, icon(ic), label);
  }

  /* ---------- steps ---------- */
  const STEPS = [
    { id: 'business', k: 'The business', t: 'Premium machine tools, sold on engineering and reliability.', render: business },
    { id: 'flow', k: 'The flow', t: 'Company A buys from outside makers and sells two ways.', render: flow },
    { id: 'price', k: 'The price puzzle', t: 'At the Country D price, Company B would lose money.', render: price },
    { id: 'risk', k: 'The risk', t: 'Company A’s margin swings. Company B’s stays flat.', render: risk },
    { id: 'people', k: 'The people', t: 'One CEO, five chiefs, eleven directors.', render: people },
    { id: 'rules', k: 'Ground rules', t: 'Four cases. One question each.', render: rules, solo: true }
  ].concat(CASES.map((c, i) => ({ id: 'case-' + c.k.toLowerCase(), k: 'Case ' + c.k, t: c.cap, render: cases, caseIdx: i })),
    [{ id: 'almost', k: 'Almost there', t: 'We are almost at the summit.', render: almost, secret: true, solo: true },
      { id: 'hidden-path', k: 'Hidden path', t: 'Case D has a history.', render: hiddenPath, secret: true },
      { id: 'summit', k: 'Summit', t: 'Where did you tip? Where did everyone else?', render: summit }]);
  const FIRST_CASE = STEPS.findIndex(x => x.render === cases);
  const ALMOST = STEPS.findIndex(x => x.id === 'almost'), SECRET = STEPS.findIndex(x => x.id === 'hidden-path'), LAST = STEPS.length - 1;
  // The hidden path is drawn on the ridge only after the "almost there" page has revealed it in this
  // visit. It starts hidden every time, also for someone who walked it on an earlier visit.
  let revealed = false;
  const state = { step: -1 };
  let cleanup = null, caseUI = null, pollUI = null;
  // The two secret steps exist only once all four cases have been answered.
  const unlocked = () => { const v = store.myVotes(); return CASES.every(c => v[c.k]); };
  const shown = i => !STEPS[i].secret || unlocked();
  // The furthest step that may be opened: nobody gets past a case they have not answered.
  function limit() {
    const v = store.myVotes();
    for (let c = 0; c < CASES.length; c++) if (!v[CASES[c].k]) return FIRST_CASE + c;
    return LAST;
  }
  function neighbour(from, dir) {
    let i = from + dir;
    while (i >= 0 && i <= LAST && !shown(i)) i += dir;
    return i < 0 || i > LAST ? from : i;
  }

  function go(i) {
    i = Math.max(0, Math.min(LAST, limit(), i));
    if (!shown(i)) i = LAST;
    if (i === SECRET) revealed = true;
    const prev = STEPS[state.step], next = STEPS[i];
    if (state.step === i) return;
    state.step = i;
    const keepStage = prev && prev.render === cases && next.render === cases && caseUI;
    if (!keepStage) {
      if (cleanup) { cleanup(); cleanup = null; }
      caseUI = null; detailEl = null; pollUI = null;
      $('stage').replaceChildren(); $('side').replaceChildren();
      $('cols').classList.toggle('solo', !!next.solo);
    }
    $('capk').textContent = next.k;
    $('cap').textContent = next.t;
    renderRidge(); renderPager();
    try { history.replaceState(null, '', '#' + next.id); } catch (e) { /* sandboxed frame */ }
    window.scrollTo(0, 0);
    if (keepStage) casesUpdate(true);
    else cleanup = next.render($('stage'), $('side'), next) || null;
  }
  function stepFromHash() {
    const id = (location.hash || '').slice(1);
    const i = STEPS.findIndex(x => x.id === id);
    return i < 0 ? 0 : i;
  }
  function renderPager() {
    const i = state.step, prev = $('prev'), next = $('next'), n = neighbour(i, 1);
    const visible = STEPS.map((st, j) => j).filter(shown);
    prev.hidden = neighbour(i, -1) === i;
    prev.replaceChildren(icon('left'), 'Back');
    // On the reveal page the way forward stays out of sight until the animation has shown it.
    // On a case and on the hidden path the only way on is the button that appears in the poll after voting.
    next.hidden = n === i || (i === ALMOST && !revealed) || i === SECRET || STEPS[i].render === cases;
    if (n !== i) next.replaceChildren(STEPS[n].k, icon('right'));
    $('count').textContent = (visible.indexOf(i) + 1) + ' / ' + visible.length;
  }

  /* ---------- ridge stepper ---------- */
  const RIDGE = [[760, 491], [800, 475], [834, 461.5], [852, 459], [878, 450], [912, 433.5], [926, 425.5], [934, 421.5], [947, 424], [970, 430], [991, 421.5], [999, 415], [1011, 409], [1031, 411], [1049, 401.5], [1061, 400.5], [1075, 394.5], [1088, 396.5], [1106, 388], [1138, 351], [1156, 342], [1159, 341.5], [1189, 349.5], [1219, 338], [1230, 336], [1238, 333], [1261, 338], [1270, 336.5], [1287, 330], [1304, 316], [1319, 305.5], [1329, 302.5], [1350, 290.5], [1361, 286], [1376, 290], [1385, 285], [1393, 279.5], [1405, 271.5], [1428, 264], [1446, 270.5], [1460, 282.5], [1473, 288.5], [1486, 303.5], [1498, 307], [1505, 307], [1510, 305], [1518, 306], [1531, 312.5], [1557, 332.5], [1580, 348], [1597, 359], [1616, 365]];
  const SPUR = [[1043, 465], [1080, 452.5], [1110, 442], [1150, 427.5], [1180, 417.5], [1210, 405.5], [1240, 386.5], [1250, 378], [1260, 367], [1270, 364.5], [1295, 359], [1310, 364], [1340, 375], [1370, 384.5], [1400, 392], [1420, 398], [1440, 408], [1460, 418], [1480, 425], [1500, 433.5], [1530, 447.5], [1560, 462.5]];
  const VB = { x: 745, y: 205, w: 815, h: 295 };
  const STOP_X = [792, 850, 908, 966, 1024, 1082, 1150, 1222, 1294, 1366];
  const SUMMIT = [1428, 222];
  function ridgeY(x) {
    for (let i = 1; i < RIDGE.length; i++) {
      const [x0, y0] = RIDGE[i - 1], [x1, y1] = RIDGE[i];
      if (x <= x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
    return RIDGE[RIDGE.length - 1][1];
  }
  // The hidden stop sits on the far side of the summit, reached by a tunnel from Case D.
  const HIDDEN = [1484, ridgeY(1484)], TUNNEL = [[1398, 318], [1446, 326]];
  const STOPS = STEPS.map((st, i) => (i === SECRET ? HIDDEN : i === ALMOST ? [1400, ridgeY(1400)] : st.id === 'summit' ? SUMMIT : [STOP_X[i], ridgeY(STOP_X[i])]));
  const DSTOP = STOPS[FIRST_CASE + 3];
  const stopEls = [];
  let climbed = null, secretLine = null;
  function buildRidge() {
    const ridge = $('ridge');
    climbed = s('polyline', { class: 'climbed' });
    secretLine = s('polyline', { class: 'secret', points: [DSTOP].concat(TUNNEL, [HIDDEN, [1460, 282.5], [1446, 270.5], [1428, 264]]).map(p => p.join(',')).join(' ') });
    ridge.append(s('svg', { viewBox: [VB.x, VB.y, VB.w, VB.h].join(' '), preserveAspectRatio: 'none', 'aria-hidden': 'true' },
      s('polyline', { points: SPUR.map(p => p.join(',')).join(' ') }),
      s('polyline', { points: RIDGE.map(p => p.join(',')).join(' ') }),
      s('polyline', { points: '1428,264 1428,216' }),
      secretLine, climbed));
    STEPS.forEach((st, i) => {
      const kind = i === SECRET ? 'case secret' : st.render === cases ? 'case' : st.id === 'summit' ? 'flag' : 'pip';
      const b = h('button', {
        class: 'wp ' + kind, type: 'button', id: 'stop-' + st.id, 'aria-label': st.k, title: st.k,
        style: 'left:' + ((STOPS[i][0] - VB.x) / VB.w * 100) + '%;top:' + ((STOPS[i][1] - VB.y) / VB.h * 100) + '%',
        on: { click: () => go(i) }
      }, i === SECRET ? icon('key') : kind === 'case' ? CASES[st.caseIdx].k : kind === 'flag' ? icon('flag') : null);
      stopEls.push(b); ridge.append(b);
    });
  }
  function renderRidge() {
    const i = state.step, votes = store.myVotes(), lim = limit();
    stopEls.forEach((b, j) => {
      b.disabled = j > lim;
      b.setAttribute('aria-current', j === i ? 'true' : 'false');
      b.classList.toggle('done', j < i);
      const old = b.querySelector('.badge'); if (old) old.remove();
      const st = STEPS[j], key = j === SECRET ? 'D2' : st.render === cases ? CASES[st.caseIdx].k : null;
      if (key && votes[key]) b.append(h('span', { class: 'badge' }, icon(votes[key].a)));
      if (st.secret) b.hidden = !shown(j) || (j === SECRET && !revealed);
      if (j === SECRET) b.classList.toggle('fresh', !votes.D2 && j !== i);
    });
    secretLine.style.display = shown(SECRET) && revealed ? '' : 'none';
    const x = i === SECRET ? DSTOP[0] : STOPS[i][0], pts = RIDGE.filter(p => p[0] < Math.min(x, 1428));
    if (STEPS[i].id === 'summit') pts.push([1428, 264], SUMMIT);
    else if (i === SECRET) pts.push(DSTOP, TUNNEL[0], TUNNEL[1], HIDDEN);
    else pts.push(STOPS[i]);
    climbed.setAttribute('points', pts.map(p => p.join(',')).join(' '));
  }

  /* ---------- step: the business ---------- */
  function gearPath(r, n, a0) {
    const ro = r + 7, ri = r - 7, st = 2 * Math.PI / n;
    let d = '';
    for (let i = 0; i < n; i++) {
      const a = a0 + i * st;
      [[ri, -0.5], [ri, -0.27], [ro, -0.15], [ro, 0.15], [ri, 0.27]].forEach(([rad, f], j) => {
        const ang = a + f * st;
        d += (i === 0 && j === 0 ? 'M' : 'L') + (rad * Math.cos(ang)).toFixed(1) + ' ' + (rad * Math.sin(ang)).toFixed(1);
      });
    }
    return d + 'Z';
  }
  // Drawn as an engineering blueprint: the value drivers are a gear train (size = importance)
  // that turns out two product lines at a premium price for five customer industries.
  function business(stage, side) {
    const P = D.PRODUCTS;
    const box = h('div', { class: 'panel bp' });
    stage.append(box, h('div', { class: 'legend' }, h('span', null, 'Bigger gear, bigger value driver.')));
    side.append(detailCard('Tap any part of the drawing.'));
    const A = { x: 125, y: 150, r: 100, n: 20 }, B = { x: 304, y: 131, r: 80, n: 16 }, C = { x: 389, y: 216, r: 40, n: 8 };
    const phi = Math.atan2(B.y - A.y, B.x - A.x), psi = Math.atan2(C.y - B.y, C.x - B.x);
    const a0 = phi, b0 = phi + Math.PI + Math.PI / B.n, c0 = psi + Math.PI + Math.PI / C.n + (psi - b0) * B.n / C.n;
    const tr = (x, y, rot) => 'translate(' + x + ' ' + y + ')' + (rot ? ' rotate(' + rot + ')' : '');
    const gear = (g, a, cls, key, secs, rev, hub, ic, label) => s('g', { transform: tr(g.x, g.y) },
      s('g', { class: 'hot', 'data-key': key },
        s('path', { class: 'gear spin hl ' + cls + (rev ? ' rev' : ''), style: 'animation-duration:' + secs + 's', d: gearPath(g.r, g.n, a) }),
        s('circle', { class: 'hub', r: hub }),
        sicon(ic, 0, label ? -12 : 0, label ? 26 : 22, 'bpicon'),
        label ? s('text', { class: 'glabel', y: 20 }, label) : null));
    const dim = (x1, x2, y, label, below) => s('g', { class: 'dim' },
      s('line', { x1, x2, y1: y, y2: y }), s('line', { x1, x2: x1, y1: y - 5, y2: y + 5 }), s('line', { x1: x2, x2, y1: y - 5, y2: y + 5 }),
      s('text', { x: (x1 + x2) / 2, y: below ? y + 16 : y - 7 }, label));
    let mode = null;
    function draw() {
      const next = box.clientWidth >= 600 ? 'wide' : 'tall';
      if (next === mode) return;
      mode = next;
      const L = mode === 'wide'
        ? { W: 800, H: 386, gears: [0, 22], out: [468, 28], drive: [446, 176, 0], tb: [468, 332] }
        : { W: 440, H: 716, gears: [0, 22], out: [58, 356], drive: [220, 322, 90], tb: [110, 660] };
      const svg = s('svg', { class: 'bpsvg ' + mode, viewBox: '0 0 ' + L.W + ' ' + L.H, role: 'group', 'aria-label': 'What drives the business' });

      // gear train
      svg.append(s('g', { transform: tr(L.gears[0], L.gears[1]) },
        dim(25, 225, 28, 'KEY DRIVER'), dim(232, 376, 34, 'KEY DRIVER'), dim(349, 429, 276, 'NOT PRIMARY', true),
        gear(A, a0, 'gear-a', 'rd', 30, false, 54, 'rd', 'R&D'),
        gear(B, b0, 'gear-b', 'quality', 24, true, 46, 'star', 'Quality'),
        gear(C, c0, 'gear-c', 'customers', 12, false, 21, 'cust', null)));
      svg.append(s('g', { class: 'drive', transform: tr(L.drive[0], L.drive[1], L.drive[2]) },
        s('path', { d: 'M0 -7l7 7-7 7' }), s('path', { d: 'M9 -7l7 7-7 7' })));

      // what comes out: price tag, service, two product lines, customers
      const out = s('g', { transform: tr(L.out[0], L.out[1]) });
      out.append(s('g', { class: 'hot', 'data-key': 'price', transform: tr(40, 14, -4) },
        s('path', { class: 'tagshape hl', d: 'M22 0H172a8 8 0 0 1 8 8V70a8 8 0 0 1-8 8H22L0 39Z' }),
        s('circle', { class: 'taghole', cx: 20, cy: 39, r: 4.5 }),
        sicon('star', 54, 39, 28, 'tagicon'),
        s('text', { class: 'tagtext', x: 78, y: 34 }, 'Premium'), s('text', { class: 'tagtext', x: 78, y: 55 }, 'price')));
      out.append(s('g', { class: 'hot', 'data-key': 'service', transform: tr(246, 52) },
        s('circle', { class: 'bpbadge hl', r: 21 }), sicon('wrench', 0, 0, 22, 'bpicon'),
        s('text', { class: 'bpsmall', y: 37, 'text-anchor': 'middle' }, '+ Service')));
      const clip = 'beltclip-' + mode;
      out.append(s('clipPath', { id: clip }, s('rect', { x: 0, y: 0, width: 252, height: 300 })));
      const lanes = s('g', { class: 'hot', 'data-key': 'lines' }, s('rect', { class: 'hit', x: -6, y: 110, width: 264, height: 124 }));
      [[P.x, 156, 'part'], [P.y, 220, 'part part-y']].forEach(([name, y, cls], li) => {
        lanes.append(s('text', { class: 'lanelabel', x: 0, y: y - 26 }, name), s('rect', { class: 'belt hl', x: 0, y, width: 252, height: 10, rx: 5 }));
        for (let x = 11; x < 250; x += 23) lanes.append(s('circle', { class: 'roller', cx: x, cy: y + 5, r: 2.2 }));
        const run = s('g', { 'clip-path': 'url(#' + clip + ')' });
        for (let k = 0; k < 4; k++) {
          const shape = li === 0
            ? s('polygon', { class: cls, points: [0, 1, 2, 3, 4, 5].map(i => (9 * Math.cos(i * Math.PI / 3)).toFixed(1) + ',' + (9 * Math.sin(i * Math.PI / 3)).toFixed(1)).join(' ') })
            : s('g', null, s('circle', { class: cls, r: 9 }), s('circle', { class: 'parthole', r: 3.4 }));
          const g = s('g', { transform: tr(36 + k * 62, y - 10) }, shape);
          if (!reduced) g.append(s('animateTransform', { attributeName: 'transform', type: 'translate', from: '-12 ' + (y - 10), to: '264 ' + (y - 10), dur: '9s', begin: '-' + (k * 2.25 + li) + 's', repeatCount: 'indefinite' }));
          run.append(g);
        }
        lanes.append(run, s('path', { class: 'chev', d: 'M260 ' + y + 'l5 5-5 5' }));
      });
      out.append(lanes);
      const buyers = s('g', { class: 'hot', 'data-key': 'buyers' }, s('rect', { class: 'hit', x: 276, y: 0, width: 56, height: 296 }),
        s('text', { class: 'bpcaps', x: 304, y: 12, 'text-anchor': 'middle' }, 'B2B'), s('line', { class: 'rail', x1: 304, x2: 304, y1: 44, y2: 268 }));
      ['car', 'plane', 'cpu', 'digger', 'factory'].forEach((ic, i) => buyers.append(s('circle', { class: 'bpbadge hl', cx: 304, cy: 44 + i * 56, r: 20 }), sicon(ic, 304, 44 + i * 56, 22, 'bpicon')));
      out.append(buyers);
      svg.append(out);

      // title block, as on an engineering drawing
      svg.append(s('g', { class: 'hot', 'data-key': 'ip', transform: tr(L.tb[0], L.tb[1]) },
        s('rect', { class: 'tb hl', width: 220, height: 46 }), s('line', { class: 'rail', x1: 46, x2: 46, y1: 0, y2: 46 }),
        sicon('ip', 23, 23, 22, 'bpicon'),
        s('text', { class: 'bpcaps', x: 58, y: 19 }, 'O.E. SEEDEE LTD.'), s('text', { class: 'bpcaps strong', x: 58, y: 35 }, 'IP OWNER · COMPANY A')));
      box.replaceChildren(svg);
      showDetail(null);
      wire(box, D.BUSINESS);
    }
    draw();
    const ro = new ResizeObserver(draw); ro.observe(box);
    return () => ro.disconnect();
  }

  /* ---------- step: the flow ---------- */
  function flow(stage, side) {
    const box = h('div', { class: 'panel' });
    stage.append(box, h('div', { class: 'legend' },
      h('span', null, h('i', { class: 'lg-line' }), 'More volume'), h('span', null, h('i', { class: 'lg-line thin' }), 'Less volume'),
      h('span', null, h('i', { class: 'lg-line dash' }), 'Inside the group')));
    side.append(detailCard('Tap a box, an arrow or a price tag.'));
    const NODES = [
      { key: 'makers', kind: 'third', ic: 'factory', label: 'Makers', sub: 'Country C' },
      { key: 'a', kind: 'a', ic: 'building', label: 'Company A', sub: 'Country A' },
      { key: 'b', kind: 'b', ic: 'building', label: 'Company B', sub: 'Country B' },
      { key: 'custB', kind: 'third', ic: 'cust', label: 'Customers', sub: 'B’s market' },
      { key: 'dist', kind: 'third', ic: 'truck', label: 'Distributor', sub: 'Country D' },
      { key: 'custD', kind: 'third', ic: 'cust', label: 'Customers', sub: 'Country D' }
    ];
    const EDGES = [
      { key: 'e_buy', from: 'makers', to: 'a', w: 8 }, { key: 'e_tp', from: 'a', to: 'b', w: 6, group: true, tag: 'tag' },
      { key: 'e_sellB', from: 'b', to: 'custB', w: 6 }, { key: 'e_dist', from: 'a', to: 'dist', w: 2.5, tag: 'up' },
      { key: 'e_sellD', from: 'dist', to: 'custD', w: 2.5 }
    ];
    const WIDE = { W: 680, H: 330, hw: 50, hh: 37, pos: { makers: [58, 165], a: [212, 165], b: [440, 82], custB: [622, 82], dist: [440, 248], custD: [622, 248] } };
    const TALL = { W: 340, H: 530, hw: 56, hh: 37, pos: { makers: [170, 45], a: [170, 165], b: [80, 335], dist: [260, 335], custB: [80, 482], custD: [260, 482] } };
    let mode = null;
    function draw() {
      const next = box.clientWidth >= 540 ? 'wide' : 'tall';
      if (next === mode) return;
      mode = next;
      const L = mode === 'wide' ? WIDE : TALL;
      const svg = s('svg', { class: 'flowsvg ' + mode, viewBox: '0 0 ' + L.W + ' ' + L.H, role: 'group', 'aria-label': 'How goods flow' });
      EDGES.forEach((e, n) => {
        const [px, py] = L.pos[e.from], [qx, qy] = L.pos[e.to], dx = qx - px, dy = qy - py, len = Math.hypot(dx, dy);
        const ux = dx / len, uy = dy / len;
        const out = Math.min(L.hw / Math.abs(ux || 1e-9), L.hh / Math.abs(uy || 1e-9)) + 7; // centre to just outside the box
        const head = 9 + e.w, x1 = px + ux * out, y1 = py + uy * out, tx = qx - ux * out, ty = qy - uy * out;
        const x2 = tx - ux * head, y2 = ty - uy * head, nx = -uy * (head * 0.55), ny = ux * (head * 0.55);
        const g = s('g', { class: 'edge' + (e.group ? ' group' : ''), 'data-key': e.key },
          s('line', { class: 'hit', x1, y1, x2: tx, y2: ty }),
          s('line', { class: 'vis', x1, y1, x2, y2, 'stroke-width': e.w }),
          s('polygon', { points: [tx, ty, x2 + nx, y2 + ny, x2 - nx, y2 - ny].join(' ') }));
        if (!reduced) for (let k = 0; k < (len - 2 * out > 90 ? 2 : 1); k++) {
          g.append(s('circle', { class: 'flowdot', r: 3.5 },
            s('animateMotion', { dur: '3.2s', repeatCount: 'indefinite', begin: '-' + (k * 1.6 + n * 0.4) + 's', path: 'M' + x1 + ' ' + y1 + 'L' + x2 + ' ' + y2 })));
        }
        svg.append(g);
        if (e.tag) {
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          svg.append(s('g', { class: 'ptag' + (e.group ? ' key' : ''), 'data-key': e.key, transform: 'translate(' + mx + ' ' + my + ')' },
            s('circle', { r: 16 }), sicon(e.tag, 0, 0, 18)));
        }
      });
      NODES.forEach(nd => {
        const [x, y] = L.pos[nd.key];
        svg.append(s('g', { class: 'node ' + nd.kind, 'data-key': nd.key, transform: 'translate(' + x + ' ' + y + ')' },
          s('rect', { x: -L.hw, y: -L.hh, width: L.hw * 2, height: L.hh * 2, rx: 12 }),
          sicon(nd.ic, 0, -19, 22, 'nicon'),
          s('text', { y: 11 }, nd.label), s('text', { class: 'sub', y: 27 }, nd.sub)));
      });
      box.replaceChildren(svg);
      showDetail(null);
      wire(box, D.FLOW);
    }
    draw();
    const ro = new ResizeObserver(draw); ro.observe(box);
    return () => ro.disconnect();
  }

  /* ---------- step: the price puzzle ---------- */
  function price(stage, side) {
    const P = D.PRICE, pct = v => (v / P.dSell * 100);
    const place = (el, from, to) => { el.style.left = 'calc(' + pct(from) + '% + 1px)'; el.style.width = 'calc(' + pct(to - from) + '% - 2px)'; };
    const seg = (cls, key, label) => h('button', { class: 'seg ' + cls, type: 'button', 'data-key': key, 'aria-label': label, title: label });
    const dBuy = seg('buy', 'dbuy', 'Distributor’s purchase price'), dMargin = seg('margin', 'dmargin', 'Distributor’s margin');
    place(dBuy, 0, P.dPrice); place(dMargin, P.dPrice, P.dSell);
    const bBuy = seg('buy', 'bbuy', 'Company B’s purchase price'), bOpex = seg('opex', 'bopex', 'Company B’s own costs');
    const bRes = seg('profit', 'bres', 'Company B’s result');
    const grip = h('input', { class: 'grip', id: 'tp', type: 'range', min: P.today, max: P.dPrice, step: 1, value: P.today, 'aria-label': 'Price Company B pays Company A' });
    grip.style.left = 'calc(' + pct(P.today) + '% - 11px)'; grip.style.width = 'calc(' + pct(P.dPrice - P.today) + '% + 22px)';
    const mark = (v, text) => { const m = h('i', { class: 'sellmark' }, h('span', null, text)); m.style.left = pct(v) + '%'; return m; };
    const vIcon = h('span', { class: 'vicon' }), vText = h('span');
    const verdict = h('div', { class: 'verdict', 'aria-live': 'polite' }, vIcon, vText);
    const bToday = h('button', { class: 'ghost', type: 'button', id: 'set-today', on: { click: () => set(P.today) } }, 'Today’s price');
    const bD = h('button', { class: 'ghost', type: 'button', id: 'set-d', on: { click: () => set(P.dPrice) } }, 'Country D price');
    stage.append(h('div', { class: 'panel pz' },
      h('div', { class: 'pzrow' }, h('div', { class: 'pzlab' }, h('b', { class: 'cbadge' }, 'D'), 'Distributor'),
        h('div', { class: 'ptrack', style: 'margin-top:14px' }, dBuy, dMargin, mark(P.dSell, 'Sells at'))),
      h('div', { class: 'pzrow' }, h('div', { class: 'pzlab' }, h('b', { class: 'cbadge b' }, 'B'), 'Company B'),
        h('div', { class: 'ptrack', style: 'margin-top:14px' }, bBuy, bOpex, bRes, mark(P.bSell, 'Sells at'), grip)),
      h('div', { class: 'pzctl' }, bToday, bD),
      verdict),
      h('div', { class: 'legend' },
        h('span', null, h('i', { class: 'sw', style: 'background:var(--ink)' }), 'Purchase price'),
        h('span', null, h('i', { class: 'sw', style: 'background:var(--p-unc)' }), 'Own costs'),
        h('span', null, h('i', { class: 'sw', style: 'background:var(--p-yes)' }), 'Profit'),
        h('span', null, h('i', { class: 'sw hatch' }), 'Loss')),
      h('p', { class: 'note' }, 'Illustrative scale. The case gives the direction, not the figures.'));
    side.append(detailCard('Drag the handle on Company B’s bar.'));
    const DET = {
      dbuy: { title: 'What the distributor pays', tag: 'Third-party price · Country D', lines: ['Company A sells directly to an unrelated distributor.', 'This price is higher than Company B could bear.'] },
      dmargin: { title: 'The distributor’s margin', tag: 'Third party', lines: ['Prices in Country D are higher, so the distributor can pay more and still earn a margin.', 'Volumes there are much lower.'] },
      bbuy: { title: 'What Company B pays', tag: 'The transfer price', lines: ['Today it is set to leave B an arm’s-length return.', 'Drag it up to the Country D price to see what happens.'] },
      bopex: { title: 'Company B’s own costs', tag: 'Sales, service, overhead', lines: ['Service is not charged separately, so its cost has to come out of the product margin.'] },
      bres: { title: 'Company B’s result', tag: 'What is left', lines: ['At the Country D price, Company B would make a loss in all scenarios.'] }
    };
    wire(stage, DET);
    function set(v) { grip.value = v; update(); }
    function update() {
      const tp = Number(grip.value), cost = tp + P.bOpex, res = P.bSell - cost;
      place(bBuy, 0, tp); place(bOpex, tp, cost);
      bRes.hidden = res === 0;
      bRes.className = 'seg ' + (res > 0 ? 'profit' : 'loss') + (bRes.classList.contains('sel') ? ' sel' : '');
      if (res > 0) place(bRes, cost, P.bSell); else if (res < 0) place(bRes, P.bSell, cost);
      verdict.className = 'verdict ' + (res > 0 ? 'profit' : res < 0 ? 'loss' : 'even');
      vIcon.replaceChildren(icon(res > 0 ? 'yes' : res < 0 ? 'no' : 'flat'));
      vText.replaceChildren(res > 0 ? 'Company B makes a profit.' : res < 0 ? 'Company B makes a loss.' : 'Company B breaks even.');
      if (tp === P.dPrice) vText.append(h('small', null, 'In the case, this holds in every scenario.'));
      bToday.setAttribute('aria-pressed', String(tp === P.today)); bD.setAttribute('aria-pressed', String(tp === P.dPrice));
    }
    grip.addEventListener('input', update);
    update();
  }

  /* ---------- step: the risk ---------- */
  function risk(stage, side) {
    const R = D.RISK, n = R.years.length, H = 250, m = { l: 30, r: 34, t: 16, b: 28 };
    let idx = 3, w = 0, parts = null;
    const holder = h('div'), out = h('output', { for: 'year' });
    const range = h('input', { type: 'range', id: 'year', min: 0, max: n - 1, step: 1, value: idx, 'aria-label': 'Year' });
    stage.append(h('div', { class: 'panel' }, holder, h('div', { class: 'yearrow' }, out, range)),
      h('div', { class: 'tiles' }, tile('paper', 'doc', 'On paper'), tile('fact', 'yes', 'In fact'), tile('policy', 'tag', 'Pricing policy')),
      h('div', { class: 'legend' },
        h('span', null, h('i', { class: 'sw', style: 'background:var(--a)' }), 'Company A'),
        h('span', null, h('i', { class: 'sw', style: 'background:var(--b)' }), 'Company B'),
        h('span', null, 'Operating margin by year. Illustrative: the case gives the pattern, not the figures.')));
    side.append(detailCard());
    wire(stage, {
      paper: { title: 'The intercompany agreement', tag: 'On paper', lines: ['Identifies Company A as the primary IP owner and risk bearer.'] },
      fact: { title: 'What actually happened', tag: 'In fact', lines: ['Company A has borne all material business risks.', 'Its margin moved with the group’s. Company B’s stayed very constant.'] },
      policy: { title: 'How the price is set', tag: 'Pricing policy', lines: ['The transfer price leaves Company B an arm’s-length return.', 'All residual profit or loss flows to Company A.'] }
    });
    const x = i => m.l + i * (w - m.l - m.r) / (n - 1), y = v => m.t + (20 - v) * (H - m.t - m.b) / 34;
    function draw() {
      const nw = Math.max(260, holder.clientWidth);
      if (nw === w) return;
      w = nw;
      const pts = arr => arr.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
      const half = (x(1) - x(0)) / 2;
      parts = { line: s('line', { class: 'cursor', y1: m.t, y2: H - m.b }), da: s('circle', { class: 'da', r: 6 }), db: s('circle', { class: 'db', r: 6 }) };
      const svg = s('svg', { class: 'chart', viewBox: '0 0 ' + w + ' ' + H, role: 'img', 'aria-label': 'Company A’s margin rises and falls with the business cycle and turns negative in 2009. Company B’s margin stays flat.' },
        s('rect', { class: 'band', x: x(5) - half, y: m.t, width: half * 2, height: H - m.t - m.b }),
        s('line', { class: 'zero', x1: m.l, x2: w - m.r, y1: y(0), y2: y(0) }),
        s('text', { x: m.l - 8, y: y(0) + 4, 'text-anchor': 'end' }, '0'),
        s('text', { x: x(0), y: H - 8, 'text-anchor': 'start' }, String(R.years[0])),
        s('text', { class: 'strong', x: x(5), y: H - 8, 'text-anchor': 'middle' }, '2009'),
        s('text', { x: x(n - 1), y: H - 8, 'text-anchor': 'end' }, String(R.years[n - 1])),
        s('polyline', { class: 'la', points: pts(R.a) }), s('polyline', { class: 'lb', points: pts(R.b) }),
        s('text', { class: 'strong', x: x(n - 1) + 10, y: y(R.a[n - 1]) + 4 }, 'A'),
        s('text', { class: 'strong', x: x(n - 1) + 10, y: y(R.b[n - 1]) + 4 }, 'B'),
        parts.line, parts.da, parts.db);
      const pick = e => {
        const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * w;
        setIdx(Math.max(0, Math.min(n - 1, Math.round((px - m.l) / ((w - m.l - m.r) / (n - 1))))));
      };
      svg.addEventListener('pointerdown', e => { svg.setPointerCapture(e.pointerId); pick(e); });
      svg.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'mouse') pick(e); });
      holder.replaceChildren(svg);
      setIdx(idx, true);
    }
    function setIdx(i, force) {
      if (i === idx && !force) return;
      idx = i; range.value = i; out.textContent = R.years[i];
      parts.line.setAttribute('x1', x(i)); parts.line.setAttribute('x2', x(i));
      parts.da.setAttribute('cx', x(i)); parts.da.setAttribute('cy', y(R.a[i]));
      parts.db.setAttribute('cx', x(i)); parts.db.setAttribute('cy', y(R.b[i]));
      const a = R.a[i], aText = a < 0 ? 'Company A: loss' : a >= 12 ? 'Company A: high profit' : 'Company A: lower profit';
      document.querySelectorAll('#stage .tile.sel').forEach(el => el.classList.remove('sel'));
      showDetail({
        title: String(R.years[i]),
        lines: a < 0 ? ['Industry downturn. The group made a loss, and it landed in Company A.'] : [],
        extra: h('div', { class: 'readout' },
          h('div', null, h('span', { class: 'ric a' }, icon(a < 0 ? 'down' : 'up')), aText),
          h('div', null, h('span', { class: 'ric b' }, icon('flat')), 'Company B: same steady return'))
      });
    }
    range.addEventListener('input', () => setIdx(Number(range.value)));
    draw();
    const ro = new ResizeObserver(draw); ro.observe(holder);
    return () => ro.disconnect();
  }

  /* ---------- step: the people ---------- */
  function people(stage, side) {
    const chip = r => h('button', { class: 'chip neutral ' + r.lvl, type: 'button', 'data-key': r.id, id: 'org-' + r.id }, r.label);
    const byId = id => ROLES.find(r => r.id === id);
    const cols = h('div', { class: 'orgcols' });
    for (let lane = 1; lane < LANES.length; lane++) {
      const chief = ROLES.find(r => r.lane === lane && r.lvl === 'exec');
      const dirs = h('div', { class: 'orgdirs' });
      ROLES.filter(r => r.lane === lane && r.lvl === 'dir').forEach(r => dirs.append(chip(r)));
      cols.append(h('div', { class: 'orgcol', title: LANES[lane].name }, icon(LANES[lane].key), chip(chief), dirs));
    }
    stage.append(h('div', { class: 'panel org' },
      h('div', { class: 'orgtop' }, h('span'), chip(byId('ceo')), h('span', { class: 'orgside' }, h('i', { class: 'rule' }), chip(byId('clo')))),
      h('i', { class: 'orgstem' }), cols),
      h('div', { class: 'legend' },
        h('span', null, h('b', { class: 'chip exec neutral' }, 'CEO'), 'C-level'),
        h('span', null, h('b', { class: 'chip dir neutral' }, 'Sales'), 'Director')));
    side.append(detailCard('Tap a role.'));
    const map = {};
    ROLES.forEach(r => {
      const reports = r.lvl === 'exec' && r.lane > 0 && !/report in/.test(r.does) ? ROLES.filter(x => x.lane === r.lane && x.lvl === 'dir').map(x => x.label) : [];
      map[r.id] = { title: r.name, tag: LANES[r.lane].name, lines: [r.does].concat(reports.length ? ['Directors: ' + reports.join(', ') + '.'] : []) };
    });
    wire(stage, map);
  }

  /* ---------- step: ground rules ---------- */
  function rules(stage) {
    const rule = (ic, title, text, cls) => h('div', { class: 'panel rule' + (cls ? ' ' + cls : '') }, icon(ic), h('h3', null, title), h('p', null, text));
    stage.append(
      h('div', { class: 'panel ask' }, h('span', { class: 'big' }, icon('target')), h('h2', null, QUESTION),
        h('div', { class: 'ans', 'aria-label': 'Yes, No or Unclear' }, ...ANSWERS.map(([k, label]) => h('span', { title: label }, icon(k))))),
      h('div', { class: 'rules' },
        rule('target', 'Method only', 'Judge whether the method works. Not what Company B’s profit should be.'),
        rule('user', 'Your own reading', 'Use your understanding of the OECD DEMPE and risk guidance. Not how a tax authority might see it.'),
        rule('unc', 'Unclear means unsure', 'Reasonably certain? Pick Yes or No. Pick Unclear only if key facts are missing, and say why.')),
      h('div', { class: 'rules' },
        rule('lock', 'Same in every case', 'The legal structure. The contract. Company A owns the IP.', 'fixed'),
        rule('swap', 'Different in each case', 'Where people work, who manages them, and how much substance each company has.', 'fixed')));
  }

  /* ---------- steps: cases A-D ---------- */
  const dotLoc = (t, i, c) => (i >= t.n - t.inB[c] ? 'B' : 'A');
  function cases(stage, side) {
    const ui = caseUI = { cells: { A: [], B: [] }, roleEl: {}, dots: {}, teamBtn: {}, anchorEl: {}, sel: null, token: 0 };
    const board = h('section', { class: 'stage', 'aria-label': 'Where people work' });
    for (const loc of ['A', 'B']) {
      board.append(h('div', { class: 'island', 'data-loc': loc }));
      const head = h('div', { class: 'ihead', 'data-loc': loc }, h('span', { class: 'big' }, loc),
        h('span', { class: 'nm' }, 'Company ' + loc, h('small', null, 'Country ' + loc)));
      if (loc === 'A') {
        const wrap = h('div', { class: 'anchors' });
        ANCHORS.forEach(a => {
          ui.anchorEl[a.id] = h('button', { class: 'anchor', type: 'button', id: 'anchor-' + a.id, on: { click: () => caseSelect(a.id) } }, icon(a.icon), a.label);
          wrap.append(ui.anchorEl[a.id]);
        });
        head.append(wrap);
      }
      board.append(head);
      LANES.forEach((lane, i) => {
        const roles = h('span', { class: 'roles' }), teams = h('span', { class: 'teams' });
        const ic = icon(lane.key); ic.removeAttribute('aria-hidden'); ic.setAttribute('role', 'img'); ic.setAttribute('aria-label', lane.name);
        const cell = h('div', { class: 'cell' + (i === LANES.length - 1 ? ' last' : ''), 'data-loc': loc, style: '--lane:' + i, title: lane.name }, ic, h('div', { class: 'slot' }, roles, teams));
        ui.cells[loc].push({ cell, roles, teams });
        board.append(cell);
      });
    }
    ROLES.forEach(r => { ui.roleEl[r.id] = h('button', { class: 'chip ' + r.lvl, type: 'button', id: 'chip-' + r.id, on: { click: () => caseSelect(r.id) } }, r.label); });
    TEAMS.forEach(t => {
      ui.dots[t.id] = Array.from({ length: t.n }, () => h('i', { class: 'dot' }));
      ui.teamBtn[t.id] = {};
      for (const loc of ['A', 'B']) {
        const dots = h('span', { class: 'dots' });
        const btn = h('button', { class: 'team', type: 'button', id: 'team-' + t.id + '-' + loc, 'aria-label': t.name + ', Company ' + loc, on: { click: () => caseSelect(t.id) } }, dots, t.label);
        ui.teamBtn[t.id][loc] = { btn, dots };
        ui.cells[loc][t.lane].teams.append(btn);
      }
    });
    ui.movers = ROLES.map(r => ui.roleEl[r.id]).concat(TEAMS.flatMap(t => ui.dots[t.id]));
    ui.poll = h('section', { class: 'card poll' });
    stage.append(board, h('div', { class: 'legend' },
      h('span', null, h('b', { class: 'chip exec', style: 'background:var(--a);color:var(--on-a)' }, 'CEO'), 'C-level'),
      h('span', null, h('b', { class: 'chip dir', style: 'background:var(--a-soft);color:var(--a-ink)' }, 'Sales'), 'Director'),
      h('span', null, h('i', { class: 'dot', style: 'background:var(--a)' }), h('i', { class: 'dot', style: 'background:var(--a)' }), h('i', { class: 'dot', style: 'background:var(--a)' }), 'Team (not to scale)'),
      h('span', null, h('i', { class: 'ring' }), 'Moved in this case')));
    side.append(detailCard('Tap a chip, a team or a badge.'), ui.poll);
    casesUpdate(false);
  }
  function casesUpdate(animate) {
    const ui = caseUI, c = STEPS[state.step].caseIdx, first = new Map();
    ui.sel = null;
    if (animate && !reduced) ui.movers.forEach(el => {
      const cs = getComputedStyle(el);
      first.set(el, { r: el.getBoundingClientRect(), bg: cs.backgroundColor, fg: cs.color });
    });
    casePlace(c);
    pollUI = { el: ui.poll, key: CASES[c].k, token: 0, question: QUESTION };
    caseDetail(); renderPoll();
    if (!first.size) return;
    let n = 0;
    ui.movers.forEach(el => {
      const f = first.get(el), l = el.getBoundingClientRect(), dx = f.r.left - l.left, dy = f.r.top - l.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      const far = el.classList.contains('moved');
      el.classList.add('flying');
      el.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)', backgroundColor: f.bg, color: f.fg }, { transform: 'none' }],
        { duration: far ? 750 : 450, delay: far ? (n++) * 14 : 0, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'backwards' })
        .onfinish = () => el.classList.remove('flying');
    });
  }
  function casePlace(c) {
    const ui = caseUI;
    ROLES.forEach(r => {
      const el = ui.roleEl[r.id];
      ui.cells[r.loc[c]][r.lane].roles.append(el);
      el.classList.toggle('moved', c > 0 && r.loc[c] !== r.loc[c - 1]);
      el.classList.toggle('sel', ui.sel === r.id);
    });
    TEAMS.forEach(t => {
      ui.dots[t.id].forEach((d, i) => {
        const loc = dotLoc(t, i, c);
        ui.teamBtn[t.id][loc].dots.append(d);
        d.classList.toggle('moved', c > 0 && loc !== dotLoc(t, i, c - 1));
      });
      for (const loc of ['A', 'B']) {
        const b = ui.teamBtn[t.id][loc];
        b.btn.hidden = !b.dots.children.length;
        b.btn.classList.toggle('sel', ui.sel === t.id);
      }
    });
    ANCHORS.forEach(a => {
      const el = ui.anchorEl[a.id];
      el.hidden = c < a.from;
      el.classList.toggle('moved', a.from > 0 && c === a.from);
      el.classList.toggle('sel', ui.sel === a.id);
    });
    for (const loc of ['A', 'B']) ui.cells[loc].forEach(x => {
      x.cell.classList.toggle('is-empty', !x.roles.children.length && !Array.from(x.teams.children).some(b => !b.hidden));
    });
  }
  function caseSelect(id) {
    caseUI.sel = caseUI.sel === id ? null : id;
    casePlace(STEPS[state.step].caseIdx);
    caseDetail();
  }
  function track4(pcts, c) {
    return h('div', { class: 'track4' }, ...CASES.map((cs, i) => h('div', { class: i === c ? 'now' : null }, h('i', { style: '--pb:' + pcts[i] + '%' }), cs.k)));
  }
  function caseDetail() {
    const c = STEPS[state.step].caseIdx, id = caseUI.sel;
    const r = ROLES.find(x => x.id === id), t = TEAMS.find(x => x.id === id), a = ANCHORS.find(x => x.id === id);
    if (r) {
      showDetail({ title: r.name, loc: r.loc[c], tag: 'Company ' + r.loc[c] + ' · Country ' + r.loc[c],
        lines: [r.does].concat(r.note && r.note[c] ? [r.note[c]] : []), extra: track4(Array.from(r.loc).map(l => (l === 'B' ? 100 : 0)), c) });
    } else if (t) {
      const share = t.inB[c] / t.n;
      showDetail({ title: t.name, loc: share >= 0.5 ? 'B' : 'A', tag: share === 0 ? 'Company A' : share === 1 ? 'Company B' : 'Split between A and B',
        lines: [t.notes[c]], extra: track4(t.inB.map(n => n / t.n * 100), c) });
    } else if (a && c >= a.from) {
      showDetail({ title: a.name, loc: 'A', tag: 'Company A · Country A', lines: [a.does] });
    } else showDetail(null);
  }

  /* ---------- poll ---------- */
  function crowdBar(t, mine) {
    const n = t.yes + t.no + t.unc;
    const bar = h('div', { class: 'bar' + (n ? '' : ' empty'), role: 'img', 'aria-label': 'Yes ' + t.yes + ', No ' + t.no + ', Unclear ' + t.unc });
    ANSWERS.forEach(([k]) => { if (t[k]) { const seg = h('i', { class: k }); seg.style.flexGrow = t[k]; bar.append(seg); } });
    let you = null;
    if (mine && t[mine]) {
      let before = 0;
      for (const [k] of ANSWERS) { if (k === mine) break; before += t[k]; }
      you = (before + t[mine] / 2) / n * 100;
    }
    return { bar, n, you };
  }
  function countsRow(t) {
    return h('div', { class: 'counts' }, ...ANSWERS.map(([k]) => h('span', null, icon(k), String(t[k]))));
  }
  // Draws the poll described by pollUI: { el, key, question, locked, compare }.
  function renderPoll(status) {
    const pu = pollUI;
    if (!pu) return;
    const key = pu.key, votes = store.myVotes(), mine = votes[key], token = ++pu.token;
    pu.el.replaceChildren(h('h2', null, pu.question));
    if (pu.locked) { pu.el.append(h('p', { class: 'status' }, pu.locked)); return; }
    pu.el.append(h('div', { class: 'opts' }, ...ANSWERS.map(([k, label]) =>
      h('button', { class: 'opt', type: 'button', id: 'vote-' + k, 'aria-pressed': String(!!mine && mine.a === k), on: { click: () => vote(k) } }, icon(k), label))));
    if (!mine) return;
    const results = h('div', null, h('div', { class: 'bar empty' }));
    const why = h('textarea', { class: 'why', id: 'why-' + key, rows: 2, maxlength: 2000, placeholder: 'Why? (optional)', 'aria-label': 'Your comment' });
    why.value = mine.c || '';
    const stat = h('p', { class: 'status' + (status && status.bad ? ' bad' : ''), role: 'status' }, status ? status.text : '');
    const save = h('button', { class: 'ghost', type: 'button', id: 'save-note', on: { click: () => vote(mine.a, why.value) } }, 'Save note');
    const row = h('div', { class: 'pollrow' }, save), n = neighbour(state.step, 1);
    if (n !== state.step) row.append(h('button', { class: 'primary', type: 'button', id: 'poll-next', on: { click: () => go(neighbour(state.step, 1)) } }, STEPS[n].k, icon('right')));
    pu.el.append(results, why, row, stat);
    store.totals().then(all => {
      if (pollUI !== pu || pu.token !== token) return;
      if (!pu.compare) { results.replaceChildren(crowdBar(all[key], mine.a).bar, countsRow(all[key])); return; }
      const before = votes.D ? votes.D.a : null;
      results.replaceChildren(
        h('div', { class: 'cmp' }, h('span', null, 'Case D'), crowdBar(all.D, before).bar),
        h('div', { class: 'cmp' }, h('span', null, 'With its history'), crowdBar(all.D2, mine.a).bar), countsRow(all.D2),
        ...(before ? [h('p', { class: 'shift' }, 'You: ', h('span', { class: 'pi ' + before }, icon(before)), icon('right'), h('span', { class: 'pi ' + mine.a }, icon(mine.a)))] : []));
    }).catch(() => {
      if (pollUI !== pu || pu.token !== token) return;
      results.replaceChildren(h('p', { class: 'status' }, 'Totals are not available right now.'));
    });
  }
  async function vote(answer, comment) {
    const pu = pollUI, key = pu.key, prev = store.myVotes()[key];
    const note = comment !== undefined ? comment : (document.getElementById('why-' + key) || {}).value || (prev ? prev.c : '');
    let status;
    try {
      await store.cast(key, answer, note);
      status = { text: store.live ? 'Saved.' : 'Saved in this browser only (preview mode).' };
    } catch (e) {
      status = { bad: true, text: 'Kept in this browser, but not sent. Check your connection and tap your answer again.' };
    }
    if (pollUI !== pu) return;
    renderPoll(status); renderRidge(); renderPager();
  }

  /* ---------- step: almost there ---------- */
  // A close-up of the summit. After a pause the mist clears and the hidden path appears, step by step.
  function almost(stage) {
    const X0 = 1262, Y0 = 196, W = 316, HT = 180, here = STOPS[ALMOST];
    const poly = pts => pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const ridge = RIDGE.filter(p => p[0] >= 1230);
    const upTo = RIDGE.filter(p => p[0] >= 1230 && p[0] < here[0]).concat([here]);
    const route = [here, [1410, 300], [1432, 320], [1462, 322], HIDDEN, [1473, 288.5], [1460, 282.5], [1446, 270.5], [1428, 264]];
    // footprints: a dot every few units along the hidden route
    const dots = [];
    let keyAt = 0;
    for (let i = 1, carry = 0; i < route.length; i++) {
      const [ax, ay] = route[i - 1], [bx, by] = route[i], len = Math.hypot(bx - ax, by - ay);
      for (let d = 6 - carry; d <= len; d += 6) dots.push([ax + (bx - ax) * d / len, ay + (by - ay) * d / len]);
      carry = (carry + len) % 6;
      if (route[i] === HIDDEN) keyAt = dots.length;
    }
    const cloud = (x, y, sc, cls) => s('g', { class: 'al-cloud ' + cls },
      s('path', { transform: 'translate(' + x + ' ' + y + ') scale(' + sc + ')', d: 'M0 14a9 9 0 0 1 9-9 13 13 0 0 1 24-3 10 10 0 0 1 15 6 8 8 0 0 1 2 16H6a8 8 0 0 1-6-10z' }));
    const svg = s('svg', { class: 'almostsvg', viewBox: [X0, Y0, W, HT].join(' '), role: 'img', 'aria-label': 'Close to the summit. A second, hidden path leads around the back of the mountain to the top.' },
      cloud(1276, 214, 0.8, 'still'), cloud(1318, 236, 0.5, 'still'),
      s('polygon', { class: 'al-land', points: poly([[1230, Y0 + HT + 10]].concat(ridge, [[1620, Y0 + HT + 10]])) }),
      s('polyline', { class: 'al-ridge', points: poly(ridge) }),
      s('polyline', { class: 'al-ridge', points: '1428,264 1428,226' }),
      s('polyline', { class: 'al-direct', points: poly([here].concat(RIDGE.filter(p => p[0] > here[0] && p[0] <= 1428))) }),
      s('polyline', { class: 'al-climbed', points: poly(upTo) }));
    dots.forEach((p, i) => svg.append(s('circle', { class: 'al-step', cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: 1.9, style: '--d:' + (0.9 + i * 0.05).toFixed(2) + 's' })));
    const dStop = STOPS[FIRST_CASE + 3];
    svg.append(
      s('g', { transform: 'translate(' + dStop[0] + ' ' + dStop[1] + ')' }, s('circle', { class: 'al-stop', r: 8 }), s('text', { class: 'al-t', y: 3 }, 'D')),
      s('g', { transform: 'translate(1428 218)' }, s('circle', { class: 'al-stop', r: 9 }), sicon('flag', 0, 0, 11, 'al-ic')),
      s('g', { transform: 'translate(' + HIDDEN[0] + ' ' + HIDDEN[1] + ')' },
        s('g', { class: 'al-key', style: '--d:' + (0.9 + keyAt * 0.05).toFixed(2) + 's' }, s('circle', { class: 'al-stop dashed', r: 9 }), sicon('key', 0, 0, 11, 'al-ic'))),
      s('circle', { class: 'al-pulse', cx: here[0], cy: here[1], r: 5 }, reduced ? null : s('animate', { attributeName: 'r', from: 5, to: 15, dur: '1.6s', repeatCount: 'indefinite' }),
        reduced ? null : s('animate', { attributeName: 'opacity', from: 0.7, to: 0, dur: '1.6s', repeatCount: 'indefinite' })),
      s('circle', { class: 'al-here', cx: here[0], cy: here[1], r: 5 }),
      cloud(1452, 262, 1.25, 'veil v1'), cloud(1498, 290, 1.0, 'veil v2'), cloud(1432, 300, 0.9, 'veil v3'), cloud(1520, 250, 0.75, 'veil v2'));
    const cta = h('div', { class: 'panel almostcta' },
      h('p', null, 'Case D has a history. Walk it before you reach the top.'),
      h('div', { class: 'almostbtns' },
        h('button', { class: 'ghost', type: 'button', id: 'skip-path', on: { click: () => go(LAST) } }, 'Straight to the summit'),
        h('button', { class: 'primary', type: 'button', id: 'take-path', on: { click: () => go(SECRET) } }, icon('key'), 'Take the hidden path', icon('right'))));
    stage.append(h('div', { class: 'panel almost' }, svg), cta);
    const timers = [];
    function finish() { revealed = true; cta.classList.add('on'); renderRidge(); renderPager(); }
    if (revealed) {
      svg.classList.add('done'); $('cap').textContent = 'But look. There is another way.'; finish();
    } else {
      timers.push(setTimeout(() => svg.classList.add('go'), 1300),
        setTimeout(() => { $('cap').textContent = 'But look. There is another way.'; }, 2300),
        setTimeout(finish, 1300 + (0.9 + dots.length * 0.05 + 0.5) * 1000));
    }
    return () => timers.forEach(clearTimeout);
  }

  /* ---------- step: the hidden path ---------- */
  // Case D's history as a trail of waypoints. Walking to the end unlocks a second vote on Case D.
  let walked = -1;
  function hiddenPath(stage, side) {
    const H = D.HISTORY, last = H.beats.length - 1;
    if (store.myVotes().D2) walked = last;
    let at = walked, mode = null;
    const box = h('div', { class: 'panel' }), story = h('div', { class: 'panel story', 'aria-live': 'polite' });
    const pu = pollUI = { el: h('section', { class: 'card poll' }), key: 'D2', token: 0, compare: true,
      question: 'Knowing this history: can the transfer price be set or tested with CPM / TNMM, with Company B as the tested party?',
      locked: walked < last ? 'Walk the hidden path to vote again.' : null };
    stage.append(box, story);
    side.append(pu.el);
    const WIDE = { W: 760, H: 330, pts: [[50, 64], [190, 262], [292, 276], [400, 222], [506, 164], [612, 104], [716, 46]] };
    const TALL = { W: 400, H: 430, pts: [[44, 52], [112, 318], [184, 338], [244, 274], [292, 206], [334, 132], [372, 58]] };
    const poly = pts => pts.map(p => p.join(',')).join(' ');
    function drawMap() {
      const L = mode === 'wide' ? WIDE : TALL, p = L.pts, top = p[last];
      const svg = s('svg', { class: 'trailsvg ' + mode, viewBox: '0 0 ' + L.W + ' ' + L.H, role: 'group', 'aria-label': 'The hidden path' },
        s('polygon', { class: 'terrain', points: poly([[0, p[0][1] + 14]].concat(p, [[L.W, top[1] + 46], [L.W, L.H], [0, L.H]])) }),
        s('polyline', { class: 'tpath', points: poly(p) }),
        s('polyline', { class: 'twalked', points: poly(p.slice(0, Math.max(at, 0) + 1)) }));
      H.beats.forEach((b, i) => {
        const [x, y] = p[i];
        if (i > walked && i > 0) { svg.append(s('circle', { class: 'tdot', cx: x, cy: y, r: 5 })); return; }
        const lab = i === 0 ? { x: x + 22, y: y + 5, a: 'start' } : i < 3 ? { x, y: y + 34, a: 'middle' } : { x: x - 20, y: y - 10, a: 'end' };
        const g = s('g', { class: 'tw' + (i === Math.max(at, 0) ? ' now' : ''), id: 'way-' + i, transform: 'translate(' + x + ' ' + y + ')' }, s('circle', { r: 16 }), sicon(b.icon, 0, 0, 20));
        pressable(g, b.label, () => { at = i; render(); });
        svg.append(g, s('text', { class: 'tlabel', x: lab.x, y: lab.y, 'text-anchor': lab.a }, b.label));
      });
      box.replaceChildren(svg);
    }
    function chart(span) {
      const C = H.chart, svg = s('svg', { class: 'yrs', viewBox: '0 0 300 132', role: 'img', 'aria-label': 'Company B keeps the same routine return each year. Company A makes losses in years 1 to 3 and profits from year 4.' },
        s('line', { class: 'zero', x1: 12, x2: 288, y1: 78, y2: 78 }));
      C.a.forEach((v, i) => {
        const x = 26 + i * 54, on = i >= span[0] && i <= span[1], hgt = Math.abs(v) * 1.4;
        svg.append(s('text', { class: on ? 'strong' : null, x: x + 17, y: 12, 'text-anchor': 'middle' }, 'Y' + (i + 1)),
          s('rect', { class: 'cb' + (on ? '' : ' dimmed'), x, y: 78 - C.b * 1.4, width: 16, height: C.b * 1.4, rx: 2 }),
          s('rect', { class: 'ca' + (on ? '' : ' dimmed'), x: x + 18, y: v < 0 ? 78 : 78 - hgt, width: 16, height: hgt, rx: 2 }));
      });
      return h('div', { class: 'yrswrap' }, svg, h('div', { class: 'legend' },
        h('span', null, h('i', { class: 'sw', style: 'background:var(--a)' }), 'Company A'), h('span', null, h('i', { class: 'sw', style: 'background:var(--b)' }), 'Company B'), h('span', null, 'Illustrative.')));
    }
    function render() {
      drawMap();
      const b = at < 0 ? H.intro : H.beats[at];
      const list = h('ul');
      b.lines.forEach(l => {
        const t = typeof l === 'string' ? { t: l } : l;
        list.append(h('li', null, t.who ? h('b', { class: 'cbadge ' + t.who.toLowerCase(), title: 'Company ' + t.who }, t.who) : h('span', { class: 'pt' }, '•'), h('span', null, t.t)));
      });
      const nav = h('div', { class: 'storynav' });
      if (at >= 0) nav.append(h('button', { class: 'ghost', type: 'button', id: 'walk-back', on: { click: () => { at -= 1; render(); } } }, icon('left'), 'Back'));
      if (at < last) nav.append(h('button', { class: 'primary', type: 'button', id: 'walk-on', on: { click: walkOn } }, at < 0 ? 'Start the walk' : 'Walk on', icon('right')));
      else nav.append(h('span', { class: 'votenow' }, icon('key'), 'Now vote on Case D again.'));
      story.replaceChildren(h('div', { class: 'when' }, at < 0 ? 'Hidden path' : b.when + ' · ' + (at + 1) + ' / ' + (last + 1)), h('h2', null, b.title), list, ...(b.chart ? [chart(b.chart)] : []), nav);
    }
    function walkOn() {
      at += 1;
      if (at > walked) walked = at;
      if (walked === last && pu.locked) { pu.locked = null; renderPoll(); }
      render();
    }
    function fit() {
      const next = box.clientWidth >= 560 ? 'wide' : 'tall';
      if (next !== mode) { mode = next; render(); }
    }
    fit(); renderPoll();
    const ro = new ResizeObserver(fit); ro.observe(box);
    return () => ro.disconnect();
  }

  /* ---------- step: summit ---------- */
  function summit(stage, side) {
    let alive = true;
    const votes = store.myVotes(), open = unlocked();
    // The polls on show: the four cases, plus the second vote on D for people who found the hidden path.
    const POLLS = CASES.map((cs, i) => ({ key: cs.k, label: cs.k, name: 'Case ' + cs.k, step: FIRST_CASE + i }))
      .concat(open && (revealed || votes.D2) ? [{ key: 'D2', label: 'D+', name: 'Case D with its history', step: SECRET }] : []);
    const route = h('div', { class: 'route' }, ...POLLS.map(pl => {
      const v = votes[pl.key];
      return h('button', { class: 'rstop', type: 'button', id: 'route-' + pl.key, 'aria-label': pl.name + ': ' + (v ? ANSWERS.find(a => a[0] === v.a)[1] : 'not answered'), on: { click: () => go(pl.step) } },
        h('span', { class: 'ric ' + (v ? v.a : 'none') }, v ? icon(v.a) : 'Vote'), pl.label);
    }));
    const crowd = h('div', { class: 'crowd' }), tips = h('div', { class: 'tips' });
    const crowdN = h('small'), tipN = h('small');
    if (open && !votes.D2) stage.append(h('div', { class: 'secretnote' }, icon('key'), h('span', null, 'There is another way up.'),
      h('button', { class: 'primary', type: 'button', id: 'take-path', on: { click: () => go(revealed ? SECRET : ALMOST) } }, revealed ? 'Take it' : 'Look', icon('right'))));
    stage.append(
      h('div', { class: 'panel' }, h('div', { class: 'ptitle' }, 'Your route'), route),
      h('div', { class: 'panel' }, h('div', { class: 'ptitle' }, 'Everyone', crowdN), crowd),
      h('div', { class: 'panel' }, h('div', { class: 'ptitle' }, 'First case that is not a Yes', tipN), tips),
      h('div', { class: 'legend' },
        ...ANSWERS.map(([k, label]) => h('span', null, h('i', { class: 'sw', style: 'background:var(--p-' + k + ')' }), icon(k), label)),
        store.live ? null : h('span', null, 'Preview mode: only votes cast in this browser.')));
    side.append(detailCard('Tap a bar.'),
      h('button', { class: 'ghost refresh', type: 'button', id: 'refresh', on: { click: load } }, icon('refresh'), 'Refresh'));
    function clearSel() { stage.querySelectorAll('.sel').forEach(el => el.classList.remove('sel')); }
    function load() {
      crowd.replaceChildren(h('p', { class: 'empty' }, 'Loading…')); tips.replaceChildren();
      Promise.all([store.totals(), store.paths()]).then(([all, paths]) => { if (alive) draw(all, paths); })
        .catch(() => { if (alive) crowd.replaceChildren(h('p', { class: 'empty' }, 'Totals are not available right now. Try Refresh.')); });
    }
    function draw(all, paths) {
      showDetail(null);
      crowd.replaceChildren(); tips.replaceChildren();
      let most = 0;
      // People who answered Case D twice: how many changed their answer after the history.
      const both = paths.filter(p => /^[ynu-]{3}[ynu]{2}$/.test(p.path));
      const bothN = both.reduce((a, p) => a + p.n, 0), movedN = both.filter(p => p.path[3] !== p.path[4]).reduce((a, p) => a + p.n, 0);
      const moves = {};
      both.forEach(p => { const k = p.path[3] + p.path[4]; moves[k] = (moves[k] || 0) + p.n; });
      POLLS.forEach(pl => {
        const t = all[pl.key], mine = votes[pl.key] ? votes[pl.key].a : null, cb = crowdBar(t, mine);
        most = Math.max(most, cb.n);
        const wrap = h('div', { class: 'bwrap' }, cb.bar);
        if (cb.you !== null) { const y = h('span', { class: 'you' }, 'You'); y.style.left = cb.you + '%'; wrap.append(y); }
        const row = h('button', { class: 'crow', type: 'button', id: 'crowd-' + pl.key, on: { click: () => {
          clearSel(); row.classList.add('sel');
          const lines = cb.n ? ANSWERS.map(([k, label]) => label + ': ' + t[k] + ' (' + Math.round(t[k] / cb.n * 100) + '%)') : ['No answers yet.'];
          const extra = h('div', null);
          if (pl.key === 'D2' && bothN) {
            lines.push(movedN + ' of ' + bothN + (bothN === 1 ? ' person' : ' people') + ' changed their answer on Case D.');
            const list = h('div', { class: 'paths' });
            Object.keys(moves).sort((p, q) => moves[q] - moves[p]).forEach(k => list.append(h('div', null,
              h('span', { class: 'pi ' + LETTER[k[0]] }, icon(LETTER[k[0]])), icon('right'), h('span', { class: 'pi ' + LETTER[k[1]] }, icon(LETTER[k[1]])), '× ' + moves[k])));
            extra.append(list);
          }
          extra.append(h('button', { class: 'ghost act', type: 'button', on: { click: () => go(pl.step) } }, pl.key === 'D2' ? 'Open the hidden path' : 'Open ' + pl.name, icon('right')));
          showDetail({ title: pl.name, tag: cb.n + (cb.n === 1 ? ' answer' : ' answers'), lines, extra });
        } } }, h('span', { class: 'cl' }, pl.label), wrap, h('span', { class: 'cn' }, String(cb.n)));
        crowd.append(row);
      });
      crowdN.textContent = most ? 'up to ' + most + (most === 1 ? ' answer' : ' answers') : '';
      if (!most) crowd.append(h('p', { class: 'empty' }, 'No answers yet.'));

      // Tipping point: the first case a person did not answer Yes. Only complete four-case routes count.
      const four = {};
      paths.forEach(p => { const k = p.path.slice(0, 4); four[k] = (four[k] || 0) + p.n; });
      const full = Object.keys(four).filter(k => /^[ynu]{4}$/.test(k)).map(k => ({ path: k, n: four[k] }));
      const buckets = [0, 1, 2, 3, 4].map(() => ({ n: 0, paths: [] }));
      full.forEach(p => { const at = p.path.search(/[nu]/); const b = buckets[at < 0 ? 4 : at]; b.n += p.n; b.paths.push(p); });
      const total = full.reduce((a, p) => a + p.n, 0), max = Math.max(1, ...buckets.map(b => b.n));
      const myPath = CASES.map(cs => (votes[cs.k] ? votes[cs.k].a[0] : '-')).join('');
      const myAt = /^[ynu]{4}$/.test(myPath) ? (myPath.search(/[nu]/) < 0 ? 4 : myPath.search(/[nu]/)) : -1;
      tipN.textContent = total ? total + (total === 1 ? ' complete route' : ' complete routes') : '';
      buckets.forEach((b, i) => {
        const name = i < 4 ? 'Case ' + CASES[i].k : 'Never';
        const fillEl = h('span', { class: 'fill' }); fillEl.style.height = (b.n / max * 100) + '%';
        const el = h('button', { class: 'tip' + (i === myAt ? ' mine' : ''), type: 'button', id: 'tip-' + i, 'aria-label': name + ': ' + b.n, on: { click: () => {
          clearSel(); el.classList.add('sel');
          const list = h('div', { class: 'paths' });
          b.paths.sort((p, q) => q.n - p.n).forEach(p => list.append(h('div', null,
            ...Array.from(p.path).map(ch => h('span', { class: 'pi ' + LETTER[ch] }, icon(LETTER[ch]))), '× ' + p.n)));
          showDetail({ title: i < 4 ? 'Tipped at Case ' + CASES[i].k : 'Yes in all four cases', tag: b.n + (b.n === 1 ? ' person' : ' people'),
            lines: b.n ? ['Answers for Cases A to D:'] : ['Nobody yet.'], extra: b.n ? list : null });
        } } },
          h('span', { class: 'col' }, h('span', { class: 'n' }, String(b.n)), fillEl),
          h('span', { class: 'lab' }, name, i === myAt ? h('b', null, 'You') : null));
        tips.append(el);
      });
    }
    load();
    return () => { alive = false; };
  }

  /* ---------- sign-in ---------- */
  function showGate(switching) {
    const me = store.me();
    $('gate').hidden = false; $('journey').hidden = true; $('who').hidden = true;
    $('name').value = ''; $('name-err').hidden = true;
    $('gate-cancel').hidden = !(switching && me);
    if (switching && me) $('gate-cancel').textContent = 'Carry on as ' + me.name;
    $('gate-note').textContent = store.live
      ? 'Everyone sees the totals. Only Thomas sees names and comments.'
      : 'Preview mode: votes stay in this browser.';
    $('name').placeholder = alias();
    if (switching) $('name').focus();
  }
  function alias() {
    const pick = list => list[Math.floor(Math.random() * list.length)];
    return pick(D.ALIAS.first) + ' ' + pick(D.ALIAS.second);
  }
  function enter(step) {
    const me = store.me();
    $('gate').hidden = true; $('journey').hidden = false; $('who').hidden = false;
    $('who-name').textContent = me.name;
    state.step = -1;
    if (cleanup) { cleanup(); cleanup = null; }
    caseUI = null; pollUI = null; walked = -1; revealed = false;
    go(step);
  }

  function start() {
    $('mode').hidden = store.live;
    buildRidge();
    $('prev').addEventListener('click', () => go(neighbour(state.step, -1)));
    $('next').addEventListener('click', () => go(neighbour(state.step, 1)));
    $('alias').addEventListener('click', () => { $('name').value = alias(); $('name-err').hidden = true; $('name').focus(); });
    $('who').addEventListener('click', () => showGate(true));
    $('gate-cancel').addEventListener('click', () => enter(stepFromHash()));
    $('signin').addEventListener('submit', e => {
      e.preventDefault();
      if (!store.signIn($('name').value)) { $('name-err').hidden = false; $('name').focus(); return; }
      enter(0);
    });
    window.addEventListener('hashchange', () => { if (!$('journey').hidden) go(stepFromHash()); });
    document.addEventListener('keydown', e => {
      if ($('journey').hidden || e.altKey || e.ctrlKey || e.metaKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === 'ArrowRight' && neighbour(state.step, 1) <= limit() && !(state.step === SECRET && !store.myVotes().D2)) go(neighbour(state.step, 1));
      if (e.key === 'ArrowLeft') go(neighbour(state.step, -1));
    });
    if (store.me()) enter(stepFromHash()); else showGate(false);
  }
  start();
})();
