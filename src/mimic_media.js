'use strict';
const {spawn}=require('node:child_process');const fs=require('node:fs');
const {RATE,wavDecode,wavEncode}=require('./mimic_audio');
function ffmpegPath(){
  if(process.env.MIMIC_FFMPEG_PATH)return process.env.MIMIC_FFMPEG_PATH;
  try{const binary=require('ffmpeg-static');if(binary&&fs.existsSync(binary))return binary;}catch{}
  return 'ffmpeg';
}
function decodeMedia(bytes,extension,{start=0,duration,padShort=false}={}){
  if(!['wav','mp3','ogg'].includes(extension))return Promise.reject(Error('Unterstützt: WAV, MP3 und OGG.'));
  if(!Buffer.isBuffer(bytes)||bytes.length>2*1024*1024)return Promise.reject(Error('Datei ist zu groß (max. 2 MB).'));
  if(!Number.isFinite(start)||start<0||start>120||duration!==undefined&&(!Number.isFinite(duration)||duration<.4||duration>6))return Promise.reject(Error('Ausschnitt: Start 0–120 Sekunden, Länge 0,4–6 Sekunden.'));
  if(extension==='wav'&&!start&&duration===undefined){try{return Promise.resolve(wavDecode(bytes));}catch(error){return Promise.reject(error);}}
  return new Promise((resolve,reject)=>{
    // A pipe-only forced demuxer prevents playlists from opening URLs or local files.
    const args=['-nostdin','-hide_banner','-loglevel','error','-protocol_whitelist','pipe','-f',extension,'-i','pipe:0','-ss',String(start),'-t',String(duration??6.05),'-map','0:a:0','-vn','-sn','-dn','-ac','1','-ar',String(RATE),'-f','s16le','pipe:1'];
    const child=spawn(ffmpegPath(),args,{stdio:['pipe','pipe','pipe'],windowsHide:true});let done=false,total=0;const chunks=[];
    const finish=(error,data)=>{if(done)return;done=true;clearTimeout(timer);child.stdin.destroy();if(error)child.kill('SIGKILL');error?reject(error):resolve(data);};
    const timer=setTimeout(()=>finish(Error('Audio-Konvertierung dauerte zu lange. Kürzeren Clip wählen.')),12000);
    child.on('error',()=>finish(Error('MP3/OGG benötigen FFmpeg. npm install ausführen oder eine PCM-WAV verwenden.')));
    child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});
    child.stdout.on('data',part=>{total+=part.length;if(total>Math.ceil(RATE*6.06)*2)return finish(Error('Clip ist länger als sechs Sekunden. Einen Ausschnitt wählen.'));chunks.push(part);});
    child.on('close',code=>{
      if(done)return;if(code!==0)return finish(Error('Audio konnte nicht gelesen werden. Gültige WAV-, MP3- oder OGG-Datei wählen.'));
      try{const pcm=Buffer.concat(chunks),length=Math.floor(pcm.length/2),samples=new Float32Array(padShort?Math.max(Math.ceil(RATE*.4),length):length);for(let i=0;i<length;i++)samples[i]=pcm.readInt16LE(i*2)/32768;
        const normalized=wavDecode(wavEncode(samples));samples.fill(0);pcm.fill(0);finish(null,normalized);
      }catch(error){finish(error);}
    });child.stdin.end(bytes);
  });
}
module.exports={decodeMedia,ffmpegPath};
