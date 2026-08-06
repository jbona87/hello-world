const fs = require('fs');
const path = require('path');

const root = path.join(process.cwd(), 'source');
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function write(rel, value) { fs.writeFileSync(path.join(root, rel), value); }
function replaceOnce(text, search, replacement, label) {
  const index = typeof search === 'string' ? text.indexOf(search) : text.search(search);
  if (index < 0) throw new Error(`V2.5.13 patch target not found: ${label}`);
  if (typeof search === 'string') return text.slice(0, index) + replacement + text.slice(index + search.length);
  return text.replace(search, replacement);
}

{
  let text = read('src/lib/types.ts');
  const marker = 'export type AnalysisConflict = {';
  const visualTypes = `export type VisualFactStatus = "visible" | "not visible" | "unclear";

export type VisualFact = {
  status: VisualFactStatus;
  description: string;
  confidence: number;
};

export type VisualBlueprint = {
  headwear: VisualFact;
  outfit: VisualFact;
  footwear: VisualFact;
  accessories: VisualFact;
  pose: VisualFact;
  expression: VisualFact;
  lighting: VisualFact;
  camera: VisualFact;
  composition: VisualFact;
  environment: VisualFact;
  hairMakeup: VisualFact;
  colourFinish: VisualFact;
};

`;
  text = replaceOnce(text, marker, visualTypes + marker, 'visual blueprint types');
  text = replaceOnce(
    text,
    '  coach: string[];\n};',
    '  coach: string[];\n  visualBlueprint?: VisualBlueprint;\n};',
    'AnalysisResult visual blueprint',
  );
  write('src/lib/types.ts', text);
}

