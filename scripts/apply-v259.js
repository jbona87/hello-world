const fs = require('fs');
const path = require('path');

const root = path.join(process.cwd(), 'source');
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function write(rel, value) { fs.writeFileSync(path.join(root, rel), value); }
function replaceOnce(text, search, replacement, label) {
  const index = typeof search === 'string' ? text.indexOf(search) : text.search(search);
  if (index < 0) throw new Error(`V2.5.9 patch target not found: ${label}`);
  if (typeof search === 'string') return text.slice(0, index) + replacement + text.slice(index + search.length);
  return text.replace(search, replacement);
}

{
  let text = read('src/app/api/analyse/route.ts');

  const insertionPoint = 'async function requestOpenAI(payload: Record<string, unknown>, model: string, timeoutMs: number) {';
  const specificAnalysisHelpers = `const independentShotSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    projectTitle: { type: "string" },
    detectedSummary: { type: "string" },
    pose: { type: "string" },
    expression: { type: "string" },
    wardrobe: { type: "string" },
    lighting: { type: "string" },
    camera: { type: "string" },
    composition: { type: "string" },
    environment: { type: "string" },
    wardrobeContinuity: { type: "string" },
    environmentContinuity: { type: "string" },
    lightingContinuity: { type: "string" },
    colourTreatment: { type: "string" },
  },
  required: [
    "projectTitle", "detectedSummary", "pose", "expression", "wardrobe", "lighting",
    "camera", "composition", "environment", "wardrobeContinuity",
    "environmentContinuity", "lightingContinuity", "colourTreatment",
  ],
} as const;

type IndependentShotFacts = {
  projectTitle: string;
  detectedSummary: string;
  pose: string;
  expression: string;
  wardrobe: string;
  lighting: string;
  camera: string;
  composition: string;
  environment: string;
  wardrobeContinuity: string;
  environmentContinuity: string;
  lightingContinuity: string;
  colourTreatment: string;
};

const VAGUE_VISUAL_PHRASES = [
  "preserve visible", "match the source", "use the source", "source garment",
  "appropriate to this frame", "exact primary-reference", "exact target camera view",
  "visible wardrobe continuity", "visible lighting character", "preserve this frame",
  "selected source wardrobe", "primary shot's visible", "use a plausible modifier",
];

function independentFactsAreSpecific(facts: IndependentShotFacts) {
  const visual = [facts.pose, facts.wardrobe, facts.lighting, facts.camera, facts.composition, facts.environment]
    .join(" ")
    .toLowerCase();
  if (VAGUE_VISUAL_PHRASES.some((phrase) => visual.includes(phrase))) return false;
  if (facts.wardrobe.trim().split(/\s+/).length < 8) return false;
  if (facts.lighting.trim().split(/\s+/).length < 8) return false;
  if (facts.pose.trim().split(/\s+/).length < 10) return false;
  return true;
}

function buildIndependentAnalysis(
  facts: IndependentShotFacts,
  options: NonNullable<AnalyseRequest["options"]>,
  hasIdentity: boolean,
) {
  const suggestedConfig = Object.fromEntries(
    SUGGESTED_STRING_FIELDS.map((field) => [field, fallbackSuggestedValue(field)]),
  ) as Record<string, string>;

  Object.assign(suggestedConfig, {
    pose: facts.pose,
    expression: facts.expression,
    wardrobe: facts.wardrobe,
    lighting: facts.lighting,
    camera: facts.camera,
    composition: facts.composition,
    background: facts.environment,
    mood: facts.colourTreatment,
    mainPosition: facts.pose,
    bodyOrientation: facts.pose,
    weightDistribution: facts.pose,
    headPosition: facts.pose,
    armPosition: facts.pose,
    handPosition: facts.pose,
    gaze: facts.expression,
    shotSize: facts.composition,
    cropRule: facts.composition,
    cameraAngle: facts.camera,
    cameraDistance: facts.camera,
    lens: facts.camera,
    lightSource: facts.lighting,
    lightDirection: facts.lighting,
    lightQuality: facts.lighting,
    wardrobeCategory: facts.wardrobe,
    mainGarment: facts.wardrobe,
    silhouette: facts.wardrobe,
    material: facts.wardrobe,
    stylingState: facts.wardrobe,
    accessories: facts.wardrobe,
    locationCategory: facts.environment,
    surface: facts.environment,
    environmentalDepth: facts.environment,
    props: facts.environment,
    colourGrade: facts.colourTreatment,
  });

  return {
    projectTitle: facts.projectTitle || options.shootName || "PromptLens series shot",
    detectedSummary: facts.detectedSummary,
    shootDNA: {
      subjectLock: hasIdentity
        ? "Use the uploaded identity reference as the sole recognisable facial identity source."
        : "Use the same anonymous adult subject consistently across the series.",
      wardrobeLock: facts.wardrobeContinuity,
      environmentLock: facts.environmentContinuity,
      lightingLock: facts.lightingContinuity,
      cameraLanguage: facts.camera,
      colourTreatment: facts.colourTreatment,
      realismLock: "Natural anatomy, true-to-reference perspective, realistic skin texture and physically accurate garment materials.",
    },
    suggestedConfig,
    shots: [{
      index: 1,
      role: "shot",
      pose: facts.pose,
      expression: facts.expression,
      wardrobe: facts.wardrobe,
      lighting: facts.lighting,
      camera: facts.camera,
      composition: facts.composition,
      environment: facts.environment,
    }],
    conflicts: [],
    coach: [
      "The clothing, lighting, pose, camera and setting were read directly from this individual source image.",
      "This shot remains independent; no pose or viewpoint is borrowed from another carousel slide or Reel frame.",
    ],
  };
}

`;
  text = replaceOnce(text, insertionPoint, specificAnalysisHelpers + insertionPoint, 'independent shot analysis helpers');

  const sourceSummaryEnd = `      : "No URL source context.";\n\n    function buildPayload(selectedImages: ReferenceImageInput[], compactRetry = false) {`;
  const independentBranch = `      : "No URL source context.";\n\n    const independentSeriesShot =
      sourceContext?.reelFrameMode === "independent-series-shot" ||
      /Analyse only series shot/i.test(options.notes || "");

    if (independentSeriesShot) {
      const shotImage =
        images.find((image) => image.role === "shot") ??
        images.find((image) => image.role !== "identity");
      const identityImage = images.find((image) => image.role === "identity");
      if (!shotImage?.dataUrl) throw new Error("The independent series shot did not include a usable source image.");

      function buildIndependentPayload() {
        const content: Array<Record<string, string>> = [{
          type: "input_text",
          text: \`Read this ONE source image as a senior fashion photographer and stylist. Return concrete visible facts, not placeholders and not instructions to “match the source”.

This is an independent image in a multi-shot series. Analyse only this image's own viewpoint.

MANDATORY SPECIFICITY:
- Wardrobe: explicitly name the garment category. If it is swimwear, say bikini, one-piece swimsuit, swim brief, bikini top or bikini bottom as visibly appropriate. Describe cut, neckline, straps, coverage, colour, pattern, hardware, trim, fit, wet/dry appearance, sheen and material cues that are actually visible.
- Lighting: state apparent source, direction relative to camera/subject, hardness or softness, highlight placement, shadow direction, fill level, colour temperature and whether the light appears natural or artificial.
- Pose: describe torso angle, hip/shoulder relationship, weight support, head angle, arm positions, hand placement and leg position.
- Camera: describe shot size, camera height, camera side, approximate lens perspective, subject distance and depth of field.
- Composition: describe crop, subject placement, horizon, negative space and frame balance.
- Environment: name the visible location, surfaces, background elements, props and atmosphere.

Do not use vague phrases such as “preserve visible wardrobe”, “match the source”, “appropriate expression”, “exact target view”, or “use the source garment category”. Do not copy or describe the source person's identity. The source person is an anonymous pose/styling placeholder.

Shoot context: \${options.shootName || sourceContext?.title || "Untitled series"}
Project type: \${options.projectType || "fashion editorial"}
User notes: \${options.notes || "None"}\`,
        }];
        content.push({ type: "input_text", text: \`Exact source shot: \${shotImage.name || "series shot"}\` });
        content.push({ type: "input_image", image_url: shotImage.dataUrl!, detail: "high" });
        if (identityImage?.dataUrl) {
          content.push({
            type: "input_text",
            text: "Identity reference: use only to note that the final subject identity is supplied separately. Do not let it alter the source shot's clothing, pose, camera, lighting or location.",
          });
          content.push({ type: "input_image", image_url: identityImage.dataUrl, detail: "high" });
        }
        return {
          instructions: "You are PromptLens Visual Facts. Describe only visible photographic and styling evidence with concrete nouns, colours, materials, directions and spatial relationships. Never answer with generic preservation instructions.",
          input: [{ role: "user", content }],
          text: {
            format: {
              type: "json_schema",
              name: "promptlens_independent_shot_facts",
              description: "Concrete visible facts for one independent fashion or portrait source image.",
              strict: true,
              schema: independentShotSchema,
            },
          },
          max_output_tokens: 2_800,
        } as Record<string, unknown>;
      }

      const attempts = requestedModel === balancedModel
        ? [{ model: balancedModel, timeout: 50_000 }]
        : [
            { model: requestedModel, timeout: 18_000 },
            { model: balancedModel, timeout: 38_000 },
          ];
      let lastReason = "The visual facts analysis did not complete.";
      for (const attempt of attempts) {
        try {
          const result = await requestOpenAI(buildIndependentPayload(), attempt.model, attempt.timeout);
          if (!result.response.ok) {
            const apiError = result.payload as { error?: { message?: string } };
            lastReason = apiError.error?.message || \`OpenAI request failed (\${result.response.status}).\`;
            continue;
          }
          const outputText = extractOutputText(result.payload);
          if (!outputText) {
            lastReason = "OpenAI returned no visual facts.";
            continue;
          }
          const facts = parseJson(outputText) as IndependentShotFacts;
          if (!independentFactsAreSpecific(facts)) {
            lastReason = "The first visual pass was too vague, so PromptLens requested a more detailed pass.";
            continue;
          }
          return Response.json({
            analysis: buildIndependentAnalysis(facts, options, Boolean(identityImage)),
            meta: {
              requestedSpeed,
              model: attempt.model,
              fallback: attempt.model !== requestedModel,
              degraded: false,
              visualFacts: true,
              referencesReceived: images.length,
              referencesAnalysed: identityImage ? 2 : 1,
              referencesDeferred: 0,
            },
          });
        } catch (error) {
          lastReason = error instanceof Error ? error.message : lastReason;
        }
      }

      return Response.json(
        {
          error: \`PromptLens could not read the clothing, lighting and pose accurately enough for this shot. No vague fallback prompt was created. \${lastReason}\`,
        },
        { status: 504 },
      );
    }

    function buildPayload(selectedImages: ReferenceImageInput[], compactRetry = false) {`;
  text = replaceOnce(text, sourceSummaryEnd, independentBranch, 'independent series visual facts branch');

  write('src/app/api/analyse/route.ts', text);
}

