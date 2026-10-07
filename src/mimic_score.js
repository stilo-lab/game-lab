'use strict';
const {RATE,MAX_SECONDS}=require('./mimic_audio');
const clamp=x=>Math.max(0,Math.min(1,x));
function prepare(input){
  if(!input||input.length>RATE*MAX_SECONDS)return new Float32Array();
  const frames=[];let peak=0;
  for(let at=0;at<input.length;at+=320){let sum=0;for(let j=at;j<Math.min(at+320,input.length);j++){const v=Number.isFinite(input[j])?Math.max(-1,Math.min(1,input[j])):0;sum+=v*v;}const rms=Math.sqrt(sum/320);frames.push(rms);peak=Math.max(peak,rms);}
  if(peak<0.008)return new Float32Array();const threshold=Math.max(0.005,peak*0.10);let first=frames.findIndex(v=>v>=threshold),last=frames.length-1;while(last>=0&&frames[last]<threshold)last--;
  return Float32Array.from(Array.from(input).slice(Math.max(0,(first-1)*320),Math.min(input.length,(last+2)*320)),v=>Number.isFinite(v)?v:0);
}
function features(input){
  const samples=prepare(input),rows=[];if(samples.length<320)return {rows,duration:0,attacks:0,voiced:0};
  const down=new Float32Array(Math.floor(samples.length/2));for(let i=0;i<down.length;i++)down[i]=(samples[i*2]+samples[i*2+1])/2;
  for(let at=0;at+256<=down.length;at+=160){let energy=0,mean=0;for(let j=0;j<256;j++)mean+=down[at+j];mean/=256;
    const frame=new Float32Array(256);for(let j=0;j<256;j++){frame[j]=down[at+j]-mean;energy+=frame[j]*frame[j];}
    let best=0,lagBest=0;
    if(energy>0.004){for(let lag=13;lag<=133;lag++){let ab=0,aa=0,bb=0;for(let j=0;j<256-lag;j++){const a=frame[j],b=frame[j+lag];ab+=a*b;aa+=a*a;bb+=b*b;}const corr=ab/Math.sqrt(aa*bb+1e-15);if(corr>best){best=corr;lagBest=lag;}}
      // Prefer the shortest near-best lag to avoid choosing octave subharmonics.
      for(let lag=13;lag<lagBest;lag++){let ab=0,aa=0,bb=0;for(let j=0;j<256-lag;j++){const a=frame[j],b=frame[j+lag];ab+=a*b;aa+=a*a;bb+=b*b;}if(ab/Math.sqrt(aa*bb+1e-15)>=Math.max(0.72,best-0.025)){lagBest=lag;break;}}
    }
    rows.push({energy:Math.sqrt(energy/256),pitch:best>=0.65&&lagBest?12*Math.log2(8000/lagBest):null});
  }
  const energies=rows.map(r=>r.energy),peak=Math.max(...energies,0.01);let attacks=0,was=false;for(const r of rows){r.energy/=peak;const on=r.energy>=0.2;if(on&&!was)attacks++;was=on;}
  const pitches=rows.filter(r=>r.pitch!==null).map(r=>r.pitch).sort((a,b)=>a-b),center=pitches[Math.floor(pitches.length/2)]||0;for(const r of rows)if(r.pitch!==null)r.pitch-=center;
  return {rows,duration:samples.length/RATE,attacks,voiced:pitches.length/Math.max(1,rows.length)};
}
function distance(a,b,cost){
  if(!a.length||!b.length)return 1;let prev=new Float64Array(b.length+1).fill(Infinity);prev[0]=0;
  for(let i=1;i<=a.length;i++){const next=new Float64Array(b.length+1).fill(Infinity);for(let j=1;j<=b.length;j++)next[j]=cost(a[i-1],b[j-1])+Math.min(prev[j],next[j-1],prev[j-1]);prev=next;}
  return clamp(prev[b.length]/Math.max(a.length,b.length));
}
function scoreMimic(reference,recording){
  const a=features(reference),b=features(recording);if(!a.rows.length||!b.rows.length)return {score:0,melody:0,rhythm:0,attacks:0,duration:0,status:'no_audio'};
  const envelope=1-distance(a.rows,b.rows,(x,y)=>Math.abs(x.energy-y.energy));
  const attacks=Math.exp(-Math.abs(a.attacks-b.attacks)/Math.max(1,a.attacks)*1.6);
  const duration=Math.exp(-Math.abs(Math.log(b.duration/a.duration))*1.8);
  const rhythm=envelope*Math.sqrt(duration);
  const melody=a.voiced<0.15?rhythm:1-distance(a.rows,b.rows,(x,y)=>x.pitch===null&&y.pitch===null?0:x.pitch===null||y.pitch===null?0.75:clamp(Math.abs(x.pitch-y.pitch)/6));
  const reliability=a.voiced>=0.4&&b.voiced<0.1?0.35:1;
  const points={melody:Math.round(melody*100),rhythm:Math.round(rhythm*100),attacks:Math.round(attacks*100),duration:Math.round(duration*100)};
  return {...points,score:Math.round(clamp((melody*.45+rhythm*.25+attacks*.20+duration*.10)*reliability)*100),status:'ok'};
}
module.exports={features,scoreMimic,prepare};
