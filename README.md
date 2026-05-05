# SFR Day of Event Results | Opulent Hardware

Static GitHub Pages visualizer for SFR Solo day-of-event results.

The browser page reads local JSON from:

```text
/data/current-event.json
```

A GitHub Action opens the live SFR results page with Playwright, extracts visible text, parses it, and writes the JSON file.

## Files

```text
index.html
assets/style.css
assets/app.js
assets/parser.js
scripts/fetch-sfr-results.js
data/current-event.json
data/source-text.txt
.github/workflows/update-results.yml
package.json
README.md
```

## Setup

1. Create a new GitHub repo.
2. Upload all files from this folder.
3. Go to **Settings → Pages**.
4. Set **Build and deployment** to deploy from branch.
5. Choose `main` and root `/`.
6. Go to **Actions → Update SFR Live Results Data → Run workflow**.
7. Open your GitHub Pages URL.

## Change source event

Edit the source URL in:

```text
.github/workflows/update-results.yml
```

Look for:

```yaml
SFR_SOURCE_URL: https://live.sfrautox.com/#N
```

Change `#N` to the view/event hash you need.

## Local test

```bash
npm install
npx playwright install chromium
npm run fetch:sfr
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Notes

GitHub Pages is static hosting, so the page itself cannot bypass CORS. The GitHub Action does the source fetch server-side and publishes a local JSON snapshot that the page can safely read.
