// ---------- Storage keys ----------
const LS_DATA = 'recipe-data-v1';
const LS_SHA = 'recipe-data-sha';
const LS_SETTINGS = 'recipe-settings-v1';
const LS_PENDING = 'recipe-pending-sync';
const LS_DRAFT = 'recipe-draft-v1'; // in-progress add/edit form, saved after every edit so it survives a reload

// ---------- State ----------
let state = loadLocalData();
let settings = loadSettings();

function loadLocalData() {
  try {
    const raw = localStorage.getItem(LS_DATA);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.warn('local data parse failed', e); }
  return { recipes: [] };
}

function saveLocalData() {
  localStorage.setItem(LS_DATA, JSON.stringify(state));
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { ghUser: '', ghRepo: '', ghBranch: 'main', ghToken: '' };
}

function saveSettings() {
  localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
}

function ghConfigured() {
  return !!(settings.ghUser && settings.ghRepo && settings.ghToken);
}

// ---------- Draft persistence (in-progress add/edit form) ----------
function saveDraft(draft) {
  if (!draft) { localStorage.removeItem(LS_DRAFT); return; }
  localStorage.setItem(LS_DRAFT, JSON.stringify(draft));
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(LS_DRAFT);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { console.warn('draft parse failed', e); return null; }
}

function clearDraft() {
  localStorage.removeItem(LS_DRAFT);
}

// ---------- GitHub sync ----------
function ghApiUrl() {
  const path = 'data.json';
  return `https://api.github.com/repos/${settings.ghUser}/${settings.ghRepo}/contents/${path}`;
}

function b64EncodeUnicode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function b64DecodeUnicode(str) {
  return decodeURIComponent(escape(atob(str)));
}

async function ghFetchRemote() {
  const branch = settings.ghBranch || 'main';
  const res = await fetch(`${ghApiUrl()}?ref=${encodeURIComponent(branch)}&_=${Date.now()}`, {
    headers: {
      'Authorization': `Bearer ${settings.ghToken}`,
      'Accept': 'application/vnd.github+json'
    }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET failed: ${res.status}`);
  const json = await res.json();
  const content = JSON.parse(b64DecodeUnicode(json.content.replace(/\n/g, '')));
  localStorage.setItem(LS_SHA, json.sha);
  return content;
}

async function ghPushLocal() {
  if (!ghConfigured()) return;
  setSyncStatus('pending', 'Saving…');
  try {
    const sha = localStorage.getItem(LS_SHA) || undefined;
    const body = {
      message: `Update recipe data — ${new Date().toISOString()}`,
      content: b64EncodeUnicode(JSON.stringify(state, null, 2)),
      branch: settings.ghBranch || 'main'
    };
    if (sha) body.sha = sha;
    const res = await fetch(ghApiUrl(), {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${settings.ghToken}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (res.status === 409 || res.status === 422) {
      const remote = await ghFetchRemote();
      setSyncStatus('error', 'Sync conflict — reloaded latest from GitHub. Please redo your last change.');
      if (remote) {
        state = remote;
        saveLocalData();
        if (typeof onRemoteDataChanged === 'function') onRemoteDataChanged();
      }
      localStorage.removeItem(LS_PENDING);
      return;
    }
    if (!res.ok) throw new Error(`GitHub PUT failed: ${res.status}`);
    const json = await res.json();
    localStorage.setItem(LS_SHA, json.content.sha);
    localStorage.removeItem(LS_PENDING);
    setSyncStatus('ok', 'Synced');
  } catch (e) {
    console.warn('push failed', e);
    localStorage.setItem(LS_PENDING, '1');
    setSyncStatus('error', 'Offline — will retry');
  }
}

async function refreshFromGitHub(initial) {
  if (!ghConfigured()) {
    setSyncStatus('pending', 'Not configured');
    return;
  }
  if (localStorage.getItem(LS_PENDING)) {
    await ghPushLocal();
    return;
  }
  setSyncStatus('pending', 'Syncing…');
  try {
    const remote = await ghFetchRemote();
    if (remote) {
      state = remote;
      saveLocalData();
      if (typeof onRemoteDataChanged === 'function') onRemoteDataChanged();
      setSyncStatus('ok', 'Synced');
    } else if (initial) {
      await ghPushLocal();
    }
  } catch (e) {
    console.warn('refresh failed', e);
    setSyncStatus('error', 'Offline (using cached data)');
  }
}

function setSyncStatus(cls, text) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  el.className = cls;
  const textEl = document.getElementById('syncStatusText');
  if (textEl) textEl.textContent = text;
}

async function persist() {
  saveLocalData();
  await ghPushLocal();
}
