import { buildPortraitRuleBlock, validatePortraitConfig } from "@/lib/portrait-rules";
import type { AnalysisResult, PromptConfig, PromptOutput, SubjectPhysicalProfile } from "@/lib/types";

const MAXIMUM_IDENTITY_LOCK = `Use the uploaded identity reference image strictly as the facial identity source. Preserve the subject's identity with maximum accuracy, including facial proportions, eye shape and spacing, iris colour, eyelid structure, eyebrow shape and density, nose structure, nostril shape, lip shape and volume, jawline, chin, cheek structure, forehead, hairline, skin tone, natural facial asymmetry, identifying facial details, and age appearance. The final subject must remain immediately recognisable as the same person shown in the identity reference.

Do not beautify, idealise, cosmetically enhance, reconstruct, restructure, reinterpret, or artificially correct the face. Do not enlarge the eyes, refine the nose, reshape the lips, sharpen the jawline, lift the cheekbones, reduce age characteristics, remove natural asymmetry, or create exaggerated facial symmetry. Avoid influencer aesthetics, glamour retouching, plastic skin, waxy skin, porcelain skin, generic model features, and recognisable AI-generated facial characteristics.`;

const STANDARD_IDENTITY_LOCK = `Use the uploaded identity reference image as the facial identity source. Preserve the same recognisable facial proportions, eyes, eyebrows, nose, lips, jawline, skin tone, hairline, natural asymmetry, and age appearance. Do not replace the face with a generic model face or apply beauty-driven facial reshaping.`;

const SOURCE_PERSON_ANONYMITY_LOCK = `SOURCE PERSON ANONYMITY LOCK: Treat every person visible in the shot, URL, carousel, Reel frame, wardrobe reference, pose reference, lighting reference or environment reference as an anonymous visual placeholder. Do not identify, name, describe, imitate or reproduce that person. Do not use their face, facial geometry, skin tone, age appearance, hairstyle, body identity, voice, persona or other identifying characteristics. Extract only non-identifying photographic and styling information: garment type and construction, colour palette, material behaviour, pose geometry, body orientation, hand placement, camera position, framing, crop, lens perspective, lighting design, background, location, props and overall visual rhythm. The uploaded identity reference is the only person whose recognisable identity may appear in the generated image.`;

const FACE_PRIORITY = `FACE DETAIL PRIORITY: The face must be the sharpest and most highly resolved region of the image. Lock critical focus precisely on the selected eye plane. Preserve natural eye shape, spacing, eyelid folds, iris colour and texture, eyelashes, tear-line detail, realistic catchlights, pores, fine skin texture, lip texture, nose contours, hairline, and small natural facial details. Facial detail should clearly exceed the detail level of clothing and background without artificial oversharpening.`;

const SKIN_REALISM = `SKIN RENDERING: Preserve authentic skin with visible micro-pores, fine texture, subtle tonal variation, natural highlights, small imperfections, and genuine facial depth. Maintain professional camera-level acuity without smoothing, airbrushing, excessive denoising, fake pore overlays, crunchy sharpening, clarity halos, or unnatural micro-contrast.`;

const HAIR_LOCK = `HAIR CONSISTENCY LOCK: Preserve the identity reference's hairstyle, hair colour, tone, highlight pattern, length, density, texture, root depth, parting direction, wave structure, hairline, and overall hair identity. Do not restyle, recolour, shorten, lengthen, over-curl, or over-straighten the hair unless the user explicitly requests a change.`;

const BODY_LOCK = `PHYSICAL PROPORTION LOCK: Preserve realistic shoulder width, neck length, arm thickness, torso proportions, collarbone structure, waist relationship, hip balance, limb proportions and natural overall build from the identity reference whenever those areas are visible. Do not elongate the body unnaturally, shrink the shoulders, alter chest or hip proportions, or create exaggerated fashion-model anatomy.`;

