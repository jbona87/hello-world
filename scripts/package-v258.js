const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const root = path.join(process.cwd(), 'source');
const out = path.join(process.cwd(), 'promptlens-v2-5-8');
const excluded = new Set(['node_modules', '.next', '.git']);

function walk(dir, base = '') {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const rel = path.join(base, entry.name).replaceAll('\\', '/');
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full, rel));
    else if (!rel.startsWith('.v258-ready')) files.push(rel);
  }
  return files;
}

const fileMap = {};
for (const rel of walk(root)) fileMap[rel] = fs.readFileSync(path.join(root, rel), 'utf8');
const plain = Buffer.from(JSON.stringify({ files: fileMap }), 'utf8');
const compressed = zlib.gzipSync(plain, { level: 9 });
const encoded = compressed.toString('base64');
const chunks = encoded.match(/.{1,10000}/g) || [];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
chunks.forEach((chunk, index) => fs.writeFileSync(path.join(out, `p${String(index).padStart(2, '0')}.txt`), chunk));
const manifest = {
  version: '2.5.8',
  fileCount: Object.keys(fileMap).length,
  chunks: chunks.map((_, index) => `p${String(index).padStart(2, '0')}.txt`),
  encodedLength: encoded.length,
  compressedBytes: compressed.length,
  checksum: crypto.createHash('sha256').update(compressed).digest('hex'),
};
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(root, '.v258-ready'), `PromptLens V2.5.8 build passed; ${manifest.fileCount} files; ${manifest.chunks.length} chunks; ${manifest.checksum}\n`);
console.log(manifest);

// Follow-up commit intentionally triggers the V2.5.8 build workflow.
