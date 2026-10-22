'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{PassThrough}=require('node:stream');
const RELEASE='2026.08.19',ID=/^[A-Za-z0-9_-]{11}$/,MAX_DURATION=7200;
const error=(code,message)=>Object.assign(new Error(message),{code});
function binaryPath(){return process.env.YTDLP_PATH||path.join(__dirname,'..','tools',process.platform==='win32'?'yt-dlp.exe':'yt-dlp');}
function executable(file){try{fs.accessSync(file,fs.constants.X_OK);return true;}catch{return false;}}
function ffmpegPath(){
  if(process.env.FFMPEG_PATH&&executable(process.env.FFMPEG_PATH))return process.env.FFMPEG_PATH;
  try{const file=require('ffmpeg-static');if(file&&executable(file))return file;}catch{}
  for(const folder of String(process.env.PATH||'').split(path.delimiter)){const file=path.join(folder,process.platform==='win32'?'ffmpeg.exe':'ffmpeg');if(executable(file))return file;}
  return null;
}
function input(value){
  const text=String(value||'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,'').trim().replace(/^<(.+)>$/,'$1');
  if(!text||text.length>200)throw error('MUSIC_INPUT','Nutze einen YouTube-Link oder einen Suchbegriff mit höchstens 200 Zeichen.');
  if(/^https?:\/\/|^(?:(?:www|m|music)\.)?youtube\.com\/|^youtu\.be\//i.test(text)){
    let u;try{u=new URL(/^https?:/i.test(text)?text:'https://'+text);}catch{throw error('MUSIC_INPUT','Der YouTube-Link ist ungültig.');}
    if(u.protocol!=='https:'||u.username||u.password||u.port)throw error('MUSIC_INPUT','Nutze einen normalen HTTPS-YouTube-Link.');
    let id;
    if(u.hostname==='youtu.be')id=u.pathname.split('/')[1];
    else if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(u.hostname))id=u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)\/?$/)?.[1];
    if(!ID.test(id||''))throw error('MUSIC_INPUT','Bitte ein einzelnes YouTube-Video wählen. Kanal- und reine Playlist-Links sind hier nicht spielbar.');
    return 'https://www.youtube.com/watch?v='+id;
  }
  if(/^[a-z][\w+.-]*:/i.test(text)||text.startsWith('-'))throw error('MUSIC_INPUT','Nutze einen YouTube-Link oder einen normalen Songtitel.');
  return 'ytsearch1:'+text;
}
function mediaError(detail=''){
  if(/sign in|confirm.*bot|login|age.restrict|private video|members.only|not available|unavailable|403|429/i.test(detail))return error('MUSIC_YOUTUBE','YouTube verweigert den Abruf dieses Videos oder des Bot-Hosts. Versuche ein anderes öffentliches Video; ein Spotify-Login behebt das nicht.');
  return error('MUSIC_SOURCE','Der YouTube-Titel konnte nicht geladen werden. Prüfe /music diagnose und versuche einen anderen Link.');
}
function metadata(raw){
  let value=raw;if(value?._type==='playlist'){if(!Array.isArray(value.entries)||value.entries.length!==1)throw mediaError();value=value.entries[0];}
  if(!value||!ID.test(value.id)||!/^youtube$/i.test(value.extractor_key||value.extractor||''))throw mediaError();
  if(value.is_live||['is_live','is_upcoming','post_live'].includes(value.live_status))throw error('MUSIC_LIVE','Bitte ein veröffentlichtes Video statt eines Live-Streams oder einer Premiere wählen.');
  if(!Number.isFinite(value.duration)||value.duration<=0||value.duration>MAX_DURATION)throw error('MUSIC_DURATION','Unterstützt sind Videos mit bekannter Dauer bis zu zwei Stunden.');
  return {id:value.id,url:'https://www.youtube.com/watch?v='+value.id,title:String(value.title||'YouTube-Video').replace(/@/g,'@\u200b').slice(0,180),duration:value.duration};
}
function kill(child){
  if(!child||child.exitCode!==null&&child.exitCode!==undefined)return;
  try{child.kill('SIGTERM');}catch{}
  const timer=setTimeout(()=>{if(child.exitCode===null)try{child.kill('SIGKILL');}catch{}},1200);timer.unref?.();child.once?.('close',()=>clearTimeout(timer));
}
function createSource({spawnImpl=spawn,ytdlp=binaryPath,ffmpeg=ffmpegPath,available=executable}={}){
  const args=()=>['--ignore-config','--no-plugin-dirs','--no-cache-dir','--no-playlist','--no-progress','--no-warnings','--no-remote-components','--js-runtimes','node:'+process.execPath,'--socket-timeout','15','--retries','1','--fragment-retries','1','--extractor-retries','1','-f','bestaudio[ext=webm]/bestaudio/best'];
  function required(){const bin=ytdlp();if(!bin||!available(bin))throw error('MUSIC_TOOL','Der YouTube-Abrufdienst fehlt. Führe npm run music:setup aus oder prüfe den Installations-Log.');return bin;}
  async function resolve(query,signal){
    const target=input(query),bin=required();if(signal?.aborted)throw error('MUSIC_CANCELLED','Musikauftrag beendet.');
    return new Promise((resolve,reject)=>{
      let child,done=false,out='',err='';
      const finish=(failure,value)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(failure)kill(child);failure?reject(failure):resolve(value);};
      const abort=()=>finish(error('MUSIC_CANCELLED','Musikauftrag beendet.'));
      const timer=setTimeout(()=>finish(error('MUSIC_TIMEOUT','YouTube antwortet zu langsam. Versuche einen anderen Titel.')),45000);timer.unref?.();
      try{child=spawnImpl(bin,[...args(),'--dump-single-json','--skip-download','--',target],{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});}
      catch{finish(mediaError());return;}
      child.on('error',()=>finish(mediaError()));
      child.stdout.on('data',chunk=>{out+=chunk.toString();if(out.length>2_000_000)finish(mediaError());});
      child.stderr.on('data',chunk=>{err=(err+chunk.toString()).slice(-16000);});
      child.on('close',code=>{if(done)return;if(code!==0)return finish(mediaError(err));try{finish(null,metadata(JSON.parse(out)));}catch(e){finish(e.code?e:mediaError());}});
      signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    });
  }
  function stream(track,signal){
    if(!ID.test(track?.id||''))throw mediaError();const bin=required(),decoder=ffmpeg();if(!decoder)throw error('MUSIC_FFMPEG','FFmpeg fehlt. Prüfe /music diagnose und den ffmpeg-static-Installations-Log.');
    const pcm=new PassThrough({highWaterMark:192000});pcm.on('error',()=>{});
    let download,convert,closed=false,bytes=0,detail='';
    const close=()=>{if(closed)return;closed=true;clearTimeout(firstTimer);signal?.removeEventListener('abort',abort);download?.stdout?.unpipe();convert?.stdout?.unpipe();download?.stdout?.destroy();convert?.stdin?.destroy();convert?.stdout?.destroy();kill(download);kill(convert);pcm.destroy();};
    const fail=e=>{if(closed)return;pcm.destroy(e);close();};
    const abort=()=>fail(error('MUSIC_CANCELLED','Musikauftrag beendet.'));
    const firstTimer=setTimeout(()=>fail(error('MUSIC_TIMEOUT','YouTube hat keinen abspielbaren Ton geliefert.')),60000);firstTimer.unref?.();
    try{
      download=spawnImpl(bin,[...args(),'-o','-','--','https://www.youtube.com/watch?v='+track.id],{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
      convert=spawnImpl(decoder,['-nostdin','-hide_banner','-loglevel','error','-protocol_whitelist','pipe','-i','pipe:0','-vn','-sn','-dn','-ac','2','-ar','48000','-f','s16le','pipe:1'],{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});
      for(const p of [download,convert]){p.on('error',()=>fail(mediaError()));p.stderr.on('data',chunk=>{detail=(detail+chunk.toString()).slice(-16000);});}
      download.stdout.on('error',()=>fail(mediaError()));convert.stdin.on('error',()=>fail(mediaError(detail)));convert.stdout.on('error',()=>fail(mediaError()));
      convert.stdout.on('data',chunk=>{bytes+=chunk.length;clearTimeout(firstTimer);});
      download.stdout.pipe(convert.stdin);convert.stdout.pipe(pcm);
      download.on('close',code=>{if(code!==0&&!closed)fail(mediaError(detail));});
      convert.on('close',code=>{if(!closed&&(code!==0||!bytes))fail(mediaError(detail));});
      signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    }catch{fail(mediaError());}
    return {pcm,close};
  }
  return {resolve,stream,report:()=>({youtubeTool:available(ytdlp()),ffmpeg:Boolean(ffmpeg()),release:RELEASE})};
}
module.exports={RELEASE,MAX_DURATION,input,metadata,binaryPath,ffmpegPath,createSource,mediaError};
