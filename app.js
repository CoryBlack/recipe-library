// ---------- Constants ----------
const CATEGORIES = ['Breakfast', 'Main Dishes', 'Side Dishes', 'Salads', 'Soups & Stews', 'Snacks',
  'Appetizers', 'Desserts', 'Baked Goods', 'Sauces & Dressings', 'Drinks', 'Other'];

// ---------- App state (beyond `state`/`settings` from storage.js) ----------
let editorDraft = null;        // working copy of the recipe being created/edited
let editorMode = 'create';     // 'create' | 'edit'
let currentEditorNote = '';
let currentDetailId = null;
let detailReturnTo = 'library'; // which view backFromDetail should return to
let lastPastedRawText = '';

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', init);

async function init() {
  wireEvents();
  if (!tryResumeDraft()) {
    renderLibrary();
    showView('view-library');
  }
  await refreshFromGitHub(true);
}

function onRemoteDataChanged() {
  const visibleId = ALL_VIEWS.find(v => !document.getElementById(v).hidden);
  if (visibleId === 'view-library') renderLibrary();
  else if (visibleId === 'view-favorites') renderFavorites();
  else if (visibleId === 'view-recipe-detail' && currentDetailId) {
    const r = state.recipes.find(x => x.id === currentDetailId);
    if (r) renderRecipeDetail(r);
  }
}

// ---------- Utilities ----------
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function moveArrayItem(arr, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

function focusLastInput(containerId) {
  const container = document.getElementById(containerId);
  const inputs = container.querySelectorAll('input, textarea');
  if (inputs.length) inputs[inputs.length - 1].focus();
}

// =====================================================================
// MODAL (duplicate warnings / choices)
// =====================================================================
function showModal(message, buttons) {
  document.getElementById('modalMessage').textContent = message;
  const actions = document.getElementById('modalActions');
  actions.innerHTML = '';
  buttons.forEach(b => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn' + (b.primary ? ' primary' : '');
    btn.textContent = b.label;
    btn.addEventListener('click', b.onClick);
    actions.appendChild(btn);
  });
  document.getElementById('modalOverlay').hidden = false;
}

function hideModal() {
  document.getElementById('modalOverlay').hidden = true;
}

// =====================================================================
// LIBRARY (home)
// =====================================================================
function recipeRowHtml(r) {
  const meta = [r.category].filter(Boolean).join(' · ');
  return `<div class="recipe-row" data-id="${r.id}">
    <div class="rr-info"><div class="rr-name">${escapeHtml(r.name)}</div><div class="rr-meta">${escapeHtml(meta)}</div></div>
    <span class="rr-star${r.favorite ? ' active' : ''}">${r.favorite ? '★' : ''}</span>
  </div>`;
}

function wireRecipeRows(container, returnTo) {
  container.querySelectorAll('.recipe-row').forEach(row => {
    row.addEventListener('click', () => openRecipeDetail(row.dataset.id, returnTo));
  });
}

function renderLibrary() {
  document.getElementById('librarySearch').value = '';
  document.getElementById('librarySearchResults').hidden = true;
  document.getElementById('libraryBrowse').hidden = false;

  const recent = [...state.recipes].sort((a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || '')).slice(0, 5);
  const recentBlock = document.getElementById('recentlyAddedBlock');
  if (recent.length) {
    recentBlock.hidden = false;
    document.getElementById('recentlyAddedList').innerHTML = recent.map(recipeRowHtml).join('');
    wireRecipeRows(document.getElementById('recentlyAddedList'), 'library');
  } else {
    recentBlock.hidden = true;
  }

  document.getElementById('allRecipesCount').textContent =
    `${state.recipes.length} recipe${state.recipes.length === 1 ? '' : 's'}`;

  renderCategoryList();
}

