const fs = require('fs');
const path = require('path');
const root = path.join(process.cwd(), 'source');
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function write(rel, value) { fs.writeFileSync(path.join(root, rel), value); }
function replaceOnce(text, search, replacement, label) {
  const index = typeof search === 'string' ? text.indexOf(search) : text.search(search);
  if (index < 0) throw new Error(`V2.5.13 exact-mode target not found: ${label}`);
  if (typeof search === 'string') return text.slice(0, index) + replacement + text.slice(index + search.length);
  return text.replace(search, replacement);
}

let text = read('src/components/PromptLensV25.tsx');
text = replaceOnce(
  text,
  '      if (config.seriesOutputMode === "separate" && sourceReferences.length > 1) {',
  '      if (sourceReferences.length > 1) {',
  'always analyse every selected shot independently',
);
text = replaceOnce(
  text,
  '        seriesOutputMode: current.seriesOutputMode,',
  '        seriesOutputMode: "separate",',
  'force separate exact prompt pack',
);
const seriesModeRe = /      \{shotCount > 1 \? \([\s\S]*?\n      \) : null\}\n\n      <section className="v25-section-block v2513-exact-vision">/;
const seriesModeLocked = `      {shotCount > 1 ? (
        <section className="v25-section-block">
          <div className="v25-section-heading"><div><span>EXACT PROMPT PACK</span><h2>{shotCount} independent recreations</h2></div><small>One full prompt per selected image</small></div>
          <div className="v2513-lock-card"><span>✓</span><div><strong>Separate exact prompt for every shot</strong><small>Each selected photo is inspected independently. Its own hat, outfit, accessories, pose, lighting, camera, crop and setting cannot be blended with another image.</small></div></div>
        </section>
      ) : null}

      <section className="v25-section-block v2513-exact-vision">`;
text = replaceOnce(text, seriesModeRe, seriesModeLocked, 'replace creative series modes with exact prompt pack lock');
write('src/components/PromptLensV25.tsx', text);
console.log('Applied PromptLens V2.5.13 exact-per-shot enforcement.');
