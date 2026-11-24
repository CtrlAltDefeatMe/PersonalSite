// Vote storage. Preview mode keeps everything in this browser; live mode also sends each
// vote to Supabase (see config.js and setup.sql) and reads totals from there.
(function () {
  'use strict';
  const cfg = window.SEEDEE_CONFIG || {};
  const live = !!(cfg.supabaseUrl && cfg.supabaseKey);
  // The four cases, plus D2: the second vote on Case D after the hidden path.
  const POLLS = ['A', 'B', 'C', 'D', 'D2'];
  const K_PEOPLE = 'seedee.people'; // { "<name, lower case>": { id, name } }
  const K_ME = 'seedee.me';         // "<name, lower case>"
  const K_VOTES = 'seedee.votes';   // { "<voter id>": { A: { a, c }, ... } }
  const K_OPEN = 'seedee.open';     // preview mode only: is the summit open?
  const mem = {};

  function read(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : (key in mem ? mem[key] : fallback); }
    catch (e) { return key in mem ? mem[key] : fallback; }
  }
  function write(key, value) {
    mem[key] = value;
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private window: keep in memory */ }
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
      const r = Math.random() * 16 | 0; return (ch === 'x' ? r : (r & 3) | 8).toString(16);
    });
  }
  async function rpc(fn, body) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 10000);
    try {
      const res = await fetch(cfg.supabaseUrl.replace(/\/+$/, '') + '/rest/v1/rpc/' + fn, {
        method: 'POST', signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', apikey: cfg.supabaseKey, Authorization: 'Bearer ' + cfg.supabaseKey },
        body: JSON.stringify(body || {})
      });
      if (!res.ok) { const err = new Error('Store answered ' + res.status); err.status = res.status; throw err; }
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    } finally { clearTimeout(timer); }
  }

  function me() {
    const key = read(K_ME, null), people = read(K_PEOPLE, {});
    return key && people[key] ? people[key] : null;
  }
  function signIn(name) {
    const clean = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!clean) return null;
    const key = clean.toLowerCase(), people = read(K_PEOPLE, {});
    if (!people[key]) people[key] = { id: uuid(), name: clean };
    people[key].name = clean;
    write(K_PEOPLE, people); write(K_ME, key);
    return people[key];
  }
  function signOut() { write(K_ME, null); }
  function myVotes() { const p = me(); return p ? (read(K_VOTES, {})[p.id] || {}) : {}; }

  // Saves on this device first, then to the shared store. Rejects if the shared save fails.
  async function cast(caseKey, answer, comment) {
    const p = me();
    if (!p) throw new Error('Not signed in');
    const all = read(K_VOTES, {});
    all[p.id] = all[p.id] || {};
    all[p.id][caseKey] = { a: answer, c: comment || '' };
    write(K_VOTES, all);
    if (live) await rpc('seedee_cast', { p_voter: p.id, p_name: p.name, p_case: caseKey, p_answer: answer, p_comment: comment || null });
  }

  function emptyTotals() {
    const t = {}; POLLS.forEach(k => { t[k] = { yes: 0, no: 0, unc: 0 }; }); return t;
  }
  async function totals() {
    const t = emptyTotals();
    if (live) {
      (await rpc('seedee_totals') || []).forEach(r => { if (t[r.case_key] && r.answer in t[r.case_key]) t[r.case_key][r.answer] = Number(r.n) || 0; });
    } else {
      Object.values(read(K_VOTES, {})).forEach(v => POLLS.forEach(k => { if (v[k] && v[k].a in t[k]) t[k][v[k].a]++; }));
    }
    return t;
  }
  // [{ path: 'yynuy', n: 3 }]: one letter per poll A, B, C, D, D2 (y, n, u, or - for not answered).
  // An older database may return only the first four letters.
  async function paths() {
    if (live) return (await rpc('seedee_paths') || []).map(r => ({ path: String(r.path), n: Number(r.n) || 0 }));
    const count = {};
    Object.values(read(K_VOTES, {})).forEach(v => {
      const path = POLLS.map(k => (v[k] ? v[k].a[0] : '-')).join('');
      if (path !== '-----') count[path] = (count[path] || 0) + 1;
    });
    return Object.keys(count).map(path => ({ path, n: count[path] }));
  }

  // Is the summit (the page with everyone's results) open? The administrator decides.
  // A database set up before this switch existed has no such function and counts as open.
  async function state() {
    if (!live) return { open: !!read(K_OPEN, false) };
    try { return { open: (await rpc('seedee_state')) === true }; }
    catch (e) { if (e.status === 404) return { open: true }; throw e; }
  }
  // Administrator: checks the passcode, optionally opens or closes the summit, and returns progress:
  // { open, people, answered: { A, B, C, D, D2 }, done4, done5 }. Rejects with status 403 on a wrong passcode.
  // In preview mode any passcode works and the switch lives in this browser only.
  async function admin(code, open) {
    if (live) return rpc('seedee_admin', open === undefined ? { p_code: code } : { p_code: code, p_open: !!open });
    if (!code) { const err = new Error('Wrong passcode'); err.status = 403; throw err; }
    if (open !== undefined) write(K_OPEN, !!open);
    const all = Object.values(read(K_VOTES, {})), answered = {};
    POLLS.forEach(k => { answered[k] = all.filter(v => v[k]).length; });
    return { open: !!read(K_OPEN, false), people: all.filter(v => POLLS.some(k => v[k])).length, answered,
      done4: all.filter(v => ['A', 'B', 'C', 'D'].every(k => v[k])).length, done5: answered.D2 };
  }

  window.SeeDeeStore = { live, me, signIn, signOut, myVotes, cast, totals, paths, state, admin };
})();