function renderCategoryList() {
  const box = document.getElementById('categoryList');
  box.innerHTML = CATEGORIES.map(cat => {
    const count = state.recipes.filter(r => r.category === cat).length;
    return `<div class="category-row" data-cat="${escapeHtml(cat)}">
      <span class="cat-name">${escapeHtml(cat)}</span>
      <span class="cat-count">${count}</span>
    </div>`;
  }).join('');
  box.querySelectorAll('.category-row').forEach(row => {
    row.addEventListener('click', () => {
      const cat = row.dataset.cat;
      openRecipeListView(cat, state.recipes.filter(r => r.category === cat));
    });
  });
}

function performLibrarySearch(q) {
  q = q.trim().toLowerCase();
  const resultsBox = document.getElementById('librarySearchResults');
  const browseBox = document.getElementById('libraryBrowse');
  if (!q) { resultsBox.hidden = true; browseBox.hidden = false; return; }
  browseBox.hidden = true; resultsBox.hidden = false;

  const matches = state.recipes.filter(r => {
    const hay = [r.name, r.category, ...(r.tags || []), ...(r.ingredients || [])].join(' ').toLowerCase();
    return hay.includes(q);
  }).sort((a, b) => {
    const an = a.name.toLowerCase().includes(q) ? 0 : 1;
    const bn = b.name.toLowerCase().includes(q) ? 0 : 1;
    if (an !== bn) return an - bn;
    return a.name.localeCompare(b.name);
  });

  resultsBox.innerHTML = matches.length
    ? matches.map(recipeRowHtml).join('')
    : `<div class="empty-state">No recipes match "${escapeHtml(q)}".</div>`;
  wireRecipeRows(resultsBox, 'library');
}

// =====================================================================
// GENERIC RECIPE LIST (category browse / all recipes)
// =====================================================================
function openRecipeListView(title, recipes) {
  document.getElementById('recipeListTitle').textContent = title;
  const box = document.getElementById('recipeListContent');
  const sorted = [...recipes].sort((a, b) => a.name.localeCompare(b.name));
  box.innerHTML = sorted.length
    ? sorted.map(recipeRowHtml).join('')
    : `<div class="empty-state">No recipes here yet.</div>`;
  wireRecipeRows(box, 'recipe-list');
  showView('view-recipe-list');
}

// =====================================================================
// FAVORITES
// =====================================================================
function renderFavorites() {
  const box = document.getElementById('favoritesList');
  const favs = state.recipes.filter(r => r.favorite).sort((a, b) => a.name.localeCompare(b.name));
  box.innerHTML = favs.length
    ? favs.map(recipeRowHtml).join('')
    : `<div class="empty-state">No favorites yet.<br>Tap the star on any recipe to add it here.</div>`;
  wireRecipeRows(box, 'favorites');
}

// =====================================================================
// RECIPE DETAIL
// =====================================================================
function openRecipeDetail(id, returnTo) {
  const r = state.recipes.find(x => x.id === id);
  if (!r) return;
  if (returnTo) detailReturnTo = returnTo;
  currentDetailId = id;
  renderRecipeDetail(r);
  showView('view-recipe-detail');
}

function sourceLineHtml(r) {
  if (r.sourceType === 'url' && r.sourceUrl) {
    return `<a href="${escapeHtml(r.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(r.sourceUrl)}</a>`;
  }
  if (r.sourceType === 'text') return 'Imported from pasted text (screenshot OCR).';
  return 'Added manually.';
}