const NEGATIVE_CORE = [
  "plastic or waxy skin",
  "beauty-filter smoothing",
  "generic model face",
  "facial reshaping",
  "artificial bilateral symmetry",
  "oversized eyes",
  "over-refined nose",
  "over-sharpened jawline",
  "fake pore overlay",
  "crunchy sharpening",
  "HDR halos",
  "multiple contradictory catchlights",
  "shadow directions that disagree with the key light",
  "wide-angle facial distortion in a close portrait",
  "unmotivated rim light",
  "distorted hands or fingers",
  "fused fingers",
  "impossible joints",
  "unsupported limbs",
  "broken centre of gravity",
  "extreme neck rotation",
  "cropping through wrists, elbows, knees or ankles",
  "unrealistic fabric physics",
  "floating accessories",
  "fake depth of field",
  "background lines growing out of the head",
  "overprocessed glamour aesthetic",
];

function identityBlocks(config: PromptConfig): string[] {
  if (config.identityStrength === "none") return [];

  const blocks = [
    config.identityStrength === "maximum" ? MAXIMUM_IDENTITY_LOCK : STANDARD_IDENTITY_LOCK,
  ];

  if (config.faceDetailPriority) blocks.push(FACE_PRIORITY, SKIN_REALISM);
  if (config.preserveHair) blocks.push(HAIR_LOCK);
  if (config.preserveBodyProportions) blocks.push(BODY_LOCK);
  return blocks;
}

function generatorInstruction(config: PromptConfig): string {
  switch (config.generator) {
    case "Midjourney":
      return `MIDJOURNEY OUTPUT: Use concise visual language, prioritise subject, pose mechanics, styling, lighting, lens, composition, realism, and mood. Suggested ending: --ar ${config.aspectRatio} --style raw.`;
    case "FLUX":
      return "FLUX OUTPUT: Use clear natural-language spatial instructions, believable physical detail, and restrained negative wording.";
    case "Stable Diffusion":
      return "STABLE DIFFUSION OUTPUT: Keep the positive prompt descriptive and place unwanted traits in the separate negative prompt.";
    case "Gemini":
      return "GEMINI OUTPUT: Treat this as a direct creative brief with explicit scene logic, identity continuity, and realistic photography instructions.";
    case "ChatGPT Images":
      return "CHATGPT IMAGES OUTPUT: Follow the spatial relationships, physical profile and identity constraints literally. Preserve continuity across all requested visual elements.";
    default:
      return "GENERAL OUTPUT: Interpret this as a production-ready photography brief.";
  }
}

function shootDnaBlock(analysis: AnalysisResult | null): string | null {
  if (!analysis) return null;
  const dna = analysis.shootDNA;
  return `SHOOT DNA
Subject lock: ${dna.subjectLock}
Wardrobe lock: ${dna.wardrobeLock}
Environment lock: ${dna.environmentLock}
Lighting lock: ${dna.lightingLock}
Camera language: ${dna.cameraLanguage}
Colour treatment: ${dna.colourTreatment}
Realism lock: ${dna.realismLock}`;
}


