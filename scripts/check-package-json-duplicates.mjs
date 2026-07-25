import fs from 'node:fs';
import path from 'node:path';

/*
 * Detect duplicate keys in package.json, especially duplicate script keys.
 * JSON.parse() cannot detect duplicates because the last duplicate silently wins,
 * so this script scans the raw package.json text before parsing it.
 */

const pkgPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(process.cwd(), 'package.json');

function stripCommentsAndPreserveStrings(source) {
  let output = '';
  let inString = false;
  let quote = '';
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        output += ch;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (inString) {
      output += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        inString = false;
        quote = '';
      }
      continue;
    }

    if ((ch === '"') || (ch === "'")) {
      inString = true;
      quote = ch;
      output += ch;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i += 1;
      continue;
    }

    output += ch;
  }
  return output;
}

function findObjectBlock(source, propertyName) {
  const propPattern = new RegExp(`"${propertyName}"\\s*:\\s*{`, 'm');
  const match = propPattern.exec(source);
  if (!match) return null;

  let start = source.indexOf('{', match.index);
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start + 1, i);
    }
  }
  throw new Error(`Could not find closing brace for ${propertyName} object.`);
}

function detectDuplicateKeysInObjectBlock(block, prefix) {
  const duplicates = [];
  const seen = new Set();
  const keyPattern = /"([^"\\]*(?:\\.[^"\\]*)*)"\s*:/g;
  let match;
  while ((match = keyPattern.exec(block)) !== null) {
    const key = match[1];
    const pathName = `${prefix}.${key}`;
    if (seen.has(pathName)) duplicates.push(pathName);
    else seen.add(pathName);
  }
  return duplicates;
}

function main() {
  const raw = fs.readFileSync(pkgPath, 'utf8');
  const duplicatePaths = [];

  const cleaned = stripCommentsAndPreserveStrings(raw);
  const scriptsBlock = findObjectBlock(cleaned, 'scripts');
  if (scriptsBlock) {
    duplicatePaths.push(...detectDuplicateKeysInObjectBlock(scriptsBlock, 'scripts'));
  }

  // Parse after duplicate scanning to confirm JSON validity.
  JSON.parse(raw);

  if (duplicatePaths.length > 0) {
    console.error('Duplicate package.json keys detected:');
    for (const key of duplicatePaths) console.error(` - ${key}`);
    process.exit(1);
  }

  console.log('No duplicate script keys found.');
}

try {
  main();
} catch (err) {
  console.error(`Package JSON duplicate check failed: ${err.message}`);
  process.exit(1);
}
