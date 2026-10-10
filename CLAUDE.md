# CLAUDE.md

## Git
- Only commit files you explicitly changed. There are other dirty files in the repo (public/, .DS_Store, etc.) that should not be included.

## Site structure
- Hugo site. `index.html` is the homepage.
- Research papers have inline press/talks/podcasts in `pdf-link` divs.

## Style conventions for research paper listings
- Coverage: `coverage in X, Y, Z`
- Talks: `talks at X, Y, Z`
- Podcasts: `podcast appearances on X, Y, Z`
- No colons — use lowercase descriptive phrases.
- Multiple articles from the same outlet: `Outlet (1, 2)` where each number is a separate link.

## Repo history
- History was reset in Oct 2026: the full pre-reset history (including retired digital garden posts) lives in the private repo `joel-becker/joel-becker.github.io-archive`, cloned locally at `~/projects/joel-becker.github.io-archive`. Don't push that history to this repo.
- `public/` is a stale Hugo output and is gitignored; GitHub Pages serves the repo root.