function sourceReconstructionBlock(config: PromptConfig, analysis: AnalysisResult | null): string | null {
  if (!analysis) return null;
  const primary = analysis.shots[0];
  const exactness = config.mode === "inspired"
    ? "Use the source as strong visual inspiration while preserving its key non-identifying photographic structure."
    : "Recreate the source shot design as closely as possible using a new subject whose identity comes only from the uploaded identity reference.";

  return `SOURCE SHOT DESIGN LOCK
${exactness}
Detected source: ${analysis.detectedSummary}
${primary ? `Primary shot details: pose — ${primary.pose}; expression category — ${primary.expression}; wardrobe — ${primary.wardrobe}; lighting — ${primary.lighting}; camera — ${primary.camera}; composition — ${primary.composition}; environment — ${primary.environment}.` : ""}

Create a new image featuring the uploaded identity subject. Transfer only the source's non-identifying visual attributes: body pose, limb placement, camera angle, framing, crop, perspective, outfit design, material behaviour, lighting direction, background, location, colour and mood.

EXACT PERSPECTIVE LOCK: Preserve the source camera side, camera height, subject-to-camera distance, lens perspective, horizon, vanishing-point direction, frame boundaries, crop and subject scale exactly as visible. Do not reinterpret the shot from another angle, reveal unseen sides, or merge several source frames into one synthetic viewpoint. For Reel imports, only the frame explicitly labelled PRIMARY REEL SHOT is the exact target; all REEL CONTINUITY ONLY frames may inform recurring outfit, lighting, colour and location details but must not change the target pose, camera angle, crop, body orientation, subject scale or perspective. Treat every other Reel shot as a separate design rather than blending it into the main image. Do not mention, identify, imitate or reproduce the person visible in the source. Do not transfer their face, facial geometry, skin tone, age appearance, hairstyle, body identity, persona or any other identifying characteristic. If a source detail conflicts with natural anatomy or photographic realism, preserve the visual intention while correcting the physical error.`;
}

function mainDirection(config: PromptConfig): string {
  return `PROJECT
Shoot name: ${config.shootName}
Project type: ${config.projectType}
Reference approach: ${config.mode}
Mood: ${config.mood}
Target generator: ${config.generator}
Aspect ratio: ${config.aspectRatio}`;
}

function nonEmptyProfileEntries(profile: SubjectPhysicalProfile): string[] {
  const entries = [
    profile.heightCm.trim() ? `User-provided height: ${profile.heightCm.trim()} cm` : "",
    profile.overallBuild !== "not specified" ? `Overall build: ${profile.overallBuild}` : "",
    profile.shoulderProfile !== "not specified" ? `Shoulders: ${profile.shoulderProfile}` : "",
    profile.neckLength !== "not specified" ? `Neck: ${profile.neckLength}` : "",
    profile.torsoLength !== "not specified" ? `Torso: ${profile.torsoLength}` : "",
    profile.armProportion !== "not specified" ? `Arms: ${profile.armProportion}` : "",
    profile.legProportion !== "not specified" ? `Legs: ${profile.legProportion}` : "",
    profile.hipBalance !== "not specified" ? `Hip line: ${profile.hipBalance}` : "",
    `Baseline posture: ${profile.baselinePosture}`,
    profile.flexibility !== "not specified" ? `Flexibility: ${profile.flexibility}` : "",
    profile.preferredSide !== "no preferred side" ? `Preferred side: ${profile.preferredSide}` : "",
    profile.mobilityNotes.trim() ? `Mobility notes: ${profile.mobilityNotes.trim()}` : "",
    profile.visualNotes.trim() ? `Additional proportion notes: ${profile.visualNotes.trim()}` : "",
  ];
  return entries.filter(Boolean);
}

function physicalProfileBlock(config: PromptConfig): string | null {
  if (!config.subjectProfile.enabled) return null;
  const entries = nonEmptyProfileEntries(config.subjectProfile);
  return `SUBJECT PHYSICAL PROFILE MEMORY
Profile name: ${config.subjectProfile.profileName || "Unnamed subject"}
${entries.join("\n")}

Use these user-confirmed relative proportions to select a believable pose and frame. Preserve the subject's natural build rather than forcing a generic runway anatomy. Do not invent measurements that were not supplied. Keep joints within comfortable ranges, distribute weight through visible supports, and adapt the pose to the recorded mobility and posture.`;
}

function poseBlock(config: PromptConfig): string {
  return `POSE AND BODY MECHANICS
High-level pose: ${config.pose}
Main position: ${config.mainPosition}
Body orientation: ${config.bodyOrientation}
Weight distribution and support: ${config.weightDistribution}
Head and neck: ${config.headPosition}
Arms: ${config.armPosition}
Hands: ${config.handPosition}
Movement: ${config.movement}
Pose energy: ${config.poseEnergy}

Keep the shoulders relaxed, spine believable, pelvis and ribcage counterbalanced, limbs visibly supported, joints softly bent rather than locked, and centre of gravity consistent with the selected support points. Preserve natural asymmetry.`;
}

