'use strict';
// All references are original synthesized sounds, freely reusable with this bot.
const fs=require('node:fs'),path=require('node:path');
const {synth,wavEncode}=require('../src/mimic_audio');
const n=(f,d=.45,gap=.10,to,style,noise=0)=>({f,d,gap,to,style,noise});
const packs={
  animals:[
    ['Katze',[n(180,.4,0,420,'voice'),n(420,.4,0,210,'voice')]],
    ['Hund',[n(135,.16,.15,95,'buzz',.1),n(135,.16,.15,95,'buzz',.1),n(110,.4,0,85,'buzz')]],
    ['Eule',[n(280,.5,.3,250,'voice'),n(280,.7,0,240,'voice')]],
    ['Vogel',[n(440,.15,.08,590),n(370,.13,.06,550),n(440,.16,.13,590),n(370,.3,0,470)]],
    ['Frosch',[n(100,.22,.12,75,'buzz'),n(110,.22,.12,80,'buzz'),n(100,.4,0,75,'buzz')]],
    ['Schaf',[n(190,.35,0,230,'voice'),n(230,.5,0,120,'voice')]],
    ['Affe',[n(230,.22,.08,330,'voice'),n(210,.22,.08,310,'voice'),n(260,.45,0,180,'voice')]],
    ['Wolf',[n(180,.5,0,310,'voice'),n(310,.8,0,190,'voice')]]
  ],
  machines:[
    ['Alarm',[n(350,.4,0,520,'buzz'),n(520,.4,0,350,'buzz'),n(350,.4,0,520,'buzz')]],
    ['Motorstart',[n(80,.5,0,160,'buzz',.08),n(160,.9,0,250,'buzz',.05)]],
    ['Roboter',[n(180,.18,.1),n(290,.18,.1),n(130,.35,.1),n(350,.25)]],
    ['Mikrowelle',[n(520,.2,.2),n(520,.2,.2),n(520,.2,.2)]],
    ['Telefon',[n(330,.18,.07),n(440,.18,.07),n(330,.18,.4),n(440,.3)]],
    ['UFO',[n(150,.5,0,580),n(580,.5,0,160),n(160,.6,0,520)]],
    ['Drucker',[n(150,.22,.13,260,'buzz'),n(220,.22,.13,130,'buzz'),n(150,.22,.13,260,'buzz')]],
    ['Dampflok',[n(400,.65,.2,350,'voice',.25),n(400,.65,0,280,'voice',.25)]]
  ],
  voices:[
    ['Oh-ho',[n(160,.3,.1,220,'voice'),n(220,.5,0,140,'voice')]],
    ['Ha-ha-ha',[n(230,.22,.1,170,'voice'),n(240,.22,.1,180,'voice'),n(250,.3,0,180,'voice')]],
    ['Hmm?',[n(180,.6,0,190,'voice'),n(190,.35,0,300,'voice')]],
    ['Wow',[n(150,.35,0,340,'voice'),n(340,.5,0,190,'voice')]],
    ['Brrr',[n(90,.45,.1,120,'buzz'),n(120,.5,0,80,'buzz')]],
    ['Uuuh',[n(320,.9,0,130,'voice')]],
    ['La-la',[n(220,.3,.12,260,'voice'),n(290,.3,.12,330,'voice'),n(220,.5,0,200,'voice')]],
    ['Pixel-Signal',[n(200,.22,.12,260,'voice'),n(310,.3,.12,220,'voice'),n(360,.5,0,230,'voice')]]
  ],
  melodies:[
    ['Level Up',[n(220),n(277),n(330),n(440,.7,0)]],
    ['Downbeat',[n(440,.3),n(330,.3),n(277,.3),n(220,.6,0)]],
    ['Sternsprung',[n(262,.25),n(392,.25),n(330,.25),n(523,.5,0)]],
    ['Glocke',[n(330,.7,.3),n(262,.7,0)]],
    ['Geheimnis',[n(196,.3),n(233,.3),n(220,.3),n(294,.6,0)]],
    ['Pixel-Tanz',[n(262,.2,.2),n(330,.2,.1),n(294,.35,.25),n(392,.4,0)]],
    ['Welle',[n(180,.8,0,360),n(360,.8,0,180)]],
    ['Auf Wiederhören',[n(330,.25),n(294,.25),n(262,.6,0)]]
  ]
};
const directory=path.join(__dirname,'../assets/mimic');fs.mkdirSync(directory,{recursive:true});
const catalog=[];
for(const [pack,sounds]of Object.entries(packs))for(const [i,[name,notes]]of sounds.entries()){
  const id=`${pack}-${i+1}`,samples=synth(notes);fs.writeFileSync(path.join(directory,`${id}.wav`),wavEncode(samples));catalog.push({id,name,pack,seconds:samples.length/16000});
}
fs.writeFileSync(path.join(directory,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');console.log(`Generated ${catalog.length} original references.`);
