const fs = require('fs');
const path = require('path');

const root = path.join(process.cwd(), 'source');
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function write(rel, value) { fs.writeFileSync(path.join(root, rel), value); }
function replaceOnce(text, search, replacement, label) {
  const index = typeof search === 'string' ? text.indexOf(search) : text.search(search);
  if (index < 0) throw new Error(`V2.5.12 patch target not found: ${label}`);
  if (typeof search === 'string') return text.slice(0, index) + replacement + text.slice(index + search.length);
  return text.replace(search, replacement);
}

{
  let text = read('src/components/PromptLensV25.tsx');

  text = replaceOnce(
    text,
    '  const completedStep = screen === "source" ? 0 : screen === "identity" ? 1 : screen === "direction" ? 2 : screen === "processing" ? 3 : 4;',
    '  const completedStep = screen === "source" ? 0 : screen === "direction" ? 1 : screen === "processing" ? 2 : 3;',
    'three-step progress calculation',
  );

  text = replaceOnce(
    text,
    `    if (!sourceReady) {\n      setError("Choose a URL, upload a source image, or describe the shot first.");\n      setScreen("source");\n      return;\n    }\n    if (!identityReference) {\n      setError("Upload the facial identity reference before building the prompt. Exact identity preservation is mandatory for this workflow.");\n      setScreen("identity");\n      return;\n    }\n    const hasIdentity = true;`,
    `    if (!sourceReady) {\n      setError("Choose a URL, upload a source image, or describe the shot first.");\n      setScreen("source");\n      return;\n    }\n    const hasIdentity = false;`,
    'remove PromptLens identity upload requirement',
  );

  text = replaceOnce(
    text,
    '                setScreen("identity");',
    '                setScreen("direction");',
    'source continues directly to direction',
  );

  const identityRender = /\n          \{screen === "identity" \? \([\s\S]*?\n          \) : null\}\n/;
  text = replaceOnce(text, identityRender, '\n', 'remove active identity screen');

  text = replaceOnce(
    text,
    '              onBack={() => setScreen("identity")}',
    '              onBack={() => setScreen("source")}',
    'direction back to source',
  );

  const progressItems = `  const items: Array<{ number: number; title: string; subtitle: string; screen: Screen }> = [\n    { number: 1, title: "Shot", subtitle: "URL, images or description", screen: "source" },\n    { number: 2, title: "Face", subtitle: "Optional identity reference", screen: "identity" },\n    { number: 3, title: "Direction", subtitle: "Choose the creative goal", screen: "direction" },\n    { number: 4, title: "Result", subtitle: "Copy or fine-tune", screen: "result" },\n  ];\n  const activeNumber = screen === "source" ? 1 : screen === "identity" ? 2 : screen === "direction" || screen === "processing" ? 3 : 4;`;
  const newProgressItems = `  const items: Array<{ number: number; title: string; subtitle: string; screen: Screen }> = [\n    { number: 1, title: "Shot", subtitle: "Exact source image or URL", screen: "source" },\n    { number: 2, title: "Direction", subtitle: "Exact recreation settings", screen: "direction" },\n    { number: 3, title: "Result", subtitle: "Copy the locked prompt", screen: "result" },\n  ];\n  const activeNumber = screen === "source" ? 1 : screen === "direction" || screen === "processing" ? 2 : 3;`;
  text = replaceOnce(text, progressItems, newProgressItems, 'three-step progress rail');

  text = replaceOnce(text, 'eyebrow="STEP 1 OF 4"', 'eyebrow="STEP 1 OF 3"', 'source step count');
  text = replaceOnce(text, 'Continue to face <span>→</span>', 'Continue to direction <span>→</span>', 'source button label');
  text = replaceOnce(text, 'eyebrow="STEP 3 OF 4"', 'eyebrow="STEP 2 OF 3"', 'direction step count');

  text = replaceOnce(
    text,
    '<small>Generator, aspect ratio and identity defaults</small>',
    '<small>Generator, aspect ratio and exact-recreation controls</small>',
    'advanced settings subtitle',
  );

  text = replaceOnce(
    text,
    '<div className="done"><span>✓</span><strong>Separating identity from the source person</strong></div>',
    '<div className="done"><span>✓</span><strong>Locking the exact source outfit, pose and scene</strong></div>',
    'processing message',
  );

  text = replaceOnce(
    text,
    '<div><span>IDENTITY</span><strong>{config.identityStrength === "none" ? "Anonymous subject" : `${config.identityStrength} match`}</strong></div>',
    '<div><span>IDENTITY</span><strong>Upload reference in image agent</strong></div>',
    'result identity summary',
  );

  text = replaceOnce(
    text,
    '<div className="v25-side-heading"><span className="v25-card-icon green">✓</span><div><strong>Source separation</strong><small>Identity and styling are isolated</small></div></div>',
    '<div className="v25-side-heading"><span className="v25-card-icon green">✓</span><div><strong>Exact recreation lock</strong><small>Identity is supplied later in the image agent</small></div></div>',
    'result source lock heading',
  );
  text = replaceOnce(
    text,
    '<ul className="v25-check-list"><li>Face comes only from the identity reference</li><li>Source person remains anonymous</li><li>Pose, outfit and camera stay transferable</li></ul>',
    '<ul className="v25-check-list"><li>The prompt begins with [UPLOAD REFERENCE IMAGE]</li><li>The attached image in the final agent controls facial identity only</li><li>The selected shot controls outfit, pose, lighting, camera and setting exactly</li></ul>',
    'result exact recreation checks',
  );

  text = text.replaceAll('V2.5.11', 'V2.5.12');
  write('src/components/PromptLensV25.tsx', text);
}

{
  let text = read('src/lib/prompt-builder.ts');

  const sharedIdentity = `  const identity = config.identityStrength === "none"\n    ? "Use the same anonymous adult subject consistently across every image."\n    : "Use the uploaded identity reference as the sole facial identity source in every image. Preserve the same recognisable facial geometry, natural asymmetry, skin tone, age appearance, hairline and selected hairstyle across the complete series.";`;
  const newSharedIdentity = `  const identity = "The [UPLOAD REFERENCE IMAGE] supplied later with the generation prompt is the sole facial identity source in every image. Preserve that exact recognisable identity across the complete series.";`;
  text = replaceOnce(text, sharedIdentity, newSharedIdentity, 'series identity supplied later');

  write('src/lib/prompt-builder.ts', text);
}

{
  let text = read('src/app/api/analyse/route.ts');

  const subjectLock = `      subjectLock: hasIdentity\n        ? "Use the uploaded identity reference as the sole recognisable facial identity source."\n        : "Use the same anonymous adult subject consistently across the series.",`;
  const newSubjectLock = `      subjectLock: "The [UPLOAD REFERENCE IMAGE] attached later in the final image agent is the sole recognisable facial identity source. Preserve it exactly.",`;
  text = replaceOnce(text, subjectLock, newSubjectLock, 'analysis identity supplied later');

  text = replaceOnce(
    text,
    '            analysis: buildIndependentAnalysis(facts, options, Boolean(identityImage)),',
    '            analysis: buildIndependentAnalysis(facts, options, true),',
    'treat final-agent identity as mandatory',
  );

  write('src/app/api/analyse/route.ts', text);
}

{
  let text = read('src/app/layout.tsx');
  text = text.replaceAll('V2.5.11', 'V2.5.12');
  write('src/app/layout.tsx', text);
}

{
  const packagePath = path.join(root, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  packageJson.version = '2.5.12';
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
}

console.log('Applied PromptLens V2.5.12 final-agent identity workflow.');
