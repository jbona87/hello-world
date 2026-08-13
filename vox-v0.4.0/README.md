# VOX v0.4.0

Free local-first text-to-speech studio.

## Current engines
- System Voice: browser / OS SpeechSynthesis
- VOX AI Local: Kokoro 82M via kokoro-js, Q8 + WASM

## v0.3.1 milestone
- Sentence-aware long-form AI chunking
- Up to 12,000 characters per AI render (beta safety limit)
- Sequential Kokoro generation with live chunk progress
- Cancellation between chunks
- PCM stitching with short natural gaps
- One combined 16-bit mono WAV download
- Output duration summary and project-based filename

No paid TTS API key is required.

## v0.3.2 voice-actor expansion
- Complete 28-voice English Kokoro cast
- Grouped US and UK masculine/feminine voice menus
- Ten performance presets: Cinematic, Documentary, Storyteller, News,
  Thriller, Heroic, Intimate, Animation, Period Drama, and Authority
- Preset state now clears when a voice or speed is manually changed
- No celebrity cloning or impersonation voices

## v0.4.0 script builder
- Turns a short brief into polished spoken copy
- Six formats: social video, advertisement, explainer, podcast introduction,
  documentary narration, and story opening
- Six tones with 15, 30, and 60-second duration targets
- Audience and call-to-action controls
- Uses Chrome's on-device LanguageModel when available
- Smart local fallback works without an API key on every modern browser
- Editable preview and one-click transfer into the VOX editor
