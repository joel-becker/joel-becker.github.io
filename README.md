# joel-becker.github.io

Personal website for Joel Becker.

## Local Development

```bash
# Simple HTTP server (shows the full site with styles)
python3 -m http.server 8000
# Then visit http://localhost:8000
```

Note: `hugo server` won't work properly for the main site because `index.html` is a static file, not a Hugo template. Hugo is only used for generating digital garden content.

## Site Structure

```
├── index.html          # Main homepage (static HTML, not Hugo)
├── config.toml         # Hugo config (only affects digital garden)
├── content/
│   └── digital-garden/ # Markdown files for digital garden posts
├── layouts/
│   └── digital-garden/ # Hugo templates for digital garden
├── digital-garden/     # Generated HTML for digital garden (committed)
├── css/                # Custom CSS overrides
├── scss/               # Compiled CSS (no source .scss files exist)
├── plugins/            # Bootstrap, jQuery, FontAwesome, etc.
├── images/             # All images including publication thumbnails
│   ├── CV/             # CV PDF
│   └── publications/   # Paper thumbnails
└── js/                 # Custom JavaScript
```

## How Things Work

### Homepage (`index.html`)
- Completely static HTML, not processed by Hugo
- To edit: modify `index.html` directly
- Sections: About → Research → Media → Contact

### Digital Garden
- Content lives in `content/digital-garden/*.md`
- Uses Hugo templates from `layouts/digital-garden/`
- To rebuild: `hugo` (outputs to `digital-garden/` and `public/`)
- Has its own navigation, categories, archive (via `digital-garden/archive.json`)

### Styling
- Main styles: `scss/style.min.*.css` (compiled, no source files)
- Custom overrides: `css/*.css`
- Framework: Bootstrap 4 + jQuery (in `plugins/`)
- To change core styles: must edit the compiled CSS or create new override files

## Deployment

Site is deployed via GitHub Pages directly from the `master` branch root (not from `/public`). Push to `master` to deploy.

## Known Issues / Tech Debt

- No source SCSS files — only compiled CSS exists
- `index.html` should be converted to Hugo template for maintainability
- Bootstrap 4 + jQuery could be replaced with modern CSS
- Favicon is missing (`images/favicon.png` returns 404)
- Some asset paths have trailing spaces (works but messy)

## Future Improvements (Ideas)

- [ ] Convert to proper Hugo templating with data files for publications
- [ ] Design refresh: dark purple theme, better typography
- [ ] Create staging/preview workflow (branch deploys)
- [ ] Drop Bootstrap/jQuery, use modern CSS

