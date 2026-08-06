const fs = require('fs');
const path = require('path');

const root = path.join(process.cwd(), 'source');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}
function write(rel, value) {
  fs.writeFileSync(path.join(root, rel), value);
}
function replaceOnce(text, search, replacement, label) {
  const index = typeof search === 'string' ? text.indexOf(search) : text.search(search);
  if (index < 0) throw new Error(`Patch target not found: ${label}`);
  if (typeof search === 'string') return text.slice(0, index) + replacement + text.slice(index + search.length);
  return text.replace(search, replacement);
}

{
  let text = read('src/lib/types.ts');
  text = replaceOnce(text, 'export type AiSpeed = "fast" | "balanced" | "quality";\n', 'export type AiSpeed = "fast" | "balanced" | "quality";\n\nexport type SeriesOutputMode = "separate" | "master" | "single";\n', 'SeriesOutputMode type');
  text = replaceOnce(text, '  aiSpeed: AiSpeed;\n', '  aiSpeed: AiSpeed;\n  seriesOutputMode: SeriesOutputMode;\n', 'PromptConfig seriesOutputMode');
  text = replaceOnce(text, 'export type PromptOutput = {\n', 'export type ShotPrompt = {\n  index: number;\n  title: string;\n  prompt: string;\n  compactPrompt: string;\n};\n\nexport type PromptOutput = {\n', 'ShotPrompt type');
  text = replaceOnce(text, '  validations: PortraitValidation[];\n};\n\nexport type SavedShoot', '  validations: PortraitValidation[];\n  sharedContinuityPrompt: string;\n  shotPrompts: ShotPrompt[];\n  promptPack: string;\n};\n\nexport type SavedShoot', 'PromptOutput series fields');
  text = replaceOnce(text, '  analysis: AnalysisResult | null;\n};\n', '  analysis: AnalysisResult | null;\n  seriesAnalyses?: AnalysisResult[];\n};\n', 'SavedShoot series analyses');
  write('src/lib/types.ts', text);
}

{
  let text = read('src/lib/presets.ts');
  text = replaceOnce(text, '  aiSpeed: "fast",\n', '  aiSpeed: "fast",\n  seriesOutputMode: "separate",\n', 'DEFAULT_CONFIG series output mode');
  write('src/lib/presets.ts', text);
}

