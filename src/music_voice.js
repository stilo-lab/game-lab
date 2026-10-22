'use strict';
function createVoice({voice=require('@discordjs/voice')}={}){
  return {busy:guildId=>Boolean(voice.getVoiceConnection(guildId)),async connect(channel,signal){
    if(signal.aborted)throw Error('Musik beendet.');
    if(voice.getVoiceConnection(channel.guild.id))throw Error('Pixel ist bereits mit einem anderen Voice-System verbunden.');
    const connection=voice.joinVoiceChannel({guildId:channel.guild.id,channelId:channel.id,adapterCreator:channel.guild.voiceAdapterCreator,selfDeaf:true,selfMute:false});
    const player=voice.createAudioPlayer({behaviors:{noSubscriber:voice.NoSubscriberBehavior.Stop}});player.on('error',()=>{});
    let closed=false,resource=null,finishCurrent=null;
    const close=()=>{if(closed)return;closed=true;signal.removeEventListener('abort',close);connection.off?.('stateChange',changed);finishCurrent?.(Error('Musik beendet.'));player.stop(true);if(voice.getVoiceConnection(channel.guild.id)===connection&&connection.state?.status!==voice.VoiceConnectionStatus.Destroyed)connection.destroy();};
    const changed=(_,next)=>{
      if(next.status===voice.VoiceConnectionStatus.Destroyed)close();
      else if(next.status===voice.VoiceConnectionStatus.Disconnected)void voice.entersState(connection,voice.VoiceConnectionStatus.Ready,AbortSignal.any([signal,AbortSignal.timeout(10000)])).catch(close);
    };
    connection.on?.('stateChange',changed);
    signal.addEventListener('abort',close,{once:true});
    try{await voice.entersState(connection,voice.VoiceConnectionStatus.Ready,AbortSignal.any([signal,AbortSignal.timeout(20000)]));if(signal.aborted||closed)throw Error('Musik beendet.');connection.subscribe(player);}
    catch(error){close();throw error;}
    return {close,get closed(){return closed;},pause:()=>player.pause(),resume:()=>player.unpause(),volume:level=>resource?.volume?.setVolume(level/100),async play(pcm,trackSignal,level,onPlaying=()=>{}){
      if(closed||trackSignal.aborted)throw Error('Musik beendet.');
      await new Promise((resolve,reject)=>{
        let done=false,started=false;const timer=setTimeout(()=>finish(Error('Die maximale Wiedergabezeit ist überschritten.')), (7200+900)*1000);timer.unref?.();
        const finish=error=>{if(done)return;done=true;clearTimeout(timer);finishCurrent=null;player.removeListener('stateChange',state);player.removeListener('error',fail);pcm.removeListener('error',fail);trackSignal.removeEventListener('abort',abort);player.stop(true);error?reject(error):resolve();};
        const state=(_,next)=>{if(next.status===voice.AudioPlayerStatus.Playing&&!started){started=true;try{onPlaying();}catch{}}if(next.status===voice.AudioPlayerStatus.Idle)finish();};
        const fail=error=>finish(error),abort=()=>finish(Object.assign(Error('Titel beendet.'),{code:'MUSIC_CANCELLED'}));finishCurrent=finish;
        player.on('stateChange',state);player.on('error',fail);pcm.on('error',fail);trackSignal.addEventListener('abort',abort,{once:true});
        try{resource=voice.createAudioResource(pcm,{inputType:voice.StreamType.Raw,inlineVolume:true});resource.volume?.setVolume(level/100);player.play(resource);}catch(error){finish(error);}
      });
    }};
  }};
}
module.exports={createVoice};
