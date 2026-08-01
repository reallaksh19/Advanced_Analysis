import fs from 'fs';
import path from 'path';

const root = process.cwd();
const srcDir = path.join(root, 'src');

function findFiles(dir, files = []) {
    if (!fs.existsSync(dir)) return files;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            findFiles(fullPath, files);
        } else if (/\.(js|jsx|mjs|cjs)$/.test(entry.name)) {
            files.push(fullPath);
        }
    }
    return files;
}

function filesystemImportPath(importPath) {
    const suffixIndex = importPath.search(/[?#]/u);
    return suffixIndex === -1 ? importPath : importPath.slice(0, suffixIndex);
}

const files = findFiles(srcDir);
let success = true;

console.log('Running import check...');

for (const file of files) {
    const code = fs.readFileSync(file, 'utf8');
    const relFile = path.relative(root, file);

    const importRegex = /import\s+.*?\s+from\s+['"](.*?)['"]/g;
    let match;
    while ((match = importRegex.exec(code)) !== null) {
        const importPath = match[1];
        if (importPath.startsWith('.')) {
            const resolvedImportPath = filesystemImportPath(importPath);
            const absPath = path.resolve(path.dirname(file), resolvedImportPath);
            let found = false;

            if (resolvedImportPath && fs.existsSync(absPath)) {
                if (fs.statSync(absPath).isDirectory()) {
                    // Check for index
                    if (fs.existsSync(path.join(absPath, 'index.js')) || fs.existsSync(path.join(absPath, 'index.jsx'))) {
                        found = true;
                    }
                } else {
                    found = true; // file exists (e.g. .css or exact .js file)
                }
            } else if (resolvedImportPath) {
                // Try appending extensions
                for (const ext of ['.js', '.jsx', '.mjs', '.cjs', '.json']) {
                    if (fs.existsSync(absPath + ext)) {
                        found = true;
                        break;
                    }
                }
            }

            if (!found) {
                console.error(`❌ Unresolved import: ${importPath} in ${relFile}`);
                success = false;
            }
        }
    }
}

if (success) {
    console.log('✅ Import check passed.');
    process.exit(0);
} else {
    process.exit(1);
}
