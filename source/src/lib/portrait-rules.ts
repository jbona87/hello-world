import type { PortraitValidation, PromptConfig } from "@/lib/types";

function lensMillimetres(lens: string): number | null {
  const match = lens.match(/(\d{2,3})\s*mm/i);
  return match ? Number(match[1]) : null;
}

function apertureValue(aperture: string): number | null {
  const match = aperture.match(/f\/?(\d+(?:\.\d+)?)/i);
  return match ? Number(match[1]) : null;
}

function shutterDenominator(shutter: string): number | null {
  const match = shutter.match(/1\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function push(
  items: PortraitValidation[],
  id: string,
  severity: PortraitValidation["severity"],
  category: string,
  message: string,
  correction: string,
) {
  if (!items.some((item) => item.id === id)) {
    items.push({ id, severity, category, message, correction });
  }
}

function isClosePortrait(config: PromptConfig) {
  return /beauty close-up|headshot|head-and-shoulders|chest-up/i.test(config.shotSize);
}

function isFullBody(config: PromptConfig) {
  return /three-quarter body|full standing|full body|wide environmental/i.test(config.shotSize);
}

function isMoving(config: PromptConfig) {
  return !/still|breathing/i.test(config.movement);
}

function isAngledHead(config: PromptConfig) {
  return /three-quarter|profile|over shoulder|turned|tilt/i.test(
    `${config.bodyOrientation} ${config.headPosition}`,
  );
}

export function validatePortraitConfig(config: PromptConfig): PortraitValidation[] {
  const items: PortraitValidation[] = [];
  const lens = lensMillimetres(config.lens);
  const aperture = apertureValue(config.aperture);
  const shutter = shutterDenominator(config.shutterSpeed);
  const close = isClosePortrait(config);
  const fullBody = isFullBody(config);

  if (close && lens !== null && lens < 70) {
    push(
      items,
      "close-wide-lens",
      "error",
      "Perspective",
      `${config.lens} is unusually wide for ${config.shotSize} and may enlarge the nearest facial features or widen the face unnaturally.`,
      "Use approximately 85–105mm, or move farther away and crop, for a more natural facial perspective.",
    );
  }

  if (close && /around 1\.0|close portrait/i.test(config.cameraDistance) && lens !== null && lens <= 50) {
    push(
      items,
      "close-distance-wide",
      "error",
      "Camera distance",
      "A short camera distance combined with a wide or normal lens increases near-range facial perspective distortion.",
      "Increase subject distance to roughly 1.5–2 m and use an 85–105mm portrait lens.",
    );
  }

  if (fullBody && lens !== null && lens >= 135 && /environment/i.test(config.environmentalDepth)) {
    push(
      items,
      "long-lens-environment",
      "warning",
      "Perspective",
      "A 135mm-or-longer lens strongly compresses the scene and may hide the environmental depth requested by the composition.",
      "Use roughly 35–85mm for stronger location context, or keep the long lens and reduce the environmental-storytelling requirement.",
    );
  }

  if (/both eyes sharp|full face sharp/i.test(config.focusPlane) && aperture !== null && aperture < 4 && isAngledHead(config)) {
    push(
      items,
      "both-eyes-wide-aperture",
      "error",
      "Depth of field",
      `${config.aperture} may be too shallow to keep both eyes or the full face sharp when the head is angled.`,
      "Use approximately f/5.6–f/8, or align both eyes more closely to the focal plane and focus on the nearest eye.",
    );
  }

  if (close && /deep enough for the full face/i.test(config.depthOfField) && aperture !== null && aperture < 4) {
    push(
      items,
      "face-depth-aperture",
      "warning",
      "Depth of field",
      `The selected ${config.aperture} conflicts with the request for full-face detail in a close portrait.`,
      "Use f/5.6–f/11 for beauty detail, depending on camera format and subject distance.",
    );
  }

  if (fullBody && /deep enough for the full subject|full environmental depth/i.test(config.depthOfField) && aperture !== null && aperture < 4) {
    push(
      items,
      "full-body-depth",
      "warning",
      "Depth of field",
      "A very wide aperture may leave clothing, hands or footwear outside the intended focus range in a full-body portrait.",
      "Use approximately f/4–f/8 or increase camera distance.",
    );
  }

  if (isMoving(config) && shutter !== null && shutter < 250) {
    push(
      items,
      "movement-shutter",
      "error",
      "Motion",
      `${config.shutterSpeed} is slow for ${config.movement} and may create unintended body, hand or hair blur.`,
      "Use at least 1/250 sec for gentle movement and approximately 1/500 sec or faster for walking or turning.",
    );
  }

  if (/studio strobe|off-camera flash|on-camera flash/i.test(config.lightSource) && shutter !== null && shutter > 250) {
    push(
      items,
      "flash-sync",
      "warning",
      "Exposure",
      `${config.shutterSpeed} may exceed a common flash-sync range unless high-speed sync is intentionally used.`,
      "Use approximately 1/125–1/250 sec, or explicitly request high-speed sync.",
    );
  }

  if (/natural window|open shade|overcast|golden-hour|midday sun/i.test(config.lightSource) && /beauty dish|softbox|octabox|grid/i.test(config.lightModifier) && !/mixed/i.test(config.lightSource)) {
    push(
      items,
      "natural-modifier-conflict",
      "warning",
      "Lighting logic",
      `${config.lightSource} does not naturally originate from a ${config.lightModifier}.`,
      "Choose window diffusion or a reflector, or change the source to studio strobe/continuous LED.",
    );
  }

  if (/direct midday sun/i.test(config.lightSource) && /very soft wrapping|diffused hazy/i.test(config.lightQuality) && !/diffusion/i.test(config.lightModifier)) {
    push(
      items,
      "sun-softness",
      "error",
      "Lighting logic",
      "Direct midday sunlight normally creates hard, defined shadows unless a large diffusion source changes its apparent size.",
      "Add a large diffusion panel/open shade, or use hard controlled light as the quality.",
    );
  }

  if (/butterfly/i.test(config.lightDirection) && /side light|strip softbox/i.test(`${config.lightDirection} ${config.lightModifier}`)) {
    push(
      items,
      "butterfly-side",
      "warning",
      "Lighting pattern",
      "Butterfly lighting requires the key light to remain centred above the face rather than primarily from the side.",
      "Use a centred octabox/beauty dish above the lens, with optional fill beneath the chin.",
    );
  }

  if (/butterfly|clamshell/i.test(`${config.lighting} ${config.lightDirection}`) && /no fill|negative fill/i.test(config.fillLevel)) {
    push(
      items,
      "clamshell-fill",
      "warning",
      "Lighting pattern",
      "Clamshell beauty lighting normally uses a reflector or lower frontal fill to open the shadows beneath the nose, lips and chin.",
      "Use a white reflector beneath the face or a lower-power frontal fill.",
    );
  }

  if (/standing/i.test(config.mainPosition) && /balanced evenly/i.test(config.weightDistribution) && /square to camera/i.test(config.bodyOrientation)) {
    push(
      items,
      "rigid-standing",
      "warning",
      "Pose mechanics",
      "Square shoulders with equal weight on both legs can read as rigid or passport-like rather than naturally posed.",
      "Turn the torso slightly and settle weight onto one leg while keeping the shoulders relaxed.",
    );
  }

  if (/seated/i.test(config.mainPosition) && /relaxed with soft natural bends|behind the back/i.test(config.armPosition)) {
    push(
      items,
      "unsupported-seated-arms",
      "warning",
      "Pose mechanics",
      "A seated portrait needs a clear place for forearms and hands so the limbs do not appear unsupported or hidden.",
      "Rest the forearms on the thighs, lap, chair or another visible support with relaxed fingers.",
    );
  }

  if (/back to camera$/i.test(config.bodyOrientation) && /directly into the lens/i.test(config.gaze)) {
    push(
      items,
      "back-direct-gaze",
      "error",
      "Pose geometry",
      "A fully back-facing body cannot maintain direct eye contact without a substantial neck and torso rotation.",
      "Use “back to camera with head turned,” add a gentle torso twist, and avoid an extreme neck rotation.",
    );
  }

  if (/lying|reclining/i.test(config.mainPosition) && /rear leg|front leg|contrapposto/i.test(config.weightDistribution)) {
    push(
      items,
      "recline-weight",
      "error",
      "Pose mechanics",
      "Standing leg-weight instructions do not apply to a reclining or lying pose.",
      "Use supported reclined weight through the hip, forearm, back or surface contact.",
    );
  }

  if (/kneeling|crouching|gentle torso twist|forward lean/i.test(
    `${config.mainPosition} ${config.bodyOrientation} ${config.weightDistribution}`,
  ) && /limited mobility/i.test(config.subjectProfile.flexibility)) {
    push(
      items,
      "mobility-pose",
      "error",
      "Physical profile",
      "The selected pose may conflict with the saved limited-mobility profile.",
      "Choose standing with support, a higher seated pose, or a smaller torso rotation that respects the subject’s mobility notes.",
    );
  }

  if (/long arms/i.test(config.subjectProfile.armProportion) && /mid-torso|chest-up/i.test(config.shotSize) && /hands resting naturally on the thighs|one hand in a pocket/i.test(config.handPosition)) {
    push(
      items,
      "hands-outside-crop",
      "warning",
      "Framing",
      "The selected hand position will probably sit below a chest-up or mid-torso crop, which can create unexplained cut-off forearms.",
      "Move the hands into the visible frame, choose a wider crop, or intentionally keep both hands completely outside the frame.",
    );
  }

  if (/preserve full hands/i.test(config.cropRule) && /tight beauty|headshot|head-and-shoulders/i.test(config.shotSize) && !/face|hair/i.test(config.handPosition)) {
    push(
      items,
      "hands-tight-crop",
      "warning",
      "Framing",
      "A tight portrait cannot normally preserve full hands unless the hands are deliberately posed near the face or shoulders.",
      "Choose a hand-near-face pose or widen the framing to chest-up or mid-torso.",
    );
  }

  if (/full standing|full body/i.test(config.shotSize) && /1:1/i.test(config.aspectRatio)) {
    push(
      items,
      "square-full-body",
      "warning",
      "Composition",
      "A square frame gives limited vertical space for a full standing portrait and can encourage cramped headroom or cropped footwear.",
      "Use 4:5, 3:4 or 2:3, or leave generous space above the head and below the feet.",
    );
  }

  if (/crop at upper waist|crop above the knees/i.test(config.cropRule) && /wrist|ankle|knee|elbow/i.test(config.notes)) {
    push(
      items,
      "joint-crop-note",
      "warning",
      "Cropping",
      "The notes appear to request a crop near a major joint, which often reads as an accidental amputation.",
      "Move the crop clearly above or below the joint and preserve complete hands or footwear when they are part of the pose.",
    );
  }

  if (/wide environmental|full body with environment/i.test(config.shotSize) && /plain background/i.test(config.environmentalDepth)) {
    push(
      items,
      "environment-depth",
      "info",
      "Composition",
      "The framing asks for an environmental portrait while the environment is set to remain plain.",
      "Use subtle environmental cues or balanced subject-and-location visibility, unless minimalism is intentional.",
    );
  }

  if (/no props/i.test(config.props) === false && /tight beauty close-up/i.test(config.shotSize)) {
    push(
      items,
      "prop-closeup",
      "info",
      "Composition",
      "A prop in a tight beauty crop can compete with the eyes and facial detail.",
      "Keep the prop outside the facial silhouette or widen the crop enough to show its relationship to the subject.",
    );
  }

  return items;
}

export function buildPortraitRuleBlock(config: PromptConfig): string {
  const rules = [
    "Maintain one coherent camera position and perspective; do not enlarge the nose, forehead, hands or feet through accidental near-camera placement.",
    "Keep the intended eye or eyes on the selected focal plane and use depth of field consistent with head angle, lens, aperture and subject distance.",
    "Use one dominant motivated key-light direction. Fill and separation lights must remain weaker and must not create contradictory shadow directions.",
    "Catchlight shape and position must correspond to the selected light modifier and direction. Do not add unrelated or duplicated catchlights.",
    "Preserve relaxed shoulders, believable spinal alignment, supported limbs, softly bent joints and a physically plausible centre of gravity.",
    "Hands must have five anatomically coherent fingers, relaxed spacing, credible grip pressure and natural contact with skin, clothing or props.",
    "Avoid cropping directly through wrists, elbows, knees or ankles. Keep complete hands and feet whenever they are visually important.",
    "Keep background lines, poles, doorframes and bright shapes from appearing to grow out of or intersect the head.",
    "Retain natural left-right facial and body asymmetry rather than mirroring features or making both sides mechanically identical.",
    "Maintain coherent material physics: fabric weight, fold size, tension, compression, gravity, translucency and airflow must match the chosen material.",
  ];

  return `PORTRAIT REALISM RULES\n${rules.map((rule, index) => `${index + 1}. ${rule}`).join("\n")}`;
}
