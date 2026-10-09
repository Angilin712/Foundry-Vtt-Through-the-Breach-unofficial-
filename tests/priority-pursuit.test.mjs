import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reset,actor,gm,player,other,ID,setTop,clone} from './harness.mjs';
const {BreachItemModel}=await import('../through-the-breach/scripts/models.mjs');
const {rewardChoices,normalizeTalent,duelFailed,qualifiesForBonus,snapshotPursuit}=await import('../through-the-breach/scripts/pursuits.mjs');
const {compileSpell}=await import('../through-the-breach/scripts/spell-builder.mjs');
const {execute,stack}=await import('../through-the-breach/scripts/cards.mjs');
const sources=JSON.parse(readFileSync(new URL('../through-the-breach/data/pack-sources.json',import.meta.url)));
const tables=JSON.parse(readFileSync(new URL('../through-the-breach/data/pursuit-progression.json',import.meta.url)));
const meta=i=>i.flags?.[ID]?.catalog??{};
const catalog=Object.entries(sources).filter(([k])=>k!=='macros').flatMap(([pack,docs])=>docs.map(d=>({...clone(d),uuid:`Compendium.${ID}.${pack}.Item.${d._id}`,toObject:()=>clone(d)})));
const named=(name,pursuit)=>catalog.find(i=>normalizeTalent(i.name)===normalizeTalent(name)&&(!pursuit||meta(i).pursuit===pursuit));
beforeEach(()=>{reset();globalThis.fetch=async()=>({ok:true,json:async()=>tables});game.packs=new Map(Object.keys(sources).map(name=>[`${ID}.${name}`,{getDocuments:async()=>catalog.filter(i=>i.uuid.startsWith(`Compendium.${ID}.${name}.`))}]));});
function add(a,data){
  const item={...clone(data.toObject?data.toObject():data),id:`test${String(a.items.size).padStart(12,'0')}`};
  item.system=new BreachItemModel(item.system).toObject();item.uuid=`${a.uuid}.Item.${item.id}`;
  item.getFlag=(s,k)=>item.flags?.[s]?.[k];a.items.set(item.id,item);return item;
}
function prepare(key='pursuit-2'){
  const a=actor();a.createEmbeddedDocuments=async(_type,docs)=>docs.map(data=>add(a,data));
  const p=add(a,catalog.find(i=>meta(i).key===key));a.system.currentPursuitId=p.id;
  a.system.pursuitProgress=[{id:p.id,step:0}];return a;
}
const run=(a,op,p={},user=player)=>execute(user,{op,actorUuid:a.uuid,...p});
const ep=(a,step,id='Сессия')=>{a.system.epilogues=[{id,pursuitId:a.system.currentPursuitId,rewardStep:step,rewardChosen:'',eligible:['notice','engineering'],chosen:'',closed:false}];return a.system.epilogues[0];};
const check=(extra={})=>({kind:'duel',closed:true,stage:'closed',base:0,baseSuits:[],tn:10,required:[],cards:[{value:5,suit:'masks'}],selected:0,replacement:null,redSuit:'',mod:0,skill:'sorcery',dramatic:true,...extra});

test('All fourteen 0–10 tables resolve every named talent and each general choice to a real pack document',async()=>{
  assert.equal(tables.pursuits.length,14);
  for(const rule of tables.pursuits){
    assert.deepEqual(rule.progression.map(x=>x.step),Array.from({length:11},(_,i)=>i));
    for(const row of rule.progression){
      if(row.general){assert.ok(catalog.some(i=>meta(i).kind==='general'));continue;}
      for(const name of row.options)assert.ok(named(name,rule.key),`${rule.name} ${row.step}: ${name}`);
    }
    const a=prepare(rule.key);
    for(let step=1;step<=10;step++)assert.ok((await rewardChoices(a,ep(a,step))).length,`${rule.name} ${step}`);
  }
});

test('Reward issue enforces owner, legal step, confirmation and single receipt without extra XP or pursuit steps',async()=>{
  const a=prepare(),e=ep(a,1),good=named('Контрмагия','pursuit-2'),wrong=named('Чародейство','pursuit-2');
  const before=a.items.size;
  await assert.rejects(()=>run(a,'choosePursuitTalent',{epilogueId:e.id,talentUuid:good.uuid,confirmed:true},other));
  await assert.rejects(()=>run(a,'choosePursuitTalent',{epilogueId:e.id,talentUuid:wrong.uuid,confirmed:true}));
  await assert.rejects(()=>run(a,'choosePursuitTalent',{epilogueId:e.id,talentUuid:good.uuid}));
  assert.equal(a.items.size,before);
  await run(a,'choosePursuitTalent',{epilogueId:e.id,talentUuid:good.uuid,confirmed:true});
  assert.equal(a.items.size,before+1);assert.equal(a.system.xp,0);assert.equal(a.system.pursuitProgress[0].step,0);
  assert.equal(a.system.epilogues[0].rewardChosen,'Контрмагия');
  await assert.rejects(()=>run(a,'choosePursuitTalent',{epilogueId:e.id,talentUuid:good.uuid,confirmed:true}));
  assert.equal(a.items.size,before+1);
});