{
  let text = read('src/app/api/analyse/route.ts');

  const schemaRe = /const independentShotSchema = \{[\s\S]*?\n\} as const;\n\ntype IndependentShotFacts = \{[\s\S]*?\n\};/;
  const schemaReplacement = `const exactVisualFactSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["visible", "not visible", "unclear"] },
    description: { type: "string" },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
  },
  required: ["status", "description", "confidence"],
} as const;

const independentShotSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    projectTitle: { type: "string" },
    detectedSummary: { type: "string" },
    visualBlueprint: {
      type: "object",
      additionalProperties: false,
      properties: {
        headwear: exactVisualFactSchema,
        outfit: exactVisualFactSchema,
        footwear: exactVisualFactSchema,
        accessories: exactVisualFactSchema,
        pose: exactVisualFactSchema,
        expression: exactVisualFactSchema,
        lighting: exactVisualFactSchema,
        camera: exactVisualFactSchema,
        composition: exactVisualFactSchema,
        environment: exactVisualFactSchema,
        hairMakeup: exactVisualFactSchema,
        colourFinish: exactVisualFactSchema,
      },
      required: [
        "headwear", "outfit", "footwear", "accessories", "pose", "expression",
        "lighting", "camera", "composition", "environment", "hairMakeup", "colourFinish",
      ],
    },
    wardrobeContinuity: { type: "string" },
    environmentContinuity: { type: "string" },
    lightingContinuity: { type: "string" },
    colourTreatment: { type: "string" },
  },
  required: [
    "projectTitle", "detectedSummary", "visualBlueprint", "wardrobeContinuity",
    "environmentContinuity", "lightingContinuity", "colourTreatment",
  ],
} as const;

type ExactVisualFact = {
  status: "visible" | "not visible" | "unclear";
  description: string;
  confidence: number;
};

type IndependentShotFacts = {
  projectTitle: string;
  detectedSummary: string;
  visualBlueprint: {
    headwear: ExactVisualFact;
    outfit: ExactVisualFact;
    footwear: ExactVisualFact;
    accessories: ExactVisualFact;
    pose: ExactVisualFact;
    expression: ExactVisualFact;
    lighting: ExactVisualFact;
    camera: ExactVisualFact;
    composition: ExactVisualFact;
    environment: ExactVisualFact;
    hairMakeup: ExactVisualFact;
    colourFinish: ExactVisualFact;
  };
  wardrobeContinuity: string;
  environmentContinuity: string;
  lightingContinuity: string;
  colourTreatment: string;
};`;
  text = replaceOnce(text, schemaRe, schemaReplacement, 'vision-first schema');

  const helperRe = /function independentFactsAreSpecific\(facts: IndependentShotFacts\) \{[\s\S]*?\n\}\n\nfunction buildIndependentAnalysis\([\s\S]*?\n\}\n\nasync function requestOpenAI/;
  const helperReplacement = `function exactFactText(fact: ExactVisualFact) {
  if (fact.status === "not visible") return "Not visible in this source frame.";
  if (fact.status === "unclear") return \`Not clearly visible: \${fact.description}\`;
  return fact.description.trim();
}

function independentFactsAreSpecific(facts: IndependentShotFacts) {
  const entries = Object.entries(facts.visualBlueprint) as Array<[string, ExactVisualFact]>;
  const vague = [
    "preserve visible", "match the source", "use the source", "source garment",
    "appropriate to this frame", "exact primary-reference", "exact target camera view",
    "visible wardrobe continuity", "visible lighting character", "preserve this frame",
    "selected source wardrobe", "primary shot's visible", "use a plausible modifier",
    "as shown", "if present", "when present", "source-appropriate",
  ];

  for (const [key, fact] of entries) {
    const description = fact.description.trim();
    const lower = description.toLowerCase();
    if (vague.some((phrase) => lower.includes(phrase))) return false;
    if (fact.status === "visible" && description.split(/\s+/).length < 6) return false;
    if (fact.status === "not visible" && fact.confidence < 70) return false;
    if (["outfit", "pose", "lighting", "camera", "composition", "environment"].includes(key)) {
      if (fact.status !== "visible" || fact.confidence < 78) return false;
    }
    if (key === "headwear" && fact.status === "unclear") return false;
  }
  return true;
}

function buildIndependentAnalysis(
  facts: IndependentShotFacts,
  options: NonNullable<AnalyseRequest["options"]>,
  hasIdentity: boolean,
) {
  const blueprint = facts.visualBlueprint;
  const wardrobeDetail = [
    \`Headwear: \${exactFactText(blueprint.headwear)}\`,
    \`Outfit: \${exactFactText(blueprint.outfit)}\`,
    \`Footwear: \${exactFactText(blueprint.footwear)}\`,
    \`Accessories: \${exactFactText(blueprint.accessories)}\`,
  ].join(" ");

  const suggestedConfig = Object.fromEntries(
    SUGGESTED_STRING_FIELDS.map((field) => [field, fallbackSuggestedValue(field)]),
  ) as Record<string, string>;

  Object.assign(suggestedConfig, {
    pose: exactFactText(blueprint.pose),
    expression: exactFactText(blueprint.expression),
    wardrobe: wardrobeDetail,
    lighting: exactFactText(blueprint.lighting),
    camera: exactFactText(blueprint.camera),
    composition: exactFactText(blueprint.composition),
    background: exactFactText(blueprint.environment),
    mood: exactFactText(blueprint.colourFinish),
    mainPosition: exactFactText(blueprint.pose),
    bodyOrientation: exactFactText(blueprint.pose),
    weightDistribution: exactFactText(blueprint.pose),
    headPosition: exactFactText(blueprint.pose),
    armPosition: exactFactText(blueprint.pose),
    handPosition: exactFactText(blueprint.pose),
    gaze: exactFactText(blueprint.expression),
    shotSize: exactFactText(blueprint.composition),
    cropRule: exactFactText(blueprint.composition),
    cameraAngle: exactFactText(blueprint.camera),
    cameraDistance: exactFactText(blueprint.camera),
    lens: exactFactText(blueprint.camera),
    lightSource: exactFactText(blueprint.lighting),
    lightDirection: exactFactText(blueprint.lighting),
    lightQuality: exactFactText(blueprint.lighting),
    wardrobeCategory: exactFactText(blueprint.outfit),
    mainGarment: exactFactText(blueprint.outfit),
    silhouette: exactFactText(blueprint.outfit),
    material: exactFactText(blueprint.outfit),
    stylingState: wardrobeDetail,
    footwear: exactFactText(blueprint.footwear),
    accessories: exactFactText(blueprint.accessories),
    locationCategory: exactFactText(blueprint.environment),
    surface: exactFactText(blueprint.environment),
    environmentalDepth: exactFactText(blueprint.environment),
    props: exactFactText(blueprint.environment),
    makeup: exactFactText(blueprint.hairMakeup),
    hair: exactFactText(blueprint.hairMakeup),
    colourGrade: exactFactText(blueprint.colourFinish),
  });

  return {
    projectTitle: facts.projectTitle || options.shootName || "PromptLens exact recreation",
    detectedSummary: facts.detectedSummary,
    shootDNA: {
      subjectLock: hasIdentity
        ? "The [UPLOAD REFERENCE IMAGE] attached in the final image agent is the sole facial identity source and must remain exact."
        : "The [UPLOAD REFERENCE IMAGE] attached in the final image agent is the sole facial identity source and must remain exact.",
      wardrobeLock: facts.wardrobeContinuity,
      environmentLock: facts.environmentContinuity,
      lightingLock: facts.lightingContinuity,
      cameraLanguage: exactFactText(blueprint.camera),
      colourTreatment: facts.colourTreatment,
      realismLock: "Copy the visible shot faithfully with natural anatomy and physically accurate materials. Do not invent or redesign anything.",
    },
    suggestedConfig,
    shots: [{
      index: 1,
      role: "shot",
      pose: exactFactText(blueprint.pose),
      expression: exactFactText(blueprint.expression),
      wardrobe: wardrobeDetail,
      lighting: exactFactText(blueprint.lighting),
      camera: exactFactText(blueprint.camera),
      composition: exactFactText(blueprint.composition),
      environment: exactFactText(blueprint.environment),
    }],
    conflicts: [],
    coach: [
      "Visual facts were extracted before prompt construction.",
      "Every visible category includes a confidence score; low-confidence essential analyses are rejected instead of padded with generic text.",
      "The source image controls every non-identity detail exactly.",
    ],
    visualBlueprint: blueprint,
  };
}

async function requestOpenAI`;
  text = replaceOnce(text, helperRe, helperReplacement, 'vision-first validation and analysis builder');

  const promptRe = /text: `Read this ONE source image as a senior fashion photographer and stylist\.[\s\S]*?User notes: \$\{options\.notes \|\| "None"\}`,/;
  const promptReplacement = `text: \`PROMPTLENS EXACT VISION INSPECTION

Analyse this ONE source image before writing any prompt. Perform a strict top-to-bottom visual inventory. Report only what can actually be seen in this frame. Do not use the Instagram caption, account name, inferred campaign, general style assumptions or creative interpretation as evidence.

ABSOLUTE RULES
- The source person is anonymous. Never identify or describe their identity.
- Do not redesign, improve, substitute, embellish, simplify, fictionalise or infer unseen details.
- Never answer with “match the source”, “preserve visible wardrobe”, “use the source garment category”, “if present” or similar placeholders.
- When a category is absent, use status “not visible” and say exactly that.
- When genuinely obstructed, use “unclear” and explain what is obstructed. Do not guess.
- Confidence must reflect visual certainty, not optimism.

MANDATORY INSPECTION ORDER
1. HEADWEAR: First decide whether any hat, cap, scarf, hood, fascinator, headband or other headwear is visible. If visible, name the exact type and describe colour, material, weave or texture, crown shape and height, brim shape and approximate width, band, trim, logo, fastener, tilt, placement, condition, and the shadow or contact it creates on the head or face.
2. OUTFIT: Name every visible garment precisely. Describe garment category, construction, neckline, cups or panels, straps, sleeves, waistband, rise, leg opening, coverage, closures, seams, trim, hardware, colour, pattern, material appearance, opacity, sheen, fit, tension, folds, layering, and wet or dry appearance. Never replace “bikini” with “swimwear” or “garment”.
3. FOOTWEAR: Name exact visible footwear, colour, material, heel or sole, straps, fasteners and condition. If feet are outside the crop, state not visible.
4. ACCESSORIES AND PROPS: Inventory jewellery, sunglasses, bags, belts, gloves and every handheld or body-contact prop. Describe shape, material, colour, position and contact point.
5. POSE: Describe standing, seated, kneeling or reclining position; torso rotation; shoulder and hip relationship; weight-bearing side; pelvis; head and chin angle; each arm, hand and finger contact; each leg and foot; visible movement.
6. EXPRESSION: Describe mouth, brows, eyelids, gaze direction and head relationship without identifying the person.
7. LIGHTING: State natural or artificial source, apparent direction relative to camera, height, hardness, highlight placement, shadow edge and direction, fill, bounce, colour temperature, reflections and falloff. Do not invent studio modifiers unless visually evidenced.
8. CAMERA: State shot size, camera height, camera side, subject distance, approximate perspective or focal-length look, depth of field and any visible distortion. Mark estimates as approximate.
9. COMPOSITION: Describe exact crop, frame boundaries, subject placement, horizon, negative space, foreground/background layering and balance.
10. ENVIRONMENT: Name visible location type, surfaces, structures, furniture, landscape, water, vegetation, props, weather and atmosphere. Do not infer geography.
11. HAIR AND MAKEUP: Describe only visible styling details; do not let them override the identity reference in the final agent.
12. COLOUR AND FINISH: Describe actual palette, contrast, white balance, saturation, grain and retouching appearance.

ESSENTIAL QUALITY GATE
Outfit, pose, lighting, camera, composition and environment must each be concrete, visually descriptive and at least 78% confident. Headwear may not be marked unclear. If the image is too small or obstructed to meet this gate, return the uncertainty honestly; PromptLens will reject the result rather than create a vague prompt.

Shoot context: \${options.shootName || sourceContext?.title || "Untitled exact recreation"}
Project type: \${options.projectType || "fashion editorial"}
User notes: \${options.notes || "None"}\`,`;
  text = replaceOnce(text, promptRe, promptReplacement, 'exact vision inspection instructions');

  text = replaceOnce(text, '          max_output_tokens: 2_800,', '          max_output_tokens: 5_500,', 'visual facts output budget');
  text = replaceOnce(
    text,
    '      const visualFactsModel = requestedSpeed === "quality" ? requestedModel : balancedModel;\n      const attempts = [{ model: visualFactsModel, timeout: 48_000 }];',
    '      const visualFactsModel = MODEL_BY_SPEED.quality;\n      const attempts = [{ model: visualFactsModel, timeout: 55_000 }];',
    'full-quality exact vision model',
  );
  text = replaceOnce(
    text,
    'The first visual pass was too vague, so PromptLens requested a more detailed pass.',
    'The exact visual inspection did not meet the confidence and specificity gate.',
    'specificity failure wording',
  );
  text = replaceOnce(
    text,
    'PromptLens could not read the clothing, lighting and pose accurately enough for this shot. No vague fallback prompt was created.',
    'PromptLens could not inspect the complete outfit, headwear, pose, lighting, camera and setting accurately enough. No generic prompt was created.',
    'exact vision failure wording',
  );

  write('src/app/api/analyse/route.ts', text);
}

