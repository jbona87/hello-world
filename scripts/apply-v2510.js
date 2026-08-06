const fs = require('fs');
const path = require('path');

const root = path.join(process.cwd(), 'source');
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function write(rel, value) { fs.writeFileSync(path.join(root, rel), value); }
function replaceOnce(text, search, replacement, label) {
  const index = typeof search === 'string' ? text.indexOf(search) : text.search(search);
  if (index < 0) throw new Error(`V2.5.10 patch target not found: ${label}`);
  if (typeof search === 'string') return text.slice(0, index) + replacement + text.slice(index + search.length);
  return text.replace(search, replacement);
}

{
  let text = read('src/components/PromptLensV25.tsx');

  text = replaceOnce(
    text,
    `      setUrlImport(payload);\n      setUrlSelections(DEFAULT_URL_SELECTIONS);\n      setSelectedMedia(payload.media.map((_, index) => index));\n      setPrimaryMediaIndex(0);`,
    `      setUrlImport(payload);\n      setUrlSelections(DEFAULT_URL_SELECTIONS);\n      let requestedCarouselIndex: number | null = null;\n      try {\n        const rawIndex = new URL(value).searchParams.get("img_index");\n        const parsedIndex = rawIndex ? Number.parseInt(rawIndex, 10) : Number.NaN;\n        if (Number.isInteger(parsedIndex) && parsedIndex > 0 && payload.media.length) {\n          requestedCarouselIndex = Math.min(parsedIndex - 1, payload.media.length - 1);\n        }\n      } catch {\n        requestedCarouselIndex = null;\n      }\n      setSelectedMedia(\n        requestedCarouselIndex === null\n          ? payload.media.map((_, index) => index)\n          : [requestedCarouselIndex],\n      );\n      setPrimaryMediaIndex(requestedCarouselIndex ?? 0);`,
    'honour Instagram img_index as exact target',
  );

  const oldSingleBranch = `      } else {\n        const defaultImages = config.seriesOutputMode === "single" && sourceReferences.length > 1\n          ? [...(identityReference ? [identityReference] : []), sourceReferences[0]]\n          : references;\n        primaryAnalysis = await requestAnalysis(defaultImages, baseContext);\n        setResultTab("prompt");\n      }`;
  const newSingleBranch = `      } else if (sourceReferences.length > 0 && (sourceReferences.length === 1 || config.seriesOutputMode === "single")) {\n        const source = sourceReferences[0];\n        const singleShotContext = {\n          sourceUrl: baseContext?.sourceUrl ?? "",\n          platform: baseContext?.platform ?? (sourceMode === "url" ? "URL import" : "Uploaded image"),\n          contentType: baseContext?.contentType ?? "single image",\n          title: baseContext?.title ?? config.shootName,\n          description: baseContext?.description ?? "",\n          creativeSummary: baseContext?.creativeSummary ?? "",\n          carouselPlan: baseContext?.carouselPlan ?? "",\n          reelPlan: baseContext?.reelPlan ?? "",\n          reusableElements: baseContext?.reusableElements ?? [],\n          adaptationIdeas: baseContext?.adaptationIdeas ?? [],\n          primaryShotName: source.name,\n          reelFrameMode: "independent-series-shot",\n        };\n        const imagePack = [\n          ...(identityReference ? [identityReference] : []),\n          { ...source, role: "shot" as const, name: \`EXACT SINGLE SHOT — \${source.name}\` },\n        ];\n        primaryAnalysis = await requestAnalysis(\n          imagePack,\n          singleShotContext,\n          "Analyse this one exact source image through the concrete Visual Facts route. Name the actual garment, colours, construction, pose, lighting, camera, composition and environment. Never return generic preservation instructions.",\n        );\n        nextSeriesAnalyses = [primaryAnalysis];\n        setResultTab("prompt");\n      } else {\n        primaryAnalysis = await requestAnalysis(references, baseContext);\n        setResultTab("prompt");\n      }`;
  text = replaceOnce(text, oldSingleBranch, newSingleBranch, 'route single images through concrete visual facts');

  text = text.replaceAll('V2.5.9', 'V2.5.10');
  write('src/components/PromptLensV25.tsx', text);
}

{
  let text = read('src/lib/prompt-builder.ts');
  const oldReturn = `  return {\n    ...core,\n    sharedContinuityPrompt,\n    shotPrompts,\n    promptPack,\n  };`;
  const newReturn = `  const singleShotPrompt = shotPrompts[0];\n  const useStandaloneSingle = config.seriesOutputMode !== "master" && Boolean(singleShotPrompt) && shotPrompts.length === 1;\n\n  return {\n    ...core,\n    fullPrompt: useStandaloneSingle && singleShotPrompt ? singleShotPrompt.prompt : core.fullPrompt,\n    compactPrompt: useStandaloneSingle && singleShotPrompt ? singleShotPrompt.compactPrompt : core.compactPrompt,\n    sharedContinuityPrompt,\n    shotPrompts,\n    promptPack,\n  };`;
  text = replaceOnce(text, oldReturn, newReturn, 'use concise standalone prompt for one image');
  write('src/lib/prompt-builder.ts', text);
}

{
  let text = read('src/app/api/analyse/route.ts');
  const oldAttempts = `      const attempts = requestedModel === balancedModel\n        ? [{ model: balancedModel, timeout: 50_000 }]\n        : [\n            { model: requestedModel, timeout: 18_000 },\n            { model: balancedModel, timeout: 38_000 },\n          ];`;
  const newAttempts = `      const visualFactsModel = requestedSpeed === "quality" ? requestedModel : balancedModel;\n      const attempts = [{ model: visualFactsModel, timeout: 48_000 }];`;
  text = replaceOnce(text, oldAttempts, newAttempts, 'use reliable model for visual facts');
  write('src/app/api/analyse/route.ts', text);
}

{
  let text = read('src/app/layout.tsx');
  text = text.replaceAll('V2.5.9', 'V2.5.10');
  write('src/app/layout.tsx', text);
}

{
  const packagePath = path.join(root, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  packageJson.version = '2.5.10';
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
}

console.log('Applied PromptLens V2.5.10 exact carousel target and single-shot Visual Facts routing.');
