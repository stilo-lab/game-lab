"""Optional development tool: pip install edge-tts; regenerate the packaged spoken references.
No speech service is used while the bot is running. No streamer voice is cloned.
"""
import asyncio, hashlib, json, os, ssl, subprocess, tempfile, wave
from pathlib import Path
import edge_tts
from edge_tts import communicate

ROOT = Path(__file__).resolve().parents[1]
PROMPTS = json.loads((ROOT / 'scripts/mimic-spoken-prompts.json').read_text())
ASSETS = ROOT / 'assets/mimic'

def pad_short(destination):
    with wave.open(str(destination)) as wav:
        parameters = wav.getparams()
        frames = wav.readframes(wav.getnframes())
        duration = wav.getnframes()/wav.getframerate()
    if duration < .4:
        frames += b'\0' * (int(.5 * parameters.framerate)-parameters.nframes) * parameters.nchannels * parameters.sampwidth
        with wave.open(str(destination), 'wb') as wav:
            wav.setparams(parameters)
            wav.writeframes(frames)

def convert(source, destination):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(source), '-af',
        'silenceremove=start_periods=1:start_duration=0.02:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_duration=0.02:start_threshold=-45dB,areverse,loudnorm=I=-19:TP=-3:LRA=7',
        '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', str(destination)], check=True)
    pad_short(destination)
    with wave.open(str(destination)) as wav:
        duration = wav.getnframes()/wav.getframerate()
        if not .4 <= duration <= 6:
            raise ValueError(f'{destination.name}: duration {duration:.2f}s outside game limits')
    return duration

async def main():
    # Use trusted system CAs as well as certifi, including a configured enterprise CA.
    paths = ssl.get_default_verify_paths()
    if paths.cafile:
        communicate._SSL_CTX.load_verify_locations(cafile=paths.cafile)
    limit = asyncio.Semaphore(3)
    result = []
    async def create(pack, index, prompt):
        name, text, difficulty, voice = prompt
        identifier = f'{pack}-spoken-{index+1}'
        destination = ASSETS / f'{identifier}.wav'
        async with limit:
            if not destination.exists():
                with tempfile.TemporaryDirectory() as temporary:
                    mp3 = Path(temporary)/'voice.mp3'
                    speed = '+10%' if difficulty != 'hard' else '+16%'
                    pitch = '+12Hz' if index % 3 == 0 else '-8Hz' if index % 3 == 1 else '+0Hz'
                    for attempt in range(3):
                        try:
                            await asyncio.wait_for(edge_tts.Communicate(text, voice=voice, rate=speed, pitch=pitch).save(str(mp3)), 30)
                            break
                        except Exception:
                            if attempt == 2: raise
                    convert(mp3, destination)
            pad_short(destination)
            with wave.open(str(destination)) as wav:
                seconds = wav.getnframes()/wav.getframerate()
            entry = {'id': identifier, 'name': name, 'pack': pack, 'seconds': seconds, 'difficulty': difficulty,
                'text': text, 'source': 'synthetic-speech', 'voice': voice,
                'sha256': hashlib.sha256(destination.read_bytes()).hexdigest()}
            result.append(entry)
            print(f'{identifier}: {seconds:.2f}s', flush=True)
    await asyncio.gather(*(create(pack,index,prompt) for pack, prompts in PROMPTS.items() for index,prompt in enumerate(prompts)))
    (ASSETS/'spoken.json').write_text(json.dumps(sorted(result,key=lambda x:x['id']),ensure_ascii=False,indent=2)+'\n')
    print(f'Created {len(result)} original spoken templates.', flush=True)

if __name__ == '__main__':
    asyncio.run(main())