{
  let text = read('src/lib/prompt-builder.ts');

  const standaloneRe = /function buildStandaloneSeriesPrompt\([\s\S]*?\n\}\n\nexport function buildPromptOutput/;
  const standaloneReplacement = `function renderExactFact(label: string, fact: { status: string; description: string; confidence: number } | undefined) {
  if (!fact) return \`${label}: Not available.\`;
  const detail = fact.status === "not visible"
    ? "Not visible in this source frame."
    : fact.status === "unclear"
      ? \`Not clearly visible: \${fact.description}\`
      : fact.description;
  return \`${label}: \${detail} [confidence \${fact.confidence}%]\`;
}

function buildStandaloneSeriesPrompt(
  config: PromptConfig,
  analysis: AnalysisResult,
  _sharedContinuityPrompt: string,
  index: number,
  total: number,
  negativePrompt: string,
): string {
  const blueprint = analysis.visualBlueprint;
  const shot = analysis.shots[0];
  const visualBlueprint = blueprint
    ? [
        renderExactFact("Headwear", blueprint.headwear),
        renderExactFact("Outfit", blueprint.outfit),
        renderExactFact("Footwear", blueprint.footwear),
        renderExactFact("Accessories and props", blueprint.accessories),
        renderExactFact("Pose and body placement", blueprint.pose),
        renderExactFact("Expression and gaze", blueprint.expression),
        renderExactFact("Lighting", blueprint.lighting),
        renderExactFact("Camera and lens perspective", blueprint.camera),
        renderExactFact("Framing and composition", blueprint.composition),
        renderExactFact("Location and environment", blueprint.environment),
        renderExactFact("Visible hair and makeup", blueprint.hairMakeup),
        renderExactFact("Colour and photographic finish", blueprint.colourFinish),
      ].join("\\n")
    : [
        \`Headwear, outfit, footwear and accessories: \${shot?.wardrobe || analysis.shootDNA.wardrobeLock}\`,
        \`Pose and expression: \${shot?.pose || analysis.detectedSummary}; \${shot?.expression || "Not clearly visible."}\`,
        \`Lighting: \${shot?.lighting || analysis.shootDNA.lightingLock}\`,
        \`Camera and composition: \${shot?.camera || analysis.shootDNA.cameraLanguage}; \${shot?.composition || "Not clearly visible."}\`,
        \`Environment: \${shot?.environment || analysis.shootDNA.environmentLock}\`,
      ].join("\\n");

  return [
    IMMUTABLE_UPLOAD_REFERENCE_BLOCK,
    EXACT_IDENTITY_EXECUTION_HIERARCHY,
    \`EXACT RECREATION PROMPT — SHOT \${index} OF \${total}\`,
    "Use the image uploaded with this prompt strictly for facial identity. Replace only the anonymous source person's face and identity. The selected source shot remains the sole authority for every other visible detail.",
    \`EXACT VISUAL BLUEPRINT\\n\${visualBlueprint}\`,
    \`FINAL GENERATION INSTRUCTION
Recreate this source shot as a faithful photographic reconstruction. Copy the exact visible headwear, complete outfit, garment construction, colour, material, fit, accessories, props, pose, body orientation, hand placement, expression category, lighting direction and shadow character, camera side and height, lens perspective, subject distance, crop, frame balance, background, surfaces and atmosphere described above.

Do not redesign, improve, editorialise, modernise, simplify or substitute anything. Do not add an accessory or prop that is not listed as visible. Do not remove a listed item. Do not turn an exact item into a generic category. If a field says not visible or unclear, do not invent it. The only permitted replacement is the source person's identity with the [UPLOAD REFERENCE IMAGE] identity.\`,
    \`PHOTOGRAPHIC FINISH\\n\${analysis.shootDNA.colourTreatment}. \${analysis.shootDNA.realismLock}\`,
    generatorInstruction(config),
    \`AVOID\\n\${negativePrompt}\`,
  ].join("\\n\\n");
}

export function buildPromptOutput`;
  text = replaceOnce(text, standaloneRe, standaloneReplacement, 'exact blueprint prompt builder');
  write('src/lib/prompt-builder.ts', text);
}

