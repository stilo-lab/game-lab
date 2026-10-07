# Pixel Soundpacks

32 retained original synthesized references, 16 new original synthesized effects and 56 newly synthesized spoken templates.

Spoken templates use generic Microsoft neural speech voices through edge-tts during asset creation; no speech service runs in the bot. No real streamer voice is cloned, and no original streamer recording or original Mimic Party game asset is included. The text and voice metadata are in catalog.json; original development prompts are in scripts/mimic-spoken-prompts.json.

Rebuild: build-mimic-sounds.js (base references), build-mimic-spoken.py (optional speech regeneration), then build-mimic-extra.js (categories and complete catalog). Existing packaged WAV files work without these build tools.
