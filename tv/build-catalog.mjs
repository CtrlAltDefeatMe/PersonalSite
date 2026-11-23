#!/usr/bin/env node
// Builds tv/catalog.json: every current or announced show on the tracked
// streaming services, from the TVMaze show index (https://www.tvmaze.com/api).
// Run: node tv/build-catalog.mjs
// The service table below must stay in step with SERVICES in tv/tv.js.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SERVICES = [
  ['netflix', /^netflix/i],
  ['apple', /^apple tv/i],
  ['prime', /^(amazon )?prime video|^amazon/i],
  ['disney', /^disney\+/i],
  ['hulu', /^hulu/i],
  ['hbo', /^(hbo( max)?|max)$/i],
  ['peacock', /^peacock/i],
  ['paramount', /^paramount\+/i],
];
const serviceOf = (name) => (name ? (SERVICES.find(([, re]) => re.test(name)) || [])[0] : undefined);
const ACTIVE = new Set(['Running', 'To Be Determined', 'In Development']);
const API = 'https://api.tvmaze.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Returns the page's shows, or null once the index runs out (HTTP 404).
async function fetchPage(page) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(`${API}/shows?page=${page}`);
    } catch (err) {
      if (attempt >= 5) throw err;
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (res.status === 404) return null;
    if (res.ok) return res.json();
    if (attempt >= 5) throw new Error(`TVMaze returned HTTP ${res.status} for page ${page}`);
    await sleep(res.status === 429 ? 6000 : 2000 * (attempt + 1));
  }
}

function toEntry(show) {
  if (!ACTIVE.has(show.status)) return null;
  const web = serviceOf(show.webChannel?.name);
  const net = serviceOf(show.network?.name);
  const svc = web || net;
  if (!svc) return null;
  const entry = { id: show.id, n: show.name, s: svc, g: show.genres || [], t: show.type || '', st: show.status };
  if (show.language) entry.l = show.language;
  if (show.premiered) entry.p = show.premiered;
  // A broadcast or cable network whose show also streams on a tracked service.
  if (show.network && !net) entry.net = show.network.name;
  if (show.weight) entry.w = show.weight;
  return entry;
}

const shows = [];
const CONCURRENCY = 4; // TVMaze allows about 20 calls per 10 seconds
let next = 0;
let done = false;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (!done) {
    const page = next++;
    const list = await fetchPage(page);
    if (!list) { done = true; break; }
    for (const show of list) {
      const entry = toEntry(show);
      if (entry) shows.push(entry);
    }
    await sleep(1200);
  }
}));

if (shows.length < 500) throw new Error(`Only ${shows.length} shows found; refusing to overwrite the catalog.`);
shows.sort((a, b) => a.n.localeCompare(b.n, 'en') || a.id - b.id);
const body = `{"shows":[\n${shows.map((s) => JSON.stringify(s)).join(',\n')}\n]}\n`;
await writeFile(fileURLToPath(new URL('./catalog.json', import.meta.url)), body);
console.log(`Wrote ${shows.length} shows from ${next} index pages.`);