function renderRecipeDetail(r) {
  const box = document.getElementById('detailContent');
  const tagsHtml = (r.tags || []).map(t => `<span class="detail-tag">${escapeHtml(t)}</span>`).join('');

  box.innerHTML = `
    <div class="detail-header">
      <div class="detail-meta-row" style="margin-top:0;margin-bottom:2px;">
        <button type="button" class="favorite-toggle${r.favorite ? ' active' : ''}" id="detailFavBtn" aria-label="Toggle favorite">${r.favorite ? '★' : '☆'}</button>
      </div>
      <div class="detail-name">${escapeHtml(r.name)}</div>
      <div class="detail-meta-row">
        <span class="detail-category">${escapeHtml(r.category || 'Other')}</span>
        ${tagsHtml}
        ${r.servings ? `<span class="detail-servings">Serves ${escapeHtml(r.servings)}</span>` : ''}
      </div>
    </div>

    ${r.ingredients && r.ingredients.length ? `
    <h3 class="section-label" style="margin-top:4px;">Ingredients</h3>
    <div id="detailIngredients">
      ${r.ingredients.map((ing, i) => `
        <label class="ingredient-line" data-i="${i}">
          <input type="checkbox" class="ing-check">
          <span>${escapeHtml(ing)}</span>
        </label>`).join('')}
    </div>` : ''}

    ${r.instructions && r.instructions.length ? `
    <h3 class="section-label">Instructions</h3>
    <div id="detailInstructions">
      ${r.instructions.map((step, i) => `
        <div class="instruction-step">
          <div class="step-num">${i + 1}</div>
          <div>${escapeHtml(step)}</div>
        </div>`).join('')}
    </div>` : ''}

    ${r.notes ? `<h3 class="section-label">Notes</h3><div class="detail-notes">${escapeHtml(r.notes)}</div>` : ''}

    <h3 class="section-label">Source</h3>
    <div class="detail-source">${sourceLineHtml(r)}</div>

    <div class="detail-footer-actions">
      <button type="button" class="btn small" id="editRecipeBtn">Edit</button>
      <button type="button" class="btn small danger" id="deleteRecipeBtn">Delete</button>
    </div>
  `;

  document.getElementById('detailFavBtn').addEventListener('click', () => toggleFavorite(r.id));
  box.querySelectorAll('.ing-check').forEach(cb => {
    cb.addEventListener('change', () => cb.closest('.ingredient-line').classList.toggle('checked', cb.checked));
  });
  document.getElementById('editRecipeBtn').addEventListener('click', () => openEditorForExisting(r.id));
  document.getElementById('deleteRecipeBtn').addEventListener('click', () => deleteRecipe(r.id));
}

function toggleFavorite(id) {
  const r = state.recipes.find(x => x.id === id);
  if (!r) return;
  r.favorite = !r.favorite;
  r.dateModified = new Date().toISOString();
  saveLocalData();
  persist();
  // Update the star in place rather than re-rendering the whole detail view —
  // a full re-render would wipe out any ingredient checkboxes ticked mid-cook.
  const btn = document.getElementById('detailFavBtn');
  if (btn) {
    btn.classList.toggle('active', r.favorite);
    btn.textContent = r.favorite ? '★' : '☆';
  }
}

function deleteRecipe(id) {
  if (!confirm('Delete this recipe? This cannot be undone.')) return;
  state.recipes = state.recipes.filter(r => r.id !== id);
  saveLocalData();
  persist();
  renderLibrary();
  showView('view-library');
}

// =====================================================================
// ADD: FROM LINK
// =====================================================================
async function importUrlFlow() {
  const url = document.getElementById('importUrlInput').value.trim();
  if (!url) return;
  const norm = normalizeUrl(url);
  const existing = state.recipes.find(r => r.sourceType === 'url' && r.sourceUrl && normalizeUrl(r.sourceUrl) === norm);
  if (existing) {
    showModal('This recipe/source may already be in your library.', [
      { label: 'Open Existing', onClick: () => { hideModal(); openRecipeDetail(existing.id, 'library'); } },
      { label: 'Import Anyway', primary: true, onClick: () => { hideModal(); runUrlImport(url); } }
    ]);
    return;
  }
  runUrlImport(url);
}

