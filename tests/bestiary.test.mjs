import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {reset,actor,ID,gm,player,BreachActorModel} from './harness.mjs';
const {BreachItemModel}=await import('../through-the-breach/scripts/models.mjs');
import {derived,skillValue} from '../through-the-breach/scripts/rules.mjs';
import {weaponData} from '../through-the-breach/scripts/battle.mjs';
import {missingBestiary,importBestiary} from '../through-the-breach/scripts/bestiary.mjs';
const {turnPlan}=await import('../through-the-breach/scripts/turns.mjs');

beforeEach(reset);
test('swarm condition damage removes one rank per source, never ordinary wounds',()=>{
 const a=actor('Рой','npc',gm);a.system.rankWounds=true;a.system.rank=2;
 a.system.effects=[{kind:'burning',value:5},{kind:'poison',value:2}];
 const plan=turnPlan(a.system,'end');
 assert.equal(plan['system.rank'],0);assert.equal(plan['system.dead'],true);
 assert.equal(plan['system.wounds.value'],undefined);
});
const catalogue=JSON.parse(fs.readFileSync(new URL('../through-the-breach/data/bestiary.json',import.meta.url),'utf8'));
test('all catalogue templates validate and reproduce printed base statistics',()=>{
  assert.equal(catalogue.entries.length,383);
  assert.equal(new Set(catalogue.entries.map(e=>e.key)).size,383);
  for(const e of catalogue.entries){
    const model=new BreachActorModel(e.data.system);
    const stats=derived(model);
    for(const key of ['defense','willpower','wounds','walk','charge','initiative','armor'])assert.equal(stats[key],e.expected[key],`${e.data.name}: ${key}`);
    for(const item of e.data.items){const im=new BreachItemModel(item.system);if(im.isWeapon){const w=weaponData({system:im});assert.ok(Number.isFinite(skillValue(model,w.skill,w.aspect)+w.bonus));}}
    assert.equal(e.data.type,'npc');assert.equal(e.data.ownership.default,0);assert.equal(e.data.prototypeToken.actorLink,false);
    assert.ok(fs.existsSync(new URL(`../through-the-breach/${e.data.img.split('through-the-breach/')[1]}`,import.meta.url)),e.data.name);
    const token=fs.readFileSync(new URL(`../through-the-breach/${e.data.prototypeToken.texture.src.split('through-the-breach/')[1]}`,import.meta.url),'utf8');
    assert.match(token,/data:image\//);assert.doesNotMatch(token,/href="https?:/);
  }
});
test('catalogue special profiles keep all skills and alternative attack aspects',()=>{
  const hom=catalogue.entries.find(e=>e.data.name==='Homunculus');
  assert.ok(Object.values(hom.data.system.skills).every(k=>k.rank===1));
  const mar=catalogue.entries.find(e=>e.data.name==='Марионетка');
  const attack=mar.data.items.find(i=>i.system.isWeapon);
  assert.equal(skillValue(mar.data.system,attack.system.skill,attack.system.attackAspect)+attack.system.attackBonus,4);
  const ex=catalogue.entries.find(e=>e.data.name==='Экзорцист');
  assert.equal(ex.data.system.skills.notice.suits,'C');
  assert.equal(catalogue.entries.find(e=>e.data.name==='Ettin').data.system.armor,0);
});
test('import is GM-only and resumes without overwriting edited actors',async()=>{
  const sample=catalogue.entries.slice(0,3);
  const fetched={version:1,entries:sample};
  globalThis.fetch=async()=>({ok:true,json:async()=>fetched});
  game.folders=[];
  let serial=0,created=0;
  foundry.documents={...foundry.documents,
    Folder:{async create(data){const doc={...data,id:String(++serial),folder:data.folder?game.folders.find(f=>f.id===data.folder):null,getFlag:(s,k)=>data.flags?.[s]?.[k]};game.folders.push(doc);return doc;}},
    Actor:{async createDocuments(batch){return batch.map(data=>{created++;const a={...data,id:String(++serial),getFlag:(s,k)=>data.flags?.[s]?.[k]};game.actors.set(a.id,a);return a;});}}};
  game.user=player;await assert.rejects(()=>importBestiary(),/только мастер/);assert.equal(created,0);
  game.user=gm;assert.equal((await importBestiary()).created,3);
  const edited=game.actors.contents[0];edited.name='Моя версия';edited.system.wounds.value=-1;
  assert.equal((await importBestiary()).created,0);assert.equal(created,3);assert.equal(edited.name,'Моя версия');assert.equal(edited.system.wounds.value,-1);
  assert.equal(game.folders.filter(f=>f.name==='Бестиарий').length,1);
  assert.deepEqual(missingBestiary(sample,game.actors),[]);
});


