const fs = require('fs');
const path = require('path');

const root = path.join(process.cwd(), 'source');
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function write(rel, value) { fs.writeFileSync(path.join(root, rel), value); }
function replaceOnce(text, search, replacement, label) {
  const index = typeof search === 'string' ? text.indexOf(search) : text.search(search);
  if (index < 0) throw new Error(`V2.5.11 patch target not found: ${label}`);
  if (typeof search === 'string') return text.slice(0, index) + replacement + text.slice(index + search.length);
  return text.replace(search, replacement);
}

{
  let text = read('src/lib/prompt-builder.ts');

  const insertBefore = 'const MAXIMUM_IDENTITY_LOCK = `';
  const immutableBlock = `const IMMUTABLE_UPLOAD_REFERENCE_BLOCK = \`[UPLOAD REFERENCE IMAGE]

Use the uploaded image strictly as the facial identity reference. Preserve the subject’s identity with maximum accuracy and maintain the same facial proportions, eye shape and spacing, iris colour, eyelid structure, eyebrow shape, nose structure, nostril shape, lip shape, jawline, chin, cheek structure, forehead, hairline, skin texture, natural asymmetry, identifying facial details, and age appearance. The final subject must remain immediately recognisable as the same person shown in the reference image.

Do not beautify, idealise, cosmetically enhance, reconstruct, restructure, reinterpret, or artificially correct the face. Do not alter facial geometry, enlarge the eyes, refine the nose, reshape the lips, sharpen the jawline, lift the cheekbones, modify the expression, reduce age characteristics, remove natural asymmetry, or create exaggerated facial symmetry. No influencer aesthetic, glamour retouching, plastic skin, waxy skin, porcelain skin, artificial perfection, generic model features, or recognisable AI-generated facial characteristics.

FACE DETAIL PRIORITY: The face must be the sharpest, most detailed, and most highly resolved region in the entire image. Allocate maximum rendering fidelity to the eyes, iris texture, limbal rings, natural catchlights, eyelashes, eyelids, eyebrows, individual eyebrow hairs, pores, fine skin texture, lips, lip texture, nose contours, facial edges, hairline, and small natural facial details. Facial resolution must clearly exceed the detail level of the clothing, accessories, background, and surrounding environment. The viewer’s attention should immediately be drawn to the face as the primary identity anchor and the most precisely rendered element.

EYE PRIORITY: Lock critical focus precisely on the eyes. Preserve the natural eye shape, spacing, eyelid folds, iris colour, iris texture, limbal rings, eyelashes, tear-line detail, and realistic catchlights. Both eyes must remain naturally sharp, clear, symmetrical only to the degree present in the reference image, and free from artificial enhancement or oversharpening.

SKIN RENDERING: Preserve authentic, realistic skin with visible micro-pores, fine texture, subtle tonal variation, natural highlights, small imperfections, and genuine facial depth. Maintain professional camera-level acuity without beauty retouching. Do not smooth, blur, airbrush, polish, denoise excessively, or flatten the skin. Avoid fake pore overlays, exaggerated texture, crunchy sharpening, excessive clarity, halos, or unnatural micro-contrast. The skin must look naturally photographed rather than digitally generated or painted.

LIGHTING: Soft natural window light combined with a large diffused key light. Gentle, flattering illumination with controlled shadows and crisp facial micro-contrast. Preserve realistic dimensionality across the eyes, nose, lips, cheekbones, jawline, and skin texture. Do not allow diffusion, bloom, haze, or soft-focus effects to reduce facial detail.

CAMERA AND IMAGE QUALITY: Fujifilm GFX 100S, 80mm medium-format portrait lens, f/5.6, ISO 100, professional RAW photography, natural Fujifilm colour science, high dynamic range, clean tonal transitions, realistic depth, tack-sharp facial focus, focus locked precisely on the eyes, professional portrait acuity, high but natural micro-contrast, and ultra-clean medium-format detail.

            Luxury beauty editorial.

High-fashion cosmetics campaign.

Elegant European glamour.

Harper's Bazaar Beauty.
Vogue Beauty.
Numéro.
L'Officiel.
Tom Ford Beauty campaign.
Dior Beauty editorial.

Minimal studio environment.

Every detail refined.

Timeless elegance.

Modern femininity.

Expensive visual language.

Editorial rather than commercial.

Natural confidence.

Understated luxury.

Medium-format realism.

Sony A1 / Phase One XF IQ4.
105mm beauty lens.
f/8
ISO 100

Ultra-high detail.
Perfect skin texture.
Natural pores.
Extremely sharp eyes.
Soft tonal transitions.

Large octabox positioned approximately 45° camera left.

Second large softbox opposite side at lower power for gentle fill.

Large overhead diffusion panel.

White reflector beneath chin to open shadows.

Very soft beauty lighting.

No harsh shadows.

Even illumination across the face.

Catchlights remain large and round.

Skin appears luminous without looking oily.

Gentle highlight on cheekbones.

Soft falloff around jawline.

Background lit independently.

Subtle separation light behind subject.

Studio grey seamless backdrop.\`;

const EXACT_IDENTITY_EXECUTION_HIERARCHY = \`EXECUTION HIERARCHY — STRICT RULE
The immutable [UPLOAD REFERENCE IMAGE] block above governs facial identity preservation, facial sharpness, eye detail and skin-rendering quality and must remain present verbatim.
The selected source shot is the sole authority for every non-identity visual element: exact outfit and garment construction, colour, material, fit, styling state, pose, body orientation, hand placement, expression category, scene lighting, light direction, shadow character, camera side, camera height, lens perspective, subject distance, framing, crop, background, location, props and atmosphere.
Do not redesign, improve, substitute, simplify, embellish, fictionalise or creatively reinterpret any visible source-shot element. Do not add accessories, garments, props, scenery, lighting effects or styling that are not visibly present. When a detail is not visible, state that it is not visible rather than inventing it.
Where the immutable block names studio lighting or camera equipment, retain that wording verbatim, but do not allow it to replace a visibly different source-shot viewpoint, outfit, scene lighting, background or composition.\`;

`;
  text = replaceOnce(text, insertBefore, immutableBlock + insertBefore, 'immutable uploaded identity block');

  const identityFn = /function identityBlocks\(config: PromptConfig\): string\[\] \{[\s\S]*?\n\}\n\nfunction generatorInstruction/;
  const replacementIdentityFn = `function identityBlocks(config: PromptConfig): string[] {
  const blocks = [IMMUTABLE_UPLOAD_REFERENCE_BLOCK, EXACT_IDENTITY_EXECUTION_HIERARCHY];
  if (config.preserveHair) blocks.push(HAIR_LOCK);
  if (config.preserveBodyProportions) blocks.push(BODY_LOCK);
  return blocks;
}

function generatorInstruction`;
  text = replaceOnce(text, identityFn, replacementIdentityFn, 'always use immutable identity preamble');

  const sourceFn = /function sourceReconstructionBlock\(config: PromptConfig, analysis: AnalysisResult \| null\): string \| null \{[\s\S]*?\n\}\n\nfunction mainDirection/;
  const replacementSourceFn = `function sourceReconstructionBlock(config: PromptConfig, analysis: AnalysisResult | null): string | null {
  if (!analysis) return null;
  const primary = analysis.shots[0];

  return \`EXACT SOURCE-SHOT RECREATION LOCK — NO CREATIVE INTERPRETATION
Recreate the selected source shot exactly as it is visibly presented, replacing only the source person's identity with the uploaded facial identity reference.

The source shot controls the complete visible outfit, garment category, cut, construction, straps, neckline, closures, coverage, colour, pattern, trim, hardware, material, sheen, fit and styling state. It also controls the exact pose, torso and hip angle, shoulder relationship, head angle, gaze direction, arm position, hand placement, leg position, weight support and visible movement.

Preserve the source shot's actual lighting exactly: apparent source type, direction, hardness or softness, highlight placement, shadow direction, fill level, colour temperature, reflections and falloff. Preserve the exact camera side, camera height, subject distance, lens perspective, horizon, crop, frame boundaries, aspect ratio, subject scale, negative space and depth of field. Preserve the visible background, location, surfaces, props, weather and atmosphere.

Do not improve, restyle, editorialise, modernise, simplify, generalise or invent. Do not replace the outfit with a similar garment. Do not substitute another lighting setup. Do not change the camera angle. Do not add or remove props. Do not infer unseen garment sections or unseen sides of the location. If a feature cannot be seen, leave it unspecified.

Detected visual facts: \${analysis.detectedSummary}
\${primary ? \`Exact pose: \${primary.pose}\nExact expression and gaze: \${primary.expression}\nExact outfit: \${primary.wardrobe}\nExact lighting: \${primary.lighting}\nExact camera: \${primary.camera}\nExact composition: \${primary.composition}\nExact environment: \${primary.environment}\` : ""}\`;
}

function mainDirection`;
  text = replaceOnce(text, sourceFn, replacementSourceFn, 'strict exact source recreation lock');

  const standaloneIdentity = `  const identity = config.identityStrength === "none"\n    ? "Use the same anonymous adult subject established for this series."\n    : "Use the uploaded identity reference as the sole facial identity source. Preserve the same recognisable face, natural asymmetry, skin tone, age appearance, hairline and selected hairstyle without beautification or facial reshaping.";`;
  const newStandaloneIdentity = `  const identity = EXACT_IDENTITY_EXECUTION_HIERARCHY;`;
  text = replaceOnce(text, standaloneIdentity, newStandaloneIdentity, 'standalone immutable identity hierarchy');

  const standaloneReturnStart = `  return [\n    \`SERIES SHOT \${index} OF \${total} — FULL STANDALONE PROMPT\`,`;
  const newStandaloneReturnStart = `  return [\n    IMMUTABLE_UPLOAD_REFERENCE_BLOCK,\n    \`SERIES SHOT \${index} OF \${total} — FULL STANDALONE PROMPT\`,`;
  text = replaceOnce(text, standaloneReturnStart, newStandaloneReturnStart, 'prepend immutable block to standalone prompts');

  write('src/lib/prompt-builder.ts', text);
}