{
  let text = read('src/lib/prompt-builder.ts');
  const oldFn = /export function buildPromptOutput\(config: PromptConfig, analysis: AnalysisResult \| null\): PromptOutput \{[\s\S]*?\n\}\s*$/;
  const newFn = `type CorePromptOutput = Pick<
  PromptOutput,
  "fullPrompt" | "compactPrompt" | "negativePrompt" | "codeView" | "structuredConfig" | "validations"
>;

function buildCorePromptOutput(config: PromptConfig, analysis: AnalysisResult | null): CorePromptOutput {
  const blocks: string[] = [];
  blocks.push(SOURCE_PERSON_ANONYMITY_LOCK);
  blocks.push(...identityBlocks(config));
  blocks.push(mainDirection(config));

  const profile = physicalProfileBlock(config);
  if (profile) blocks.push(profile);

  const dna = shootDnaBlock(analysis);
  if (dna) blocks.push(dna);

  const reconstruction = sourceReconstructionBlock(config, analysis);
  if (reconstruction) blocks.push(reconstruction);

  blocks.push(buildPortraitRuleBlock(config));
  blocks.push(poseBlock(config));
  blocks.push(expressionBlock(config));
  blocks.push(compositionBlock(config));
  blocks.push(cameraBlock(config));
  blocks.push(lightingBlock(config));
  blocks.push(wardrobeBlock(config));
  blocks.push(beautyBlock(config));
  blocks.push(environmentBlock(config));
  blocks.push(finishBlock(config));

  if (config.notes.trim()) blocks.push(\`ADDITIONAL USER DIRECTION\\n\${config.notes.trim()}\`);

  const corrections = validationBlock(config);
  if (corrections) blocks.push(corrections);

  blocks.push(generatorInstruction(config));

  const negativePrompt = \`Avoid: \${NEGATIVE_CORE.join(", ")}.\`;
  blocks.push(\`AVOID\\n\${negativePrompt}\`);

  return {
    fullPrompt: blocks.join("\\n\\n"),
    compactPrompt: compactPrompt(config, analysis),
    negativePrompt,
    codeView: \`const promptConfig = \${JSON.stringify(config, null, 2)};\`,
    structuredConfig: config,
    validations: validatePortraitConfig(config),
  };
}

function buildSharedContinuityPrompt(config: PromptConfig, analysis: AnalysisResult | null): string {
  const dna = analysis?.shootDNA;
  const identity = config.identityStrength === "none"
    ? "Use the same anonymous adult subject consistently across every image."
    : "Use the uploaded identity reference as the sole facial identity source in every image. Preserve the same recognisable facial geometry, natural asymmetry, skin tone, age appearance, hairline and selected hairstyle across the complete series.";

  return [
    "SERIES CONTINUITY LOCK",
    identity,
    config.preserveBodyProportions ? "Preserve the same natural physique, shoulder width, limb proportions and overall build across every shot." : "Keep the same believable adult subject proportions across the set.",
    dna ? \`Wardrobe continuity: \${dna.wardrobeLock}\` : \`Wardrobe continuity: \${config.wardrobe}; \${config.mainGarment}; \${config.material}; \${config.stylingState}.\`,
    dna ? \`Environment continuity: \${dna.environmentLock}\` : \`Environment continuity: \${config.locationCategory}; \${config.background}; \${config.surface}.\`,
    dna ? \`Lighting continuity: \${dna.lightingLock}\` : \`Lighting continuity: \${config.lightSource}; \${config.lightModifier}; \${config.lightDirection}; \${config.lightQuality}.\`,
    dna ? \`Colour continuity: \${dna.colourTreatment}\` : \`Colour continuity: \${config.colourGrade}; \${config.retouching}; \${config.grain}.\`,
    "Keep wardrobe construction, styling, makeup, hair, colour treatment, skin rendering and production quality consistent. Each prompt remains a complete standalone generation brief; do not rely on instructions from another prompt.",
  ].join("\\n");
}

function buildShotPriorityBlock(analysis: AnalysisResult, index: number, total: number): string {
  const shot = analysis.shots[0];
  return \`SERIES SHOT \${index} OF \${total} — EXACT INDEPENDENT TARGET
This is a complete standalone prompt for one image in a coherent series. Recreate only this shot's own viewpoint. Do not blend its pose, framing or camera perspective with another carousel image or Reel frame.
\${shot ? \`Exact shot design: pose — \${shot.pose}; expression — \${shot.expression}; wardrobe — \${shot.wardrobe}; lighting — \${shot.lighting}; camera — \${shot.camera}; composition — \${shot.composition}; environment — \${shot.environment}.\` : \`Use this reference as the sole pose, camera, framing and perspective target for shot \${index}.\`}
The shot-specific pose, camera, crop, composition and perspective above override generic defaults whenever they conflict.\`;
}

export function buildPromptOutput(
  config: PromptConfig,
  analysis: AnalysisResult | null,
  seriesAnalyses: AnalysisResult[] = [],
): PromptOutput {
  const core = buildCorePromptOutput(config, analysis);
  const analyses = config.seriesOutputMode === "separate"
    ? (seriesAnalyses.length
        ? seriesAnalyses
        : analysis?.shots.length
          ? analysis.shots.map((shot) => ({ ...analysis, shots: [shot] }))
          : [])
    : analysis
      ? [analysis]
      : [];
  const limited = analyses.slice(0, 5);
  const total = limited.length;
  const sharedContinuityPrompt = buildSharedContinuityPrompt(config, analysis ?? limited[0] ?? null);
  const shotPrompts = limited.map((shotAnalysis, position) => {
    const shotCore = buildCorePromptOutput(config, shotAnalysis);
    const index = position + 1;
    const shot = shotAnalysis.shots[0];
    return {
      index,
      title: shot?.pose || shotAnalysis.projectTitle || \`Series shot \${index}\`,
      prompt: [
        buildShotPriorityBlock(shotAnalysis, index, total),
        sharedContinuityPrompt,
        shotCore.fullPrompt,
      ].join("\\n\\n"),
      compactPrompt: \`Series shot \${index} of \${total}. \${shotCore.compactPrompt}\`,
    };
  });
  const promptPack = shotPrompts.length
    ? [
        \`PROMPTLENS SERIES PACK — \${shotPrompts.length} FULL STANDALONE PROMPTS\`,
        sharedContinuityPrompt,
        ...shotPrompts.map((item) => \`==============================\\nPROMPT \${item.index} — \${item.title}\\n==============================\\n\${item.prompt}\`),
        \`==============================\\nSHARED NEGATIVE PROMPT\\n==============================\\n\${core.negativePrompt}\`,
      ].join("\\n\\n")
    : core.fullPrompt;

  return {
    ...core,
    sharedContinuityPrompt,
    shotPrompts,
    promptPack,
  };
}
`;
  text = replaceOnce(text, oldFn, newFn, 'buildPromptOutput refactor');
  write('src/lib/prompt-builder.ts', text);
}

