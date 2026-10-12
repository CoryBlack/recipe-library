# Recipe Library

A personal recipe library: import recipes from a URL, from pasted screenshot text, or type
them in by hand — every recipe ends up in the same clean, structured format. No backend, no
App Store — it's a static web app you install to your phone's home screen (PWA), and it
stores your data in a private GitHub repo via the GitHub API.

Everything here is free: no AI API, no server, no accounts beyond GitHub.

## How importing works

- **From Link** — paste a recipe URL. The app fetches the page (through a public CORS proxy,
  since browsers can't fetch arbitrary third-party sites directly) and looks for the
  structured `Recipe` data (JSON-LD/Schema.org) that most real recipe sites embed for Google's
  search rich-snippets. If that's missing, it falls back to best-effort HTML parsing
  (ingredient/instruction headings, common class names, microdata).
- **Paste Text** — for a screenshot or photo: use your phone's built-in text recognition
  (iPhone: long-press the photo → Select Text / Live Text → Copy; Android: Google Lens) to
  copy the recipe text, then paste it in. The app splits it into title/ingredients/
  instructions using line patterns (bullets, numbered steps, quantity/unit matching,
  "Ingredients"/"Instructions" headings) and dedupes overlapping lines if you paste text from
  multiple overlapping screenshots.
- **Enter Manually** — just type it in.

Every import path ends at the same editable preview screen before anything is saved, since
automatic parsing will never be perfect.

## How storage works

- Your recipes live in `data.json` inside a **private** GitHub repo you create (kept separate
  from this app's code repo, which has to stay public for free GitHub Pages).
- The app talks to that repo directly from your phone's browser using a **fine-grained
  personal access token** scoped only to that one repo. The token is stored only in the
  browser's local storage — it's never sent anywhere except `api.github.com`.
- A local cache (also in the browser) means the app loads instantly and still works offline;
  it syncs to GitHub in the background and retries automatically once you're back online.
- Every save is a git commit, so your recipe history has a full version log for free.

## One-time setup

### 1. Create two repos on GitHub

- **App repo** (public) — e.g. `recipe-library`. This hosts the app itself via GitHub Pages.
- **Data repo** (private) — e.g. `recipe-data`. This holds nothing but your `data.json`; the
  app creates that file automatically on first sync.

### 2. Push this code to the app repo, enable Pages

```bash
cd RecipeLibrary
git init
git add .
git commit -m "Initial recipe library"
git branch -M main
git remote add origin https://github.com/<you>/recipe-library.git
git push -u origin main
```

Then in the app repo on GitHub: **Settings → Pages → Source: Deploy from branch → main → /(root)**.
Your app will be live at `https://<you>.github.io/recipe-library/` within a minute or two.

### 3. Create a fine-grained personal access token

Go to **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
→ Generate new token**.

- Resource owner: your account
- Repository access: **Only select repositories** → pick your `recipe-data` repo
- Permissions: **Contents → Read and write**
- Generate, and copy the token (starts with `github_pat_…`) — you won't see it again.

### 4. Install the app on your phone

Open the Pages URL in Safari/Chrome → Share → **Add to Home Screen**. It'll launch
full-screen, no browser UI, like a real app.

### 5. Connect it to your data repo

Open the app → tap the ⚙︎ settings icon → fill in:

- GitHub username
- Data repo name (`recipe-data`)
- Branch (`main`)
- The token from step 3

Tap **Save**. The sync dot at the top turns green once it's connected.

## Using it

Three tabs, always available:

- **Library** (home): search bar, Recently Added, "All Recipes", a random-recipe picker, and
  your categories with counts. Tap a category to browse just those recipes.
- **Favorites**: everything you've starred, in one place.
- **+ Add**: choose From Link / Paste Text / Enter Manually. Every path ends at an editable
  preview before saving.

Tap any recipe to open it: ingredients with checkboxes you can tap off while cooking (this
state is temporary and resets each time you reopen the recipe — it's just a cooking aid, not
saved data), clearly separated numbered instructions, your notes, and a link back to the
original source. Edit and Delete are there but kept out of the way at the bottom.

If you're in the middle of adding or editing a recipe and the app gets reloaded or closed, it
picks up right where you left off instead of losing your work.

## Duplicate protection

- Importing a URL that's already in your library warns you before fetching anything, with the
  choice to open the existing recipe instead.
- Saving a recipe with a name very similar to one you already have gives a non-blocking
  warning — you can save anyway if it's genuinely a different recipe.

Nothing is ever auto-merged or auto-deleted.

## Notes / limitations

- This is intentionally single-user and low-ceremony — no accounts, no server, no AI.
- URL parsing depends on a free public CORS proxy being reachable; if one is down the app
  tries a second one automatically. If both fail, use Paste Text or Enter Manually instead.
- The "Paste Text" parser is heuristic (pattern-based, not AI) — it handles common formats
  well (bulleted ingredients, numbered steps, clear headings) but isn't perfect. That's what
  the preview/edit screen is for.
- If you ever edit data from two devices while offline at the same time, the second sync will
  detect the conflict, pull the latest from GitHub, and ask you to redo your last change
  rather than silently overwriting anything.