function expressionBlock(config: PromptConfig): string {
  return `EXPRESSION AND GAZE
Expression: ${config.expression}
Gaze: ${config.gaze}
Keep the jaw, brow, eyelids and mouth relaxed unless the selected expression explicitly requires tension. Eye direction, head turn and catchlights must agree.`;
}

function compositionBlock(config: PromptConfig): string {
  return `FRAMING AND COMPOSITION
Shot size: ${config.shotSize}
Composition: ${config.composition}
Crop rule: ${config.cropRule}
Aspect ratio: ${config.aspectRatio}
Avoid accidental crops through wrists, elbows, knees or ankles. Preserve complete hands and footwear whenever they are part of the visual story. Keep distracting background lines away from the head and face.`;
}

function cameraBlock(config: PromptConfig): string {
  return `CAMERA, OPTICS AND EXPOSURE
Camera rendering: ${config.camera}
Camera format: ${config.cameraFormat}
Lens: ${config.lens}
Aperture: ${config.aperture}
Shutter speed: ${config.shutterSpeed}
Sensitivity: ${config.iso}
Subject distance: ${config.cameraDistance}
Camera angle: ${config.cameraAngle}
Focus plane: ${config.focusPlane}
Depth of field: ${config.depthOfField}

Use physically coherent perspective, magnification, depth transition, motion rendering and noise. Camera distance—not lens prestige—must produce the intended facial and body proportions. The selected focus plane must remain compatible with the aperture, head angle and subject distance.`;
}

function lightingBlock(config: PromptConfig): string {
  return `LIGHTING
Lighting preset: ${config.lighting}
Source: ${config.lightSource}
Modifier: ${config.lightModifier}
Direction: ${config.lightDirection}
Quality: ${config.lightQuality}
Fill: ${config.fillLevel}
Separation/background light: ${config.separationLight}

Maintain one dominant motivated key-light direction. Fill and separation lights must be weaker and must not create contradictory shadows. Catchlight shape, position and number must correspond to the selected modifier and setup. Preserve believable highlight roll-off, shadow density and falloff across the face, hair, clothing and background.`;
}

function wardrobeBlock(config: PromptConfig): string {
  return `WARDROBE AND MATERIAL PHYSICS
Wardrobe direction: ${config.wardrobe}
Category: ${config.wardrobeCategory}
Main garment: ${config.mainGarment}
Silhouette: ${config.silhouette}
Material: ${config.material}
Styling state: ${config.stylingState}
Footwear: ${config.footwear}
Accessories: ${config.accessories}

Preserve real garment construction, seams, closures, thickness, gravity, tension, compression and contact with the body. Fold size, sheen, translucency and airflow must match ${config.material}. Hands, straps, jewellery and accessories must make credible contact and must not float or merge with skin.`;
}

function beautyBlock(config: PromptConfig): string {
  return `BEAUTY
Makeup: ${config.makeup}
Hair: ${config.hair}
Retouching: ${config.retouching}
Preserve genuine skin texture, realistic edge detail, individual hair strands, natural flyaways and believable contact between hair, skin and clothing.`;
}

function environmentBlock(config: PromptConfig): string {
  return `LOCATION AND ENVIRONMENT
Environment direction: ${config.background}
Location: ${config.locationCategory}
Primary surface: ${config.surface}
Time of day: ${config.timeOfDay}
Weather/atmosphere: ${config.weather}
Environmental visibility: ${config.environmentalDepth}
Props: ${config.props}

Keep location perspective, scale, ambient light, reflections and contact shadows coherent with the subject. Props must support the narrative without competing with the face. Avoid poles, frames, branches or strong lines intersecting the head.`;
}

