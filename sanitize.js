export function sanitizeShownotes(html, options = {}) {
  if (!html) return '';

  const doc = options.document || globalThis.document;
  if (!doc) {
    throw new Error('sanitizeShownotes requires a DOM document');
  }

  const template = doc.createElement('template');
  template.innerHTML = html;

  const allowedTags = new Set([
    'A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DIV', 'EM', 'H1', 'H2', 'H3', 'H4',
    'HR', 'I', 'IMG', 'LI', 'OL', 'P', 'PRE', 'S', 'SPAN', 'STRONG', 'TABLE',
    'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'U', 'UL',
  ]);
  const allowedAttrs = {
    A: new Set(['href', 'title']),
    IMG: new Set(['src', 'alt', 'title', 'width', 'height']),
    TD: new Set(['colspan', 'rowspan']),
    TH: new Set(['colspan', 'rowspan']),
  };
  const dropWithContents = new Set(['IFRAME', 'MATH', 'NOSCRIPT', 'SCRIPT', 'STYLE', 'SVG']);

  [...template.content.querySelectorAll('*')].forEach((el) => {
    if (!allowedTags.has(el.tagName)) {
      if (dropWithContents.has(el.tagName)) {
        el.remove();
      } else {
        el.replaceWith(...el.childNodes);
      }
      return;
    }

    [...el.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const allowed = allowedAttrs[el.tagName]?.has(name);
      if (!allowed) {
        el.removeAttribute(attr.name);
        return;
      }
      if (!isSafeAttributeUrl(el.tagName, name, attr.value, options.baseUrl)) {
        el.removeAttribute(attr.name);
      }
    });

    if (el.tagName === 'A' && el.hasAttribute('href')) {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }
    if (el.tagName === 'IMG') {
      el.setAttribute('loading', 'lazy');
    }
  });

  const wrapper = doc.createElement('div');
  wrapper.appendChild(template.content.cloneNode(true));
  return wrapper.innerHTML;
}

function isSafeAttributeUrl(tagName, attrName, value, baseUrl = globalThis.location?.href || 'https://example.com/') {
  if (attrName !== 'href' && attrName !== 'src') return true;

  try {
    const url = new URL(value, baseUrl);
    if (tagName === 'A' && attrName === 'href') {
      return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol);
    }
    if (tagName === 'IMG' && attrName === 'src') {
      return ['http:', 'https:'].includes(url.protocol);
    }
    return false;
  } catch {
    return false;
  }
}
