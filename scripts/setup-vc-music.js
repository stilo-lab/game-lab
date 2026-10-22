'use strict';
// Install a pinned upstream release, verify its SHA-256 and replace atomically.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {RELEASE,binaryPath}=require('../src/music_source');
const HOSTS=new Set(['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com']);
async function response(url,{fetchImpl=fetch,signal}={}){
  let current=new URL(url);
  for(let i=0;i<5;i++){
    if(current.protocol!=='https:'||!HOSTS.has(current.hostname)||current.username||current.password||current.port)throw Error('Unerwartetes Download-Ziel.');
    const res=await fetchImpl(current.href,{signal,redirect:'manual',headers:{'User-Agent':'Pixel-VC-Music-Setup'}});
    if([301,302,303,307,308].includes(res.status)){const next=res.headers.get('location');await res.body?.cancel();if(!next)throw Error('Download-Weiterleitung fehlt.');current=new URL(next,current);continue;}
    if(!res.ok){await res.body?.cancel();throw Error('Download meldet HTTP '+res.status);}return res;
  }
  throw Error('Zu viele Download-Weiterleitungen.');
}
async function bytes(res,max){
  const chunks=[];let size=0;for await(const chunk of res.body){size+=chunk.length;if(size>max)throw Error('Download ist zu groß.');chunks.push(Buffer.from(chunk));}return Buffer.concat(chunks);
}
async function setup({platform=process.platform,arch=process.arch,target=binaryPath(),fetchImpl=fetch,explicit=Boolean(process.env.YTDLP_PATH)}={}){
  if(explicit){fs.accessSync(target,fs.constants.X_OK);return {status:'existing',target};}
  const asset=platform==='linux'&&arch==='x64'?'yt-dlp_linux':platform==='linux'&&arch==='arm64'?'yt-dlp_linux_aarch64':platform==='darwin'?'yt-dlp_macos':platform==='win32'&&arch==='x64'?'yt-dlp.exe':null;
  if(!asset)throw Error('Diese Plattform braucht eine eigene YTDLP_PATH-Installation.');
  const root='https://github.com/yt-dlp/yt-dlp/releases/download/'+RELEASE+'/',signal=AbortSignal.timeout(120000);
  const sums=(await bytes(await response(root+'SHA2-256SUMS',{fetchImpl,signal}),100000)).toString();
  const checksum=sums.split(/\r?\n/).map(line=>line.match(/^([a-f0-9]{64})\s+\*?(.+)$/i)).find(m=>m&&m[2]===asset)?.[1]?.toLowerCase();if(!checksum)throw Error('Upstream-Prüfsumme fehlt.');
  try{if(crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')===checksum){fs.chmodSync(target,0o755);return {status:'verified',target};}}catch{}
  const file=await bytes(await response(root+asset,{fetchImpl,signal}),100_000_000);
  if(crypto.createHash('sha256').update(file).digest('hex')!==checksum)throw Error('Die Download-Prüfsumme stimmt nicht. Vorhandene Datei bleibt erhalten.');
  fs.mkdirSync(path.dirname(target),{recursive:true});const temp=target+'.'+crypto.randomBytes(6).toString('hex')+'.download';
  try{fs.writeFileSync(temp,file,{mode:0o755,flag:'wx'});fs.renameSync(temp,target);}finally{fs.rmSync(temp,{force:true});}
  return {status:'installed',target};
}
if(require.main===module)setup().then(r=>console.log('Pixel VC-Musik: YouTube-Abrufdienst '+r.status+'.')).catch(()=>{console.warn('Pixel VC-Musik: Abrufdienst konnte nicht installiert werden. Andere Bot-Funktionen bleiben aktiv. Prüfe npm run music:setup und /music diagnose.');if(process.argv.includes('--strict'))process.exitCode=1;});
module.exports={setup,response};
