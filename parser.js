// =====================================================================
// Shared text utilities
// =====================================================================
function stripHtmlToText(html) {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent.replace(/\s+/g, ' ').trim();
}

function cleanLine(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

function normalizeForCompare(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeUrl(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    // Strip common tracking params so the same recipe with different UTM tags still matches.
    const dropPrefixes = ['utm_', 'fbclid', 'gclid', 'ref', 'ref_'];
    [...url.searchParams.keys()].forEach(k => {
      if (dropPrefixes.some(p => k.toLowerCase().startsWith(p))) url.searchParams.delete(k);
    });
    let s = url.origin.toLowerCase() + url.pathname.replace(/\/+$/, '').toLowerCase();
    const qs = url.searchParams.toString();
    if (qs) s += '?' + qs;
    return s;
  } catch (e) {
    return (u || '').trim().toLowerCase();
  }
}

function titleSimilarity(a, b) {
  const na = normalizeForCompare(a), nb = normalizeForCompare(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const wa = new Set(na.split(' ').filter(w => w.length > 2));
  const wb = new Set(nb.split(' ').filter(w => w.length > 2));
  if (!wa.size || !wb.size) return 0;
  let shared = 0;
  wa.forEach(w => { if (wb.has(w)) shared++; });
  return shared / Math.max(wa.size, wb.size);
}

// =====================================================================
// Category suggestion — simple keyword scoring against fixed category list
// =====================================================================
const CATEGORY_KEYWORDS = {
  'Breakfast': ['pancake', 'waffle', 'oatmeal', 'omelet', 'omelette', 'breakfast', 'granola', 'french toast', 'hash brown', 'bacon and egg', 'scramble', 'brunch'],
  'Main Dishes': ['chicken breast', 'dinner', 'casserole', 'main course', 'entree', 'steak', 'roast', 'meatloaf', 'stir fry', 'stir-fry', 'curry', 'pasta', 'lasagna', 'taco', 'burrito', 'pizza'],
  'Side Dishes': ['side dish', 'mashed potato', 'roasted vegetable', 'rice pilaf', 'stuffing'],
  'Salads': ['salad', 'coleslaw', 'slaw'],
  'Soups & Stews': ['soup', 'stew', 'chili', 'broth', 'bisque', 'chowder'],
  'Snacks': ['snack', 'trail mix', 'popcorn', 'granola bar', 'energy ball'],
  'Appetizers': ['appetizer', 'dip', 'starter', 'finger food', 'bruschetta', 'hors d'],
  'Desserts': ['dessert', 'ice cream', 'pudding', 'mousse', 'tart', 'pie', 'cheesecake', 'custard'],
  'Baked Goods': ['cookie', 'cake', 'bread', 'muffin', 'brownie', 'scone', 'biscuit', 'pastry', 'bun', 'loaf', 'baking'],
  'Sauces & Dressings': ['sauce', 'dressing', 'marinade', 'glaze', 'condiment', 'salsa', 'gravy'],
  'Drinks': ['smoothie', 'cocktail', 'drink', 'juice', 'beverage', 'latte', 'lemonade', 'punch', 'mocktail']
};

function suggestCategory(name, ingredients, instructions) {
  const text = [name, ...(ingredients || []), ...(instructions || [])].join(' ').toLowerCase();
  let best = null, bestScore = 0;
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    keywords.forEach(kw => {
      if (text.includes(kw)) score += (name && name.toLowerCase().includes(kw)) ? 2 : 1;
    });
    if (score > bestScore) { bestScore = score; best = cat; }
  }
  return best || 'Other';
}

function suggestTags(name, ingredients) {
  const text = [name, ...(ingredients || [])].join(' ').toLowerCase();
  const candidates = {
    'Chicken': ['chicken'], 'Beef': ['beef', 'steak', 'ground beef'], 'Pork': ['pork', 'bacon', 'ham'],
    'Seafood': ['shrimp', 'salmon', 'fish', 'crab', 'scallop'], 'Pasta': ['pasta', 'noodle', 'spaghetti'],
    'Vegetarian': [], 'Chocolate': ['chocolate', 'cocoa'], 'Spicy': ['chili', 'jalape', 'cayenne', 'sriracha'],
    'Quick': [], 'Slow Cooker': ['slow cooker', 'crock pot', 'crockpot'], 'Air Fryer': ['air fryer', 'air-fryer'],
    'One Pot': ['one pot', 'one-pot', 'sheet pan']
  };
  const tags = [];
  for (const [tag, keywords] of Object.entries(candidates)) {
    if (keywords.some(kw => text.includes(kw))) tags.push(tag);
  }
  return tags;
}

// =====================================================================
// URL import — JSON-LD first, heuristic HTML fallback
// =====================================================================
// corsproxy.io now requires a paid API key, so it's not usable here — allorigins and
// codetabs are both free, keyless proxies as of this writing. Free public proxies can be
// flaky or rate-limited, and some sites block scraper traffic outright regardless of which
// proxy is used — that's why there are two fallbacks, and why Paste Text / Enter Manually
// exist as a backstop when neither works.
const CORS_PROXIES = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
];