{
  let text = read('src/components/PromptLensV25.tsx');

  const sourceGuard = `    if (!sourceReady) {\n      setError("Choose a URL, upload a source image, or describe the shot first.");\n      setScreen("source");\n      return;\n    }\n    const hasIdentity = Boolean(identityReference);`;
  const identityGuard = `    if (!sourceReady) {\n      setError("Choose a URL, upload a source image, or describe the shot first.");\n      setScreen("source");\n      return;\n    }\n    if (!identityReference) {\n      setError("Upload the facial identity reference before building the prompt. Exact identity preservation is mandatory for this workflow.");\n      setScreen("identity");\n      return;\n    }\n    const hasIdentity = true;`;
  text = replaceOnce(text, sourceGuard, identityGuard, 'require uploaded identity reference');

  text = text.replace('identityStrength: hasIdentity ? config.identityStrength : "none",', 'identityStrength: "maximum",');
  text = text.replaceAll('V2.5.10', 'V2.5.11');
  write('src/components/PromptLensV25.tsx', text);
}

{
  let text = read('src/app/api/analyse/route.ts');
  const vagueRule = `- Wardrobe: explicitly name the garment category.`;
  const stricterRule = `- Absolute rule: do not redesign, improve, substitute, embellish, fictionalise or creatively reinterpret anything visible. Describe only what is visibly present. If a detail is not visible, say it is not visible rather than guessing.\n- Wardrobe: explicitly name the garment category.`;
  text = replaceOnce(text, vagueRule, stricterRule, 'no invention visual facts rule');
  write('src/app/api/analyse/route.ts', text);
}

{
  let text = read('src/app/layout.tsx');
  text = text.replaceAll('V2.5.10', 'V2.5.11');
  write('src/app/layout.tsx', text);
}

{
  const packagePath = path.join(root, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  packageJson.version = '2.5.11';
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
}

console.log('Applied PromptLens V2.5.11 immutable identity block and exact recreation lock.');
