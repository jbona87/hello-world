const fs = require('fs');
const path = require('path');

const root = path.join(process.cwd(), 'source');
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function write(rel, value) { fs.writeFileSync(path.join(root, rel), value); }
function replaceOnce(text, search, replacement, label) {
  const index = typeof search === 'string' ? text.indexOf(search) : text.search(search);
  if (index < 0) throw new Error(`V2.5.14 patch target not found: ${label}`);
  if (typeof search === 'string') return text.slice(0, index) + replacement + text.slice(index + search.length);
  return text.replace(search, replacement);
}

{
  let text = read('src/app/api/analyse/route.ts');

  const specificityRe = /function independentFactsAreSpecific\(facts: IndependentShotFacts\) \{[\s\S]*?\n\}\n\nfunction buildIndependentAnalysis/;
  const specificityReplacement = "const ESSENTIAL_VISUAL_FACTS = [\"outfit\", \"pose\", \"lighting\", \"camera\", \"composition\", \"environment\"] as const;\n\nconst VAGUE_FACT_PHRASES = [\n  \"preserve visible\", \"match the source\", \"use the source\", \"source garment\",\n  \"appropriate to this frame\", \"exact primary-reference\", \"exact target camera view\",\n  \"visible wardrobe continuity\", \"visible lighting character\", \"preserve this frame\",\n  \"selected source wardrobe\", \"primary shot's visible\", \"use a plausible modifier\",\n  \"as shown\", \"if present\", \"when present\", \"source-appropriate\",\n];\n\nfunction factIsVague(fact: ExactVisualFact) {\n  const description = fact.description.trim().toLowerCase();\n  return !description || VAGUE_FACT_PHRASES.some((phrase) => description.includes(phrase));\n}\n\nfunction sanitizeExactFact(key: string, fact: ExactVisualFact): ExactVisualFact {\n  const confidence = Math.max(0, Math.min(100, Number.isFinite(fact.confidence) ? Math.round(fact.confidence) : 0));\n  const description = fact.description.trim();\n\n  if (fact.status === \"not visible\") {\n    return {\n      status: \"not visible\",\n      description: description || `The ${key} is outside the visible frame or absent.`,\n      confidence,\n    };\n  }\n\n  if (factIsVague({ ...fact, confidence })) {\n    return {\n      status: \"unclear\",\n      description: `The ${key} could not be resolved confidently from this frame. Do not invent or substitute it.`,\n      confidence,\n    };\n  }\n\n  if (fact.status === \"visible\" && description.split(/\\s+/).length < 4) {\n    return {\n      status: \"unclear\",\n      description: `${description || `The ${key}`} is visible, but its finer construction details are not clear enough to state safely.`,\n      confidence,\n    };\n  }\n\n  return { ...fact, description, confidence };\n}\n\nfunction normalizeIndependentFacts(facts: IndependentShotFacts): IndependentShotFacts {\n  const blueprint = Object.fromEntries(\n    Object.entries(facts.visualBlueprint).map(([key, fact]) => [key, sanitizeExactFact(key, fact as ExactVisualFact)]),\n  ) as IndependentShotFacts[\"visualBlueprint\"];\n  return { ...facts, visualBlueprint: blueprint };\n}\n\nfunction weakVisualCategories(facts: IndependentShotFacts) {\n  const entries = Object.entries(facts.visualBlueprint) as Array<[string, ExactVisualFact]>;\n  return entries\n    .filter(([key, fact]) => {\n      if (factIsVague(fact)) return true;\n      if (fact.status === \"unclear\") return true;\n      if (fact.status === \"visible\" && fact.confidence < (ESSENTIAL_VISUAL_FACTS.includes(key as typeof ESSENTIAL_VISUAL_FACTS[number]) ? 68 : 58)) return true;\n      return false;\n    })\n    .map(([key]) => key);\n}\n\nfunction blueprintSpecificityScore(facts: IndependentShotFacts) {\n  return (Object.entries(facts.visualBlueprint) as Array<[string, ExactVisualFact]>).reduce((score, [key, fact]) => {\n    if (fact.status === \"visible\" && !factIsVague(fact)) {\n      const essentialBonus = ESSENTIAL_VISUAL_FACTS.includes(key as typeof ESSENTIAL_VISUAL_FACTS[number]) ? 30 : 12;\n      return score + essentialBonus + fact.confidence + Math.min(30, fact.description.split(/\\s+/).length);\n    }\n    if (fact.status === \"not visible\") return score + 25 + fact.confidence;\n    return score + Math.max(0, fact.confidence / 3);\n  }, 0);\n}\n\nfunction independentFactsAreSpecific(facts: IndependentShotFacts) {\n  const blueprint = facts.visualBlueprint;\n  const usefulEssentials = ESSENTIAL_VISUAL_FACTS.filter((key) => {\n    const fact = blueprint[key];\n    return fact.status === \"visible\" && !factIsVague(fact) && fact.description.split(/\\s+/).length >= 6 && fact.confidence >= 68;\n  });\n  const outfitUseful = blueprint.outfit.status === \"visible\" && !factIsVague(blueprint.outfit) && blueprint.outfit.description.split(/\\s+/).length >= 8;\n  const poseUseful = blueprint.pose.status === \"visible\" && !factIsVague(blueprint.pose) && blueprint.pose.description.split(/\\s+/).length >= 8;\n  return outfitUseful && poseUseful && usefulEssentials.length >= 4;\n}\n\nfunction unresolvedIndependentFacts(\n  options: NonNullable<AnalyseRequest[\"options\"]>,\n  reason: string,\n): IndependentShotFacts {\n  const unclear = (label: string): ExactVisualFact => ({\n    status: \"unclear\",\n    description: `${label} could not be resolved from the available source image. Do not invent or substitute it.`,\n    confidence: 0,\n  });\n  return {\n    projectTitle: options.shootName || \"PromptLens exact recreation\",\n    detectedSummary: `The source image was received, but the visual inspection was incomplete: ${reason}`,\n    visualBlueprint: {\n      headwear: unclear(\"Headwear\"),\n      outfit: unclear(\"The complete outfit\"),\n      footwear: unclear(\"Footwear\"),\n      accessories: unclear(\"Accessories and props\"),\n      pose: unclear(\"The exact pose\"),\n      expression: unclear(\"Expression and gaze\"),\n      lighting: unclear(\"Lighting\"),\n      camera: unclear(\"Camera perspective\"),\n      composition: unclear(\"Composition\"),\n      environment: unclear(\"The environment\"),\n      hairMakeup: unclear(\"Visible hair and makeup\"),\n      colourFinish: unclear(\"Colour and finish\"),\n    },\n    wardrobeContinuity: \"Use only wardrobe details explicitly resolved in the visual blueprint; do not invent missing construction.\",\n    environmentContinuity: \"Use only environmental details explicitly resolved in the visual blueprint.\",\n    lightingContinuity: \"Use only lighting details explicitly resolved in the visual blueprint.\",\n    colourTreatment: \"Preserve the source image's visible colour treatment without inventing a grade.\",\n  };\n}\n\nfunction buildIndependentAnalysis";
  text = replaceOnce(text, specificityRe, specificityReplacement, 'replace all-or-nothing visual gate');

  text = replaceOnce(
    text,
    'function buildIndependentPayload() {',
    'function buildIndependentPayload(focusCategories: string[] = []) {',
    'focused repair payload signature',
  );

  text = replaceOnce(
    text,
    'Shoot context: ${options.shootName || sourceContext?.title || "Untitled exact recreation"}',
    '${focusCategories.length ? `REINSPECTION PASS\nConcentrate especially on these previously weak categories: ${focusCategories.join(", ")}. Re-read the pixels for these fields and provide concrete visible facts. Keep all other categories accurate and concise.\n` : ""}Shoot context: ${options.shootName || sourceContext?.title || "Untitled exact recreation"}',
    'focused repair instructions',
  );

  text = replaceOnce(
    text,
    '      const visualFactsModel = MODEL_BY_SPEED.quality;\n      const attempts = [{ model: visualFactsModel, timeout: 55_000 }];',
    '      const attempts = [\n        { model: balancedModel, timeout: 32_000 },\n        { model: MODEL_BY_SPEED.quality, timeout: 22_000 },\n      ];',
    'two-pass visual inspection',
  );

  text = replaceOnce(
    text,
    '      let lastReason = "The visual facts analysis did not complete.";\n      for (const attempt of attempts) {',
    '      let lastReason = "The visual facts analysis did not complete.";\n      let bestFacts: IndependentShotFacts | null = null;\n      let bestScore = -1;\n      let focusCategories: string[] = [];\n      for (const attempt of attempts) {',
    'track best visual inspection',
  );

  text = replaceOnce(
    text,
    '          const result = await requestOpenAI(buildIndependentPayload(), attempt.model, attempt.timeout);',
    '          const result = await requestOpenAI(buildIndependentPayload(focusCategories), attempt.model, attempt.timeout);',
    'send focused repair payload',
  );

  const parsedFactsBlock = "          const facts = parseJson(outputText) as IndependentShotFacts;\n          if (!independentFactsAreSpecific(facts)) {\n            lastReason = \"The exact visual inspection did not meet the confidence and specificity gate.\";\n            continue;\n          }\n          return Response.json({\n            analysis: buildIndependentAnalysis(facts, options, Boolean(identityImage)),";
  const newParsedFactsBlock = "          const facts = normalizeIndependentFacts(parseJson(outputText) as IndependentShotFacts);\n          const score = blueprintSpecificityScore(facts);\n          if (score > bestScore) {\n            bestFacts = facts;\n            bestScore = score;\n          }\n          if (!independentFactsAreSpecific(facts)) {\n            focusCategories = weakVisualCategories(facts);\n            lastReason = focusCategories.length\n              ? `PromptLens reinspected weak categories: ${focusCategories.join(\", \")}.`\n              : \"The exact visual inspection remained partially uncertain.\";\n            continue;\n          }\n          return Response.json({\n            analysis: buildIndependentAnalysis(facts, options, Boolean(identityImage)),";
  text = replaceOnce(text, parsedFactsBlock, newParsedFactsBlock, 'retain and repair partial visual facts');

  const abortRe = /\n      return Response\.json\(\n        \{\n          error: `PromptLens could not inspect the complete outfit, headwear, pose, lighting, camera and setting accurately enough\. No generic prompt was created\. \$\{lastReason\}`,\n        \},\n        \{ status: 504 \},\n      \);/;
  const gracefulResult = "      const recoveredFacts = bestFacts ?? unresolvedIndependentFacts(options, lastReason);\n      return Response.json({\n        analysis: buildIndependentAnalysis(recoveredFacts, options, Boolean(identityImage)),\n        meta: {\n          requestedSpeed,\n          model: bestFacts ? \"best available visual pass\" : balancedModel,\n          fallback: true,\n          degraded: true,\n          partialVisualFacts: true,\n          weakCategories: weakVisualCategories(recoveredFacts),\n          referencesReceived: images.length,\n          referencesAnalysed: 1,\n          referencesDeferred: Math.max(0, images.length - 1),\n        },\n      });";
  text = replaceOnce(text, abortRe, '\n' + gracefulResult, 'return partial blueprint instead of 504');

  write('src/app/api/analyse/route.ts', text);
}

{
  let text = read('src/lib/prompt-builder.ts');
  text = replaceOnce(
    text,
    '  return `${label}: ${detail} [confidence ${fact.confidence}%]`;',
    '  return `${label}: ${detail}`;',
    'remove confidence metadata from copy-paste prompt',
  );
  write('src/lib/prompt-builder.ts', text);
}

{
  let text = read('src/components/PromptLensV25.tsx');
  text = text.replaceAll('V2.5.13', 'V2.5.14');
  write('src/components/PromptLensV25.tsx', text);
}

{
  let text = read('src/app/layout.tsx');
  text = text.replaceAll('V2.5.13', 'V2.5.14');
  write('src/app/layout.tsx', text);
}

{
  const packagePath = path.join(root, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  packageJson.version = '2.5.14';
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
}

console.log('Applied PromptLens V2.5.14 resilient visual inspection and partial-category repair.');
