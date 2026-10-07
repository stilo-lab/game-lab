'use strict';
const RATE=16000,MAX_SECONDS=8;
const clamp=x=>Math.max(-1,Math.min(1,Number.isFinite(x)?x:0));
function wavEncode(samples){
  const out=Buffer.alloc(44+samples.length*2);out.write('RIFF');out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);out.writeUInt32LE(RATE,24);out.writeUInt32LE(RATE*2,28);out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(samples.length*2,40);
  for(let i=0;i<samples.length;i++)out.writeInt16LE(Math.round(clamp(samples[i])*32767),44+i*2);return out;
}
function wavDecode(bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length<44||bytes.length>2*1024*1024||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE')throw Error('Bitte eine gültige PCM-WAV-Datei hochladen.');
  let format,data,offset=12;
  while(offset+8<=bytes.length){const id=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4),start=offset+8;if(start+size>bytes.length)throw Error('WAV-Datei ist unvollständig.');
    if(id==='fmt '){if(size<16)throw Error('Ungültiges WAV-Format.');format={codec:bytes.readUInt16LE(start),channels:bytes.readUInt16LE(start+2),rate:bytes.readUInt32LE(start+4),align:bytes.readUInt16LE(start+12),bits:bytes.readUInt16LE(start+14)};}
    if(id==='data')data=bytes.subarray(start,start+size);offset=start+size+(size&1);
  }
  if(!format||!data||format.codec!==1||![1,2].includes(format.channels)||format.bits!==16||format.align!==format.channels*2||format.rate<8000||format.rate>48000||data.length%format.align)throw Error('Unterstützt: WAV, 16-Bit PCM, Mono/Stereo, 8–48 kHz.');
  const length=data.length/format.align,duration=length/format.rate;if(duration<0.4||duration>6)throw Error('Dein Sound muss 0,4 bis 6 Sekunden lang sein.');
  const samples=new Float32Array(Math.round(duration*RATE));
  for(let i=0;i<samples.length;i++){const pos=Math.min(length-1,Math.floor(i*format.rate/RATE));let v=0;for(let c=0;c<format.channels;c++)v+=data.readInt16LE(pos*format.align+c*2)/32768;samples[i]=v/format.channels;}
  let peak=0;for(const v of samples)peak=Math.max(peak,Math.abs(v));if(peak<0.005)throw Error('Der Sound enthält nur Stille.');
  const gain=Math.min(4,0.6/peak);for(let i=0;i<samples.length;i++)samples[i]=clamp(samples[i]*gain);return samples;
}
function pcmStereo48(samples){const out=Buffer.alloc(samples.length*3*4);for(let i=0;i<samples.length*3;i++){const p=i/3,low=Math.floor(p),value=clamp(samples[low]*(1-p+low)+(samples[low+1]??samples[low])*(p-low));const v=Math.round(value*22000);out.writeInt16LE(v,i*4);out.writeInt16LE(v,i*4+2);}return out;}
function pcmMono16(buffer){const frames=Math.floor(buffer.length/12),out=new Float32Array(frames);for(let i=0;i<frames;i++){let sum=0;for(let j=0;j<3;j++)sum+=(buffer.readInt16LE(i*12+j*4)+buffer.readInt16LE(i*12+j*4+2))/65536;out[i]=sum/3;}return out;}
function effect(samples,type){
  const out=new Float32Array(samples.length);
  if(type==='fart')return synth([{f:85,to:35,d:0.8,noise:0.4,style:'buzz'}]);
  if(type==='pitch'){for(let i=0;i<out.length;i++)out[i]=samples[Math.floor(i*1.38)%samples.length]*0.8;return out;}
  for(let i=0;i<out.length;i++){
    const x=samples[i];out[i]=type==='saturation'?Math.tanh(x*7)*0.55:type==='echo'?clamp(x*0.65+(samples[i-2800]||0)*0.3+(samples[i-5600]||0)*0.15):type==='chop'?(Math.floor(i/1400)%2?0:x):x;
  }return out;
}
function synth(notes){
  const total=notes.reduce((n,x)=>n+Math.round((x.d+(x.gap||0))*RATE),0),out=new Float32Array(total);let offset=0,seed=7123;
  for(const note of notes){const count=Math.round(note.d*RATE);let phase=0;
    for(let i=0;i<count;i++){const t=i/count,frequency=note.f+(note.to===undefined?0:(note.to-note.f)*t);phase+=2*Math.PI*frequency/RATE;
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=(seed/2**32)*2-1;
      const envelope=Math.min(1,i/(RATE*0.018),(count-i)/(RATE*0.035));
      const pulse=note.style==='buzz'?Math.sin(phase)+0.3*Math.sin(3*phase)+0.15*Math.sin(5*phase):note.style==='voice'?Math.sin(phase)+0.35*Math.sin(2*phase)+0.22*Math.sin(3*phase)+0.1*Math.sin(5*phase):Math.sin(phase);
      out[offset+i]=clamp(envelope*(pulse*0.28+noise*(note.noise||0)*0.2));
    }offset+=count+Math.round((note.gap||0)*RATE);
  }return out;
}
module.exports={RATE,MAX_SECONDS,wavEncode,wavDecode,pcmStereo48,pcmMono16,effect,synth};
