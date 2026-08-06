const fs = require('fs');
const path = require('path');

const patchPath = path.join(process.cwd(), 'scripts', 'apply-v258.js');
let patch = fs.readFileSync(patchPath, 'utf8');
const target = '].filter(Boolean).join("\\n"),';
const replacement = '].filter(Boolean).join("\\\\n"),';
if (!patch.includes(target)) throw new Error('V2.5.8 newline hotfix target was not found.');
patch = patch.replace(target, replacement);
fs.writeFileSync(patchPath, patch);
require(patchPath);
