// Code that runs inside the page, kept as text: the backend is compiled
// without the DOM library, and Playwright evaluates strings as-is.

/** A ring that follows the pointer, so you can see where the agent acts. */
export const CURSOR_SCRIPT = `
(() => {
  if (window.top !== window) return;
  const ring = document.createElement('div');
  ring.style.cssText =
    'position:fixed;z-index:2147483647;pointer-events:none;width:16px;height:16px;border-radius:50%;' +
    'border:2px solid #c6613f;background:rgba(198,97,63,.22);transform:translate(-50%,-50%);display:none;';
  const show = (event) => {
    ring.style.left = event.clientX + 'px';
    ring.style.top = event.clientY + 'px';
    ring.style.display = 'block';
  };
  document.addEventListener('mousemove', show, true);
  document.addEventListener('mousedown', show, true);
  const mount = () => document.documentElement && document.documentElement.appendChild(ring);
  if (document.documentElement) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
`;

/**
 * Reads the page as an outline of what matters: interactive elements, headings,
 * landmarks and text, each interactive element tagged with a stable ref the
 * click/type tools can use. Expression taking {filter, query, maxChars}.
 */
export const OUTLINE_SCRIPT = `(options) => {
  const INTERACTIVE = 'a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=tab],[role=menuitem],[role=switch],[role=combobox],[role=textbox],[role=option],[contenteditable=""],[contenteditable="true"],[tabindex]:not([tabindex="-1"])';
  const state = (window.__cooderRefs = window.__cooderRefs || { n: 0 });
  const refOf = (el) => {
    let ref = el.getAttribute('data-cooder-ref');
    if (!ref) { ref = 'ref_' + (++state.n); el.setAttribute('data-cooder-ref', ref); }
    return ref;
  };
  const visible = (el) => {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const clean = (text, max) => (text || '').replace(/\\s+/g, ' ').trim().slice(0, max);
  const roleOf = (el) => {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'button' || tag === 'summary') return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (type === 'checkbox' || type === 'radio') return type;
      if (['button', 'submit', 'reset', 'image'].includes(type)) return 'button';
      return type === 'search' ? 'searchbox' : 'textbox';
    }
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (['nav', 'main', 'header', 'footer', 'aside', 'form', 'dialog'].includes(tag)) return tag;
    if (tag === 'img') return 'img';
    if (el.isContentEditable) return 'textbox';
    return 'generic';
  };
  const nameOf = (el) => {
    const label = el.getAttribute('aria-label');
    if (label) return clean(label, 100);
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const text = by.split(' ').map((id) => (document.getElementById(id) || {}).textContent || '').join(' ');
      if (clean(text, 100)) return clean(text, 100);
    }
    if (el.labels && el.labels.length) return clean(el.labels[0].textContent, 100);
    if (el.tagName === 'IMG') return clean(el.getAttribute('alt'), 100);
    if (el.tagName === 'INPUT') {
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (['button', 'submit', 'reset'].includes(type)) return clean(el.value, 100);
      return clean(el.getAttribute('placeholder') || el.getAttribute('title') || el.name, 100);
    }
    return clean(el.innerText || el.textContent || el.getAttribute('title'), 100);
  };
  const lines = [];
  const interactiveOnly = options.filter === 'interactive';
  const walk = (el, depth) => {
    if (lines.length > 4000) return;
    for (const child of el.children) {
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'svg'].includes(child.tagName)) continue;
      if (!visible(child)) continue;
      const role = roleOf(child);
      const isInteractive = child.matches(INTERACTIVE);
      const isLandmark = ['heading', 'nav', 'main', 'header', 'footer', 'aside', 'form', 'dialog', 'img'].includes(role);
      const show = isInteractive || (!interactiveOnly && isLandmark);
      if (show) {
        const name = nameOf(child);
        let line = '  '.repeat(Math.min(depth, 6)) + '- ' + role + (name ? ' "' + name + '"' : '');
        if (isInteractive) line += ' [' + refOf(child) + ']';
        if (child.tagName === 'A' && child.getAttribute('href')) line += ' href="' + child.getAttribute('href').slice(0, 120) + '"';
        if ('value' in child && child.value && ['textbox', 'searchbox', 'combobox'].includes(role)) line += ' value="' + clean(child.value, 60) + '"';
        if (child.checked === true) line += ' checked';
        if (child.disabled) line += ' disabled';
        lines.push(line);
      } else if (!interactiveOnly && ['P', 'LI', 'TD', 'TH', 'LABEL', 'PRE', 'BLOCKQUOTE', 'DT', 'DD'].includes(child.tagName) && !child.querySelector(INTERACTIVE)) {
        const text = clean(child.innerText, 200);
        if (text) lines.push('  '.repeat(Math.min(depth, 6)) + '- text "' + text + '"');
        continue;
      }
      walk(child, show ? depth + 1 : depth);
    }
  };
  walk(document.body || document.documentElement, 0);
  let result = lines;
  if (options.query) {
    const needle = options.query.toLowerCase();
    result = lines.filter((line) => line.toLowerCase().includes(needle)).slice(0, 20);
  }
  const text = result.join('\\n');
  return text.length > options.maxChars ? text.slice(0, options.maxChars) + '\\n… (truncated)' : text;
}`;

/** Runs agent-supplied JavaScript: tries an expression, falls back to statements. */
export const EVAL_SCRIPT = `async (code) => {
  const run = async (source) => (0, eval)('(async () => (' + source + '))()');
  try {
    return await run(code);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return await (0, eval)('(async () => {' + code + '})()');
  }
}`;
