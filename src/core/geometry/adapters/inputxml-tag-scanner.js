/**
 * Minimal regex-based tag/attribute scanner for CAESAR II InputXML.
 *
 * InputXML files are single-line, deeply attribute-heavy, and not
 * well-formed enough in the wild to be worth a real DOM dependency for (and
 * the repository allows no new runtime dependency). This scans for a named
 * tag, self-closing or with children, and returns each match's attributes and
 * inner text — the same approach the reference InputXML engine in
 * `reallaksh19/3D_Converters` (`uxml/UxmlInputXmlSchemaMapper.js`) uses,
 * reimplemented here rather than copied.
 *
 * This does not validate well-formedness; it is a targeted extractor for a
 * known, narrow attribute grammar (`NAME="value"`), not a general XML parser.
 */

/**
 * @param {string} attributeText Raw text between a tag name and its `>`.
 * @returns {Record<string, string>}
 */
export function parseAttributes(attributeText = '') {
  const attributes = {};
  const pattern = /([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match = pattern.exec(attributeText);
  while (match) {
    attributes[match[1]] = match[3] ?? match[4] ?? '';
    match = pattern.exec(attributeText);
  }
  return attributes;
}

/**
 * Find every element with the given tag name, at any nesting depth,
 * non-recursively into matches (a match's `inner` text may itself contain
 * further tags, found separately by a nested call).
 *
 * @param {string} xmlText Source text.
 * @param {string} tagName Tag to find, case-insensitive, no namespace prefix required.
 * @returns {Array<{attributes:Record<string,string>, inner:string, selfClosing:boolean}>}
 */
export function findElements(xmlText, tagName) {
  const escaped = String(tagName).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const token = new RegExp(`<\\s*(/)?\\s*(?:[\\w.-]+:)?${escaped}\\b([^>]*?)(/)?\\s*>`, 'giu');
  const results = [];
  const stack = [];
  let match = token.exec(xmlText);
  while (match) {
    const isClosing = Boolean(match[1]);
    const rawAttributeText = (match[2] || '').trim();
    const isSelfClosing = Boolean(match[3]) || rawAttributeText.endsWith('/');
    if (isClosing) {
      const open = stack.pop();
      if (open) {
        results.push({
          attributes: parseAttributes(open.attributeText),
          inner: xmlText.slice(open.end, match.index),
          selfClosing: false,
        });
      }
    } else if (isSelfClosing) {
      results.push({
        attributes: parseAttributes(rawAttributeText.replace(/\/$/u, '')),
        inner: '',
        selfClosing: true,
      });
    } else {
      stack.push({ end: token.lastIndex, attributeText: rawAttributeText });
    }
    match = token.exec(xmlText);
  }
  return results;
}

/**
 * Find every element matching any of the given tag names, in document order,
 * de-duplicated by match position.
 *
 * @param {string} xmlText Source text to search within (typically an element's `inner`).
 * @param {string[]} tagNames Candidate tag names.
 * @returns {Array<{attributes:Record<string,string>, inner:string, selfClosing:boolean}>}
 */
export function findAnyElements(xmlText, tagNames) {
  const merged = [];
  for (const tagName of tagNames) merged.push(...findElements(xmlText, tagName));
  return merged;
}

/**
 * @param {string} xmlText
 * @param {string[]} tagNames
 * @returns {{attributes:Record<string,string>, inner:string, selfClosing:boolean}|null}
 */
export function firstElement(xmlText, tagNames) {
  return findAnyElements(xmlText, tagNames)[0] || null;
}

/**
 * Read the first non-empty attribute among several candidate names, trimmed.
 *
 * @param {Record<string,string>} attributes
 * @param {...string} names Candidate attribute names, tried in order.
 * @returns {string}
 */
export function attributeValue(attributes, ...names) {
  for (const name of names) {
    const direct = attributes[name];
    if (direct != null && String(direct).trim()) return String(direct).trim();
    const key = Object.keys(attributes).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    if (key && String(attributes[key]).trim()) return String(attributes[key]).trim();
  }
  return '';
}
