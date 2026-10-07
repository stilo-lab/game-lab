'use strict';
const crypto=require('node:crypto');
const {RATE,synth,effect}=require('./mimic_audio');
const {wait}=require('./mimic_voice');
const {prepare}=require('./mimic_score');
const {categoriesFor,DIFFICULTIES,CATEGORIES,categoryName}=require('./mimic_categories');
const EFFECTS=Object.freeze({echo:'Echo',saturation:'Verzerrung',pitch:'Pitch-Shift',chop:'Zerhackt',fart:'Pups-Ersatz',penalty:'20 Punkte Abzug'});
const CARDS=Object.freeze(['bonus','bonus','double','shield',...Object.keys(EFFECTS)]);
function createMimicEngine({sounds,scorePool,voiceFactory,quietLeases,db,saveDB,isExternalBusy=()=>false,isAllowed=()=>true,onUpdate=async()=>{},delay=wait,random=crypto.randomInt,now=Date.now,maxSessions=4}){
  const sessions=new Map();
  const check=s=>{if(s.abort.signal.aborted||sessions.get(s.guildId)!==s||!isAllowed(s.guildId))throw Error('Spiel beendet.');};
  async function update(s,note){s.note=note;await onUpdate(s,note);check(s);}
  const sorted=s=>[...s.players.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
  function status(guildId){return sessions.get(guildId);}
  function create(options){
    if(sessions.has(options.guildId))throw Error('Hier gibt es schon eine Mimic-Lobby. /mimic status zeigt sie.');
    if(sessions.size>=maxSessions)throw Error('Alle Voice-Spielplätze sind gerade belegt. Bitte später versuchen.');
    if(isExternalBusy(options.guildId))throw Error('Eine andere Voice-Party läuft. Beende sie zuerst.');
    categoriesFor(options.pack);const difficulty=options.difficulty||'mixed';
    const available=sounds.list(options.guildId,options.pack,difficulty);if(!available.length)throw Error('Dieser Kategorie-Mix enthält keine passenden Sounds. Anderes Pack oder Gemischte Schwierigkeit wählen.');
    const s={...options,difficulty,token:crypto.randomBytes(12).toString('hex'),abort:new AbortController(),phase:'lobby',round:0,players:new Map(),roundResults:[],cards:new Map(),pending:new Map(),samples:new Map(),started:now(),history:[],connection:null,note:'Bereit zum Mitmachen',used:new Set(),votes:new Map(),playedCategories:new Set()};
    s.players.set(options.host.id,{id:options.host.id,name:options.host.name.slice(0,40),total:0,ready:false,modifier:null});
    sessions.set(s.guildId,s);
    s.expiry=setTimeout(()=>{void stop(s.guildId,'Lobby wegen Inaktivität beendet.');},10*60*1000);s.expiry.unref?.();
    return s;
  }
  function join(s,user){check(s);if(s.phase!=='lobby')throw Error('Diese Runde läuft bereits. Warte auf die nächste Lobby.');if(s.players.has(user.id))return;
    if(s.players.size>=5)throw Error('Die Lobby ist voll (maximal 5 Spieler).');s.players.set(user.id,{id:user.id,name:user.name.slice(0,40),total:0,ready:false,modifier:null});
  }
  function ready(s,id){check(s);if(s.phase!=='lobby'||!s.players.has(id))throw Error('Tritt zuerst der Lobby bei.');const p=s.players.get(id);p.ready=!p.ready;}
  function configure(s,id,{pack=s.pack,difficulty=s.difficulty}={}){
    check(s);if(s.phase!=='lobby')throw Error('Die Kategorien sind während der Party gesperrt.');if(id!==s.host.id)throw Error('Nur der Host kann den Mix ändern.');
    categoriesFor(pack);if(!DIFFICULTIES.some(d=>d.value===difficulty))throw Error('Unbekannte Schwierigkeit.');
    if(!sounds.list(s.guildId,pack,difficulty).length)throw Error('Dieser Mix enthält keine passenden Sounds. Gemischte Schwierigkeit wählen.');
    s.pack=Array.isArray(pack)?[...pack]:pack;s.difficulty=difficulty;s.used.clear();s.playedCategories.clear();
    for(const p of s.players.values())p.ready=false;s.note='Kategorie-Mix geändert. Alle bitte erneut Bereit drücken.';
  }
  function vote(s,id,category){check(s);if(s.phase!=='lobby'||!s.players.has(id))throw Error('Nur Lobby-Mitspieler können abstimmen.');if(!CATEGORIES.some(c=>c.value===category))throw Error('Unbekannte Kategorie.');if(!sounds.list(s.guildId,category).length)throw Error('Diese Kategorie ist leer.');s.votes.set(id,category);}
  function applyVotes(s,id){
    check(s);if(s.phase!=='lobby'||s.host.id!==id)throw Error('Nur der Host kann Lobby-Stimmen übernehmen.');
    const votes=[...s.votes].filter(([user])=>s.players.has(user));if(!votes.length)throw Error('Noch keine Kategorie-Stimmen.');
    const counts=new Map();for(const [,cat]of votes)counts.set(cat,(counts.get(cat)||0)+1);
    const pack=[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,3).map(x=>x[0]);configure(s,id,{pack,difficulty:'mixed'});return pack;
  }
  async function leave(s,id){
    s.connection?.forget(id);if(s.replayId===id)s.connection?.interrupt();s.samples.get(id)?.fill(0);s.samples.delete(id);s.players.delete(id);s.pending.delete(id);s.cards.delete(id);s.votes.delete(id);
    for(const [target,card] of s.pending)if(card.attacker===id)s.pending.delete(target);
    if(!s.players.size){s.abort.abort();if(s.task)await s.task;else await cleanup(s,'Alle Spieler sind gegangen.');return;}
    if(s.host.id===id){const p=s.players.values().next().value;s.host={id:p.id,name:p.name};}
    await onUpdate(s,'Spieler hat die Party verlassen.');
  }
  function attack(s,attacker,target,round){
    check(s);if(s.phase!=='wheel'||s.round!==round)throw Error('Dieses Glücksrad ist bereits vorbei.');
    const card=s.cards.get(attacker);if(!card||card.used||!EFFECTS[card.type])throw Error('Du hast keine offene Sabotage-Karte.');
    if(attacker===target||!s.players.has(target))throw Error('Wähle einen anderen aktiven Spieler.');
    if(s.pending.has(target))throw Error('Dieser Spieler hat bereits eine Sabotage für die nächste Runde.');
    card.used=true;s.pending.set(target,{type:card.type,attacker});
  }
  function next(s,id){check(s);if(s.phase!=='wheel'||s.host.id!==id)throw Error('Nur der Host kann das Glücksrad überspringen.');s.next?.();}
  async function cleanup(s,note){
    if(s.cleanup)return s.cleanup;
    s.cleanup=(async()=>{
      clearTimeout(s.expiry);clearTimeout(s.deadline);s.abort.abort();
      for(const data of s.samples.values())data.fill(0);s.samples.clear();s.reference?.fill(0);s.reference=null;
      s.connection?.close();
      const remaining=await quietLeases.restore(s.guildId,s.voiceChannel.id);
      s.phase='ended';s.note=note+(remaining?' Sprechrechte-Wiederherstellung offen: /mimic diagnose.':'');
      if(sessions.get(s.guildId)===s)sessions.delete(s.guildId);
      await onUpdate(s,s.note).catch(error=>console.warn('Mimic Panel:',error?.code||error?.message));
    })();return s.cleanup;
  }
  async function stop(guildId,note='Party beendet.'){const s=sessions.get(guildId);if(!s)return false;s.stopNote=note;s.abort.abort();if(s.task)await s.task;else await cleanup(s,note);return true;}
  function persist(s){
    db.mimic??={};db.mimic.stats??={};
    const previous=db.mimic.stats[s.guildId];const rec=structuredClone(previous||{players:{},lastGames:[]});
    if(rec.lastGames.includes(s.token))return;
    const ranking=sorted(s),best=ranking[0]?.total;
    for(const p of ranking){const stat=rec.players[p.id]??={name:p.name,games:0,wins:0,points:0,best:0};stat.name=p.name;stat.games++;stat.wins+=p.total===best?1:0;stat.points+=p.total;stat.best=Math.max(stat.best,p.total);}
    rec.lastGames=[...rec.lastGames,s.token].slice(-50);db.mimic.stats[s.guildId]=rec;
    try{saveDB();}catch(error){if(previous)db.mimic.stats[s.guildId]=previous;else delete db.mimic.stats[s.guildId];throw error;}
  }
  async function quiet(s){if(s.quiet){check(s);await quietLeases.lock(s.voiceChannel,[...s.players.keys()]);check(s);}}
  async function unquiet(s){if(await quietLeases.restore(s.guildId,s.voiceChannel.id))throw Error('Sprechrechte konnten nicht wiederhergestellt werden. /mimic diagnose verwenden.');}
  async function wheel(s){
    s.phase='wheel';s.cards.clear();
    for(const p of s.players.values()){
      const type=CARDS[random(CARDS.length)];s.cards.set(p.id,{type,used:!EFFECTS[type]});
      if(type==='bonus')p.total+=15;
      if(type==='double')p.modifier={...(p.modifier||{}),multiplier:2};
      if(type==='shield')p.modifier={...(p.modifier||{}),shield:true};
    }
    await update(s,'Glücksrad: 15 Sekunden zum Auswählen einer Sabotage.');
    const skip=new Promise(resolve=>{s.next=resolve;});
    try{await Promise.race([delay(15000,s.abort.signal),skip]);}finally{s.next=null;}
    check(s);
    for(const [target,card] of s.pending){const p=s.players.get(target);if(p){if(p.modifier?.shield){p.modifier={...p.modifier,shield:false,blocked:true};}else p.modifier={...(p.modifier||{}),effect:card.type,attacker:card.attacker};}}
    s.pending.clear();
  }
  async function run(s){
    let end='Party beendet.';
    try{
      check(s);await update(s,'Verbinde mit dem Voice-Chat …');s.connection=await voiceFactory().connect(s.voiceChannel,s.abort.signal);check(s);
      const disconnected=()=>{s.stopNote='Voice-Verbindung unterbrochen.';s.abort.abort();};
      s.connection.connection?.once('disconnected',disconnected);
      s.connection.connection?.once('destroyed',disconnected);
      s.connection.connection?.on('error',disconnected);
      s.deadline=setTimeout(()=>{s.stopNote='Zeitlimit erreicht.';s.abort.abort();},25*60*1000);s.deadline.unref?.();
      for(let round=1;round<=s.rounds;round++){
        check(s);s.round=round;s.roundResults=[];
        const pack=sounds.list(s.guildId,s.pack,s.difficulty);if(!pack.length)throw Error('Das Sound-Pack ist leer.');
        let candidates=pack.filter(x=>!s.used.has(x.id));if(!candidates.length){s.used.clear();candidates=pack;}
        // Alternate selected categories fairly instead of letting large packs dominate.
        const categories=[...new Set(candidates.map(x=>x.category||x.pack||'custom'))];
        let fresh=categories.filter(x=>!s.playedCategories.has(x));if(!fresh.length){s.playedCategories.clear();fresh=categories;}
        const category=fresh[random(fresh.length)];s.playedCategories.add(category);candidates=candidates.filter(x=>(x.category||x.pack||'custom')===category);
        const sound=candidates[random(candidates.length)];s.used.add(sound.id);s.sound=sound;s.reference=await sounds.load(s.guildId,sound);check(s);
        s.phase='reference';await quiet(s);await update(s,`${categoryName(sound.category||sound.pack)} · ${sound.name}. Einmal zuhören!`);await s.connection.play(s.reference);check(s);await unquiet(s);
        s.phase='countdown';
        await update(s,'🎧 Hörbarer Countdown: 3 · 2 · 1. Danach gemeinsam nachmachen!');
        for(let i=3;i>0;i--){const beep=synth([{f:i===1?800:500,d:.1}]);try{await s.connection.play(beep);}finally{beep.fill(0);}await delay(900,s.abort.signal);}
        s.phase='recording';
        // Discord message rate limits must not postpone the shared microphone window.
        const capture=s.connection.capture([...s.players.keys()],Math.min(7,Math.max(1.5,s.reference.length/RATE+.6)));
        [s.samples]=await Promise.all([capture,update(s,'🔴 JETZT nachmachen! Ein Versuch für alle.')]);check(s);
        // Remove a take if its owner left during capture; never replay revoked audio.
        for(const [id,data] of s.samples)if(!s.players.has(id)){data.fill(0);s.samples.delete(id);}
        s.phase='scoring';await update(s,'Bewerte Melodie, Rhythmus und Einsätze …');
        await Promise.all([...s.players.values()].map(async p=>{
          const original=s.samples.get(p.id)||new Float32Array(0);
          const audible=prepare(original);let replay=audible.length?effect(original,p.modifier?.effect):new Float32Array(0),result;audible.fill(0);
          try{result=await scorePool.score(s.reference,replay);}finally{replay.fill(0);}
          check(s);if(!s.players.has(p.id))return;
          const points=Math.max(0,Math.round(result.score*(p.modifier?.multiplier||1))-(p.modifier?.effect==='penalty'?20:0));p.total+=points;
          s.roundResults.push({id:p.id,name:p.name,result,points,effect:p.modifier?.effect,attacker:p.modifier?.attacker,blocked:p.modifier?.blocked});
        }));check(s);
        s.roundResults.sort((a,b)=>b.points-a.points);s.phase='replay';await quiet(s);
        for(const item of s.roundResults){
          if(!s.players.has(item.id))continue;
          s.replayId=item.id;const attacker=s.players.get(item.attacker)?.name||'ein Mitspieler';
          await update(s,`${item.name}: ${item.result.score}/100${item.effect?` · ${EFFECTS[item.effect]} von ${attacker}`:''}${item.blocked?' · Schild hat Sabotage abgewehrt':''}`);
          // Silence remains silence; sabotage cannot manufacture a scored attempt.
          const original=s.samples.get(item.id);if(original&&item.result.status!=='no_audio'){
            const replay=effect(original,item.effect);try{await s.connection.play(replay);}finally{replay.fill(0);}
          }
          check(s);await delay(500,s.abort.signal);
        }
        s.replayId=null;await unquiet(s);
        for(const data of s.samples.values())data.fill(0);s.samples.clear();s.reference.fill(0);s.reference=null;
        for(const p of s.players.values())p.modifier=null;
        s.history.push(s.roundResults.map(({id,points,result})=>({id,points,score:result.score})));s.phase='results';await update(s,'Runde abgeschlossen!');await delay(3000,s.abort.signal);
        if(round<s.rounds&&s.mode==='chaos')await wheel(s);
      }
      check(s);persist(s);end='🏆 Party abgeschlossen! Rangliste gespeichert.';
    }catch(error){end=s.stopNote||(s.abort.signal.aborted?'Party beendet.':`Party gestoppt: ${error.message}`);}
    finally{await cleanup(s,end);}
  }
  function start(s,id){
    check(s);if(s.host.id!==id)throw Error('Nur der Host kann starten.');if(s.phase!=='lobby')throw Error('Die Party wurde bereits gestartet.');
    if(!s.players.size||[...s.players.values()].some(p=>!p.ready))throw Error('Alle Mitspieler müssen zuerst Bereit drücken.');
    clearTimeout(s.expiry);s.phase='connecting';s.task=run(s);return s.task;
  }
  async function shutdown(){await Promise.all([...sessions.keys()].map(id=>stop(id,'Bot wird neu gestartet.')));scorePool.close();await quietLeases.restore();}
  return {create,status,join,ready,configure,vote,applyVotes,leave,start,stop,attack,next,sorted,hasSession:id=>sessions.has(id),shutdown,sessions};
}
module.exports={createMimicEngine,EFFECTS,CARDS};
