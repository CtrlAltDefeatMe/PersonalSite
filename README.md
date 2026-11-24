# PersonalSite
Personal Website

## New Episodes (`/tv/`)

A private-use page listing streaming shows that released an episode today or in the prior three days.
It is not linked from the main site and is marked `noindex`.

- `tv/index.html`, `tv/tv.css`, `tv/tv.js`: the page. It reads the schedule live from the
  [TVMaze API](https://www.tvmaze.com/api) in the visitor's browser and keeps settings in `localStorage`.
- `tv/catalog.json`: every current or announced show on the tracked services, used by the settings menu.
- `tv/build-catalog.mjs`: rebuilds the catalog (`node tv/build-catalog.mjs`, about three minutes).
  `.github/workflows/tv-catalog.yml` runs it daily and commits the result to the default branch.

## O.E. SeeDee case study (`/seedee/`)

An interactive walk-through of the O.E. SeeDee transfer pricing case, with a poll on each of the four scenarios.
It is not linked from the main site and is marked `noindex`.

- `seedee/index.html`, `seedee/seedee.css`, `seedee/app.js`: the page. Visitors sign in with a name, step through
  the case along the Säntis ridge, and answer Yes / No / Unclear for Cases A to D. Once all four are answered,
  a hidden path opens: Case D's history, followed by a second vote on Case D (stored as `D2`).
- `seedee/content.js`: the case facts. Numbers used only to draw pictures are marked illustrative.
- `seedee/store.js`, `seedee/config.js`: where votes go. With `config.js` empty the page runs in preview mode and
  votes stay in the visitor's browser.
- `seedee/setup.sql`: creates the vote table in a Supabase project. To collect votes from everyone:
  1. Create a free project at supabase.com.
  2. Open its SQL editor, paste `setup.sql`, run it.
  3. Copy the project URL and the public `anon` key (Project settings > API) into `seedee/config.js`.

  The public key can only cast a vote and read totals. Names and comments are visible only in the Supabase
  dashboard (Table editor > `seedee_votes`, which also exports CSV). Sign-in is by name only, so anyone with the
  link can vote; one answer per person per case, and a person is remembered per browser.
  After changing `setup.sql`, run it again in the SQL editor; it keeps existing votes.