test('Epilogue stores the new step reward once, owner chooses it, and previous unclaimed rewards remain selectable',async()=>{
  const a=prepare();
  await run(a,'epilogue',{session:'Первая',eligible:['notice','engineering'],pursuitId:a.system.currentPursuitId},gm);
  assert.equal(a.system.xp,1);assert.equal(a.system.pursuitProgress[0].step,1);assert.equal(a.system.epilogues[0].rewardStep,1);
  await assert.rejects(()=>run(a,'epilogue',{session:'Первая',eligible:['notice','engineering'],pursuitId:a.system.currentPursuitId},gm));
  await run(a,'epilogue',{session:'Вторая',eligible:['notice','engineering'],pursuitId:a.system.currentPursuitId},gm);
  assert.equal(a.system.epilogues[0].closed,true);
  await run(a,'choosePursuitTalent',{epilogueId:'Первая',talentUuid:named('Контрмагия','pursuit-2').uuid,confirmed:true});
  assert.equal(a.system.epilogues[0].rewardChosen,'Контрмагия');assert.equal(a.system.xp,2);
});

test('Mastered Immuto and Magia issue explicit components independent of an unattuned or missing Grimoire',async()=>{
  const a=prepare();let e=ep(a,1),fire=named('Огонь');
  await run(a,'choosePursuitTalent',{epilogueId:e.id,talentUuid:named('Освоенный иммуто','pursuit-2').uuid,componentUuid:fire.uuid,confirmed:true});
  const learnedFire=a.items.find(i=>i.getFlag(ID,'masteredComponent')===meta(fire).key);
  assert.equal(learnedFire.system.grimoireId,'');assert.equal(learnedFire.system.equipped,true);
  e=ep(a,3,'Третья');const magia=named('Элементальный удар');
  await run(a,'choosePursuitTalent',{epilogueId:e.id,talentUuid:named('Освоенная магия','pursuit-2').uuid,componentUuid:magia.uuid,confirmed:true});
  const learnedMagia=a.items.find(i=>i.getFlag(ID,'masteredComponent')===meta(magia).key);
  assert.equal(learnedMagia.system.grimoireId,'');a.system.activeGrimoire='missing';
  const compiled=compileSpell(a,{baseId:learnedMagia.id,immutos:[{itemId:learnedFire.id,count:1}]});
  assert.deepEqual(compiled.damageTrack,[1,2,3]);assert.ok(compiled.effects.some(x=>x.kind==='burning'));
  e=ep(a,5,'Пятая');const count=a.items.size;
  await assert.rejects(()=>run(a,'choosePursuitTalent',{epilogueId:e.id,talentUuid:named('Освоенный иммуто','pursuit-2').uuid,componentUuid:fire.uuid,confirmed:true}));
  assert.equal(a.items.size,count);
});

test('Failures use final opposed results: aggressor wins a tie, both sides must be closed, unsuccessful magic cannot beat the defender',()=>{
  const offense=check({opposed:{role:'attack'},tn:0}),defense=check({opposed:{role:'defense'},tn:0});
  assert.equal(duelFailed(offense,defense),false);assert.equal(duelFailed(defense,offense),true);
  assert.equal(duelFailed(offense,{...defense,closed:false}),false);
  offense.spellTN=10;offense.required=['tomes'];
  assert.equal(duelFailed(offense,defense),true);assert.equal(duelFailed(defense,offense),false);
  offense.tn=10;offense.required=[];
  assert.equal(duelFailed(offense,defense),true);assert.equal(duelFailed(defense,offense),false);
  assert.equal(duelFailed(check({kind:'damage'})),false);assert.equal(duelFailed(check({stage:'cancelled'})),false);
});

test('A lawful zero casting TN still requires its suit and cannot suppress the caster failure or create a defender failure',()=>{
  const offense=check({opposed:{role:'attack'},tn:0,spellTN:0,required:['tomes'],cards:[{value:12,suit:'masks'}]});
  const defense=check({opposed:{role:'defense'},tn:0});
  assert.equal(duelFailed(offense,defense),true);
  assert.equal(duelFailed(defense,offense),false);
});

test('Groups and Dramatic restrictions follow each Pursuit, including specialized TinSmith Pneumatics',()=>{
  const rule=key=>tables.pursuits.find(x=>x.key===key);
  assert.equal(qualifiesForBonus(rule('pursuit-2'),check({dramatic:false})),false);
  assert.equal(qualifiesForBonus(rule('pursuit-2'),check()),true);
  assert.equal(qualifiesForBonus(rule('pursuit-0'),check({skill:'engineering',dramatic:false})),true);
  assert.equal(qualifiesForBonus(rule('pursuit-0'),check({skill:'notice',dramatic:false})),false);
  assert.equal(qualifiesForBonus(rule('pursuit-12'),check({skill:'pneumatic'})),true);
  assert.equal(qualifiesForBonus(rule('pursuit-12'),check({skill:'sorcery'})),false);
  assert.equal(qualifiesForBonus(rule('pursuit-12'),check({skill:'pneumatic',dramatic:false})),false);
});

