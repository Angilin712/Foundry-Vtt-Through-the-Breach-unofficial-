import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {reset,actor,gm,player,other,ID,clone} from './harness.mjs';
const {creationPlan,executeCreation,repairCreatedPursuit}=await import('../through-the-breach/scripts/creation.mjs');
import {SKILLS} from '../through-the-breach/scripts/rules.mjs';
const {stack,setupActor,createStack}=await import('../through-the-breach/scripts/cards.mjs');
const tarot=JSON.parse(await readFile('through-the-breach/data/tarot.json','utf8'));
const sources=JSON.parse(await readFile('through-the-breach/data/pack-sources.json','utf8'));
const catalog=Object.entries(sources).filter(([k])=>k!=='macros').flatMap(([pack,docs])=>docs.map(d=>({...clone(d),uuid:`Compendium.${ID}.${pack}.Item.${d._id}`,toObject:()=>clone(d)})));
const meta=i=>i.flags[ID].catalog;
const one=fn=>catalog.find(fn);
const draft={cards:[{value:1,suit:'rams'},{value:11,suit:'masks'},{value:14,suit:''},{value:1,suit:'crows'},{value:0,suit:''}]};
const form=()=>({body:[0,0,0,0],mind:[-3,0,0,3],root:['pistol','evade','notice'],endeavor:['barter','doctor','stealth','literacy','athletics','toughness'],mods:['aspect.might','melee'],stationSkill:'',twist:['rams','tomes','crows','masks'],pursuit:one(i=>meta(i).key==='pursuit-0').uuid,talent:one(i=>meta(i).kind==='general').uuid,requirementsConfirmed:true,starter:[one(i=>meta(i).kind==='toolkit').uuid],bought:[one(i=>i.name==='Охотничий нож').uuid]});
function prepareActor(){const a=actor();a.flags={};a.getFlag=(s,k)=>a.flags[s]?.[k];a.setFlag=async(s,k,v)=>{a.flags[s]??={};a.flags[s][k]=clone(v);return a;};a.createEmbeddedDocuments=async(_kind,docs)=>docs.map((d,i)=>{const item={...clone(d),id:`created${String(i).padStart(9,'0')}`};a.items.set(item.id,item);return item;});return a;}
function packs(){game.packs=new Map(Object.entries(sources).filter(([k])=>k!=='macros').map(([name])=>[`${ID}.${name}`,{getDocuments:async()=>catalog.filter(i=>i.uuid.startsWith(`Compendium.${ID}.${name}.`)),getDocument:async id=>catalog.find(i=>i._id===id)}]));}
async function stage(a){const spread=await createStack('creationSpread','Таро','pile',a.id,draft.cards);await a.setFlag(ID,'creation',{...draft,cards:spread.cards.map(c=>({cardId:c.id,value:c.value,suit:c.suit}))});}
test('All 54 Tarot entries preserve five tables; Mind Ace Crows uses Yan correction',()=>{assert.equal(Object.keys(tarot).length,54);assert.deepEqual(tarot['1-crows'].mind,[-3,0,0,3]);for(const row of Object.values(tarot)){assert.equal(row.body.length,4);assert.equal(row.mind.length,4);assert.ok(row.station.skill in SKILLS);for(const kind of ['body','mind','root','station','endeavor'])assert.ok(row.fate[kind]);}assert.notDeepEqual(tarot['9-masks'].body,tarot['9-masks'].mind);});
test('Creation distributes separate skills, station, mods, wounds, 10 scrip and step zero',()=>{const p=creationPlan(draft,form(),tarot,catalog);assert.equal(p.update['system.aspects'].might,1);assert.equal(p.update['system.skills.melee.rank'],2);assert.equal(p.update['system.skills.shotgun.rank'],1);assert.equal(p.update['system.scrip'],8);assert.equal(p.documents.length,5);assert.equal(p.update['system.wounds.value'],6);assert.match(p.update['system.fate'],/\S/);});
test('Creation rejects changed aspect multiset, duplicate skills, trained modification and overspending',()=>{for(const change of [f=>f.body=[1,0,0,0],f=>f.endeavor[0]='pistol',f=>f.mods=['pistol'],f=>f.bought=Array(6).fill(f.bought[0]),f=>f.requirementsConfirmed=false,f=>f.twist=['rams','rams','masks','tomes']]){const f=form();change(f);assert.throws(()=>creationPlan(draft,f,tarot,catalog));}});
test('Already trained station requires an untrained alternative',()=>{const f=form();f.root[0]='shotgun';assert.throws(()=>creationPlan(draft,f,tarot,catalog));f.stationSkill='pistol';assert.equal(creationPlan(draft,f,tarot,catalog).update['system.skills.pistol.rank'],1);});
test('Ganfighter budget is separate and grants ammo once to each new starting gun',()=>{const f=form();f.pursuit=one(i=>meta(i).key==='pursuit-6').uuid;f.starter=[one(i=>i.name==='ВМФ Колиера').uuid,one(i=>i.name==='БиД Карманный').uuid];const p=creationPlan(draft,f,tarot,catalog);assert.equal(p.update['system.scrip'],8);const gun=p.documents.find(i=>i.name==='ВМФ Колиера');assert.equal(gun.system.loaded,6);assert.equal(gun.system.reserve,24);f.starter.push(f.starter[0]);assert.throws(()=>creationPlan(draft,f,tarot,catalog));});
test('Native creation Tarot is separate, persists same five cards and rejects foreign actors',async()=>{reset();const a=prepareActor();await executeCreation(player,{op:'creationStart',actorUuid:a.uuid});const first=clone(a.getFlag(ID,'creation'));await executeCreation(player,{op:'creationStart',actorUuid:a.uuid});assert.deepEqual(first,a.getFlag(ID,'creation'));assert.equal(stack('creationSpread',a.id).cards.size,5);assert.equal(new Set(first.cards.map(c=>`${c.value}-${c.suit}`)).size,5);assert.equal(stack('fate'),undefined);await assert.rejects(executeCreation(other,{op:'creationStart',actorUuid:a.uuid}));});
test('Catalog validates source, money and ownership before charging or adding',async()=>{reset();packs();const a=prepareActor(),uuid=one(i=>i.name==='Охотничий нож').uuid;await executeCreation(player,{op:'catalogBuy',actorUuid:a.uuid,uuid,quantity:2});assert.equal(a.system.scrip,6);assert.equal(a.items.size,1);assert.equal([...a.items][0].system.quantity,2);await assert.rejects(executeCreation(other,{op:'catalogBuy',actorUuid:a.uuid,uuid}));await assert.rejects(executeCreation(player,{op:'catalogImport',actorUuid:a.uuid,uuid}));await assert.rejects(executeCreation(player,{op:'catalogBuy',actorUuid:a.uuid,uuid,quantity:99}));await assert.rejects(executeCreation(player,{op:'catalogBuy',actorUuid:a.uuid,uuid:'Compendium.other.pack.Item.1234567890123456'}));assert.equal(a.system.scrip,6);});
test('Prologue ledger prevents repeat and player invocation; partial draw blocks retry',async()=>{reset();const a=prepareActor();await setupActor(a);const p={op:'sessionStart',session:'Сессия 1',actorIds:[a.id]};await assert.rejects(executeCreation(player,p));await executeCreation(gm,p);await executeCreation(gm,p);assert.equal(stack('hand',a.id).cards.size,3);const ledger=game.settings.get(ID,'sessions');ledger['Сессия 2']={actors:{[a.id]:'pending'}};await game.settings.set(ID,'sessions',ledger);await assert.rejects(executeCreation(gm,{...p,session:'Сессия 2'}));assert.equal(stack('hand',a.id).cards.size,3);});
test('Creation commit rejects forged Tarot, is GM only and cannot replay after completion',async()=>{reset();packs();globalThis.fetch=async()=>({ok:true,json:async()=>tarot});const a=prepareActor();await stage(a);await assert.rejects(executeCreation(player,{op:'creationApply',actorUuid:a.uuid,form:form()}));const saved=clone(a.getFlag(ID,'creation'));const forged=clone(saved);forged.cards[0].value=2;await a.setFlag(ID,'creation',forged);await assert.rejects(executeCreation(gm,{op:'creationApply',actorUuid:a.uuid,form:form()}));assert.equal(a.items.size,0);assert.equal(a.system.scrip,10);await a.setFlag(ID,'creation',saved);await executeCreation(gm,{op:'creationApply',actorUuid:a.uuid,form:form()});assert.equal(a.system.scrip,8);assert.equal(a.getFlag(ID,'creation').complete,true);assert.equal(stack('twist',a.id).cards.size,13);await assert.rejects(executeCreation(gm,{op:'creationApply',actorUuid:a.uuid,form:form()}));assert.equal(a.items.size,5);});
test('Creation links current pursuit even when Foundry returns embedded items in another order',async()=>{
 reset();packs();globalThis.fetch=async()=>({ok:true,json:async()=>tarot});const a=prepareActor();
 const create=a.createEmbeddedDocuments;a.createEmbeddedDocuments=async(...args)=>(await create(...args)).reverse();
 await stage(a);await executeCreation(gm,{op:'creationApply',actorUuid:a.uuid,form:form()});
 const pursuit=a.items.get(a.system.currentPursuitId);assert.equal(pursuit.system.category,'pursuit');
 assert.deepEqual(a.system.pursuitProgress,[{id:pursuit.id,step:0}]);
 const {executeAutomation}=await import('../through-the-breach/scripts/automation.mjs');
 await executeAutomation(gm,{op:'epilogue',actorUuid:a.uuid,session:'Reordered items',eligible:['notice','doctor'],pursuitId:pursuit.id});
 assert.equal(a.system.xp,1);assert.equal(a.system.pursuitProgress[0].step,1);
});
test('Repair of an already created sheet restores only the mistaken step zero pursuit link',async()=>{
 reset();packs();globalThis.fetch=async()=>({ok:true,json:async()=>tarot});const a=prepareActor();await stage(a);
 await executeCreation(gm,{op:'creationApply',actorUuid:a.uuid,form:form()});const correct=a.system.currentPursuitId;
 const wrong=[...a.items].find(i=>meta(i).kind==='step0').id;
 await a.update({'system.currentPursuitId':wrong,'system.pursuitProgress':[{id:wrong,step:0}]});
 await repairCreatedPursuit(a);assert.equal(a.system.currentPursuitId,correct);assert.deepEqual(a.system.pursuitProgress,[{id:correct,step:0}]);
 await a.update({'system.currentPursuitId':wrong,'system.pursuitProgress':[{id:wrong,step:2}]});await repairCreatedPursuit(a);assert.equal(a.system.currentPursuitId,wrong);
});
test('Dabbler starter grants linked grimoire, one Sorcery, another school and three distinct Immuto',async()=>{
 reset();packs();globalThis.fetch=async()=>({ok:true,json:async()=>tarot});const a=prepareActor();
 a.updateEmbeddedDocuments=async(_kind,docs)=>{for(const d of docs){const item=a.items.get(d._id);for(const [k,v] of Object.entries(d))if(k!=='_id')foundry.utils.setProperty(item,k,v);}};
 const f=form();f.pursuit=one(i=>meta(i).key==='pursuit-2').uuid;f.starter=[];f.magia=[one(i=>meta(i).kind==='magia'&&i.system.skill==='sorcery').uuid,one(i=>meta(i).kind==='magia'&&i.system.skill==='enchanting').uuid];f.immuto=catalog.filter(i=>meta(i).kind==='immuto').slice(0,3).map(i=>i.uuid);
 const bad=clone(f);bad.magia[1]=bad.magia[0];assert.throws(()=>creationPlan(draft,bad,tarot,catalog));
 await stage(a);await executeCreation(gm,{op:'creationApply',actorUuid:a.uuid,form:f});
 const g=[...a.items].find(i=>i.system.magicKind==='grimoire');assert.ok(g);assert.equal(g.system.attuned,false);assert.equal([...a.items].filter(i=>i.system.grimoireId===g.id).length,5);assert.equal(a.system.scrip,8);
});