async function fetchHtmlViaProxies(url, timeoutMs = 18000) {
  let lastErr = null;
  for (const buildProxyUrl of CORS_PROXIES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(buildProxyUrl(url), { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) { lastErr = new Error(`HTTP ${res.status}`); continue; }
      const text = await res.text();
      if (text && text.length > 200) return text;
      lastErr = new Error('Empty response');
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
    }
  }
  throw lastErr || new Error('All proxies failed');
}

function findRecipeNode(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }
  const type = node['@type'];
  const types = Array.isArray(type) ? type : [type];
  if (types.includes('Recipe')) return node;
  if (node['@graph']) {
    const found = findRecipeNode(node['@graph']);
    if (found) return found;
  }
  return null;
}

function extractJsonLdRecipe(doc) {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    let data;
    try { data = JSON.parse(script.textContent); } catch (e) { continue; }
    const recipe = findRecipeNode(data);
    if (recipe) return recipe;
  }
  return null;
}

function flattenInstructions(ri) {
  const steps = [];
  function walk(node) {
    if (!node) return;
    if (typeof node === 'string') {
      // Some sites put all steps in one newline-separated string.
      node.split(/\n+/).map(cleanLine).filter(Boolean).forEach(s => steps.push(s));
      return;
    }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node === 'object') {
      const type = node['@type'];
      if (type === 'HowToSection') {
        if (node.name) steps.push(`— ${cleanLine(node.name)} —`);
        walk(node.itemListElement);
      } else if (type === 'HowToStep' || node.text) {
        const t = cleanLine(stripHtmlToText(node.text || node.name || ''));
        if (t) steps.push(t);
      } else {
        walk(node.itemListElement);
      }
    }
  }
  walk(ri);
  return steps.filter(Boolean);
}

function normalizeYield(y) {
  if (!y) return '';
  if (Array.isArray(y)) y = y[0];
  return cleanLine(String(y));
}

function recipeFromJsonLd(node, pageUrl) {
  const name = cleanLine(stripHtmlToText(node.name || ''));
  const ingredients = (node.recipeIngredient || node.recipeIngredients || [])
    .map(i => cleanLine(stripHtmlToText(i))).filter(Boolean);
  const instructions = flattenInstructions(node.recipeInstructions);
  const servings = normalizeYield(node.recipeYield || node.yield);

  let categoryRaw = node.recipeCategory;
  if (Array.isArray(categoryRaw)) categoryRaw = categoryRaw[0];
  categoryRaw = cleanLine(categoryRaw || '');

  let keywordTags = [];
  if (node.keywords) {
    const kw = Array.isArray(node.keywords) ? node.keywords.join(',') : node.keywords;
    keywordTags = kw.split(',').map(s => cleanLine(s)).filter(s => s && s.length < 24).slice(0, 6);
  }

  return {
    name, ingredients, instructions, servings,
    categoryHint: categoryRaw,
    tagHints: keywordTags,
    sourceUrl: cleanLine(node.url || '') || pageUrl,
    extractionMethod: 'jsonld',
    fieldsFound: { name: !!name, ingredients: ingredients.length > 0, instructions: instructions.length > 0, servings: !!servings }
  };
}