test('Final failed magic offers optional take/decline, owner alone resolves, and each distinct duel can award one card',async()=>{
  const a=prepare();await run(a,'setupActor',{},gm);game.combat={started:true,combatant:{actor:a},getFlag:()=>null};
  setTop(stack('fate'),[1,2]);
  const one=await run(a,'duel',{kind:'duel',skill:'sorcery',aspect:'intellect',tn:20});await execute(player,{op:'finish',messageId:one.id});
  assert.equal(one.getFlag(ID,'duel').pursuitBonus.status,'offered');assert.equal(stack('hand',a.id).cards.size,0);
  await assert.rejects(()=>execute(other,{op:'pursuitDraw',messageId:one.id}));
  await execute(player,{op:'pursuitDecline',messageId:one.id});assert.equal(stack('hand',a.id).cards.size,0);
  await assert.rejects(()=>execute(player,{op:'pursuitDraw',messageId:one.id}));
  const two=await run(a,'duel',{kind:'duel',skill:'sorcery',aspect:'intellect',tn:20});await execute(player,{op:'finish',messageId:two.id});
  await execute(player,{op:'pursuitDraw',messageId:two.id});assert.equal(stack('hand',a.id).cards.size,1);
  await assert.rejects(()=>execute(player,{op:'pursuitDraw',messageId:two.id}));assert.equal(stack('hand',a.id).cards.size,1);
});

test('TinSmith bonus goes to the owner of a subordinate Construct, never a controlled human or the owner’s own failure',async()=>{
  const owner=prepare('pursuit-12');await run(owner,'setupActor',{},gm);
  setTop(stack('fate'),[1]);
  const human=actor('Человек','npc',gm),construct=actor('Конструкт','npc',gm);
  human.system.characteristics='Живой, Человек';construct.system.characteristics='Конструкт';
  human.system.controllerUuid=owner.uuid;construct.system.controllerUuid=owner.uuid;
  for(const a of [human,construct,owner]){
    game.combat={started:true,combatant:{actor:a},getFlag:()=>null};
    const m=await run(a,'duel',{kind:'duel',skill:'pneumatic',aspect:'might',tn:20},gm);
    await execute(gm,{op:'finish',messageId:m.id});
    if(a===construct)assert.equal(m.getFlag(ID,'duel').pursuitBonus?.actorUuid,owner.uuid);
    else assert.equal(m.getFlag(ID,'duel').pursuitBonus,undefined);
  }
  assert.equal(snapshotPursuit(construct).actorUuid,owner.uuid);
});

test('Adopting a new Pursuit grants only its step-zero talent once, without creation equipment, XP or money',async()=>{
  const a=prepare('pursuit-0'),p=add(a,catalog.find(i=>meta(i).key==='pursuit-2'));
  const first=a.system.currentPursuitId,money=a.system.scrip,xp=a.system.xp;
  await assert.rejects(()=>run(a,'adoptPursuit',{pursuitId:p.id},other));assert.equal(a.items.size,2);
  await run(a,'adoptPursuit',{pursuitId:p.id});assert.equal(a.system.currentPursuitId,p.id);
  assert.equal(a.items.filter(i=>meta(i).kind==='step0'&&meta(i).pursuit==='pursuit-2').length,1);
  assert.equal(a.items.filter(i=>i.type==='equipment'||i.type==='magic').length,0);
  await run(a,'adoptPursuit',{pursuitId:first});await run(a,'adoptPursuit',{pursuitId:p.id});
  assert.equal(a.items.filter(i=>meta(i).kind==='step0').length,2);
  assert.equal(a.system.pursuitProgress.find(x=>x.id===p.id).step,0);assert.equal(a.system.scrip,money);assert.equal(a.system.xp,xp);
});
test('Interrupted step-zero adoption blocks replay and GM reconciliation preserves the already created talent',async()=>{
  const a=prepare(),p=add(a,catalog.find(i=>meta(i).key==='pursuit-0')),update=a.update;let fail=true;
  a.update=async changes=>{if('system.currentPursuitId' in changes&&fail){fail=false;throw Error('offline');}return update(changes);};
  await assert.rejects(()=>run(a,'adoptPursuit',{pursuitId:p.id}));assert.ok(a.system.operationPending);
  await assert.rejects(()=>run(a,'adoptPursuit',{pursuitId:p.id}));
  await run(a,'recoverOperation',{},gm);await run(a,'adoptPursuit',{pursuitId:p.id});
  assert.equal(a.items.filter(i=>meta(i).kind==='step0'&&meta(i).pursuit==='pursuit-0').length,1);
  assert.equal(a.system.currentPursuitId,p.id);assert.equal(a.system.operationPending,'');
});
