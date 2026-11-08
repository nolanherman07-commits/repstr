# REPSTR

Real estate deal analyzer, rental bookkeeping, and REPS / STR tax-savings tracker.

- **Deals** – analyze a property (price, loan, rent, cash flow, cash on cash, IRR), then move it to Active Rentals.
- **Active Rentals** – month-by-month bookkeeping for each rental, spreadsheet import, profit & loss.
- **Taxes** – estimated tax savings from your rentals (REPS, short-term rental, and "doesn't qualify" / passive rules,
  federal + all 50 states + DC, S corp / W-2 / 1099), write-offs, bonus depreciation, CPA actuals.
- **Home** – needs-attention list, tax savings, key numbers, charts.
- **CPA report** – Schedule E style summary per property per year (Print / Save PDF, CSV).
- **Hours log** – REPS / STR material participation hours with test progress.
- **What-if planner** – tax savings this year with and without one more purchase.
- **Tax savings check** – 5 questions on the first screen, one number.
- **Audit check** – green / yellow / red per property for the REPS / STR tests.
- **CPA package** – one PDF: cover, tax math, Schedule E, hours log.
- **How we calculate** – Info page with every rule, source and test.
- **Landing page** – the main address; the app lives at `/app/`. Screenshots are in `src/img/`.
- **STR loophole quiz**, **cost seg calculator**, **hours pace + calendar reminder**, quick **+ Log hours** button on phones.

It is a **static website**: plain HTML/CSS/JavaScript, no server, no database, no accounts, no API keys.
Each visitor's data is saved in their own browser (localStorage). "Download everything" saves one HTML file
with the app and all of the visitor's data, which can be opened later to get everything back.

> Estimates only – not tax advice. Confirm with a CPA.

© 2026 Nolan Herman. All rights reserved. See [LICENSE](LICENSE). No permission is granted to copy, modify or distribute this code.

---

## Project structure

```
repstr-site/
├── .github/workflows/deploy.yml   GitHub Actions: build + publish to GitHub Pages on every push to main
├── src/
│   ├── core_blank.js              the whole app (JavaScript) - blank starting data
│   ├── template.html              HTML/CSS shell the app is injected into
│   ├── themes.py                  color themes (navy is used)
│   ├── state.json                 sample data: 5-year simulation (3 properties)
│   ├── state_big.json             sample data: big investor (35 short-term rentals)
│   ├── state_s8.json              sample data: Section 8, 3 years
│   └── sim_ver.txt                storage version for the sample pages
├── build.py                       builds src/ -> dist/ (Python 3 standard library only)
├── check.js                       smoke test: opens every page in a headless browser, fails on any error
├── package.json                   npm scripts (build / test / start) + Playwright for the test
├── vercel.json                    Vercel settings (optional)
├── netlify.toml                   Netlify settings (optional)
├── .gitignore
└── README.md
```

`dist/` (the built website) is created by `build.py` and is **not** committed – every host rebuilds it.

Built pages:

| File | What it is |
|---|---|
| `index.html` | Landing page: savings check, STR quiz, screenshots, pricing, FAQ. |
| `app/index.html` | The app. Every visitor starts with an empty account in their own browser. |
| `simulation.html` | Sample: 5-year simulation with 3 properties |
| `simulation-big.html` | Sample: big investor, 35 short-term rentals |
| `simulation-section8.html` | Sample: Section 8, 3 years |
| `test-new.html` | Demo that never saves anything – every visit is a brand-new user |

## Requirements

- **Python 3.8+** – to build (no packages needed).
- **Node.js 18+** – only for the optional automated test (`npm test`).

## Run it on your computer

```bash
python3 build.py          # creates dist/
python3 -m http.server 8080 --directory dist
```

Then open http://localhost:8080. (You can also just double-click `dist/index.html`.)

With npm:

```bash
npm install               # installs Playwright (test only)
npm run setup             # downloads the test browser (one time)
npm test                  # build + open every page, fails on any error
npm start                 # serve dist/ at http://localhost:8080
```

## Deploy

### GitHub Pages (recommended – free)

1. Push this project to a GitHub repository (steps below).
2. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main` (or open **Actions → Deploy to GitHub Pages → Run workflow**).
4. Your site is live at `https://<your-username>.github.io/<repository-name>/` (the link also shows in the Actions run).

Every later push to `main` rebuilds and republishes automatically.

### Vercel

Import the repository at vercel.com → New Project. `vercel.json` already sets the build command
(`python3 build.py`) and output folder (`dist`). No environment variables are needed.

### Netlify

Import the repository at app.netlify.com → Add new site. `netlify.toml` already sets the build command and the `dist` folder.

### Any other static host

Run `python3 build.py` and upload the contents of `dist/`.

## Environment variables

None. The site has no backend, no API keys and no secrets, so there is no `.env` file.

## Your personal copy

If you keep a personal version of the app code as `src/core.js`, `build.py` also builds
`private/REPSTR_personal.html`. Both `src/core.js` and `private/` are in `.gitignore`, so they are never committed or deployed.

## Launch settings (fill these in when ready)

- **Custom domain:** create `src/CNAME` containing just the domain (for example `repstr.com`). The build copies it to the site
  and the link previews switch to the new address. Then add the domain under **Settings > Pages > Custom domain** on GitHub.
- **Visitor counts (GoatCounter):** set `GC_URL` near the top of the `LAND` section in `src/core_blank.js`
  to your GoatCounter count URL (for example `https://repstr.goatcounter.com/count`).
- **Early-access list (Formspree or similar):** set `FORM_URL` in `src/core_blank.js`. Until then, "Join early access"
  opens an email to the owner.

## Notes

- The page checks its own code when it loads and shows a "locked" message if the built file was edited by hand.
  Make changes in `src/` and rebuild.
- `src/core_blank.js` must stay plain ASCII (the build checks this).
- Cloud save works only inside Claude's artifact viewer. On GitHub Pages / Vercel / Netlify, data is saved in each visitor's browser.
  Visitors should use **Download everything** now and then as a backup.