{
  let text = read('src/components/PromptLensV25.tsx');

  text = replaceOnce(
    text,
    'type ResultTab = "pack" | "prompt" | "short" | "negative" | "shot" | "advanced";',
    'type ResultTab = "pack" | "inspector" | "prompt" | "short" | "negative" | "shot" | "advanced";',
    'visual inspector result tab type',
  );

  text = text.replace('generator: config.generator, aiSpeed: config.aiSpeed,', 'generator: config.generator, aiSpeed: "quality",');

  const speedSectionRe = /      <section className="v25-section-block">\n        <div className="v25-section-heading"><div><span>AI PROCESSING<\/span>[\s\S]*?\n      <\/section>/;
  const speedSection = `      <section className="v25-section-block v2513-exact-vision">
        <div className="v25-section-heading"><div><span>EXACT VISION</span><h2>Full-detail source inspection</h2></div><small>Creative shortcuts disabled</small></div>
        <div className="v2513-lock-card"><span>◎</span><div><strong>GPT-5 exact visual analysis</strong><small>PromptLens inventories headwear, garments, accessories, pose, lighting, camera, crop and environment before it writes the prompt. Low-confidence results are rejected rather than padded with generic language.</small></div></div>
      </section>`;
  text = replaceOnce(text, speedSectionRe, speedSection, 'replace speed chooser with exact vision lock');

  const creativeSectionRe = /      <section className="v25-two-column">[\s\S]*?\n      <\/section>\n\n      <section className="v25-soft-panel">/;
  const exactLockSection = `      <section className="v25-section-block v2513-exact-lock">
        <div className="v25-section-heading"><div><span>RECREATION MODE</span><h2>Exact source shot — locked</h2></div><small>No inspiration or redesign mode</small></div>
        <div className="v25-note-card"><span>✓</span><div><strong>The source image controls everything except facial identity</strong><p>PromptLens will not alter the outfit, hat, accessories, pose, lighting, camera viewpoint, crop, background or props. The [UPLOAD REFERENCE IMAGE] attached later controls the face only.</p></div></div>
      </section>

      <section className="v25-soft-panel">`;
  text = replaceOnce(text, creativeSectionRe, exactLockSection, 'remove creative mood and fidelity choices');

  text = replaceOnce(
    text,
    '              ...(hasPromptPack ? [["pack", `Prompt Pack (${output.shotPrompts.length})`]] : []),\n              ["prompt", hasPromptPack ? "Master Prompt" : "Final Prompt"],',
    '              ...(hasPromptPack ? [["pack", `Prompt Pack (${output.shotPrompts.length})`]] : []),\n              ["inspector", "Visual Inspector"],\n              ["prompt", hasPromptPack ? "Master Prompt" : "Final Prompt"],',
    'add visual inspector tab',
  );

  text = replaceOnce(
    text,
    '          {tab === "pack" ? <PromptPack output={output} copied={copied} onCopy={onCopy} /> : null}',
    '          {tab === "pack" ? <PromptPack output={output} copied={copied} onCopy={onCopy} /> : null}\n          {tab === "inspector" ? <VisualInspector analysis={analysis} /> : null}',
    'render visual inspector',
  );

  const componentMarker = '\nfunction PromptPack({ output, copied, onCopy }:';
  const inspectorComponent = `
function VisualInspector({ analysis }: { analysis: AnalysisResult | null }) {
  const blueprint = analysis?.visualBlueprint;
  if (!blueprint) {
    return <div className="v2513-inspector-empty"><strong>No exact visual blueprint is available.</strong><p>Rebuild the shoot from an imported or uploaded source image. PromptLens will not substitute generic placeholder details.</p></div>;
  }
  const labels: Array<[keyof typeof blueprint, string]> = [
    ["headwear", "Headwear"], ["outfit", "Outfit"], ["footwear", "Footwear"],
    ["accessories", "Accessories and props"], ["pose", "Pose"], ["expression", "Expression and gaze"],
    ["lighting", "Lighting"], ["camera", "Camera"], ["composition", "Composition"],
    ["environment", "Environment"], ["hairMakeup", "Hair and makeup"], ["colourFinish", "Colour and finish"],
  ];
  return (
    <div className="v2513-inspector">
      <header><span>VISION-FIRST BLUEPRINT</span><h2>What PromptLens actually sees</h2><p>The final prompt is built from these observations only. Confidence below the required threshold blocks generation rather than encouraging invention.</p></header>
      <div className="v2513-inspector-grid">
        {labels.map(([key, label]) => {
          const fact = blueprint[key];
          return <article key={key}><div><strong>{label}</strong><span className={fact.confidence >= 85 ? "high" : fact.confidence >= 78 ? "medium" : "low"}>{fact.confidence}%</span></div><small>{fact.status}</small><p>{fact.description}</p></article>;
        })}
      </div>
    </div>
  );
}
`;
  text = replaceOnce(text, componentMarker, inspectorComponent + componentMarker, 'visual inspector component');

  text = text.replaceAll('V2.5.12', 'V2.5.13');
  write('src/components/PromptLensV25.tsx', text);
}

