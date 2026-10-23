// Compiles a user-supplied *hostname* regex into a full-URL regex usable as a
// declarativeNetRequest `regexFilter` (RE2 syntax).
//
// The hostname pattern is confined to the authority part of the URL: every
// construct that could match "/", "?", "#", "@" or ":" (".", negated classes,
// \S, \W, \D) is rewritten so a pattern such as `.*\.example\.com` can never
// match `https://evil.com/x.example.com`. Without this, headers like
// Authorization could leak to unrelated hosts.
//
// Semantics:
//   - `^` at the start / `$` at the end of the pattern (or of each top-level
//     alternative) anchor to the start / end of the hostname.
//   - Without anchors the pattern matches anywhere inside the hostname.
//   - Matching is case-insensitive (hostnames are lowercase in URLs anyway).

const FORBIDDEN = '/?#@:';
const ANY_HOST_CHAR = `[^${FORBIDDEN}]`;
const SCHEME = '^[a-z][a-z0-9+.-]*://';
const USERINFO = '(?:[^/?#@]*@)?';
const PORT_AND_REST = '(?::[0-9]+)?(?:[/?#]|$)';

export class PatternError extends Error {}

// Splits a pattern on `|` that are not escaped, inside a class or inside a group.
function splitTopLevel(pattern) {
  const branches = [];
  let depth = 0;
  let inClass = false;
  let start = 0;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (inClass) {
      if (c === ']') inClass = false;
      continue;
    }
    if (c === '[') {
      inClass = true;
      // A `]` right after `[` or `[^` is a literal.
      if (pattern[i + 1] === '^') i++;
      if (pattern[i + 1] === ']') i++;
    } else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === '|' && depth === 0) {
      branches.push(pattern.slice(start, i));
      start = i + 1;
    }
  }
  if (depth !== 0) throw new PatternError('Unbalanced parentheses');
  if (inClass) throw new PatternError('Unterminated character class');
  branches.push(pattern.slice(start));
  return branches;
}

// POSIX classes are RE2-only: expand them so the JS preview behaves the same.
const POSIX = {
  alpha: 'a-zA-Z',
  digit: '0-9',
  alnum: '0-9A-Za-z',
  word: '0-9A-Za-z_',
  lower: 'a-z',
  upper: 'A-Z',
  xdigit: '0-9A-Fa-f',
};

// Placeholders for anchors nested in groups, e.g. `(^|\.)example\.com$`.
// They are expanded by hostPatternToUrlRegex().
const CARET = '\u0000';
const DOLLAR = '\u0001';
const NEVER = '[^\\s\\S]';

// Rewrites one branch so it can only match hostname characters.
function confine(branch) {
  let out = '';
  for (let i = 0; i < branch.length; i++) {
    const c = branch[i];

    if (c === '\\') {
      const n = branch[i + 1];
      if (n === undefined) throw new PatternError('Pattern ends with a lone backslash');
      if (n === 'S') out += `[^\\s${FORBIDDEN}]`;
      else if (n === 'W') out += `[^\\w${FORBIDDEN}]`;
      else if (n === 'D') out += `[^\\d${FORBIDDEN}]`;
      else if (n === 'P' || n === 'C' || n === 'Q') {
        throw new PatternError(`\\${n} is not supported in hostname patterns`);
      } else out += c + n;
      i++;
      continue;
    }

    if (c === '[') {
      let j = i + 1;
      const negated = branch[j] === '^';
      if (negated) j++;
      let body = '';
      // RE2 reads a leading `]` as a literal, JS does not: always escape it.
      if (branch[j] === ']') {
        body += '\\]';
        j++;
      }
      for (; j < branch.length && branch[j] !== ']'; j++) {
        if (branch[j] === '\\') {
          const n = branch[j + 1];
          if (negated ? false : 'SWDP'.includes(n)) {
            throw new PatternError(`\\${n} inside [...] is not supported, use an explicit class`);
          }
          body += branch[j] + (n ?? '');
          j++;
        } else if (branch.startsWith('[:', j)) {
          if (branch.startsWith('[:^', j)) throw new PatternError('Negated POSIX classes are not supported');
          const end = branch.indexOf(':]', j + 2);
          if (end === -1) throw new PatternError('Unterminated POSIX class');
          const name = branch.slice(j + 2, end);
          if (!POSIX[name]) throw new PatternError(`POSIX class [:${name}:] is not supported`);
          body += POSIX[name];
          j = end + 1;
        } else {
          body += branch[j];
        }
      }
      if (j >= branch.length) throw new PatternError('Unterminated character class');
      out += negated ? `[^${body}${FORBIDDEN}]` : `[${body}]`;
      i = j;
      continue;
    }

    if (c === '.') out += ANY_HOST_CHAR;
    else if (c === '^') out += CARET;
    else if (c === '$') out += DOLLAR;
    else out += c;
  }
  return out;
}

function isTrailingDollar(branch) {
  if (!branch.endsWith('$')) return false;
  let backslashes = 0;
  for (let i = branch.length - 2; i >= 0 && branch[i] === '\\'; i--) backslashes++;
  return backslashes % 2 === 0;
}

/**
 * @param {string} pattern hostname regex, e.g. `^api\.example\.com$`
 * @returns {string} URL regex for declarativeNetRequest
 */
export function hostPatternToUrlRegex(pattern) {
  const trimmed = (pattern ?? '').trim();
  if (!trimmed) throw new PatternError('Pattern is empty');

  const hosts = splitTopLevel(trimmed).map((branch) => {
    let b = branch;
    const startAnchored = b.startsWith('^');
    if (startAnchored) b = b.slice(1);
    const endAnchored = isTrailingDollar(b);
    if (endAnchored) b = b.slice(0, -1);
    if (!b) throw new PatternError('Empty alternative');
    const body = confine(b);

    // A nested `^` holds only when nothing precedes it in the hostname, so
    // emit one variant where the branch starts at the hostname start (`^`
    // matches empty) and one where it may start later (`^` never matches).
    // Same for `$` at the end.
    const starts = startAnchored ? [true] : body.includes(CARET) ? [true, false] : [false];
    const ends = endAnchored ? [true] : body.includes(DOLLAR) ? [true, false] : [false];
    return starts.flatMap((atStart) =>
      ends.map(
        (atEnd) =>
          (atStart ? '' : `${ANY_HOST_CHAR}*`) +
          body.replaceAll(CARET, atStart ? '' : NEVER).replaceAll(DOLLAR, atEnd ? '' : NEVER) +
          (atEnd ? '' : `${ANY_HOST_CHAR}*`),
      ),
    );
  }).flat();

  const urlRegex = `${SCHEME}${USERINFO}(?:${hosts.join('|')})${PORT_AND_REST}`;

  // Catch syntax errors early. JS and RE2 differ slightly, so the browser's
  // isRegexSupported() remains the final authority.
  try {
    new RegExp(urlRegex, 'i');
  } catch (e) {
    throw new PatternError(`Invalid regex: ${e.message.replace(/^Invalid regular expression: /, '')}`);
  }
  return urlRegex;
}

/** Returns a tester function `(url) => boolean`, or throws PatternError. */
export function compileHostPattern(pattern) {
  const re = new RegExp(hostPatternToUrlRegex(pattern), 'i');
  return (url) => re.test(url);
}