{
  let text = read('src/lib/prompt-builder.ts');

  const priorityEnd = `The shot-specific pose, camera, crop, composition and perspective above override generic defaults whenever they conflict.\`;
}\n\nexport function buildPromptOutput(`;
  const conciseBuilder = `The shot-specific pose, camera, crop, composition and perspective above override generic defaults whenever they conflict.\`;
}

function buildStandaloneSeriesPrompt(
  config: PromptConfig,
  analysis: AnalysisResult,
  sharedContinuityPrompt: string,
  index: number,
  total: number,
  negativePrompt: string,
): string {
  const shot = analysis.shots[0];
  const identity = config.identityStrength === "none"
    ? "Use the same anonymous adult subject established for this series."
    : "Use the uploaded identity reference as the sole facial identity source. Preserve the same recognisable face, natural asymmetry, skin tone, age appearance, hairline and selected hairstyle without beautification or facial reshaping.";
  const physical = config.preserveBodyProportions
    ? "Preserve the identity subject's natural physique and realistic limb proportions."
    : "Maintain believable adult anatomy and natural proportions.";
  const generator = generatorInstruction(config);

  return [
    \`SERIES SHOT \${index} OF \${total} — FULL STANDALONE PROMPT\`,
    \`SUBJECT AND CONTINUITY\\n\${identity}\\n\${physical}\\n\${sharedContinuityPrompt.replace(/^SERIES CONTINUITY LOCK\\n/, "")}\`,
    \`EXACT SHOT DESIGN\\nPose and body mechanics: \${shot?.pose || analysis.detectedSummary}\\nExpression and gaze: \${shot?.expression || "Natural expression matching the visible moment."}\`,
    \`WARDROBE AND STYLING\\n\${shot?.wardrobe || analysis.shootDNA.wardrobeLock}\nRender the named garment construction, straps, closures, fit, coverage, trim, colour, pattern, material sheen, tension and contact with the body exactly as described. Do not replace a bikini or swimwear look with generic clothing.\`,
    \`LIGHTING\\n\${shot?.lighting || analysis.shootDNA.lightingLock}\nKeep the stated source direction, highlight placement, shadow direction, softness, fill level and colour temperature coherent.\`,
    \`CAMERA AND COMPOSITION\\nCamera and lens perspective: \${shot?.camera || analysis.shootDNA.cameraLanguage}\\nFraming and composition: \${shot?.composition || "Preserve the exact visible crop and subject placement."}\nRecreate only this shot's viewpoint; do not average it with another image in the series.\`,
    \`LOCATION AND ATMOSPHERE\\n\${shot?.environment || analysis.shootDNA.environmentLock}\\nColour and finish: \${analysis.shootDNA.colourTreatment}\`,
    \`REALISM\\n\${analysis.shootDNA.realismLock} Keep skin texture, anatomy, hands, fabric or swimwear tension, contact shadows, reflections and depth of field physically believable.\`,
    generator,
    \`AVOID\\n\${negativePrompt}\`,
  ].join("\\n\\n");
}

export function buildPromptOutput(`;
  text = replaceOnce(text, priorityEnd, conciseBuilder, 'concise standalone series prompt builder');

  const oldShotMap = `  const shotPrompts = limited.map((shotAnalysis, position) => {
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
  });`;
  const newShotMap = `  const shotPrompts = limited.map((shotAnalysis, position) => {
    const index = position + 1;
    const shot = shotAnalysis.shots[0];
    return {
      index,
      title: shot?.wardrobe
        ? \`\${shot.wardrobe.split(/[.;]/)[0]} — shot \${index}\`
        : shot?.pose || shotAnalysis.projectTitle || \`Series shot \${index}\`,
      prompt: buildStandaloneSeriesPrompt(
        config,
        shotAnalysis,
        sharedContinuityPrompt,
        index,
        total,
        core.negativePrompt,
      ),
      compactPrompt: \`Series shot \${index} of \${total}. \${shot?.pose || "Exact source pose"}; \${shot?.wardrobe || shotAnalysis.shootDNA.wardrobeLock}; \${shot?.lighting || shotAnalysis.shootDNA.lightingLock}; \${shot?.camera || shotAnalysis.shootDNA.cameraLanguage}; \${shot?.environment || shotAnalysis.shootDNA.environmentLock}.\`,
    };
  });`;
  text = replaceOnce(text, oldShotMap, newShotMap, 'replace verbose generic shot prompts');

  write('src/lib/prompt-builder.ts', text);
}

{
  let text = read('src/components/PromptLensV25.tsx');
  text = replaceOnce(
    text,
    '        updateConfig("shootName", payload.title.slice(0, 90));',
    '        updateConfig("shootName", decodeDisplayText(payload.title).slice(0, 90));',
    'decode imported shoot title',
  );
  text = text.replaceAll('V2.5.8', 'V2.5.9');
  write('src/components/PromptLensV25.tsx', text);
}

{
  let text = read('src/app/layout.tsx');
  text = text.replaceAll('V2.5.8', 'V2.5.9');
  write('src/app/layout.tsx', text);
}

{
  const packagePath = path.join(root, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  packageJson.version = '2.5.9';
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
}

console.log('Applied PromptLens V2.5.9 concrete visual facts and concise series prompts.');
