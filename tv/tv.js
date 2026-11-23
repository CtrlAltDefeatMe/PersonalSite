// New Episodes: lists streaming shows that released an episode today or in the prior three days.
// Schedule and show data come from the public TVMaze API (https://www.tvmaze.com/api).
(() => {
  'use strict';

  const API = 'https://api.tvmaze.com';
  const STORE_KEY = 'tv.settings.v1';
  const PAGE = 100; // rows added to the show list per "Show more"
  const DAYS_BACK = 3; // days shown before today

  // Keep in step with SERVICES in build-catalog.mjs.
  const SERVICES = [
    { key: 'netflix', label: 'Netflix', re: /^netflix/i, dot: '#e50914' },
    { key: 'apple', label: 'Apple TV', re: /^apple tv/i, dot: '#8e8e93' },
    { key: 'prime', label: 'Prime Video', re: /^(amazon )?prime video|^amazon/i, dot: '#1a98ff' },
    { key: 'disney', label: 'Disney+', re: /^disney\+/i, dot: '#1f5fd6' },
    { key: 'hulu', label: 'Hulu', re: /^hulu/i, dot: '#1cc47a' },
    { key: 'hbo', label: 'HBO', re: /^(hbo( max)?|max)$/i, dot: '#8b45f5' },
    { key: 'peacock', label: 'Peacock', re: /^peacock/i, dot: '#e3a400' },
    { key: 'paramount', label: 'Paramount+', re: /^paramount\+/i, dot: '#0064ff' },
  ];
  const SERVICE = Object.fromEntries(SERVICES.map((s) => [s.key, s]));

  // Each chip maps to one or more TVMaze genres. The first five are the default focus.
  const GENRES = [
    { key: 'scifi', label: 'Sci-Fi', match: ['Science-Fiction'], on: true },
    { key: 'fantasy', label: 'Fantasy', match: ['Fantasy', 'Supernatural'], on: true },
    { key: 'action', label: 'Action', match: ['Action'], on: true },
    { key: 'thriller', label: 'Thriller', match: ['Thriller', 'Espionage'], on: true },
    { key: 'comedy', label: 'Comedy', match: ['Comedy'], on: true },
    { key: 'adventure', label: 'Adventure', match: ['Adventure'] },
    { key: 'crime', label: 'Crime', match: ['Crime'] },
    { key: 'drama', label: 'Drama', match: ['Drama'] },
    { key: 'horror', label: 'Horror', match: ['Horror'] },
    { key: 'mystery', label: 'Mystery', match: ['Mystery'] },
  ];
  const KIDS = ['Children', 'Family'];
  const AUTO_TYPES = ['Scripted', 'Animation'];
  const OPTIONS = ['hideKids', 'englishOnly', 'includeNetwork', 'includeUntagged', 'onlySelected'];

  const $ = (id) => document.getElementById(id);

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k in el) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
    return el;
  }

  /* ---------- Settings ---------- */

  function defaults() {
    return {
      services: Object.fromEntries(SERVICES.map((s) => [s.key, true])),
      genres: Object.fromEntries(GENRES.map((g) => [g.key, !!g.on])),
      hideKids: true,
      englishOnly: true,
      includeNetwork: true,
      includeUntagged: true,
      onlySelected: false,
      picks: {}, // show id -> 1 (always include) or 0 (never include)
      pickInfo: {}, // details for picked shows that are not in the catalog
    };
  }

  function loadSettings() {
    const base = defaults();
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        for (const k of OPTIONS) if (typeof saved[k] === 'boolean') base[k] = saved[k];
        for (const k of ['services', 'genres', 'picks', 'pickInfo']) {
          if (saved[k] && typeof saved[k] === 'object') Object.assign(base[k], saved[k]);
        }
      }
    } catch { /* storage unavailable or corrupt: fall back to defaults */ }
    return base;
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch { /* keep working without storage */ }
  }

  const settings = loadSettings();

  /* ---------- Show model and matching ---------- */

  const serviceKey = (name) => (name ? (SERVICES.find((s) => s.re.test(name)) || {}).key || '' : '');

  // Reduces a TVMaze show to the compact shape that catalog.json also uses.
  function normShow(raw) {
    const web = serviceKey(raw.webChannel && raw.webChannel.name);
    const net = serviceKey(raw.network && raw.network.name);
    return {
      id: raw.id,
      n: raw.name || 'Untitled',
      s: web || net,
      g: raw.genres || [],
      t: raw.type || '',
      st: raw.status || '',
      l: raw.language || '',
      p: raw.premiered || '',
      net: raw.network && !net ? raw.network.name : '',
      ch: (raw.webChannel || raw.network || {}).name || '',
      w: raw.weight || 0,
      img: (raw.image && raw.image.medium) || '',
      url: raw.url || '',
    };
  }

  function matchesFilters(show) {
    if (!show.s || !settings.services[show.s]) return false;
    if (show.net && !settings.includeNetwork) return false;
    if (!AUTO_TYPES.includes(show.t)) return false;
    if (settings.hideKids && show.g.some((g) => KIDS.includes(g))) return false;
    if (settings.englishOnly && show.l && show.l !== 'English') return false;
    if (!show.g.length) return settings.includeUntagged;
    return GENRES.some((grp) => settings.genres[grp.key] && grp.match.some((g) => show.g.includes(g)));
  }

  const pickOf = (show) => settings.picks[show.id];

  function isIncluded(show) {
    const pick = pickOf(show);
    if (pick === 1) return true;
    if (pick === 0) return false;
    return !settings.onlySelected && matchesFilters(show);
  }

  // value: 1 include, 0 exclude, null back to the filters.
  function setPick(show, value) {
    if (value == null) {
      delete settings.picks[show.id];
      delete settings.pickInfo[show.id];
      return;
    }
    settings.picks[show.id] = value;
    if (catalog && catalogIds.has(show.id)) delete settings.pickInfo[show.id];
    else {
      const { id, n, s, g, t, st, l, p, net, ch } = show;
      settings.pickInfo[show.id] = { id, n, s, g, t, st, l, p, net, ch };
    }
  }

  /* ---------- Formatting ---------- */

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const longDate = (s) => fromYmd(s).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const weekday = (s) => fromYmd(s).toLocaleDateString(undefined, { weekday: 'long' });
  const monthDay = (s) => fromYmd(s).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  const shortDate = (s) => fromYmd(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
  const genreLabel = (g) => (g === 'Science-Fiction' ? 'Sci-Fi' : g);
  // Lower-cases and strips accents so "shogun" finds "Shōgun".
  const fold = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  function channelLabel(show) {
    if (!SERVICE[show.s]) return show.ch || show.net || 'Other';
    return show.net ? `${show.net} · ${SERVICE[show.s].label}` : SERVICE[show.s].label;
  }

  function statusLabel(show) {
    if (show.st === 'In Development') {
      if (!show.p) return 'Announced';
      return `${show.p > ymd(new Date()) ? 'Premieres' : 'Premiered'} ${shortDate(show.p)}`;
    }
    if (show.st === 'To Be Determined') return 'Next season unconfirmed';
    return show.st;
  }

  function episodeCode(ep) {
    if (ep.number == null) return ep.type && ep.type !== 'regular' ? 'Special' : `Season ${ep.season}`;
    return `S${ep.season} E${ep.number}`;
  }

  // Returns [bold part, plain part] describing what a show released that day.
  function episodeLine(eps) {
    if (eps.length === 1) {
      const ep = eps[0];
      const generic = !ep.name || /^episode \d+$/i.test(ep.name);
      return [episodeCode(ep), generic ? '' : ep.name];
    }
    const seasons = [...new Set(eps.map((e) => e.season))];
    const nums = eps.map((e) => e.number).filter((n) => n != null);
    if (seasons.length === 1 && nums.length === eps.length) {
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      const range = max - min + 1 === nums.length ? `Episodes ${min}–${max}` : plural(eps.length, 'episode');
      return [`Season ${seasons[0]}`, range];
    }
    return [plural(eps.length, 'episode'), ''];
  }

  function premiereTag(eps) {
    const first = eps.find((e) => e.number === 1);
    if (!first) return '';
    return first.season === 1 ? 'Series premiere' : 'Season premiere';
  }

  function airTime(eps) {
    const ep = eps.find((e) => e.airtime && e.airstamp);
    if (!ep) return '';
    const t = new Date(ep.airstamp);
    return Number.isNaN(t.getTime()) ? '' : t.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  /* ---------- Schedule ---------- */

  let episodes = []; // { id, day, show, season, number, name, type, airtime, airstamp }
  let loadedDays = [];
  let loadedAt = 0;
  let loading = false;

  function currentDays() {
    const now = new Date();
    return Array.from({ length: DAYS_BACK + 1 }, (_, i) => ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
  }

  async function getJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function loadSchedule() {
    if (loading) return;
    loading = true;
    $('refresh').disabled = true;
    const days = currentDays();
    if (!episodes.length) setStatus('Loading the schedule…');
    // Streaming releases are global; the US TV schedule adds HBO and network shows.
    const requests = days.flatMap((day) => [
      { day, url: `${API}/schedule/web?date=${day}` },
      { day, url: `${API}/schedule?country=US&date=${day}` },
    ]);
    const results = await Promise.allSettled(requests.map((r) => getJSON(r.url)));
    loading = false;
    $('refresh').disabled = false;

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed === results.length) {
      setStatus('The schedule could not be loaded. Check your connection, then choose Refresh.', true);
      return;
    }
    const seen = new Set();
    const list = [];
    results.forEach((result, i) => {
      if (result.status !== 'fulfilled' || !Array.isArray(result.value)) return;
      for (const item of result.value) {
        const rawShow = (item._embedded && item._embedded.show) || item.show;
        if (!rawShow || seen.has(item.id)) continue;
        seen.add(item.id);
        list.push({
          id: item.id,
          day: requests[i].day,
          show: normShow(rawShow),
          season: item.season,
          number: item.number,
          name: item.name || '',
          type: item.type || 'regular',
          airtime: item.airtime || '',
          airstamp: item.airstamp || '',
        });
      }
    });
    episodes = list;
    loadedDays = days;
    loadedAt = Date.now();
    setStatus(failed ? 'Part of the schedule could not be loaded, so some releases may be missing. Choose Refresh to try again.' : '', failed > 0);
    render();
  }

  function setStatus(text, isError, action) {
    const el = $('status');
    el.replaceChildren(text || '');
    if (action) el.append(' ', action);
    el.className = isError ? 'status error' : 'status';
    el.hidden = !text;
  }

  /* ---------- Main view ---------- */

  function groupByShow(list) {
    const groups = new Map();
    for (const ep of list) {
      if (!groups.has(ep.show.id)) groups.set(ep.show.id, { show: ep.show, eps: [] });
      groups.get(ep.show.id).eps.push(ep);
    }
    for (const g of groups.values()) g.eps.sort((a, b) => a.season - b.season || (a.number ?? 1e6) - (b.number ?? 1e6));
    return [...groups.values()].sort((a, b) => b.show.w - a.show.w || a.show.n.localeCompare(b.show.n));
  }

  function poster(show) {
    if (show.img) return h('img', { class: 'poster', src: show.img, alt: '', loading: 'lazy', width: 76, height: 107 });
    return h('div', { class: 'poster poster-blank', 'aria-hidden': 'true' }, show.n.slice(0, 1).toUpperCase());
  }

  function card({ show, eps }) {
    const [bold, plain] = episodeLine(eps);
    const tag = premiereTag(eps);
    const time = airTime(eps);
    const svc = h('span', { class: 'svc' }, channelLabel(show));
    if (SERVICE[show.s]) svc.style.setProperty('--dot', SERVICE[show.s].dot);
    const title = show.url ? h('a', { href: show.url, rel: 'noopener' }, show.n) : show.n;
    const meta = [show.g.map(genreLabel).join(', '), time].filter(Boolean).join(' · ');
    return h('article', { class: 'card' },
      poster(show),
      h('div', { class: 'card-body' },
        h('div', { class: 'card-top' }, svc, tag && h('span', { class: 'tag' }, tag)),
        h('h3', null, title),
        h('p', { class: 'ep' }, h('b', null, bold), plain ? ` · ${plain}` : ''),
        meta && h('p', { class: 'meta' }, meta),
        h('div', { class: 'card-foot' },
          h('button', { class: 'link', type: 'button', onclick: () => hideShow(show) }, 'Hide this show'))));
  }

  function otherRow({ show, eps }) {
    const [bold, plain] = episodeLine(eps);
    const details = [channelLabel(show), show.g.length ? show.g.map(genreLabel).join(', ') : show.t, [bold, plain].filter(Boolean).join(' · ')];
    return h('li', null,
      h('span', { class: 'text' },
        show.url ? h('a', { class: 'name', href: show.url, rel: 'noopener' }, show.n) : h('span', { class: 'name' }, show.n),
        h('span', { class: 'meta' }, details.filter(Boolean).join(' · '))),
      h('button', { class: 'link', type: 'button', onclick: () => { setPick(show, 1); save(); render(); } }, 'Add'));
  }

  function hideShow(show) {
    setPick(show, 0);
    save();
    render();
    const undo = h('button', { class: 'link', type: 'button', onclick: () => { setPick(show, null); save(); setStatus(''); render(); } }, 'Undo');
    setStatus(`${show.n} is hidden.`, false, undo);
  }

  function render() {
    if (!loadedDays.length) return;
    const container = $('days');
    container.replaceChildren();
    loadedDays.forEach((day, i) => {
      const groups = groupByShow(episodes.filter((e) => e.day === day));
      const mine = groups.filter((g) => isIncluded(g.show));
      // Releases on the selected services that the filters leave out, offered for adding.
      const others = groups.filter((g) => pickOf(g.show) == null && !isIncluded(g.show) && settings.services[g.show.s]);
      const section = h('section', { class: 'day', 'aria-labelledby': `day-${i}` },
        h('div', { class: 'day-head' },
          h('h2', { id: `day-${i}` }, i === 0 ? 'Today' : i === 1 ? 'Yesterday' : weekday(day)),
          h('span', { class: 'day-date' }, i < 2 ? longDate(day) : monthDay(day)),
          h('span', { class: 'day-count' }, plural(mine.length, 'show'))),
        mine.length
          ? h('div', { class: 'cards' }, mine.map(card))
          : h('p', { class: 'empty' }, i === 0 ? 'No new episodes from your shows yet today.' : 'No new episodes from your shows.'),
        others.length > 0 && h('details', { class: 'others' },
          h('summary', null, `${plural(others.length, 'other release')} on your services`),
          h('ul', null, others.map(otherRow))));
      container.append(section);
    });
  }

  /* ---------- Settings: filters ---------- */

  function buildFilters() {
    $('service-checks').replaceChildren(...SERVICES.map((s) => h('label', null,
      h('input', { type: 'checkbox', id: `svc-${s.key}`, checked: !!settings.services[s.key], onchange: (e) => { settings.services[s.key] = e.target.checked; changed(); } }),
      h('span', null, s.label))));
    $('genre-chips').replaceChildren(...GENRES.map((g) => h('button', {
      class: 'chip', type: 'button', id: `genre-${g.key}`, 'aria-pressed': String(!!settings.genres[g.key]),
      onclick: (e) => {
        settings.genres[g.key] = !settings.genres[g.key];
        e.currentTarget.setAttribute('aria-pressed', String(settings.genres[g.key]));
        changed();
      },
    }, g.label)));
    for (const key of OPTIONS) {
      const box = $(`opt-${key}`);
      box.checked = settings[key];
      box.addEventListener('change', () => { settings[key] = box.checked; changed(); });
    }
  }

  function changed() {
    save();
    render();
    renderList();
  }

  /* ---------- Settings: show list ---------- */

  let catalog = null; // array of compact shows once loaded
  let catalogIds = new Set();
  let catalogState = 'idle'; // idle | loading | ready | error
  const found = new Map(); // shows found through TVMaze search that are not in the catalog
  let foundQuery = ''; // the query of the latest TVMaze search
  let foundIds = new Set(); // its results, listed even when the name differs from the query
  let listLimit = PAGE;
  let listed = []; // current filtered rows, used by the bulk actions

  async function loadCatalog() {
    if (catalogState === 'loading' || catalogState === 'ready') return;
    catalogState = 'loading';
    renderList();
    try {
      const data = await getJSON('catalog.json');
      catalog = data.shows.map((s) => ({ l: '', p: '', net: '', w: 0, ch: '', ...s }));
      catalogIds = new Set(catalog.map((s) => s.id));
      catalogState = 'ready';
    } catch {
      catalogState = 'error';
    }
    renderList();
  }

  function listSource() {
    const rows = catalog ? catalog.slice() : [];
    const extra = new Map();
    for (const info of Object.values(settings.pickInfo)) if (info && info.id && !catalogIds.has(info.id)) extra.set(info.id, info);
    for (const [id, show] of found) if (!catalogIds.has(id)) extra.set(id, show);
    for (const show of extra.values()) rows.push({ g: [], l: '', p: '', net: '', w: 0, ch: '', t: '', st: '', ...show });
    return rows;
  }

  function filterList() {
    const q = fold($('show-search').value.trim());
    const svc = $('show-service').value;
    const status = $('show-status').value;
    const selection = $('show-selection').value;
    const sort = $('show-sort').value;
    const rows = listSource().filter((show) => {
      if (q && !fold(show.n).includes(q) && !(q === foundQuery && foundIds.has(show.id))) return false;
      if (svc && show.s !== svc) return false;
      if (status === 'announced' && show.st !== 'In Development') return false;
      if (status === 'current' && show.st === 'In Development') return false;
      if (selection === 'in' && !isIncluded(show)) return false;
      if (selection === 'out' && isIncluded(show)) return false;
      if (selection === 'manual' && pickOf(show) == null) return false;
      return true;
    });
    const byName = (a, b) => a.n.localeCompare(b.n);
    if (sort === 'name') rows.sort(byName);
    else if (sort === 'premiere') rows.sort((a, b) => (b.p || '').localeCompare(a.p || '') || byName(a, b));
    else rows.sort((a, b) => b.w - a.w || byName(a, b));
    return rows;
  }

  function listRow(show) {
    const manual = pickOf(show) != null;
    const parts = [channelLabel(show), show.g.map(genreLabel).join(', '), AUTO_TYPES.includes(show.t) ? '' : show.t, statusLabel(show)];
    return h('li', null,
      h('label', null,
        h('input', { type: 'checkbox', id: `show-${show.id}`, checked: isIncluded(show), onchange: (e) => { setPick(show, e.target.checked ? 1 : 0); changed(); } }),
        h('span', { class: 'text' },
          h('span', { class: 'name' }, show.n),
          h('span', { class: 'meta' }, parts.filter(Boolean).join(' · ')))),
      manual && h('button', { class: 'link', type: 'button', title: 'Let your filters decide for this show', onclick: () => { setPick(show, null); changed(); } }, 'Reset'));
  }

  function renderList() {
    if ($('panel-shows').hidden) return;
    const list = $('show-list');
    const count = $('show-count');
    const q = $('show-search').value.trim();
    listed = filterList();
    list.replaceChildren(...listed.slice(0, listLimit).map(listRow));
    $('show-more').hidden = listed.length <= listLimit;
    if (!$('show-more').hidden) $('show-more').textContent = `Show ${Math.min(PAGE, listed.length - listLimit)} more`;

    if (catalogState === 'loading') count.textContent = 'Loading shows…';
    else if (catalogState === 'error' && !listed.length) count.textContent = 'The show list could not be loaded. Close settings and try again.';
    else count.textContent = `${plural(listed.length, 'show')} listed · ${listed.filter(isIncluded).length.toLocaleString()} included`;

    const everywhere = $('search-everywhere');
    everywhere.hidden = q.length < 2;
    everywhere.textContent = `Search every network and service for “${q}”`;
  }

  async function searchEverywhere() {
    const q = $('show-search').value.trim();
    const note = $('search-note');
    const button = $('search-everywhere');
    button.disabled = true;
    note.hidden = false;
    note.textContent = 'Searching…';
    try {
      const results = await getJSON(`${API}/search/shows?q=${encodeURIComponent(q)}`);
      let added = 0;
      foundQuery = fold(q);
      foundIds = new Set();
      for (const { show } of results) {
        if (!show) continue;
        foundIds.add(show.id);
        if (catalogIds.has(show.id)) continue;
        if (!found.has(show.id)) added++;
        found.set(show.id, normShow(show));
      }
      note.textContent = added
        ? `${plural(added, 'more show')} added to the list from other networks, services, or ended series.`
        : 'No further shows found.';
      // Search results span every service, so clear filters that would hide them.
      if (added) { $('show-service').value = ''; $('show-status').value = ''; }
    } catch {
      note.textContent = 'The search could not be completed. Try again in a moment.';
    }
    button.disabled = false;
    renderList();
  }

  function bulk(value) {
    for (const show of listed) setPick(show, value);
    changed();
  }

  function selectTab(name) {
    for (const tab of ['filters', 'shows']) {
      $(`tab-${tab}`).setAttribute('aria-selected', String(tab === name));
      $(`panel-${tab}`).hidden = tab !== name;
    }
    if (name === 'shows') { loadCatalog(); renderList(); }
  }

  function buildShowControls() {
    $('show-service').replaceChildren(h('option', { value: '' }, 'All services'), ...SERVICES.map((s) => h('option', { value: s.key }, s.label)));
    let timer;
    $('show-search').addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { listLimit = PAGE; $('search-note').hidden = true; renderList(); }, 150);
    });
    for (const id of ['show-service', 'show-status', 'show-selection', 'show-sort']) {
      $(id).addEventListener('change', () => { listLimit = PAGE; renderList(); });
    }
    $('show-more').addEventListener('click', () => { listLimit += PAGE; renderList(); });
    $('search-everywhere').addEventListener('click', searchEverywhere);
    $('bulk-in').addEventListener('click', () => bulk(1));
    $('bulk-out').addEventListener('click', () => bulk(0));
    $('bulk-auto').addEventListener('click', () => bulk(null));
  }

  /* ---------- Wiring ---------- */

  const dialog = $('settings');
  $('open-settings').addEventListener('click', () => { dialog.showModal(); if (!$('panel-shows').hidden) renderList(); });
  $('close-settings').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); }); // click on the backdrop
  $('tab-filters').addEventListener('click', () => selectTab('filters'));
  $('tab-shows').addEventListener('click', () => selectTab('shows'));
  $('refresh').addEventListener('click', loadSchedule);
  // Reload when the page is reopened on a new day or after half an hour.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (currentDays()[0] !== loadedDays[0] || Date.now() - loadedAt > 30 * 60 * 1000) loadSchedule();
  });

  buildFilters();
  buildShowControls();
  loadSchedule();
})();
