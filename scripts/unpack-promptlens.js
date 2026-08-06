const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const chunkDir = path.join(process.cwd(), 'promptlens-v2-5-7');
const chunkNames = [
  's00.txt', 's01.txt', 's02.txt', 's03.txt',
  's04a.txt', 's04b.txt', 's05.txt', 's06.txt', 's07.txt'
];

const encoded = chunkNames.map((name) => {
  let value = fs.readFileSync(path.join(chunkDir, name), 'utf8');
  if (name === 's04a.txt') value = value.slice(0, 5000);
  return value.trim();
}).join('');

const compressed = Buffer.from(encoded, 'base64');
let plain = null;
for (const decompress of [zlib.gunzipSync, zlib.brotliDecompressSync, zlib.inflateSync]) {
  try {
    plain = decompress(compressed);
    break;
  } catch (_) {}
}
if (!plain) throw new Error('Could not decompress PromptLens bundle.');

const payload = JSON.parse(plain.toString('utf8'));
const sourceRoot = path.join(process.cwd(), 'source');
fs.rmSync(sourceRoot, { recursive: true, force: true });
fs.mkdirSync(sourceRoot, { recursive: true });

let entries;
if (Array.isArray(payload)) {
  entries = payload;
} else if (Array.isArray(payload.files)) {
  entries = payload.files;
} else {
  const fileMap = payload.files && typeof payload.files === 'object' ? payload.files : payload;
  entries = Object.entries(fileMap).map(([file, data]) => ({ file, data }));
}

let written = 0;
for (const entry of entries) {
  const file = entry.file || entry.path || entry.name;
  const data = entry.data ?? entry.content;
  if (!file || typeof data !== 'string') continue;
  const destination = path.join(sourceRoot, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, data);
  written += 1;
}

fs.writeFileSync(path.join(sourceRoot, '.unpacked'), `PromptLens V2.5.7 source files: ${written}\n`);
console.log(`Unpacked ${written} PromptLens source files.`);