{
  let text = read('src/app/globals.css');
  text += `

/* PromptLens V2.5.13 vision-first exact inspector */
.v2513-lock-card { display:flex; gap:14px; align-items:flex-start; padding:18px; border:1px solid #37324f; border-radius:16px; background:#171520; }
.v2513-lock-card > span { display:grid; place-items:center; width:38px; height:38px; border-radius:12px; background:#2a2445; color:#b9adff; font-size:20px; }
.v2513-lock-card strong, .v2513-lock-card small { display:block; }
.v2513-lock-card small { margin-top:5px; color:#aaa6b7; line-height:1.5; }
.v2513-inspector { display:grid; gap:18px; padding:22px; }
.v2513-inspector > header span { color:#9384ff; font-size:11px; font-weight:800; letter-spacing:.13em; }
.v2513-inspector > header h2 { margin:6px 0; }
.v2513-inspector > header p { margin:0; color:#aaa6b7; }
.v2513-inspector-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
.v2513-inspector-grid article { min-width:0; padding:16px; border:1px solid #2b2932; border-radius:14px; background:#121217; }
.v2513-inspector-grid article > div { display:flex; justify-content:space-between; gap:12px; align-items:center; }
.v2513-inspector-grid article span { padding:3px 8px; border-radius:999px; font-size:11px; font-weight:800; }
.v2513-inspector-grid article span.high { background:#173629; color:#8ae0b5; }
.v2513-inspector-grid article span.medium { background:#3a321a; color:#f1d276; }
.v2513-inspector-grid article span.low { background:#442026; color:#ff9aa6; }
.v2513-inspector-grid article small { display:block; margin-top:8px; text-transform:uppercase; letter-spacing:.09em; color:#7f7a89; }
.v2513-inspector-grid article p { margin:8px 0 0; color:#e9e7ef; line-height:1.55; white-space:pre-wrap; }
.v2513-inspector-empty { padding:28px; border:1px solid #3d2c31; border-radius:16px; background:#1b1417; }
@media (max-width:820px) { .v2513-inspector-grid { grid-template-columns:1fr; } }
`;
  write('src/app/globals.css', text);
}

{
  let text = read('src/app/layout.tsx');
  text = text.replaceAll('V2.5.12', 'V2.5.13');
  write('src/app/layout.tsx', text);
}

{
  const packagePath = path.join(root, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  packageJson.version = '2.5.13';
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
}

console.log('Applied PromptLens V2.5.13 vision-first exact photo inspector and copy-paste prompt builder.');
