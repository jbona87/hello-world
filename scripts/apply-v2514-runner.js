const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

(async () => {
  const url = 'https://raw.githubusercontent.com/jbona87/hello-world/promptlens-v258/scripts/apply-v2514.js';
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not fetch apply-v2514.js (${response.status}).`);
  let source = await response.text();
  source = source.replace(
    'analysis: buildIndependentAnalysis\\(facts, options, Boolean\\(identityImage\\)\\),/',
    'analysis: buildIndependentAnalysis\\(facts, options, (?:Boolean\\(identityImage\\)|true)\\),/',
  );
  source = source.replace(
    'analysis: buildIndependentAnalysis(facts, options, Boolean(identityImage)),";',
    'analysis: buildIndependentAnalysis(facts, options, true),";',
  );
  source = source.replace(
    'analysis: buildIndependentAnalysis(recoveredFacts, options, Boolean(identityImage)),',
    'analysis: buildIndependentAnalysis(recoveredFacts, options, true),',
  );
  const target = path.join(process.cwd(), 'apply-v2514-normalized.js');
  fs.writeFileSync(target, source);
  execFileSync(process.execPath, [target], { cwd: process.cwd(), stdio: 'inherit' });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
