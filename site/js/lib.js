// Pure helpers without DOM access, tested in test/site.test.mjs.

const decimals = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const num2 = (x) => decimals.format(x);
export const int = (x) => new Intl.NumberFormat('de-DE').format(x);

// Same formula as src/aggregate.mjs, the demo must not compute anything the report does not.
export function roganGladen(observed, tpr, tnr) {
  const denominator = tpr + tnr - 1;
  if (denominator <= 0) return null;
  return Math.min(1, Math.max(0, (observed + tnr - 1) / denominator));
}

// Word diff via longest common subsequence. Whitespace tokens stay, so the result keeps the line breaks.
export function diffWords(a, b) {
  const [x, y] = [a.split(/(\s+)/), b.split(/(\s+)/)];
  const width = y.length + 1;
  const lengths = new Uint16Array((x.length + 1) * width);
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      lengths[i * width + j] = x[i] === y[j]
        ? lengths[(i + 1) * width + j + 1] + 1
        : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
    }
  }
  const parts = [];
  const push = (type, text) => {
    if (parts.at(-1)?.type === type) parts.at(-1).text += text;
    else parts.push({ type, text });
  };
  let [i, j] = [0, 0];
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) { push('same', x[i]); i++; j++; }
    else if (j < y.length && (i === x.length || lengths[i * width + j + 1] >= lengths[(i + 1) * width + j])) push('add', y[j++]);
    else push('del', x[i++]);
  }
  return parts;
}

const escapeHtml = (text) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const inline = (text) => escapeHtml(text).replace(/`([^`]+)`/g, '<code>$1</code>');

// shortcut: only what the notes in demo.json use (#, ##, "- ", indented continuation, `code`), extend when other syntax shows up.
export function renderMarkdown(source) {
  const html = [];
  let item = null;
  const closeList = () => {
    if (item === null) return;
    html.push(`<li>${item}</li></ul>`);
    item = null;
  };
  for (const line of source.split('\n')) {
    if (!line.trim()) closeList();
    else if (line.startsWith('## ')) { closeList(); html.push(`<p class="md-h2">${inline(line.slice(3))}</p>`); }
    else if (line.startsWith('# ')) { closeList(); html.push(`<p class="md-h1">${inline(line.slice(2))}</p>`); }
    else if (line.startsWith('- ')) {
      if (item === null) html.push('<ul>');
      else html.push(`<li>${item}</li>`);
      item = inline(line.slice(2));
    } else if (item !== null) item += `<br>${inline(line.trim())}`;
    else html.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return html.join('');
}