// ---------- Heuristic fallback when no JSON-LD Recipe is present ----------
function textOf(el) { return el ? cleanLine(stripHtmlToText(el.innerHTML)) : ''; }

function heuristicExtract(doc, pageUrl) {
  let name = '';
  const h1 = doc.querySelector('h1');
  if (h1) name = textOf(h1);
  if (!name) {
    const og = doc.querySelector('meta[property="og:title"]');
    if (og) name = cleanLine(og.getAttribute('content') || '');
  }
  if (!name && doc.title) name = cleanLine(doc.title);

  let ingredients = [...doc.querySelectorAll('[itemprop="recipeIngredient"], [itemprop="ingredients"]')]
    .map(textOf).filter(Boolean);

  let instructions = [...doc.querySelectorAll('[itemprop="recipeInstructions"]')]
    .map(textOf).filter(Boolean);

  if (!ingredients.length) {
    ingredients = findListNearHeading(doc, /ingredient/i);
  }
  if (!instructions.length) {
    instructions = findListNearHeading(doc, /instruction|direction|method|steps?\b/i);
  }

  let servings = '';
  const bodyText = cleanLine(doc.body ? doc.body.textContent : '');
  const servMatch = bodyText.match(/\b(?:serves|servings?|yield)s?\s*:?\s*(\d+(?:\s*-\s*\d+)?)/i);
  if (servMatch) servings = servMatch[1];

  return {
    name, ingredients, instructions, servings,
    categoryHint: '', tagHints: [],
    sourceUrl: pageUrl,
    extractionMethod: 'heuristic',
    fieldsFound: { name: !!name, ingredients: ingredients.length > 0, instructions: instructions.length > 0, servings: !!servings }
  };
}

function findListNearHeading(doc, pattern) {
  const headings = [...doc.querySelectorAll('h1, h2, h3, h4, strong, b, [class], [id]')];
  for (const heading of headings) {
    const label = cleanLine(heading.textContent || '');
    if (!label || label.length > 40 || !pattern.test(label)) continue;
    // Search forward through following siblings (and their lists) for the content block.
    let el = heading.nextElementSibling;
    let hops = 0;
    while (el && hops < 6) {
      const items = [...el.querySelectorAll('li')];
      if (items.length) return items.map(textOf).filter(Boolean);
      if (el.tagName === 'LI' || el.tagName === 'P') {
        const items2 = [el, ...collectSiblingsOfSameTag(el)];
        const texts = items2.map(textOf).filter(Boolean);
        if (texts.length) return texts;
      }
      el = el.nextElementSibling;
      hops++;
    }
  }
  // Last resort: match by class/id name directly on list containers.
  const containers = [...doc.querySelectorAll('[class], [id]')].filter(el => {
    const attr = ((el.className && el.className.toString()) || '') + ' ' + (el.id || '');
    return pattern.test(attr);
  });
  for (const c of containers) {
    const items = [...c.querySelectorAll('li')].map(textOf).filter(Boolean);
    if (items.length) return items;
  }
  return [];
}

function collectSiblingsOfSameTag(el) {
  const out = [];
  let sib = el.nextElementSibling;
  let hops = 0;
  while (sib && sib.tagName === el.tagName && hops < 40) {
    out.push(sib);
    sib = sib.nextElementSibling;
    hops++;
  }
  return out;
}

async function importFromUrl(pageUrl) {
  const html = await fetchHtmlViaProxies(pageUrl);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const node = extractJsonLdRecipe(doc);
  const result = node ? recipeFromJsonLd(node, pageUrl) : heuristicExtract(doc, pageUrl);
  if (!result.sourceUrl) result.sourceUrl = pageUrl;
  return result;
}

