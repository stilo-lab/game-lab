'use strict';
const {AsyncLocalStorage}=require('node:async_hooks');
let resolver=()=> 'en';
let activeContext=null;
const locale=value=>/^(?:de|deutsch|german)(?:-|$)/i.test(String(value||''))?'de':'en';
function languageFor(guildId){try{return locale(resolver(guildId));}catch{return 'en';}}
function configure(fn){if(typeof fn==='function')resolver=fn;}
function languageName(guildId){return languageFor(guildId)==='de'?'German':'English';}
function currentGuild(){return activeContext?.getStore()?.guildId||null;}
function inGuild(guildId,fn){return activeContext?activeContext.run({guildId,protectedValues:[]},fn):fn();}
function withProtectedValues(values,fn){if(!activeContext)return fn();const state=activeContext.getStore()||{};return activeContext.run({...state,protectedValues:[...(state.protectedValues||[]),...values.filter(v=>typeof v==='string')]},fn);}
function withLiteralUI(values,fn){if(!activeContext)return fn();const state=activeContext.getStore()||{};return activeContext.run({...state,literalUIValues:[...(state.literalUIValues||[]),...values.filter(v=>typeof v==='string')]},fn);}
function languageInstruction(guildId=currentGuild()){return '\nOUTPUT LANGUAGE: '+languageName(guildId)+'. Use this server language for your final answer even if the user writes another language. Preserve quoted user text, names, commands and code. An explicitly requested translation may use its requested target language.';}
function languageRequest(request,guildId=currentGuild()){
  if(/precise Discord translator/i.test(String(request?.config?.systemInstruction||'')))return request;
  const structured=request?.config?.responseMimeType==='application/json'?' Keep every JSON field name, enum value, identifier and requested user-supplied name unchanged. The language setting applies only to human-readable answer, summary and reason strings.':'';
  return {...request,config:{...request?.config,systemInstruction:String(request?.config?.systemInstruction||'')+languageInstruction(guildId)+structured}};
}
let shared;
function translate(text,language='en',options={}){shared ||= createTranslator();return shared(text,locale(language),options);}
function createTranslator(catalog=require('./locales_catalog.json')){
  const exact={en:new Map(),de:new Map()},patterns={en:[],de:[]};
  for(const row of catalog){
    if(!row||typeof row.de!=='string'||typeof row.en!=='string'||!row.de||!row.en)continue;
    for(const lang of ['en','de']){const from=lang==='en'?row.de:row.en,to=row[lang];
      const placeholders=[...from.matchAll(/\{#(\d+)\}/g)];
      if(!placeholders.length){if(!exact[lang].has(from))exact[lang].set(from,to);if(from.trim()&&to.trim()&&!exact[lang].has(from.trim()))exact[lang].set(from.trim(),to.trim());continue;}
      if(placeholders.length>16)continue;
      const pieces=from.split(/\{#\d+\}/g),order=placeholders.map(x=>Number(x[1]));
      patterns[lang].push({pieces,order,to,safeArgs:row.safeArgs||[],length:pieces.reduce((n,s)=>n+s.length,0)});
    }
  }
  for(const lang of ['en','de'])patterns[lang].sort((a,b)=>b.length-a.length);
  function apply(text,lang,{protectedValues=[],depth=0}={}){
    if(typeof text!=='string'||!text||text.length>14000||depth>3||protectedValues.includes(text))return text;
    if(exact[lang].has(text))return exact[lang].get(text);
    if(depth<2&&text.includes('\n\n')&&text.split('\n\n').at(-1).startsWith('🧩'))return text.split('\n\n').map(s=>apply(s,lang,{protectedValues,depth:depth+1})).join('\n\n');
    for(const rule of patterns[lang]){
      const p=rule.pieces;if(!text.startsWith(p[0])||!text.endsWith(p.at(-1)))continue;
      let cursor=p[0].length,valid=true;const args={};
      for(let i=0;i<rule.order.length;i++){
        const end=i===rule.order.length-1?text.length-p[i+1].length:p[i+1]?text.indexOf(p[i+1],cursor):cursor;
        if(end<cursor){valid=false;break;}args[rule.order[i]]=text.slice(cursor,end);cursor=end+p[i+1].length;
      }
      if(!valid||cursor!==text.length)continue;
      return rule.to.replace(/\{#(\d+)\}/g,(_,n)=>rule.safeArgs[n]?apply(args[n]||'',lang,{protectedValues,depth:depth+1}):args[n]||'');
    }
    if(depth<2&&text.includes('\n'))return text.split('\n').map(s=>apply(s,lang,{protectedValues,depth:depth+1})).join('\n');
    const prefix=text.match(/^([\p{Extended_Pictographic}\uFE0F\u200d⚠❌✅⏳🧩📚•\s]+)([^\s][\s\S]*)$/u);
    if(prefix&&prefix[1].length<30){const changed=apply(prefix[2],lang,{protectedValues,depth:depth+1});if(changed!==prefix[2])return prefix[1]+changed;}
    return text;
  }
  return apply;
}
function payload(value,lang,{translateFn=translate,protectedValues=[],literalUIValues=[]}={}){
  const t=s=>translateFn(s,lang,{protectedValues});
  const ui=s=>translateFn(s,lang,{protectedValues:literalUIValues});
  const cap=(s,max)=>typeof s==='string'&&s.length>max?s.slice(0,max-1)+'…':s;
  const plain=v=>v&&typeof v.toJSON==='function'?v.toJSON():v;
  function component(raw){const c=plain(raw);if(!c||typeof c!=='object')return c;const out={...c};for(const key of ['label','placeholder','description','content','title'])if(typeof out[key]==='string')out[key]=ui(out[key]);if(out.label)out.label=cap(out.label,c.type===4?45:c.type===2?80:100);if(out.placeholder)out.placeholder=cap(out.placeholder,c.type===4?100:150);if(c.components)out.components=c.components.map(component);if(c.options)out.options=c.options.map(o=>{const copy={...o};for(const key of ['label','description'])if(typeof copy[key]==='string')copy[key]=cap(t(copy[key]),100);return copy;});return out;}
  const raw=plain(value);if(!raw||typeof raw!=='object'||Buffer.isBuffer(raw))return raw;
  const out={...raw};if(typeof out.content==='string')out.content=cap(t(out.content),2000);if(typeof out.title==='string')out.title=cap(raw.custom_id?ui(out.title):t(out.title),raw.custom_id?45:256);
  if(raw.embeds)out.embeds=raw.embeds.map(e=>{const b={...plain(e)};for(const key of ['title','description'])if(typeof b[key]==='string')b[key]=cap(t(b[key]),key==='title'?256:4096);if(b.footer)b.footer={...b.footer,text:cap(t(b.footer.text),2048)};if(b.fields)b.fields=b.fields.map(f=>({...f,name:cap(t(f.name),256),value:cap(t(f.value),1024)}));return b;});
  if(raw.components)out.components=raw.components.map(component);
  if(raw.data&&typeof raw.data==='object')out.data=payload(raw.data,lang,{translateFn,protectedValues,literalUIValues});
  return out;
}
const EN_NAMES={wunsch:'request',vorschau:'preview',sprache:'language',kanal:'channel',rolle:'role',nutzer:'user',mitglied:'member',preis:'prize',dauer:'duration',gewinner:'winners',claim_zeit:'claim_time',grund:'reason',nachricht:'message',titel:'title',beschreibung:'description',funktion:'function',farbe:'color',anzahl:'count',frage:'question',antwort:'answer',zeit:'time',benutzer:'user',name:'name',geburtstag:'birthday',wochenstats:'weeklystats',teamliste:'teamlist',umfrage:'poll',zufall:'random',hilfe:'help'};
function commandPayload(commands,lang){
  function walkList(items){const used=new Set(items.map(o=>o.name));return items.map(o=>{let alias=EN_NAMES[o.name];if(alias&&alias!==o.name&&used.has(alias))alias=o.name==='sprache'?'translation_language':null;if(alias&&alias!==o.name&&used.has(alias))alias=null;if(alias)used.add(alias);
    const out={...o};if(o.description){out.description=translate(o.description,lang).slice(0,100);out.description_localizations={...o.description_localizations,'en-US':translate(o.description,'en').slice(0,100),'en-GB':translate(o.description,'en').slice(0,100),de:translate(o.description,'de').slice(0,100)};}
    if(alias)out.name_localizations={...o.name_localizations,'en-US':alias,'en-GB':alias,de:o.name};if(o.options)out.options=walkList(o.options);return out;});}
  return walkList(commands);
}
function install(client,{getLanguage=languageFor,translateFn=translate}={}){
  if(client.__pixelLocalization)return client.__pixelLocalization;
  const storage=new AsyncLocalStorage(),originalEmit=client.emit,originalRequest=client.rest.request;
  activeContext=storage;
  function findGuild(args){for(const item of args){if(item?.guildId)return item.guildId;if(item?.guild?.id)return item.guild.id;if(item?.channel?.guildId)return item.channel.guildId;}return null;}
  function inputs(args){const values=[];const visit=(rows,depth=0)=>{if(!Array.isArray(rows)||depth>3)return;for(const row of rows){if(typeof row?.value==='string')values.push(row.value);visit(row?.options,depth+1);}};for(const item of args){visit(item?.options?.data);if(item?.fields?.fields)for(const f of item.fields.fields.values())if(typeof f?.value==='string')values.push(f.value);if(typeof item?.content==='string')values.push(item.content);}return values.slice(0,40);}
  client.emit=function(event,...args){return storage.run({guildId:findGuild(args),protectedValues:inputs(args)},()=>originalEmit.call(this,event,...args));};
  client.rest.request=function(options){
    if(!options?.body||typeof options.body!=='object')return originalRequest.call(this,options);
    const path=String(options.fullRoute||options.route||''),state=storage.getStore()||{};
    const channelId=path.match(/\/channels\/(\d+)/)?.[1],routeGuild=path.match(/\/guilds\/(\d+)/)?.[1];
    const guildId=routeGuild||client.channels?.cache?.get(channelId)?.guildId||client.channels?.cache?.get(channelId)?.guild?.id||state.guildId;
    const lang=locale(getLanguage(guildId));let body;
    if(Array.isArray(options.body)&&/\/commands/.test(path))body=commandPayload(options.body,lang);
    else body=payload(options.body,lang,{translateFn,protectedValues:state.protectedValues||[],literalUIValues:state.literalUIValues||[]});
    return originalRequest.call(this,{...options,body});
  };
  const result={run:(guildId,fn)=>storage.run({guildId,protectedValues:[]},fn),uninstall(){client.emit=originalEmit;client.rest.request=originalRequest;if(activeContext===storage)activeContext=null;delete client.__pixelLocalization;}};
  Object.defineProperty(client,'__pixelLocalization',{value:result,configurable:true});return result;
}
module.exports={locale,configure,languageFor,languageName,currentGuild,inGuild,withProtectedValues,withLiteralUI,languageInstruction,languageRequest,translate,createTranslator,payload,commandPayload,install};
