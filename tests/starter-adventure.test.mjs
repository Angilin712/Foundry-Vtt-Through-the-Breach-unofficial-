import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
await import('./harness.mjs');
const {importStarterAdventure,prepareStarterEncounter}=await import('../through-the-breach/scripts/starter-adventure.mjs');
const data=JSON.parse(await readFile('through-the-breach/data/starter-adventure.json','utf8'));
const ID='through-the-breach';
function setup(){
 let serial=0;
 const collection=()=>Object.assign([],{find:Array.prototype.find});
 game.user={isGM:true};for(const key of ['folders','actors','journal','scenes','macros'])game[key]=collection();
 globalThis.fetch=async()=>({ok:true,json:async()=>structuredClone(data)});
 for(const [kind,key] of Object.entries({Folder:'folders',Actor:'actors',JournalEntry:'journal',Scene:'scenes',Macro:'macros'}))foundry.documents[kind]={create:async source=>{
  const doc=structuredClone(source);doc.id=String(++serial).padStart(16,'0');doc.uuid=`${kind}.${doc.id}`;doc.getFlag=(scope,key)=>doc.flags?.[scope]?.[key];
  if(kind==='Actor')doc.prototypeToken={toObject:()=>structuredClone(source.prototypeToken)};
  if(kind==='JournalEntry')for(const p of doc.pages)p.update=async changes=>{p.text.content=changes['text.content'];};
  if(kind==='Scene'){doc.tokens??=[];doc.createEmbeddedDocuments=async(_type,tokens)=>{doc.tokens.push(...tokens.map(t=>({...t,getFlag:(s,k)=>t.flags?.[s]?.[k]})));};}
  game[key].push(doc);return doc;
 }};
}
test('Starter import resolves links, protects GM materials and preserves edits on repeat',async()=>{
 setup();assert.equal((await importStarterAdventure()).added,18);assert.equal(game.actors.length,4);assert.equal(game.scenes.length,4);assert.equal(game.journal.length,10);assert.equal(game.macros.length,3);
 for(const j of game.journal){assert.equal(j.ownership.default,0);for(const p of j.pages)assert.ok(!p.text?.content.includes('{ttb:'));}
 game.journal[0].pages[0].text.content='Моя заметка';assert.equal((await importStarterAdventure()).added,0);assert.equal(game.journal[0].pages[0].text.content,'Моя заметка');
 assert.equal(await prepareStarterEncounter(2),2);const scene=game.scenes.find(s=>s.getFlag(ID,'starter').key==='train');assert.ok(scene.tokens.every(t=>t.hidden&&!t.actorLink));
 await assert.rejects(()=>prepareStarterEncounter(2));game.user.isGM=false;await assert.rejects(()=>importStarterAdventure());await assert.rejects(()=>prepareStarterEncounter(1));
});
test('Cesar uses modified Steamer profile; source artwork and scene backgrounds exist',async()=>{
 const cesar=data.actors.find(a=>a.key==='cesar').data;assert.equal(cesar.system.rank,6);for(const i of cesar.items)assert.ok(!/Взрыватель:|Моё творение:/.test(i.system.description));
 for(const s of data.scenes)for(const level of s.data.levels)await readFile('through-the-breach/'+level.background.src.replace(`systems/${ID}/`,''));
});
