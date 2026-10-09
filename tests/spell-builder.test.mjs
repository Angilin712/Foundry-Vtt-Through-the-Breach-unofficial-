import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {actor,reset,gm,player,other,ID,setTop} from './harness.mjs';
const {BreachItemModel}=await import('../through-the-breach/scripts/models.mjs');
import {compileSpell,immutoRule} from '../through-the-breach/scripts/spell-builder.mjs';
const {spellPlan}=await import('../through-the-breach/scripts/automation.mjs');
const {execute,stack}=await import('../through-the-breach/scripts/cards.mjs');
const catalog=JSON.parse(readFileSync(new URL('../through-the-breach/data/pack-sources.json',import.meta.url))).magic;
beforeEach(reset);
function add(a,name,changes={}){const source=structuredClone(catalog.find(i=>i.name===name));assert.ok(source,name);const i={id:name,...source,system:new BreachItemModel({...source.system,...changes}).toObject(),getFlag:(scope,key)=>source.flags?.[scope]?.[key],async update(data){for(const [key,val]of Object.entries(data))foundry.utils.setProperty(this,key,val);}};a.items.set(i.id,i);return i;}
const recipe=(base,...rows)=>({baseId:base.id,immutos:rows});
const row=(i,count=1,extra={})=>({itemId:i.id,count,...extra});
test('Additional suit, swapped resistance and repeatable capped elements compile without mutating the base',()=>{
  const a=actor(),b=add(a,'Элементальный снаряд'),s=add(a,'Дополнительная Масть'),alt=add(a,'Альтернативная сопротивляемость'),fire=add(a,'Огонь');
  const before=structuredClone(b.system),p=compileSpell(a,recipe(b,row(s,1,{suit:'crows'}),row(alt),row(fire,3)));
  assert.equal(p.tn,b.system.tn-3+2+9);assert.equal(p.required,b.system.required+'C');assert.equal(p.resistance,b.system.resistance==='defense'?'willpower':'defense');assert.deepEqual(b.system,before);
  assert.throws(()=>compileSpell(a,recipe(b,row(fire,4))));assert.throws(()=>compileSpell(a,recipe(b,row(s))));assert.throws(()=>compileSpell(a,recipe(b,row(fire),row(fire))));
});
test('Copied catalogue documents cannot bypass Immuto limits or combine the same Magia with itself',()=>{
  const a=actor(),b=add(a,'Допрос'),s=add(a,'Дополнительная Масть'),c=add(a,'Комбинированное заклинание');
  const copy={...s,id:'s-copy'};a.items.set(copy.id,copy);
  assert.throws(()=>compileSpell(a,recipe(b,row(s,1,{suit:'rams'}),row(copy,1,{suit:'tomes'}))));
  const baseCopy={...b,id:'b-copy'};a.items.set(baseCopy.id,baseCopy);assert.throws(()=>compileSpell(a,recipe(b,row(c,1,{magiaId:baseCopy.id}))));
});
test('Range follows the table in both directions and preserves untagged range; delay modes have flat costs',()=>{
  const a=actor(),b=add(a,'Элементальный снаряд'),r=add(a,'Изменение Дальности'),d=add(a,'Задержка'),water=add(a,'Вода');
  let p=compileSpell(a,recipe(b,row(water),row(r,1,{choice:'down'})));assert.equal(p.range,'y3 ярда');assert.equal(p.tn,b.system.tn-2+1);
  p=compileSpell(a,recipe(b,row(water),row(r,2,{choice:'up'}),row(d,1,{choice:'rounds',rounds:10})));assert.equal(p.range,'z15 ярдов');assert.equal(p.tn,b.system.tn+6+1);
  b.system.range='4 ярда';p=compileSpell(a,recipe(b,row(water),row(r,1,{choice:'up'}),row(d,1,{choice:'condition',text:'Слово «ворон»'})));assert.equal(p.range,'5 ярдов');assert.equal(p.tn,b.system.tn+7+1);
  assert.throws(()=>compileSpell(a,recipe(b,row(water),row(d,1,{choice:'rounds',rounds:11}))));b.system.range='-';assert.throws(()=>compileSpell(a,recipe(b,row(water),row(r,1,{choice:'up'}))));
});
test('AP reduction floors at zero; increase may exceed two but actual turn resources gate casting',async()=>{
  const a=actor(),b=add(a,'Элементальный снаряд'),less=add(a,'Уменьшить ОД'),more=add(a,'Увеличить ОД'),water=add(a,'Вода');
  assert.equal(compileSpell(a,recipe(b,row(water),row(less,3))).ap,0);
  b.system.tn=20;const p=compileSpell(a,recipe(b,row(water),row(more,2)));assert.equal(p.ap,b.system.apCost+2);
  const prepared={id:'prepared',type:'magic',system:new BreachItemModel({magicKind:'spell',spellBaseId:b.id,spellImmutos:[row(water),row(more,2)]}).toObject()};a.items.set(prepared.id,prepared);
  await execute(gm,{op:'setup',actorUuid:a.uuid});game.combat={started:true,combatant:{actor:a},getFlag:()=>null};const before=stack('fate').availableCards.length;
  await assert.rejects(()=>execute(player,{op:'castSpell',actorUuid:a.uuid,itemId:prepared.id,targetUuid:actor('NPC','npc',gm).uuid,confirmed:true}));assert.equal(a.system.ap.value,2);assert.equal(stack('fate').availableCards.length,before);
});
test('Focus object is fixed per learned Immuto and its two categories sum once',()=>{
  const a=actor(),b=add(a,'Допрос'),f=add(a,'Объект фокуса'),r=row(f,1,{text:'Посох',portability:2,rarity:1});
  const p=compileSpell(a,recipe(b,r));assert.equal(p.tn,b.system.tn-3);assert.equal(p.focusUpdates.length,1);
  Object.assign(f.system,{focusObject:'Посох',focusPortability:2,focusRarity:1});assert.equal(compileSpell(a,recipe(b,r)).focusUpdates.length,0);
  assert.throws(()=>compileSpell(a,recipe(b,{...r,text:'Другое'})));assert.throws(()=>compileSpell(a,recipe(b,{...r,rarity:3})));
});
test('Combined spell validates different bases, same resistance and second base TN, plus pulse prerequisites',()=>{
  const a=actor(),b=add(a,'Допрос'),c=add(a,'Комбинированное заклинание'),second=add(a,'Контроль над разумом'),amp=add(a,'Усилить Импульс'),pulse=add(a,'Импульс');
  const p=compileSpell(a,recipe(b,row(c,1,{magiaId:second.id})));assert.equal(p.tn,b.system.tn+5);assert.match(p.description,/Вторая Магия/);
  assert.throws(()=>compileSpell(a,recipe(b,row(c,1,{magiaId:b.id}))));second.system.tn=99;assert.throws(()=>compileSpell(a,recipe(b,row(c,1,{magiaId:second.id}))));
  assert.throws(()=>compileSpell(a,recipe(b,row(amp))));assert.doesNotThrow(()=>compileSpell(a,recipe(b,row(amp),row(pulse))));
});
test('Recipes survive actual v14 model serialization and revalidate components instead of trusting saved TN',()=>{
  const a=actor(),b=add(a,'Допрос'),alt=add(a,'Альтернативная сопротивляемость');const m=new BreachItemModel({magicKind:'spell',spellBaseId:b.id,spellImmutos:[row(alt)],tn:1});
  const saved=new BreachItemModel(m.toObject()).toObject(),prepared={type:'magic',system:saved};assert.equal(spellPlan(a,prepared).tn,b.system.tn+2);
  b.system.tn=12;assert.equal(spellPlan(a,prepared).tn,14);a.items.delete(alt.id);assert.throws(()=>spellPlan(a,prepared));
});
test('Inactive grimoire and foreign owner cannot build; owner saves a native item with computed fields',async()=>{
  const a=actor(),b=add(a,'Допрос');let created;
  a.createEmbeddedDocuments=async(type,data)=>{created={type,data};return data;};
  await assert.rejects(()=>execute(other,{op:'buildSpell',actorUuid:a.uuid,name:'Вопрос',recipe:recipe(b)}));assert.equal(created,undefined);
  b.system.grimoireId='missing';assert.throws(()=>compileSpell(a,recipe(b)));b.system.grimoireId='';
  await execute(player,{op:'buildSpell',actorUuid:a.uuid,name:'Вопрос',recipe:recipe(b)});assert.equal(created.type,'Item');assert.equal(created.data[0].system.tn,b.system.tn);assert.equal(created.data[0].system.spellBaseId,b.id);assert.equal(a.system.operationPending,'');
});
test('Prepared spell casts with recalculated suits/resistance, spends AP once and applies Focus and blindness',async()=>{
  const a=actor(),b=add(a,'Допрос'),s=add(a,'Дополнительная Масть'),alt=add(a,'Альтернативная сопротивляемость'),target=actor('NPC','npc',gm);
  const prepared={id:'test-spell',name:'Вопрос',type:'magic',system:new BreachItemModel({magicKind:'spell',spellBaseId:b.id,spellImmutos:[row(s,1,{suit:'rams'}),row(alt)],tn:1,resistance:''}).toObject()};a.items.set(prepared.id,prepared);
  await execute(gm,{op:'setup',actorUuid:a.uuid});setTop(stack('fate'),[11]);game.combat={started:true,combatant:{actor:a},getFlag:()=>null};a.system.effects=[{kind:'focus',value:1},{kind:'blind',value:1}];
  const p=compileSpell(a,recipe(b,...prepared.system.spellImmutos)),m=await execute(player,{op:'castSpell',actorUuid:a.uuid,itemId:prepared.id,targetUuid:target.uuid,confirmed:true,sight:true,useFocus:true});
  const d=m.getFlag(ID,'duel');assert.equal(d.tn,Math.max(p.tn,target.system.computed.defense+target.system.rank));assert.equal(d.mod,-1);assert.equal(d.required.length,parseInt(b.system.required.length)+1);assert.equal(a.system.effects.some(x=>x.kind==='focus'),false);assert.equal(a.system.ap.value,2-p.ap);
  assert.throws(()=>spellPlan(a,prepared,[alt]));
});
