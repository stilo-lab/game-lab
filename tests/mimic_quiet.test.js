'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {PermissionsBitField,PermissionFlagsBits:P}=require('discord.js');const {createQuietLeases}=require('../src/mimic_quiet');
function setup(db={}){
  const cache=new Map(),operations=[];const channel={id:'456',guild:{id:'123'},permissionOverwrites:{cache,
    edit:async(id,{Speak})=>{operations.push(`edit:${id}`);const old=cache.get(id)||{allow:new PermissionsBitField(),deny:new PermissionsBitField()};old.allow.remove(P.Speak);old.deny.remove(P.Speak);if(Speak===true)old.allow.add(P.Speak);if(Speak===false)old.deny.add(P.Speak);cache.set(id,old);},
    delete:async id=>{operations.push(`delete:${id}`);cache.delete(id);}}};
  const guild={channels:{fetch:async()=>channel}},client={guilds:{cache:new Map([['123',guild]])}};
  const saveDB=()=>operations.push('save');const leases=createQuietLeases({client,db,saveDB});return {cache,channel,client,db,operations,leases,saveDB};
}
test('Replay quiet journals before editing, then restores only Speak',async()=>{
  const h=setup();h.cache.set('A',{allow:new PermissionsBitField([P.Speak,P.ViewChannel]),deny:new PermissionsBitField([P.SendMessages])});
  await h.leases.lock(h.channel,['A']);assert.equal(h.cache.get('A').deny.has(P.Speak),true);assert.ok(h.operations.indexOf('save')<h.operations.indexOf('edit:A'));
  h.cache.get('A').allow.add(P.Stream);await h.leases.restore('123','456');assert.equal(h.cache.get('A').allow.has(P.Speak),true);assert.equal(h.cache.get('A').allow.has(P.Stream),true);assert.equal(h.cache.get('A').deny.has(P.SendMessages),true);assert.deepEqual(h.db.mimic.quietLeases,{});
});
test('An originally absent overwrite is deleted unless unrelated permissions were added',async()=>{
  const h=setup();await h.leases.lock(h.channel,['A','B']);h.cache.get('B').allow.add(P.ViewChannel);await h.leases.restore();assert.equal(h.cache.has('A'),false);assert.equal(h.cache.has('B'),true);assert.equal(h.cache.get('B').deny.has(P.Speak),false);assert.equal(h.cache.get('B').allow.has(P.ViewChannel),true);
});
test('Existing Speak deny is never leased; moderator changes are respected',async()=>{
  const h=setup();h.cache.set('A',{allow:new PermissionsBitField(),deny:new PermissionsBitField([P.Speak])});await h.leases.lock(h.channel,['A','B']);assert.equal(Object.values(h.db.mimic.quietLeases).length,1);
  h.cache.get('B').deny.remove(P.Speak);h.cache.get('B').allow.add(P.Speak);await h.leases.restore();assert.equal(h.cache.get('A').deny.has(P.Speak),true);assert.equal(h.cache.get('B').allow.has(P.Speak),true);
});
test('Durable journal restores an interrupted replay after a bot restart',async()=>{
  const h=setup();await h.leases.lock(h.channel,['A']);const persisted=JSON.parse(JSON.stringify(h.db));const recovered=createQuietLeases({client:h.client,db:persisted,saveDB:h.saveDB});await recovered.restore();assert.equal(h.cache.has('A'),false);assert.deepEqual(persisted.mimic.quietLeases,{});
});
test('Failed restoration retains journal for diagnose; deleted channels clear stale journal',async()=>{
  const h=setup();await h.leases.lock(h.channel,['A']);h.channel.permissionOverwrites.delete=async()=>{throw Object.assign(Error('permission'),{code:50013});};assert.equal(await h.leases.restore(),1);
  h.client.guilds.cache.get('123').channels.fetch=async()=>{throw Object.assign(Error('gone'),{code:10003});};assert.equal(await h.leases.restore(),0);
});
test('A database write failure cannot initiate a permission change',async()=>{
  const h=setup();const leases=createQuietLeases({client:h.client,db:h.db,saveDB(){throw Error('full');}});await assert.rejects(leases.lock(h.channel,['A']),/full/);assert.equal(h.cache.has('A'),false);
});
