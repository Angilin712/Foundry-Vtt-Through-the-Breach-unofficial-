import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const root=process.env.FOUNDRY_APP??'C:/Program Files/Foundry Virtual Tabletop/resources/app';
await import(pathToFileURL(`${root}/common/server.mjs`).href);
globalThis.getDocumentClass=name=>foundry.documents[`Base${name}`];
globalThis.CONFIG=Object.fromEntries(['Actor','Item','Cards','Card','ChatMessage','User','Folder'].map(k=>[k,{dataModels:{}}]));
globalThis.game={system:{id:'through-the-breach',documentTypes:{Actor:['fated','npc'],Item:['equipment','talent','magic']}},model:{Actor:{fated:{},npc:{}},Item:{equipment:{},talent:{},magic:{}}},i18n:{localize:k=>k,format:k=>k},release:{generation:14,build:365}};
const {BreachActorModel,BreachItemModel}=await import('../through-the-breach/scripts/models.mjs');
CONFIG.Actor.dataModels={fated:BreachActorModel,npc:BreachActorModel};
CONFIG.Item.dataModels={equipment:BreachItemModel,talent:BreachItemModel,magic:BreachItemModel};
test('Manifest validates against installed Foundry v14 BaseSystem schema',async()=>{const data=JSON.parse(await readFile('through-the-breach/system.json','utf8'));const m=new foundry.packages.BaseSystem(data);assert.equal(m.id,'through-the-breach');assert.equal(m.invalid,false);});

test('Manifest permits world creation on the tested build and later v14 builds',async()=>{
  const data=JSON.parse(await readFile('through-the-breach/system.json','utf8'));
  for(const build of [365,368]){
    const availability=foundry.packages.BaseSystem.testAvailability(data,{release:{version:`14.${build}`,generation:14,maxStableGeneration:14,maxGeneration:14}});
    assert.ok([CONST.PACKAGE_AVAILABILITY_CODES.VERIFIED,CONST.PACKAGE_AVAILABILITY_CODES.UNVERIFIED_BUILD].includes(availability));
  }
  assert.equal(data.compatibility.minimum,'14');assert.equal(data.compatibility.maximum,undefined);
});
test('Actual Foundry TypeDataModel: actor defaults, derived fields and serialized save',()=>{const m=new BreachActorModel({aspects:{resilience:3},skills:{toughness:{rank:2}}});m.prepareDerivedData();assert.equal(m.wounds.max,8);assert.equal(m.skills.literacy.aspect,'intellect');assert.equal(Object.keys(m.skills).length,56);const copy=new BreachActorModel(m.toObject());copy.prepareDerivedData();assert.equal(copy.wounds.max,8);assert.equal(new BreachActorModel({skills:{literacy:{rank:6}}}).skills.literacy.rank,5);});
test('Actual item model remains plain text and preserves Cyrillic',()=>{const m=new BreachItemModel({description:'Талант: карта в рукаве',quantity:2});assert.equal(m.toObject().description,'Талант: карта в рукаве');});
test('Actual weapon and unconscious state survive native model serialization',()=>{const w=new BreachItemModel({isWeapon:true,skill:'pistol',damage:'2/3/5',range:'10 ярдов',ignoreArmor:true,defense:'willpower'});const copy=new BreachItemModel(w.toObject());assert.equal(copy.damage,'2/3/5');assert.equal(copy.skill,'pistol');assert.equal(copy.ignoreArmor,true);assert.equal(copy.defense,'willpower');const a=new BreachActorModel({unconscious:true,armor:3,wounds:{value:-2},conditions:'Глубокая рана'});const saved=new BreachActorModel(a.toObject());assert.equal(saved.unconscious,true);assert.equal(saved.wounds.value,-2);assert.equal(saved.conditions,'Глубокая рана');});

test('Structured sheet automation fields preserve references, progress and triggers through native serialization',()=>{
  const s=new BreachActorModel({temporaryAspects:{grace:-2},currentPursuitId:'p',activeGrimoire:'g',epilogues:[{id:'s1',eligible:['pistol'],chosen:'',closed:true}],pursuitProgress:[{id:'p',step:3}],learnedTriggers:[{id:'t',name:'Русский триггер',skill:'pistol',suits:'RR'}],effects:[{id:'e',kind:'poison',value:3,endPhase:'end'}]});
  const copy=new BreachActorModel(s.toObject());assert.equal(copy.temporaryAspects.grace,-2);assert.equal(copy.epilogues[0].closed,true);assert.equal(copy.pursuitProgress[0].step,3);assert.equal(copy.learnedTriggers[0].suits,'RR');assert.equal(copy.effects[0].value,3);
  const item=new BreachItemModel({capacity:6,loaded:4,reserve:12,reloadCost:3,reloadProgress:2,magicKind:'immuto',grimoireId:'g',tnAdjustment:3,maxCopies:2,bonusTarget:'skill.pistol',bonus:1});const i=new BreachItemModel(item.toObject());assert.equal(i.reloadProgress,2);assert.equal(i.grimoireId,'g');assert.equal(i.maxCopies,2);assert.equal(i.bonusTarget,'skill.pistol');
});
