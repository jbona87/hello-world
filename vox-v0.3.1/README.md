# VOX v0.3.1

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
