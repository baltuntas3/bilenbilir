/**
 * Decode HTML entities in a string (e.g. &amp; → &, &quot; → ", &#039; → ')
 */
function decodeHTMLEntities(str) {
  if (typeof str !== 'string') return str;
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&apos;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
    '&#39;': "'",
  };
  return str.replace(/&(?:#(?:x[0-9a-fA-F]+|[0-9]+)|[a-zA-Z]+);/g, (match) => {
    if (entities[match]) return entities[match];
    // Handle numeric entities (&#123; or &#x1A;)
    if (match.startsWith('&#x')) return String.fromCharCode(parseInt(match.slice(3, -1), 16));
    if (match.startsWith('&#')) return String.fromCharCode(parseInt(match.slice(2, -1), 10));
    return match;
  });
}

module.exports = { decodeHTMLEntities };
