'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const {RATE,synth,wavEncode}=require('../src/mimic_audio');
const root=path.join(__dirname,'../assets/mimic'),catalog=require(path.join(root,'catalog.json')).filter(x=>['animals','machines','voices','melodies'].includes(x.pack));
for(const [index,sound]of catalog.entries())sound.difficulty=['easy','normal','hard','normal'][index%4];
const note=(f,d=.25,gap=.08,to,style,noise=0)=>({f,d,gap,to,style,noise});
const effects=[
  ['gaming','Coin-Kombo','easy',[note(330,.12,.04),note(440,.14,.04),note(550,.25,0)]],
  ['gaming','Game Over','normal',[note(392,.2),note(330,.2),note(262,.2),note(196,.5,0)]],
  ['gaming','Boss-Alarm','hard',[note(100,.22,.1,200,'buzz'),note(100,.22,.1,260,'buzz'),note(100,.5,0,350,'buzz')]],
  ['gaming','Respawn-Signal','normal',[note(200,.5,0,480),note(480,.25,0,360)]],
  ['horror','Geisterheulen','normal',[note(210,.6,0,430,'voice'),note(430,.6,0,140,'voice')]],
  ['horror','Monster-Knurren','hard',[note(90,.7,0,60,'buzz',.35),note(70,.35,0,130,'buzz',.25)]],
  ['horror','Dunkle Schritte','easy',[note(70,.09,.23,30,'buzz',.4),note(75,.09,.23,30,'buzz',.4),note(80,.13,0,35,'buzz',.4)]],
  ['horror','Grusel-Lachen','hard',[note(190,.16,.1,110,'voice'),note(210,.18,.12,130,'voice'),note(240,.5,0,120,'voice')]],
  ['beatbox','Kick Snare','easy',[note(95,.12,.12,35,'buzz'),note(160,.1,.14,80,'buzz',1),note(95,.12,.12,35,'buzz'),note(160,.1,0,80,'buzz',1)]],
  ['beatbox','Hi-Hat-Kette','normal',[note(540,.06,.10,300,'buzz',1),note(540,.06,.10,300,'buzz',1),note(540,.06,.10,300,'buzz',1),note(540,.12,0,300,'buzz',1)]],
  ['beatbox','Bass-Drop','normal',[note(180,.65,.1,45,'buzz'),note(80,.25,0,35,'buzz')]],
  ['beatbox','Triple Kick','easy',[note(95,.13,.08,30,'buzz'),note(95,.13,.08,30,'buzz'),note(95,.24,0,30,'buzz')]],
  ['beatbox','Drum Fill','hard',[note(180,.1,.12,85,'buzz',.9),note(170,.1,.06,80,'buzz',.9),note(160,.1,.06,75,'buzz',.9),note(120,.24,0,40,'buzz')]],
  ['beatbox','Boots Cats','normal',[note(90,.12,.12,35,'buzz'),note(240,.15,.12,130,'buzz',.8),note(90,.12,.12,35,'buzz'),note(240,.15,0,130,'buzz',.8)]],
  ['beatbox','Pixel-Bass','hard',[note(80,.18,.08,110,'buzz'),note(100,.18,.08,70,'buzz'),note(130,.18,.08,160,'buzz'),note(90,.3,0,50,'buzz')]],
  ['beatbox','Beatbox-Finale','hard',[note(95,.1,.05,35,'buzz'),note(300,.09,.08,160,'buzz',1),note(150,.12,.05,65,'buzz',.8),note(95,.14,.12,35,'buzz'),note(180,.3,0,50,'buzz',.4)]]
];
for(const [index,[pack,name,difficulty,notes]]of effects.entries()){
  const id=`${pack}-fx-${index+1}`,samples=synth(notes),bytes=wavEncode(samples);fs.writeFileSync(path.join(root,`${id}.wav`),bytes);catalog.push({id,name,pack,difficulty,seconds:samples.length/RATE,source:'original-synth',sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
}
const spoken=require(path.join(root,'spoken.json'));catalog.push(...spoken);
fs.writeFileSync(path.join(root,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');
fs.writeFileSync(path.join(root,'SOUND_SOURCES.md'),'# Pixel Soundpacks\n\n32 retained original synthesized references, 16 new original synthesized effects and '+spoken.length+' newly synthesized spoken templates.\n\nSpoken templates use generic Microsoft neural speech voices through edge-tts during asset creation; no speech service runs in the bot. No real streamer voice is cloned, and no original streamer recording or original Mimic Party game asset is included. The text and voice metadata are in catalog.json; original development prompts are in scripts/mimic-spoken-prompts.json.\n\nRebuild: build-mimic-sounds.js (base references), build-mimic-spoken.py (optional speech regeneration), then build-mimic-extra.js (categories and complete catalog). Existing packaged WAV files work without these build tools.\n');
console.log(`Catalog: ${catalog.length} sounds in ${new Set(catalog.map(x=>x.pack)).size} categories.`);