async function runUrlImport(url) {
  const statusEl = document.getElementById('importUrlStatus');
  const btn = document.getElementById('importUrlBtn');
  statusEl.textContent = 'Fetching and parsing…';
  btn.disabled = true;
  try {
    const result = await importFromUrl(url);
    if (!result.ingredients.length && !result.instructions.length) {
      statusEl.textContent = 'Could not find ingredients or instructions on that page (some sites block automated fetching). Try "Paste Text" or "Enter Manually" instead.';
      return;
    }
    statusEl.textContent = '';
    openEditorFromExtraction(result, 'url');
  } catch (e) {
    console.warn('URL import failed', e);
    statusEl.textContent = 'Could not fetch or parse that page. You can try again, or use "Paste Text" / "Enter Manually" instead.';
  } finally {
    btn.disabled = false;
  }
}

// =====================================================================
// ADD: PASTE TEXT
// =====================================================================
function parsePasteFlow() {
  const text = document.getElementById('pasteTextInput').value;
  if (!text.trim()) { alert('Paste some recipe text first.'); return; }
  lastPastedRawText = text;
  const result = parsePastedText(text);
  openEditorFromExtraction(result, 'text');
}

// =====================================================================
// SHARED EDITOR (manual entry / import preview / edit existing)
// =====================================================================
function emptyDraft() {
  return {
    id: null, name: '', category: 'Other', tags: [], ingredients: [''], instructions: [''],
    servings: '', notes: '', sourceType: 'manual', sourceUrl: '', sourceText: '',
    favorite: false, dateAdded: null, dateModified: null
  };
}

function buildExtractionNote(result) {
  const missing = [];
  if (!result.fieldsFound.ingredients) missing.push('ingredients');
  if (!result.fieldsFound.instructions) missing.push('instructions');
  let base;
  if (result.extractionMethod === 'jsonld') {
    base = 'Imported using structured recipe data found on the page — should be accurate, but please double-check.';
  } else if (result.extractionMethod === 'heuristic') {
    base = "This page didn't have structured recipe data, so this was extracted using best-effort parsing — please review carefully.";
  } else {
    base = 'Parsed from your pasted text using line-pattern matching — please review and fix anything misplaced.';
  }
  if (missing.length) base += ` No ${missing.join(' or ')} were found — please add them below.`;
  return base;
}

function openManualEntry() {
  editorDraft = emptyDraft();
  editorMode = 'create';
  openEditorView('New Recipe', '');
}

function openEditorFromExtraction(result, sourceType) {
  const category = suggestCategory((result.name || '') + ' ' + (result.categoryHint || ''), result.ingredients, result.instructions);
  const mergedTags = [...(result.tagHints || []), ...suggestTags(result.name, result.ingredients)];
  const seenTags = new Set();
  const tags = [];
  mergedTags.forEach(t => {
    const key = t.toLowerCase();
    if (!seenTags.has(key)) { seenTags.add(key); tags.push(t); }
  });
  tags.length = Math.min(tags.length, 6);
  editorDraft = {
    id: null,
    name: result.name || '',
    category,
    tags,
    ingredients: result.ingredients && result.ingredients.length ? result.ingredients : [''],
    instructions: result.instructions && result.instructions.length ? result.instructions : [''],
    servings: result.servings || '',
    notes: '',
    sourceType,
    sourceUrl: result.sourceUrl || '',
    sourceText: sourceType === 'text' ? lastPastedRawText : '',
    favorite: false,
    dateAdded: null, dateModified: null
  };
  editorMode = 'create';
  openEditorView('Review & Save', buildExtractionNote(result));
}

function openEditorForExisting(id) {
  const r = state.recipes.find(x => x.id === id);
  if (!r) return;
  editorDraft = JSON.parse(JSON.stringify(r));
  if (!editorDraft.ingredients.length) editorDraft.ingredients = [''];
  if (!editorDraft.instructions.length) editorDraft.instructions = [''];
  editorMode = 'edit';
  openEditorView('Edit Recipe', '');
}

