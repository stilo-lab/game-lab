'use strict';

const {PermissionsBitField} = require('discord.js');
const {GAMES, GAME_ROLE_NAMES} = require('./games');
const P = PermissionsBitField.Flags;
const COMMUNITY_ROLE_NAMES = {
  ...GAME_ROLE_NAMES,
  build:'Build Mode', zeroBuild:'Zero Build', casual:'Casual', competitive:'Competitive', ranked:'Ranked', chill:'Chill', roleplay:'Roleplay', creative:'Creative',
  pc:'PC', playstation:'PlayStation', xbox:'Xbox', switch:'Switch', mobile:'Mobile', eu:'EU', nae:'NA East', nac:'NA Central', naw:'NA West', oce:'OCE', asia:'Asia', middleeast:'Middle East', brazil:'Brazil',
  eventPing:'Event Pings', newsPing:'Fortnite News', shopPing:'Fortnite Item Shop', birthday:'Birthday', memberWeek:'Member of the Week', vip:'Community VIP'
};
const GAME_COLORS = [0x9b72ff,0xf25c69,0xffc857,0x57c7a3,0x64c86c,0xff6978,0x63b8ff];
const EMOJIS = {build:'🛠️',zeroBuild:'🪂',casual:'🍀',competitive:'⚔️',ranked:'🏆',chill:'🌙',roleplay:'🎭',creative:'🎨',pc:'🖥️',playstation:'🎮',xbox:'🎮',switch:'🎮',mobile:'📱',eventPing:'📅',newsPing:'📰',shopPing:'🛒',birthday:'🎂',memberWeek:'🌟',vip:'💎'};
const STYLES = new Set(['clean','brackets','fancy']);
function normalize(value) {return String(value || '').normalize('NFKC').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');}
function font(text, style) {
  const special={C:'ℂ',H:'ℍ',N:'ℕ',P:'ℙ',Q:'ℚ',R:'ℝ',Z:'ℤ'};
  return Array.from(text,c=>{
    if(style==='fancy' && special[c]) return special[c];
    const n=c.codePointAt(0);
    if(n>=65 && n<=90) return String.fromCodePoint((style==='fancy'?0x1d538:0x1d400)+n-65);
    if(n>=97 && n<=122) return String.fromCodePoint((style==='fancy'?0x1d552:0x1d41a)+n-97);
    return c;
  }).join('');
}
function roleName(label,emoji,style) {
  return (style==='brackets'?`『${emoji}』${font(label,style)}`:style==='fancy'?`${emoji} ${font(label,style)}`:`${emoji} │ ${label}`).slice(0,100);
}
function definitions(style='clean') {
  style=STYLES.has(style)?style:'clean';
  const rows=[
    {key:'support',label:'Support Team',emoji:'🎫',color:0x60c6ef,group:'Team',hoist:true},
    {key:'moderator',label:'Moderator',emoji:'🛡️',color:0x75d6a2,group:'Team',hoist:true},
    {key:'member',label:'Member',emoji:'🌿',color:0x92a3b7,group:'Community',hoist:false}
  ];
  let gameIndex=0;
  for(const [key,label] of Object.entries(COMMUNITY_ROLE_NAMES)) {
    const game=GAMES.find(g=>`game_${g.key}`===key);
    const group=game?'Games':EMOJIS[key]&&['eventPing','newsPing','shopPing'].includes(key)?'Pings':['birthday','memberWeek','vip'].includes(key)?'Community':['pc','playstation','xbox','switch','mobile'].includes(key)?'Plattform':'Spielstil / Region';
    rows.push({key,label,group,emoji:game?.emoji || EMOJIS[key] || '🌍',color:game?GAME_COLORS[gameIndex++%GAME_COLORS.length]:group==='Pings'?0xf7bc68:group==='Community'?0xc69aff:group==='Plattform'?0x79b9e8:0x70bfae,hoist:key==='vip'});
  }
  return rows.map(r=>({...r,name:roleName(r.label,r.emoji,style)}));
}
function snapshot(role) {
  return {id:role.id,name:role.name,color:role.color || 0,hoist:Boolean(role.hoist),managed:Boolean(role.managed),editable:role.editable!==false,permissions:String(role.permissions?.bitfield ?? 0),position:role.position || 0};
}
function buildRoleOperations(guild,gd,style='clean',restyle=true) {
  const used=new Set(),roles=[...(guild.roles.cache?.values() || [])];
  return definitions(style).map(def=>{
    const linked=gd.roleDesign?.roles?.[def.key] || (def.key==='support'?gd.supportRoleId:gd.community?.roles?.[def.key]);
    let role=linked && guild.roles.cache.get(linked);
    if(role && (role.id===guild.roles.everyone.id || used.has(role.id))) role=null;
    if(!role) {
      const names=new Set([def.label,def.name,...['clean','brackets','fancy'].map(s=>roleName(def.label,def.emoji,s))].map(normalize));
      const matches=roles.filter(r=>r.id!==guild.roles.everyone.id && !r.managed && !used.has(r.id) && names.has(normalize(r.name)));
      // Ambiguous matches require manual mapping rather than creating a duplicate.
      if(matches.length>1) return {...def,action:'blocked',existing:null,problem:'Mehrere passende Rollen gefunden. Vorhandene Rollen manuell zuordnen.'};
      role=matches[0];
    }
    if(role) used.add(role.id);
    const edit=role && restyle && !role.managed && role.editable!==false && (role.name!==def.name || role.color!==def.color);
    return {...def,existing:role?snapshot(role):null,action:role?(edit?'edit':'keep'):'create'};
  });
}
async function prepareRoleOperations(guild,gd,style,restyle=true) {
  await guild.roles.fetch();
  return buildRoleOperations(guild,gd,style,restyle);
}
async function applyRoleOperations(guild,gd,operations,save=()=>{},style='clean') {
  const result={created:0,edited:0,reused:0,failed:[]};
  const blocked=operations.filter(r=>r.action==='blocked');
  if(blocked.length) {result.failed=blocked.map(r=>({name:r.name,code:r.problem}));return result;}
  const needs=operations.filter(r=>['create','edit'].includes(r.action));
  if(needs.length && !guild.members.me?.permissions?.has(P.ManageRoles)) {
    result.failed.push({name:'Setup-Rollen',code:'Der Bot braucht „Rollen verwalten“. Vorhandene Rollen bleiben erhalten.'});return result;
  }
  if((guild.roles.cache?.size || 0)+operations.filter(r=>r.action==='create').length>250) {
    result.failed.push({name:'Setup-Rollen',code:'Das Rollenlimit reicht für diese Rollen nicht aus.'});return result;
  }
  gd.roleDesign ||= {roles:{}};gd.roleDesign.roles ||= {};gd.roleDesign.style=STYLES.has(style)?style:'clean';
  gd.community ||= {};gd.community.roles ||= {};
  // Discord inserts new roles at the bottom: create higher groups first.
  // Existing roles are never reordered or given different privileges.
  for(const item of operations) {
    try {
      if(item.action==='blocked') throw new Error(item.problem);
      let role=item.existing?guild.roles.cache.get(item.existing.id):null;
      if(item.existing && !role) throw new Error('Rolle wurde inzwischen entfernt; Setup erneut prüfen.');
      if(!role) {
        role=await guild.roles.create({name:item.name,color:item.color,hoist:item.hoist,mentionable:false,permissions:0n,reason:'Pixel Setup: gestaltete Community-Rolle'});
        // Persist the ID before another Discord call, so retries cannot duplicate this role.
        gd.roleDesign.roles[item.key]=role.id;
        if(item.key==='support') gd.supportRoleId=role.id;
        if(Object.hasOwn(COMMUNITY_ROLE_NAMES,item.key)) gd.community.roles[item.key]=role.id;
        save();result.created++;
      } else {
        if(item.action==='edit') {
          if(role.managed || role.editable===false) throw new Error('Rolle liegt über der Bot-Rolle oder ist von Discord verwaltet.');
          await role.edit({name:item.name,color:item.color,reason:'Pixel Setup: Rollen-Design'});result.edited++;
        } else result.reused++;
        gd.roleDesign.roles[item.key]=role.id;
        if(item.key==='support') gd.supportRoleId=role.id;
        if(Object.hasOwn(COMMUNITY_ROLE_NAMES,item.key)) gd.community.roles[item.key]=role.id;
        save();
      }
    } catch(error) {
      result.failed.push({name:item.name,code:String(error.code || error.message || 'Rollenrechte/API').slice(0,180)});
      // A persistence failure must stop this run; preserve created IDs in memory for a retry.
      if(gd.roleDesign.roles[item.key] && !item.existing) break;
    }
  }
  return result;
}
module.exports={COMMUNITY_ROLE_NAMES,definitions,buildRoleOperations,prepareRoleOperations,applyRoleOperations};