function finishBlock(config: PromptConfig): string {
  return `PHOTOGRAPHIC FINISH
Realism: ${config.realism}
Colour grade: ${config.colourGrade}
Retouching: ${config.retouching}
Grain: ${config.grain}
Maintain natural tonal transitions, plausible dynamic range, restrained sharpening, realistic skin colour and coherent optical depth.`;
}

function validationBlock(config: PromptConfig): string | null {
  const validations = validatePortraitConfig(config).filter((item) => item.severity !== "info");
  if (!validations.length) return null;
  return `REALISM CORRECTIONS REQUIRED
${validations.map((item) => `- ${item.category}: ${item.correction}`).join("\n")}`;
}

function compactPrompt(config: PromptConfig, analysis: AnalysisResult | null): string {
  const identity =
    config.identityStrength === "none"
      ? ""
      : "Use the uploaded identity reference as the sole facial identity source; preserve recognisable facial geometry, natural asymmetry, skin tone, age appearance, hairline and hair identity without beautification. ";
  const profile = config.subjectProfile.enabled
    ? `Respect the saved ${config.subjectProfile.profileName || "subject"} physical profile: ${nonEmptyProfileEntries(config.subjectProfile).join(", ")}. `
    : "";
  const dna = analysis
    ? `${analysis.shootDNA.subjectLock}; ${analysis.shootDNA.lightingLock}; ${analysis.shootDNA.cameraLanguage}. `
    : "";
  const sourceBoundary = analysis
    ? "Treat the source person as anonymous and transfer only non-identifying pose, wardrobe, camera, lighting, composition and environment details. Do not name, identify or reproduce the source person. "
    : "";
  return `${sourceBoundary}${identity}${profile}${config.mood} ${config.projectType}; ${config.mainPosition}, ${config.bodyOrientation}, ${config.weightDistribution}, ${config.headPosition}, ${config.armPosition}, ${config.handPosition}, ${config.expression}, ${config.gaze}; ${config.shotSize}, ${config.composition}, ${config.cropRule}; ${config.cameraFormat}, ${config.lens}, ${config.aperture}, ${config.shutterSpeed}, ${config.iso}, ${config.cameraDistance}, ${config.cameraAngle}, ${config.focusPlane}; ${config.lightSource}, ${config.lightModifier}, ${config.lightDirection}, ${config.lightQuality}, ${config.fillLevel}; ${config.mainGarment}, ${config.silhouette}, ${config.material}, ${config.stylingState}; ${config.locationCategory}, ${config.surface}, ${config.timeOfDay}; ${config.makeup}, ${config.hair}, ${config.colourGrade}, ${config.retouching}, ${config.realism}. ${dna}Natural pores, believable anatomy, physically plausible weight and support, realistic fabric physics, coherent shadows and catchlights, no generic AI face. Aspect ratio ${config.aspectRatio}.`
    .replace(/\s+/g, " ")
    .trim();
}

export function buildPromptOutput(config: PromptConfig, analysis: AnalysisResult | null): PromptOutput {
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

  if (config.notes.trim()) {
    blocks.push(`ADDITIONAL USER DIRECTION\n${config.notes.trim()}`);
  }

  const corrections = validationBlock(config);
  if (corrections) blocks.push(corrections);

  blocks.push(generatorInstruction(config));

  const negativePrompt = `Avoid: ${NEGATIVE_CORE.join(", ")}.`;
  blocks.push(`AVOID\n${negativePrompt}`);

  const codeView = `const promptConfig = ${JSON.stringify(config, null, 2)};`;
  const validations = validatePortraitConfig(config);

  return {
    fullPrompt: blocks.join("\n\n"),
    compactPrompt: compactPrompt(config, analysis),
    negativePrompt,
    codeView,
    structuredConfig: config,
    validations,
  };
}