{
  let text = read('src/components/PromptLensV25.tsx');
  text = replaceOnce(text, 'type ResultTab = "prompt" | "short" | "negative" | "shot" | "advanced";', 'type ResultTab = "pack" | "prompt" | "short" | "negative" | "shot" | "advanced";', 'ResultTab pack');
  text = replaceOnce(text, '  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);\n', '  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);\n  const [seriesAnalyses, setSeriesAnalyses] = useState<AnalysisResult[]>([]);\n', 'series analyses state');
  text = replaceOnce(text, '  const promptOutput = useMemo(() => buildPromptOutput(config, analysis), [config, analysis]);', '  const promptOutput = useMemo(() => buildPromptOutput(config, analysis, seriesAnalyses), [config, analysis, seriesAnalyses]);', 'series prompt output memo');

  const analyseFn = /  async function analyseReferences\(\) \{[\s\S]*?\n  \}\n\n  function openManualResult\(\) \{/;
  const newAnalyseFn = `  async function analyseReferences() {
    if (!sourceReady) {
      setError("Choose a URL, upload a source image, or describe the shot first.");
      setScreen("source");
      return;
    }
    const hasIdentity = Boolean(identityReference);
    setLoading(true);
    setError("");
    setScreen("processing");
    try {
      const selectedUrlContext = buildSelectedUrlContext();
      const manualContext = manualDescription.trim()
        ? {
            sourceUrl: "", platform: "Manual description", contentType: "text brief",
            title: config.shootName, description: manualDescription.trim(), creativeSummary: manualDescription.trim(),
            carouselPlan: "", reelPlan: "", reusableElements: [], adaptationIdeas: [],
            primaryShotName: "", reelFrameMode: "manual-description",
          }
        : undefined;
      const baseContext = selectedUrlContext ?? manualContext;

      async function requestAnalysis(
        imagePack: ReferenceImage[],
        sourceContext: typeof baseContext,
        extraNotes = "",
      ): Promise<AnalysisResult> {
        const response = await fetch("/api/analyse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            images: imagePack.map((reference) => ({
              dataUrl: reference.dataUrl, role: reference.role, name: reference.name,
            })),
            sourceContext,
            options: {
              shootName: config.shootName, projectType: config.projectType, mode: config.mode,
              generator: config.generator, aiSpeed: config.aiSpeed,
              identityStrength: hasIdentity ? config.identityStrength : "none",
              preserveHair: hasIdentity ? config.preserveHair : false,
              preserveBodyProportions: hasIdentity ? config.preserveBodyProportions : false,
              preserveSourcePerspective: config.preserveSourcePerspective,
              faceDetailPriority: config.faceDetailPriority, subjectProfile: config.subjectProfile,
              notes: [
                config.notes, extraNotes,
                outputs.carousel ? "Create a carousel shot plan." : "",
                outputs.reel ? "Create a Reel shot plan." : "",
                outputs.video ? "Include video-generation direction." : "",
              ].filter(Boolean).join("\n"),
            },
          }),
        });
        const payload = (await readApiResponse(response)) as { analysis?: AnalysisResult; error?: string };
        if (!response.ok || !payload.analysis) throw new Error(payload.error || "The analysis did not return a usable result.");
        return payload.analysis;
      }

      let primaryAnalysis: AnalysisResult;
      let nextSeriesAnalyses: AnalysisResult[] = [];

      if (config.seriesOutputMode === "separate" && sourceReferences.length > 1) {
        const results = new Array<AnalysisResult>(Math.min(sourceReferences.length, MAX_SOURCE_REFERENCES));
        let cursor = 0;
        const workers = Array.from({ length: Math.min(2, results.length) }, async () => {
          while (cursor < results.length) {
            const index = cursor;
            cursor += 1;
            const source = sourceReferences[index];
            const sourceContext = baseContext
              ? { ...baseContext, primaryShotName: source.name, reelFrameMode: "independent-series-shot" }
              : baseContext;
            const imagePack = [
              ...(identityReference ? [identityReference] : []),
              { ...source, role: "shot" as const, name: \`SERIES SHOT \${index + 1} — \${source.name}\` },
            ];
            results[index] = await requestAnalysis(
              imagePack,
              sourceContext,
              \`Analyse only series shot \${index + 1} of \${results.length}. Treat this source image as the sole exact pose, crop, camera and perspective target. Return a complete independent shot analysis while preserving series continuity.\`,
            );
          }
        });
        await Promise.all(workers);
        nextSeriesAnalyses = results;
        primaryAnalysis = results[0];
        setResultTab("pack");
      } else {
        const defaultImages = config.seriesOutputMode === "single" && sourceReferences.length > 1
          ? [...(identityReference ? [identityReference] : []), sourceReferences[0]]
          : references;
        primaryAnalysis = await requestAnalysis(defaultImages, baseContext);
        setResultTab("prompt");
      }

      setAnalysis(primaryAnalysis);
      setSeriesAnalyses(nextSeriesAnalyses);
      setConfig((current) => ({
        ...current,
        ...primaryAnalysis.suggestedConfig,
        seriesOutputMode: current.seriesOutputMode,
        ...(!hasIdentity ? {
          identityStrength: "none" as const, preserveHair: false, preserveBodyProportions: false,
        } : {}),
      }));
      setScreen("result");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The analysis failed.");
      setScreen("direction");
    } finally {
      setLoading(false);
    }
  }

  function openManualResult() {`;
  text = replaceOnce(text, analyseFn, newAnalyseFn, 'analyseReferences multi-shot');

  text = replaceOnce(text, '  function openManualResult() {\n    setAnalysis(null);\n', '  function openManualResult() {\n    setAnalysis(null);\n    setSeriesAnalyses([]);\n    setResultTab("prompt");\n', 'manual result clear series');
  text = replaceOnce(text, '      analysis,\n    };', '      analysis,\n      seriesAnalyses,\n    };', 'save series analyses');
  text = replaceOnce(text, '    setAnalysis(shoot.analysis);\n    setReferences([]);\n    setScreen("result");', '    setAnalysis(shoot.analysis);\n    setSeriesAnalyses(shoot.seriesAnalyses ?? []);\n    setReferences([]);\n    setResultTab((shoot.seriesAnalyses?.length ?? 0) > 1 ? "pack" : "prompt");\n    setScreen("result");', 'load series analyses');
  text = replaceOnce(text, '    setAnalysis(null);\n    setSourceMode(null);', '    setAnalysis(null);\n    setSeriesAnalyses([]);\n    setSourceMode(null);', 'reset series analyses');
  text = replaceOnce(text, '              config={config}\n              outputs={outputs}', '              config={config}\n              shotCount={sourceReferences.length}\n              outputs={outputs}', 'DirectionScreen shot count prop');
  text = replaceOnce(text, '          {screen === "processing" ? <ProcessingScreen count={references.length} speed={config.aiSpeed} /> : null}', '          {screen === "processing" ? <ProcessingScreen count={references.length} speed={config.aiSpeed} seriesMode={config.seriesOutputMode} shotCount={sourceReferences.length} /> : null}', 'ProcessingScreen series props');

  text = replaceOnce(text, 'function DirectionScreen({\n  config,\n  outputs,', 'function DirectionScreen({\n  config,\n  shotCount,\n  outputs,', 'DirectionScreen destructure shotCount');
  text = replaceOnce(text, '  config: PromptConfig;\n  outputs: Record<OutputChoice, boolean>;', '  config: PromptConfig;\n  shotCount: number;\n  outputs: Record<OutputChoice, boolean>;', 'DirectionScreen shotCount type');
  const outputSectionEnd = `      </section>\n\n      <section className="v25-section-block">\n        <div className="v25-section-heading"><div><span>AI PROCESSING</span><h2>Choose speed or detail</h2></div><small>Fast is recommended for most shoots</small></div>`;
  const seriesSection = `      </section>\n\n      {shotCount > 1 ? (\n        <section className="v25-section-block">\n          <div className="v25-section-heading"><div><span>SHOOT SET OUTPUT</span><h2>How should PromptLens build these {shotCount} shots?</h2></div><small>Separate full prompts are recommended</small></div>\n          <div className="v25-choice-stack">\n            {[\n              { value: "separate", title: "Separate full prompt for every selected shot", description: \`Create \${shotCount} complete standalone prompts. Each image keeps its own pose, framing, camera and perspective.\` },\n              { value: "master", title: "One master prompt with shot variations", description: "Create one main prompt and describe the selected images as a connected series." },\n              { value: "single", title: "Only recreate one selected target image", description: "Use the first or exact target image for pose and camera; use the others only for continuity." },\n            ].map((item) => (\n              <button className={classNames("v25-choice-row", config.seriesOutputMode === item.value && "selected")} type="button" key={item.value} onClick={() => onChange("seriesOutputMode", item.value as PromptConfig["seriesOutputMode"])}>\n                <span>{config.seriesOutputMode === item.value ? "●" : "○"}</span><div><strong>{item.title}</strong><small>{item.description}</small></div>\n              </button>\n            ))}\n          </div>\n        </section>\n      ) : null}\n\n      <section className="v25-section-block">\n        <div className="v25-section-heading"><div><span>AI PROCESSING</span><h2>Choose speed or detail</h2></div><small>Fast is recommended for most shoots</small></div>`;
  text = replaceOnce(text, outputSectionEnd, seriesSection, 'series output mode UI');

  const processingRe = /function ProcessingScreen\(\{ count, speed \}: \{ count: number; speed: PromptConfig\["aiSpeed"\] \}\) \{[\s\S]*?\n\}\n\nfunction ResultScreen/;
  const processingNew = `function ProcessingScreen({ count, speed, seriesMode, shotCount }: { count: number; speed: PromptConfig["aiSpeed"]; seriesMode: PromptConfig["seriesOutputMode"]; shotCount: number }) {\n  const speedLabel = speed === "fast" ? "Fast · GPT-5 nano" : speed === "balanced" ? "Balanced · GPT-5 mini" : "Best detail · GPT-5";\n  const isPack = seriesMode === "separate" && shotCount > 1;\n  return (\n    <div className="v25-processing">\n      <div className="v25-orbit"><span /><i /><b /></div>\n      <span>BUILDING YOUR SHOOT · {speedLabel}</span>\n      <h1>{isPack ? \`Building \${shotCount} complete prompts\` : "PromptLens is doing the technical work"}</h1>\n      <p>{isPack ? "Each selected shot is analysed independently in small batches so its pose, camera and perspective remain exact." : "Separating identity from styling, checking portrait realism, and translating the source into an editable prompt."}</p>\n      <div className="v25-processing-list">\n        <div className="done"><span>✓</span><strong>Reading {count || "the"} reference{count === 1 ? "" : "s"}</strong></div>\n        <div className="done"><span>✓</span><strong>Separating identity from the source person</strong></div>\n        <div className="active"><span>●</span><strong>{isPack ? "Analysing each shot independently" : "Checking pose, camera and lighting realism"}</strong></div>\n        <div><span>○</span><strong>{isPack ? \`Assembling \${shotCount} standalone prompts\` : "Building the final prompt"}</strong></div>\n      </div>\n    </div>\n  );\n}\n\nfunction ResultScreen`;
  text = replaceOnce(text, processingRe, processingNew, 'ProcessingScreen multi-prompt');

  text = replaceOnce(text, '  const warnings = validations.filter((item) => item.severity !== "info");\n  const currentText = tab === "short" ? drafts.short : tab === "negative" ? drafts.negative : drafts.prompt;', '  const warnings = validations.filter((item) => item.severity !== "info");\n  const hasPromptPack = config.seriesOutputMode === "separate" && output.shotPrompts.length > 1;\n  const currentText = tab === "pack" ? output.promptPack : tab === "short" ? drafts.short : tab === "negative" ? drafts.negative : drafts.prompt;', 'ResultScreen prompt pack state');
  text = replaceOnce(text, '<div><span className="v25-success-chip">✓ PROMPT READY</span><h1>Your shoot is ready to generate</h1><p>Built with separated identity, source-shot design and portrait-realism checks.</p></div>\n        <div className="v25-result-actions"><button className="v25-button secondary" type="button" onClick={onFineTune}>Fine-tune</button><button className="v25-button primary" type="button" onClick={() => onCopy("main", drafts.prompt)}>{copied === "main" ? "Copied ✓" : "Copy prompt"}</button></div>', '<div><span className="v25-success-chip">✓ {hasPromptPack ? "PROMPT PACK READY" : "PROMPT READY"}</span><h1>{hasPromptPack ? `${output.shotPrompts.length} full prompts are ready` : "Your shoot is ready to generate"}</h1><p>{hasPromptPack ? "Every selected shot has its own complete prompt while identity, wardrobe and visual continuity stay locked." : "Built with separated identity, source-shot design and portrait-realism checks."}</p></div>\n        <div className="v25-result-actions"><button className="v25-button secondary" type="button" onClick={onFineTune}>Fine-tune</button><button className="v25-button primary" type="button" onClick={() => onCopy("main", hasPromptPack ? output.promptPack : drafts.prompt)}>{copied === "main" ? "Copied ✓" : hasPromptPack ? "Copy all prompts" : "Copy prompt"}</button></div>', 'Result hero prompt pack');
  text = replaceOnce(text, '<div><span>REFERENCE</span><strong>{config.mode === "close reconstruction" ? "Exact structure" : config.mode}</strong></div>', '<div><span>OUTPUT</span><strong>{hasPromptPack ? `${output.shotPrompts.length} standalone prompts` : config.mode === "close reconstruction" ? "Exact structure" : config.mode}</strong></div>', 'Result summary output');
  text = replaceOnce(text, '            {[\n              ["prompt", "Final Prompt"],', '            {[\n              ...(hasPromptPack ? [["pack", `Prompt Pack (${output.shotPrompts.length})`]] : []),\n              ["prompt", hasPromptPack ? "Master Prompt" : "Final Prompt"],', 'Result tabs prompt pack');
  text = replaceOnce(text, '          {tab === "prompt" || tab === "short" || tab === "negative" ? (', '          {tab === "pack" ? <PromptPack output={output} copied={copied} onCopy={onCopy} /> : null}\n\n          {tab === "prompt" || tab === "short" || tab === "negative" ? (', 'PromptPack render');

  text = replaceOnce(text, '\nfunction ShotPlan({ urlImport, analysis, outputs }:', `\nfunction PromptPack({ output, copied, onCopy }: { output: ReturnType<typeof buildPromptOutput>; copied: string; onCopy: (label: string, value: string) => void }) {\n  return (\n    <div className="v25-prompt-pack">\n      <section className="v25-continuity-card">\n        <div><span>SHARED ACROSS THE SET</span><h2>Series continuity</h2><p>Identity, physique, wardrobe, lighting, location and colour treatment stay coherent in every generated image.</p></div>\n        <button className="v25-button secondary compact" type="button" onClick={() => onCopy("continuity", output.sharedContinuityPrompt)}>{copied === "continuity" ? "Copied ✓" : "Copy continuity"}</button>\n        <pre>{output.sharedContinuityPrompt}</pre>\n      </section>\n      <div className="v25-prompt-pack-list">\n        {output.shotPrompts.map((item) => (\n          <article className="v25-shot-prompt-card" key={item.index}>\n            <header><div><span>PROMPT {item.index}</span><h2>{item.title}</h2><p>Full standalone generation prompt</p></div><button className="v25-button secondary compact" type="button" onClick={() => onCopy(\`shot-\${item.index}\`, item.prompt)}>{copied === \`shot-\${item.index}\` ? "Copied ✓" : \`Copy prompt \${item.index}\`}</button></header>\n            <textarea value={item.prompt} readOnly aria-label={\`Full prompt \${item.index}\`} />\n          </article>\n        ))}\n      </div>\n    </div>\n  );\n}\n\nfunction ShotPlan({ urlImport, analysis, outputs }:`, 'PromptPack component');

  text = replaceOnce(text, '  const [formats, setFormats] = useState({ full: true, short: false, negative: false, json: false, shot: outputs.carousel || outputs.reel });', '  const hasPack = output.shotPrompts.length > 1;\n  const [formats, setFormats] = useState({ pack: hasPack, full: !hasPack, short: false, negative: false, json: false, shot: outputs.carousel || outputs.reel });', 'Export formats pack');
  text = replaceOnce(text, '    if (formats.full) parts.push(output.fullPrompt);', '    if (formats.pack && hasPack) parts.push(output.promptPack);\n    if (formats.full) parts.push(output.fullPrompt);', 'Export prompt pack content');
  text = replaceOnce(text, '      ["full", "Full prompt — TXT"], ["short", "Short prompt — TXT"],', '      ...(hasPack ? [["pack", `${output.shotPrompts.length} full prompts — TXT`]] : []), ["full", hasPack ? "Master prompt — TXT" : "Full prompt — TXT"], ["short", "Short prompt — TXT"],', 'Export pack checkbox');

  text = text.replaceAll('V2.5.7', 'V2.5.8');
  write('src/components/PromptLensV25.tsx', text);
}

{
  let text = read('src/app/globals.css');
  text += `\n\n/* PromptLens V2.5.8 multi-shot prompt pack */\n.v25-prompt-pack { display: grid; gap: 22px; padding: 22px; }\n.v25-continuity-card, .v25-shot-prompt-card { border: 1px solid rgba(148,163,184,.2); background: rgba(15,23,42,.72); border-radius: 18px; overflow: hidden; }\n.v25-continuity-card { padding: 22px; display: grid; gap: 16px; }\n.v25-continuity-card > div:first-child { display: grid; gap: 6px; }\n.v25-continuity-card span, .v25-shot-prompt-card header span { color: #a78bfa; font-size: 11px; font-weight: 800; letter-spacing: .12em; }\n.v25-continuity-card h2, .v25-shot-prompt-card h2 { margin: 0; color: #f8fafc; }\n.v25-continuity-card p, .v25-shot-prompt-card p { margin: 0; color: #94a3b8; }\n.v25-continuity-card pre { margin: 0; padding: 16px; border-radius: 14px; background: rgba(2,6,23,.75); color: #cbd5e1; white-space: pre-wrap; font: 13px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace; }\n.v25-prompt-pack-list { display: grid; gap: 18px; }\n.v25-shot-prompt-card header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding: 20px; border-bottom: 1px solid rgba(148,163,184,.16); }\n.v25-shot-prompt-card header > div { display: grid; gap: 5px; }\n.v25-shot-prompt-card textarea { width: 100%; min-height: 520px; padding: 20px; resize: vertical; border: 0; outline: 0; background: rgba(2,6,23,.72); color: #e2e8f0; font: 13px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace; }\n@media (max-width: 720px) { .v25-prompt-pack { padding: 14px; } .v25-shot-prompt-card header { flex-direction: column; } .v25-shot-prompt-card textarea { min-height: 420px; } }\n`;
  write('src/app/globals.css', text);
}

{
  const packagePath = path.join(root, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  pkg.version = '2.5.8';
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
  for (const rel of ['src/app/layout.tsx', 'README.md', 'IMPLEMENTATION_NOTES.md']) {
    const full = path.join(root, rel);
    if (fs.existsSync(full)) fs.writeFileSync(full, fs.readFileSync(full, 'utf8').replaceAll('V2.5.7', 'V2.5.8'));
  }
}

console.log('Applied PromptLens V2.5.8 multi-shot prompt pack patch.');