// =====================================================================
// Paste-text import — heuristic structuring of OCR'd / copy-pasted text
// =====================================================================
const UNIT_PATTERN = /^(?:[\d¼½¾⅓⅔⅛⅜⅝⅞]+[\d\s\/.\-]*|a|an|one|two|three|four|five|six)\s*(cups?|tbsp\.?|tablespoons?|tsp\.?|teaspoons?|oz\.?|ounces?|lbs?\.?|pounds?|g\b|grams?|kg\b|kilograms?|ml\b|milliliters?|l\b|liters?|cloves?|cans?|pinch(?:es)?|dash(?:es)?|slices?|stick(?:s)?|packages?|pkg\.?|bunch(?:es)?)\b/i;
const QTY_LEADING_PATTERN = /^[\d¼½¾⅓⅔⅛⅜⅝⅞]+[\d\s\/.\-]*\s+\S/;

function dedupeLines(lines) {
  const seen = new Set();
  const out = [];
  for (const line of lines) {
    const key = normalizeForCompare(line);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function parsePastedText(raw) {
  const rawLines = (raw || '').split(/\r?\n/).map(cleanLine).filter(Boolean);
  const lines = dedupeLines(rawLines);

  let name = '';
  let servings = '';
  const ingredients = [];
  const instructions = [];

  const servMatch = raw.match(/\b(?:serves|servings?|yield)s?\s*:?\s*(\d+(?:\s*-\s*\d+)?)/i);
  if (servMatch) servings = servMatch[1];

  const HEADING_ING = /^#{0,3}\s*ingredients?\s*:?$/i;
  const HEADING_INSTR = /^#{0,3}\s*(instructions?|directions?|method|steps?)\s*:?$/i;
  const NUMBERED = /^\s*(?:step\s*)?(\d{1,2})[\.\):]\s+(.*)/i;
  const BULLET = /^\s*[-•*▪◦‣·]\s+(.*)/;

  let mode = null; // 'ing' | 'instr' | null (unknown, use per-line heuristics)
  let titleTaken = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (HEADING_ING.test(line)) { mode = 'ing'; continue; }
    if (HEADING_INSTR.test(line)) { mode = 'instr'; continue; }
    if (servMatch && line === cleanLine(servMatch[0])) continue;

    const numbered = line.match(NUMBERED);
    const bulleted = line.match(BULLET);
    let content = line;
    let strongInstrSignal = false, strongIngSignal = false;

    if (numbered) { content = numbered[2]; strongInstrSignal = true; }
    else if (bulleted) { content = bulleted[1]; }

    if (UNIT_PATTERN.test(content) || QTY_LEADING_PATTERN.test(content)) strongIngSignal = true;
    if (/[.!?]\s*$/.test(content) && content.split(' ').length > 6) strongInstrSignal = true;

    // First substantial line that isn't itself a clear ingredient/instruction becomes the title.
    if (!titleTaken && !name && mode === null && !strongIngSignal && !strongInstrSignal && !numbered && !bulleted
        && content.length <= 80 && i < 4) {
      name = content;
      titleTaken = true;
      continue;
    }

    if (strongInstrSignal) { mode = 'instr'; instructions.push(content); continue; }
    if (strongIngSignal && mode !== 'instr') { ingredients.push(content); continue; }

    if (mode === 'ing') ingredients.push(content);
    else if (mode === 'instr') instructions.push(content);
    else if (bulleted) ingredients.push(content);
    else instructions.push(content);
  }

  if (!name && lines.length) name = lines[0];

  return {
    name: cleanLine(name),
    ingredients: ingredients.map(cleanLine).filter(Boolean),
    instructions: instructions.map(cleanLine).filter(Boolean),
    servings,
    categoryHint: '', tagHints: [],
    sourceUrl: '',
    extractionMethod: 'pasted-text',
    fieldsFound: { name: !!name, ingredients: ingredients.length > 0, instructions: instructions.length > 0, servings: !!servings }
  };
}
