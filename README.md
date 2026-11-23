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
