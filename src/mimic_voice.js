'use strict';
const {Readable}=require('node:stream');
const {performance}=require('node:perf_hooks');
const {RATE,pcmStereo48,pcmMono16}=require('./mimic_audio');

function wait(ms,signal){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(Error('Spiel beendet.'));
    const abort=()=>finish(Error('Spiel beendet.'));
    const timer=setTimeout(()=>finish(),ms);
    function finish(error){clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve();}
    signal?.addEventListener('abort',abort,{once:true});
  });
}

// Voice is loaded lazily: a missing optional codec never breaks other commands.
function createVoiceAdapter(){
  const v=require('@discordjs/voice'),Opus=require('opusscript');
  if(!v.version?.startsWith('0.19.'))throw Error('Mimic benötigt @discordjs/voice 0.19.2. Bitte npm install ausführen.');
  return {
    busy:guildId=>Boolean(v.getVoiceConnection(guildId)),
    report:()=>v.generateDependencyReport(),
    async connect(channel,signal){
      if(v.getVoiceConnection(channel.guild.id))throw Error('Pixel ist bereits in einem anderen Voice-Spiel. Beende dieses zuerst.');
      const connection=v.joinVoiceChannel({channelId:channel.id,guildId:channel.guild.id,adapterCreator:channel.guild.voiceAdapterCreator,selfDeaf:false,selfMute:false});
      const player=v.createAudioPlayer({behaviors:{noSubscriber:v.NoSubscriberBehavior.Stop}});
      let current=null,playing=null,closed=false;
      const stop=()=>{player.stop(true);};signal.addEventListener('abort',stop);
      // Always attach an error listener, including while no resource is playing.
      player.on('error',()=>{});
      try{await v.entersState(connection,v.VoiceConnectionStatus.Ready,AbortSignal.any([signal,AbortSignal.timeout(20000)]));}catch(error){signal.removeEventListener('abort',stop);connection.destroy();throw error;}
      if(signal.aborted){connection.destroy();throw Error('Spiel beendet.');}
      connection.subscribe(player);
      return {
        async play(samples){
          if(closed||signal.aborted)throw Error('Spiel beendet.');
          await new Promise((resolve,reject)=>{
            const pcm=pcmStereo48(samples),stream=Readable.from([pcm]);
            let done=false;
            const finish=error=>{if(done)return;done=true;playing=null;clearTimeout(timer);player.removeListener('stateChange',state);player.removeListener('error',fail);signal.removeEventListener('abort',abort);player.stop(true);stream.destroy();pcm.fill(0);error?reject(error):resolve();};
            const state=(_,next)=>{if(next.status===v.AudioPlayerStatus.Idle)finish();},fail=e=>finish(e),abort=()=>finish(Error('Spiel beendet.'));
            const timer=setTimeout(()=>finish(Error('Audio-Wiedergabe hat zu lange gebraucht.')),samples.length/RATE*1000+12000);
            player.on('stateChange',state);player.on('error',fail);signal.addEventListener('abort',abort,{once:true});
            playing=()=>finish();try{player.play(v.createAudioResource(stream,{inputType:v.StreamType.Raw}));}catch(error){finish(error);}
          });
        },
        async capture(ids,seconds){
          if(current)throw Error('Eine Aufnahme läuft bereits.');
          if(closed||signal.aborted)throw Error('Spiel beendet.');
          const buffers=new Map(),streams=new Map(),start=performance.now();
          const release=id=>{
            const item=streams.get(id);if(item){item.stream.destroy();item.decoder.delete();streams.delete(id);}
          };
          const forget=id=>{release(id);buffers.get(id)?.fill(0);buffers.delete(id);};
          current={forget};
          try{
            for(const id of ids){
              const data=new Float32Array(Math.ceil(Math.min(8,seconds)*RATE));buffers.set(id,data);
              const decoder=new Opus(48000,2,Opus.Application.AUDIO),stream=connection.receiver.subscribe(id,{end:{behavior:v.EndBehaviorType.Manual}});
              const item={stream,decoder,cursor:0,last:0,errors:0};streams.set(id,item);
              stream.on('error',()=>release(id));
              stream.on('data',packet=>{
                if(signal.aborted||!buffers.has(id)||packet.length>4000)return;
                try{
                  const decoded=decoder.decode(packet),mono=pcmMono16(decoded),now=performance.now();
                  // Preserve actual pauses between packet bursts; never concatenate silence away.
                  if(!item.last||now-item.last>80)item.cursor=Math.max(item.cursor,Math.round((now-start)*RATE/1000)-mono.length);
                  item.last=now;const at=Math.max(0,item.cursor),size=Math.min(mono.length,data.length-at);
                  if(size>0)data.set(mono.subarray(0,size),at);item.cursor=at+mono.length;decoded.fill(0);mono.fill(0);
                }catch{if(++item.errors>20)release(id);}
              });
            }
            await wait(Math.min(8,seconds)*1000,signal);return buffers;
          }catch(error){for(const data of buffers.values())data.fill(0);buffers.clear();throw error;}
          finally{for(const id of [...streams.keys()])release(id);current=null;}
        },
        forget:id=>current?.forget(id),
        interrupt:()=>playing?.(),
        close(){if(closed)return;closed=true;signal.removeEventListener('abort',stop);player.stop(true);if(v.getVoiceConnection(channel.guild.id)===connection)connection.destroy();},
        connection
      };
    }
  };
}
module.exports={createVoiceAdapter,wait};
