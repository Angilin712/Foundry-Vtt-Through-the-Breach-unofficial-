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