function openEditorView(title, note) {
  currentEditorNote = note || '';
  document.getElementById('editorTitle').textContent = title;
  VIEW_TITLES['view-editor'] = title;
  const noteEl = document.getElementById('editorExtractionNote');
  if (currentEditorNote) { noteEl.hidden = false; noteEl.textContent = currentEditorNote; }
  else { noteEl.hidden = true; noteEl.textContent = ''; }

  document.getElementById('editName').value = editorDraft.name || '';
  const catSel = document.getElementById('editCategory');
  catSel.innerHTML = CATEGORIES.map(c => `<option value="${escapeHtml(c)}" ${c === editorDraft.category ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
  document.getElementById('editServings').value = editorDraft.servings || '';
  document.getElementById('editNotes').value = editorDraft.notes || '';
  document.getElementById('editSourceUrl').value = editorDraft.sourceUrl || '';
  document.getElementById('editFavorite').checked = !!editorDraft.favorite;

  renderTagEditor();
  renderIngredientsEditor();
  renderInstructionsEditor();

  saveEditorDraftLocal();
  showView('view-editor');
}

function saveEditorDraftLocal() {
  saveDraft({ mode: editorMode, data: editorDraft, note: currentEditorNote, title: document.getElementById('editorTitle').textContent });
}

function tryResumeDraft() {
  const d = loadDraft();
  if (d && d.data) {
    editorDraft = d.data;
    editorMode = d.mode || 'create';
    openEditorView(d.title || (editorMode === 'edit' ? 'Edit Recipe' : 'New Recipe'), d.note || '');
    return true;
  }
  return false;
}

function renderTagEditor() {
  const chipsBox = document.getElementById('editTagChips');
  chipsBox.innerHTML = (editorDraft.tags || []).map(t =>
    `<span class="chip removable">${escapeHtml(t)}<button type="button" data-tag="${escapeHtml(t)}" aria-label="Remove tag">✕</button></span>`
  ).join('');
  chipsBox.querySelectorAll('button[data-tag]').forEach(btn => {
    btn.addEventListener('click', () => {
      editorDraft.tags = editorDraft.tags.filter(t => t !== btn.dataset.tag);
      renderTagEditor();
      saveEditorDraftLocal();
    });
  });

  const allKnownTags = Array.from(new Set(state.recipes.flatMap(r => r.tags || []))).sort();
  const suggestions = allKnownTags.filter(t => !(editorDraft.tags || []).includes(t)).slice(0, 12);
  const sugBox = document.getElementById('editTagSuggestions');
  sugBox.innerHTML = suggestions.map(t => `<span class="chip suggestion" data-tag="${escapeHtml(t)}">+ ${escapeHtml(t)}</span>`).join('');
  sugBox.querySelectorAll('.suggestion').forEach(chip => {
    chip.addEventListener('click', () => {
      if (!editorDraft.tags.includes(chip.dataset.tag)) editorDraft.tags.push(chip.dataset.tag);
      renderTagEditor();
      saveEditorDraftLocal();
    });
  });
}

function renderIngredientsEditor() {
  const box = document.getElementById('editIngredientsList');
  box.innerHTML = editorDraft.ingredients.map((ing, i) => `
    <div class="edit-row" data-i="${i}">
      <input type="text" class="edit-row-input ing-input" data-i="${i}" value="${escapeHtml(ing)}" placeholder="e.g. 2 cups flour">
      <div class="edit-row-actions">
        <button type="button" class="up-btn" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
        <button type="button" class="down-btn" data-i="${i}" ${i === editorDraft.ingredients.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
        <button type="button" class="remove-btn" data-i="${i}" aria-label="Remove">✕</button>
      </div>
    </div>`).join('');
  box.querySelectorAll('.ing-input').forEach(inp => {
    inp.addEventListener('input', () => { editorDraft.ingredients[Number(inp.dataset.i)] = inp.value; saveEditorDraftLocal(); });
  });
  box.querySelectorAll('.up-btn').forEach(btn => btn.addEventListener('click', () => {
    moveArrayItem(editorDraft.ingredients, Number(btn.dataset.i), -1); renderIngredientsEditor(); saveEditorDraftLocal();
  }));
  box.querySelectorAll('.down-btn').forEach(btn => btn.addEventListener('click', () => {
    moveArrayItem(editorDraft.ingredients, Number(btn.dataset.i), 1); renderIngredientsEditor(); saveEditorDraftLocal();
  }));
  box.querySelectorAll('.remove-btn').forEach(btn => btn.addEventListener('click', () => {
    editorDraft.ingredients.splice(Number(btn.dataset.i), 1);
    if (!editorDraft.ingredients.length) editorDraft.ingredients.push('');
    renderIngredientsEditor(); saveEditorDraftLocal();
  }));
}

function renderInstructionsEditor() {
  const box = document.getElementById('editInstructionsList');
  box.innerHTML = editorDraft.instructions.map((step, i) => `
    <div class="edit-row" data-i="${i}">
      <textarea class="edit-row-input instr-input" data-i="${i}" rows="2" placeholder="Step ${i + 1}">${escapeHtml(step)}</textarea>
      <div class="edit-row-actions">
        <button type="button" class="up-btn" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
        <button type="button" class="down-btn" data-i="${i}" ${i === editorDraft.instructions.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
        <button type="button" class="remove-btn" data-i="${i}" aria-label="Remove">✕</button>
      </div>
    </div>`).join('');
  box.querySelectorAll('.instr-input').forEach(inp => {
    inp.addEventListener('input', () => { editorDraft.instructions[Number(inp.dataset.i)] = inp.value; saveEditorDraftLocal(); });
  });
  box.querySelectorAll('.up-btn').forEach(btn => btn.addEventListener('click', () => {
    moveArrayItem(editorDraft.instructions, Number(btn.dataset.i), -1); renderInstructionsEditor(); saveEditorDraftLocal();
  }));
  box.querySelectorAll('.down-btn').forEach(btn => btn.addEventListener('click', () => {
    moveArrayItem(editorDraft.instructions, Number(btn.dataset.i), 1); renderInstructionsEditor(); saveEditorDraftLocal();
  }));
  box.querySelectorAll('.remove-btn').forEach(btn => btn.addEventListener('click', () => {
    editorDraft.instructions.splice(Number(btn.dataset.i), 1);
    if (!editorDraft.instructions.length) editorDraft.instructions.push('');
    renderInstructionsEditor(); saveEditorDraftLocal();
  }));
}

function cancelEditor() {
  const hasContent = editorDraft && (editorDraft.name.trim()
    || editorDraft.ingredients.some(x => x.trim()) || editorDraft.instructions.some(x => x.trim()));
  if (hasContent && !confirm('Discard this recipe? Any unsaved changes will be lost.')) return;
  const wasEditingId = editorMode === 'edit' ? editorDraft.id : null;
  editorDraft = null;
  clearDraft();
  if (wasEditingId) openRecipeDetail(wasEditingId, detailReturnTo);
  else { renderLibrary(); showView('view-library'); }
}

function saveEditor(forceSkipSimilarityCheck) {
  const draft = editorDraft;
  draft.name = document.getElementById('editName').value.trim();
  if (!draft.name) { alert('Please enter a recipe name.'); return; }
  draft.category = document.getElementById('editCategory').value;
  draft.servings = document.getElementById('editServings').value.trim();
  draft.notes = document.getElementById('editNotes').value.trim();
  draft.sourceUrl = document.getElementById('editSourceUrl').value.trim();
  draft.favorite = document.getElementById('editFavorite').checked;
  draft.ingredients = draft.ingredients.map(s => s.trim()).filter(Boolean);
  draft.instructions = draft.instructions.map(s => s.trim()).filter(Boolean);

  if (!forceSkipSimilarityCheck) {
    const similar = state.recipes.find(r => r.id !== draft.id && titleSimilarity(r.name, draft.name) >= 0.6);
    if (similar) {
      showModal(`A recipe with a similar name already exists: "${similar.name}". Save anyway?`, [
        { label: 'Go Back', onClick: hideModal },
        { label: 'Save Anyway', primary: true, onClick: () => { hideModal(); saveEditor(true); } }
      ]);
      return;
    }
  }

  const now = new Date().toISOString();
  if (editorMode === 'create') {
    draft.id = draft.id || uuid();
    draft.dateAdded = now;
    draft.dateModified = now;
    state.recipes.push(draft);
  } else {
    const idx = state.recipes.findIndex(r => r.id === draft.id);
    draft.dateModified = now;
    if (idx !== -1) state.recipes[idx] = draft; else state.recipes.push(draft);
  }
  saveLocalData();
  const savedId = draft.id;
  editorDraft = null;
  clearDraft();
  persist();
  openRecipeDetail(savedId, 'library');
}

// =====================================================================
// SETTINGS
// =====================================================================
function openSettings() {
  document.getElementById('ghUser').value = settings.ghUser || '';
  document.getElementById('ghRepo').value = settings.ghRepo || '';
  document.getElementById('ghBranch').value = settings.ghBranch || 'main';
  document.getElementById('ghToken').value = settings.ghToken || '';
  document.getElementById('settingsStatus').textContent = '';
  showView('view-settings');
}

async function saveSettingsFromForm() {
  settings.ghUser = document.getElementById('ghUser').value.trim();
  settings.ghRepo = document.getElementById('ghRepo').value.trim();
  settings.ghBranch = document.getElementById('ghBranch').value.trim() || 'main';
  settings.ghToken = document.getElementById('ghToken').value.trim();
  saveSettings();
  document.getElementById('settingsStatus').textContent = 'Saved. Syncing…';
  localStorage.removeItem(LS_SHA);
  await refreshFromGitHub(true);
  document.getElementById('settingsStatus').textContent = 'Saved.';
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `recipe-data-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// =====================================================================
// VIEW SWITCHING
// =====================================================================
const ALL_VIEWS = ['view-library', 'view-favorites', 'view-recipe-list', 'view-recipe-detail',
  'view-add', 'view-add-link', 'view-add-paste', 'view-editor', 'view-settings'];
const TOP_LEVEL_VIEWS = ['view-library', 'view-favorites', 'view-add'];
const VIEW_TO_TAB = { 'view-library': 'library', 'view-favorites': 'favorites', 'view-add': 'add' };
const VIEW_TITLES = {
  'view-library': 'Recipe Library', 'view-favorites': 'Favorites', 'view-recipe-list': 'Recipes',
  'view-recipe-detail': 'Recipe', 'view-add': 'Add Recipe', 'view-add-link': 'From Link',
  'view-add-paste': 'Paste Text', 'view-editor': 'Edit Recipe', 'view-settings': 'Settings'
};

function showView(id) {
  ALL_VIEWS.forEach(v => { document.getElementById(v).hidden = (v !== id); });
  document.getElementById('pageTitle').textContent = VIEW_TITLES[id] || 'Recipe Library';
  document.getElementById('mainTabs').hidden = !TOP_LEVEL_VIEWS.includes(id);
  if (TOP_LEVEL_VIEWS.includes(id)) setActiveTab(id);
  window.scrollTo(0, 0);
}

function setActiveTab(id) {
  const tab = VIEW_TO_TAB[id];
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
}

// =====================================================================
// WIRE EVENTS
// =====================================================================
function wireEvents() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab === 'library') { renderLibrary(); showView('view-library'); }
      else if (tab === 'favorites') { renderFavorites(); showView('view-favorites'); }
      else if (tab === 'add') { showView('view-add'); }
    });
  });

  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('backFromSettings').addEventListener('click', () => { renderLibrary(); showView('view-library'); });

  // Library
  document.getElementById('librarySearch').addEventListener('input', e => performLibrarySearch(e.target.value));
  document.getElementById('allRecipesBtn').addEventListener('click', () => openRecipeListView('All Recipes', state.recipes));
  document.getElementById('randomRecipeBtn').addEventListener('click', () => {
    if (!state.recipes.length) { alert('No recipes saved yet!'); return; }
    const r = state.recipes[Math.floor(Math.random() * state.recipes.length)];
    openRecipeDetail(r.id, 'library');
  });
  document.getElementById('backFromRecipeList').addEventListener('click', () => { renderLibrary(); showView('view-library'); });

  // Detail
  document.getElementById('backFromDetail').addEventListener('click', () => {
    if (detailReturnTo === 'favorites') { renderFavorites(); showView('view-favorites'); }
    else if (detailReturnTo === 'recipe-list') { showView('view-recipe-list'); }
    else { renderLibrary(); showView('view-library'); }
  });

  // Add chooser
  document.getElementById('addFromLinkBtn').addEventListener('click', () => {
    document.getElementById('importUrlInput').value = '';
    document.getElementById('importUrlStatus').textContent = '';
    showView('view-add-link');
  });
  document.getElementById('addFromPasteBtn').addEventListener('click', () => {
    document.getElementById('pasteTextInput').value = '';
    showView('view-add-paste');
  });
  document.getElementById('addManualBtn').addEventListener('click', openManualEntry);

  // Add: from link
  document.getElementById('backFromAddLink').addEventListener('click', () => showView('view-add'));
  document.getElementById('importUrlBtn').addEventListener('click', importUrlFlow);
  document.getElementById('importUrlInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); importUrlFlow(); }
  });

  // Add: paste text
  document.getElementById('backFromAddPaste').addEventListener('click', () => showView('view-add'));
  document.getElementById('parsePasteBtn').addEventListener('click', parsePasteFlow);

  // Editor
  document.getElementById('backFromEditor').addEventListener('click', cancelEditor);
  document.getElementById('cancelEditorBtn').addEventListener('click', cancelEditor);
  document.getElementById('saveRecipeBtn').addEventListener('click', () => saveEditor(false));
  document.getElementById('editName').addEventListener('input', () => { editorDraft.name = document.getElementById('editName').value; saveEditorDraftLocal(); });
  document.getElementById('editCategory').addEventListener('change', () => { editorDraft.category = document.getElementById('editCategory').value; saveEditorDraftLocal(); });
  document.getElementById('editServings').addEventListener('input', () => { editorDraft.servings = document.getElementById('editServings').value; saveEditorDraftLocal(); });
  document.getElementById('editNotes').addEventListener('input', () => { editorDraft.notes = document.getElementById('editNotes').value; saveEditorDraftLocal(); });
  document.getElementById('editSourceUrl').addEventListener('input', () => { editorDraft.sourceUrl = document.getElementById('editSourceUrl').value; saveEditorDraftLocal(); });
  document.getElementById('editFavorite').addEventListener('change', () => { editorDraft.favorite = document.getElementById('editFavorite').checked; saveEditorDraftLocal(); });
  document.getElementById('editTagInput').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const input = e.target;
    const val = input.value.trim();
    if (!val) return;
    if (!editorDraft.tags.some(t => t.toLowerCase() === val.toLowerCase())) editorDraft.tags.push(val);
    input.value = '';
    renderTagEditor();
    saveEditorDraftLocal();
  });
  document.getElementById('addIngredientBtn').addEventListener('click', () => {
    editorDraft.ingredients.push(''); renderIngredientsEditor(); saveEditorDraftLocal(); focusLastInput('editIngredientsList');
  });
  document.getElementById('addInstructionBtn').addEventListener('click', () => {
    editorDraft.instructions.push(''); renderInstructionsEditor(); saveEditorDraftLocal(); focusLastInput('editInstructionsList');
  });

  // Settings
  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettingsFromForm);
  document.getElementById('syncNowBtn').addEventListener('click', () => refreshFromGitHub(false));
  document.getElementById('exportBtn').addEventListener('click', exportData);

  window.addEventListener('online', () => { if (localStorage.getItem(LS_PENDING)) ghPushLocal(); });
}

// ---------- Service worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
