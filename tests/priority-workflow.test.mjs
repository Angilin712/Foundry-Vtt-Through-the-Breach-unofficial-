import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {reset,actor,gm,player,other,ID,MockMessage,setTop} from './harness.mjs';
const {execute,duelHTML,request,stack,duelPlan}=await import('../through-the-breach/scripts/cards.mjs');
const {walkPlan}=await import('../through-the-breach/scripts/turns.mjs');
const {weaponRating}=await import('../through-the-breach/scripts/battle.mjs');
const {outcome,derived}=await import('../through-the-breach/scripts/rules.mjs');
const {ongoingPlan}=await import('../through-the-breach/scripts/ongoing.mjs');
const {draftWeaponRating}=await import('../through-the-breach/scripts/creation-ui.mjs');
const {qualifiesForBonus}=await import('../through-the-breach/scripts/pursuits.mjs');
const awaitableTemplates=Object.fromEntries(await Promise.all(['actor','item','table'].map(async name=>[name,await readFile(`through-the-breach/templates/${name}.hbs`,'utf8')])));
beforeEach(reset);

function duel(extra={}){
  return {actorName:'Анна',label:'Тест',actorId:'test',actorUuid:'Actor.test',kind:'duel',npc:false,base:6,baseSuits:[],tn:10,required:['tomes'],mod:0,cards:[{id:'card',name:'Красный джокер',value:14,suit:''}],selected:0,replacement:null,redSuit:'',cheated:false,closed:false,stage:'select',track:[1,2,3],...extra};
}
function combat(a){game.combat={started:true,combatant:{actor:a},getFlag:()=>null};}
const run=(a,op,p={},user=player)=>execute(user,{op,actorUuid:a.uuid,...p});

test('Red joker requires suit before duel completion, but not for damage or NPC rank 14',()=>{
  const finish=html=>html.match(/<button\b[^>]*data-ttb="finish"[^>]*>/)?.[0];
  assert.match(finish(duelHTML(duel())),/disabled/);
  assert.doesNotMatch(finish(duelHTML(duel({redSuit:'tomes'}))),/disabled/);
  assert.doesNotMatch(finish(duelHTML(duel({kind:'damage'}))),/disabled/);
  assert.doesNotMatch(finish(duelHTML(duel({npc:true,cards:[{id:'rank',rank:true,value:14,name:'Ранг 14',suit:''}]}))),/disabled/);
});

test('Requester can receive private request status; no unrelated player gets the whisper',async()=>{
  game.user=player;
  const original=MockMessage.create;
  MockMessage.create=async data=>{const m=await original.call(MockMessage,data);await m.setFlag(ID,'status','done');return m;};
  try{
    await request({op:'setup'});
    const m=game.messages.contents.at(-1);
    assert.ok(m.whisper.includes(player.id));assert.ok(m.whisper.includes(gm.id));
    assert.ok(!m.whisper.includes(other.id));
  }finally{MockMessage.create=original;}
});

test('Weapon preview uses Heavy Melee rather than trained ordinary Melee, and includes weapon aspect and bonus',()=>{
  const a=actor();a.system.skills.melee.rank=4;a.system.skills.heavyMelee.rank=0;a.system.aspects.might=1;a.system.aspects.grace=2;
  const hammer={id:'hammer',name:'Молот',system:{isWeapon:true,skill:'heavyMelee',damage:'2/4/6',defense:'defense',range:'y2',attackBonus:1,apCost:1}};
  const r=weaponRating(a,hammer);assert.equal(r.skill,'heavyMelee');assert.equal(r.rank,0);assert.equal(r.aspect,'might');assert.equal(r.total,2);
  hammer.system.attackAspect='grace';assert.equal(weaponRating(a,hammer).total,3);
});

test('Focus declaration charges AP with the effect and rejects a foreign actor or another turn',async()=>{
  const a=actor(),b=actor('Другой','fated',other);combat(a);
  await run(a,'focusAction',{cost:1});assert.equal(a.system.ap.value,1);
  assert.equal(a.system.effects.filter(x=>x.kind==='focus').reduce((n,x)=>n+(x.value??1),0),1);
  await assert.rejects(()=>run(b,'focusAction',{cost:1}));assert.equal(b.system.effects.length,0);
  game.combat.combatant.actor=b;
  await assert.rejects(()=>run(a,'focusAction',{cost:1}));assert.equal(a.system.ap.value,1);
  assert.equal(a.system.effects.filter(x=>x.kind==='focus').length,1);
});

test('Focus cannot be declared without AP or while unconscious',async()=>{
  const a=actor();combat(a);a.system.ap.value=0;
  await assert.rejects(()=>run(a,'focusAction',{cost:1}));assert.equal(a.system.effects.length,0);
  a.system.ap.value=2;a.system.unconscious=true;
  await assert.rejects(()=>run(a,'focusAction',{cost:1}));assert.equal(a.system.ap.value,2);assert.equal(a.system.effects.length,0);
});

test('Confirmed walk uses the actual Walk stat and doubles difficult distance without silently moving tokens',async()=>{
  const a=actor();a.system.aspects.speed=2;const walk=derived(a.system).walk;
  const ordinary=walkPlan(a.system,{distance:walk,difficult:false});assert.equal(ordinary.cost,1);assert.equal(ordinary.paidDistance,walk);
  const difficult=walkPlan(a.system,{distance:walk/2,difficult:true});assert.equal(difficult.paidDistance,walk);
  assert.throws(()=>walkPlan(a.system,{distance:walk,difficult:true}));
  combat(a);await assert.rejects(()=>run(a,'walkAction',{distance:walk,difficult:false}));assert.equal(a.system.ap.value,2);
  await run(a,'walkAction',{distance:walk,difficult:false,confirmed:true});assert.equal(a.system.ap.value,1);
  await assert.rejects(()=>run(a,'walkAction',{distance:walk+1,difficult:false,confirmed:true}));assert.equal(a.system.ap.value,1);
});

test('Ongoing task counts base success plus complete fives and distinguishes zero-degree numeric failure',()=>{
  const result=(total,tn=8)=>ongoingPlan(duel({base:Math.max(0,total-13),tn,required:[],closed:true,stage:'closed',cards:[{id:'c',value:Math.min(total,13),suit:'tomes'}]}));
  assert.deepEqual(result(19),{successes:3,failures:0});
  assert.deepEqual(result(16),{successes:2,failures:0});
  assert.deepEqual(result(8),{successes:1,failures:0});
  assert.deepEqual(result(6),{successes:0,failures:0});
  assert.deepEqual(result(2),{successes:0,failures:1});
});

test('A positive numeric margin cannot conceal a missing mandatory magical suit',()=>{
  const d=duel({cards:[{id:'c',value:12,suit:'masks'}],required:['tomes'],base:6,tn:10,closed:true,stage:'closed'});
  const r=outcome(d);assert.equal(r.margin,8);assert.equal(r.success,false);assert.equal(r.failureDegrees,0);assert.equal(r.suitSuccess,false);
  assert.equal(ongoingPlan(d).successes,0);
});

test('Ongoing interval cannot advance with open contributions or allow a second contribution by the same participant',async()=>{
  const a=actor();await execute(gm,{op:'setup'});
  await execute(gm,{op:'taskCreate',name:'Двигатель',skills:['engineering'],aspect:'intellect',actorUuids:[a.uuid],tn:8,goal:6,limit:3});
  const task=game.messages.find(m=>m.getFlag(ID,'ongoing'));setTop(stack('fate'),[13]);
  await run(a,'taskContribute',{messageId:task.id,skill:'engineering'});
  await assert.rejects(()=>execute(gm,{op:'taskNext',messageId:task.id}));
  await assert.rejects(()=>run(a,'taskContribute',{messageId:task.id,skill:'engineering'}));
  const child=game.messages.find(m=>m.getFlag(ID,'duel'));await execute(player,{op:'finish',messageId:child.id});
  assert.equal(task.getFlag(ID,'ongoing').successes,2);
  await assert.rejects(()=>execute(player,{op:'finish',messageId:child.id}));assert.equal(task.getFlag(ID,'ongoing').successes,2);
  await assert.rejects(()=>execute(player,{op:'taskNext',messageId:task.id}));
  await execute(gm,{op:'taskNext',messageId:task.id});assert.equal(task.getFlag(ID,'ongoing').interval,2);
});

test('GM reconciles a closed contribution after interrupted task write without reflipping or double counting',async()=>{
  const a=actor();await execute(gm,{op:'setup'});
  await execute(gm,{op:'taskCreate',name:'Двигатель',skills:['engineering'],aspect:'intellect',actorUuids:[a.uuid],tn:8,goal:6,limit:3});
  const task=game.messages.find(m=>m.getFlag(ID,'ongoing'));setTop(stack('fate'),[13]);
  await run(a,'taskContribute',{messageId:task.id,skill:'engineering'});
  const child=game.messages.find(m=>m.getFlag(ID,'duel')),update=task.update;let interrupted=false;
  task.update=async function(data){const t=data[`flags.${ID}.ongoing`];if(!interrupted&&t?.rows.some(r=>!r.pending)){interrupted=true;throw Error('offline');}return update.call(this,data);};
  await assert.rejects(()=>execute(player,{op:'finish',messageId:child.id}),/offline/);
  assert.equal(child.getFlag(ID,'duel').closed,true);assert.equal(task.getFlag(ID,'ongoing').rows[0].pending,true);
  const deckSize=stack('fate').availableCards.length;
  await assert.rejects(()=>execute(player,{op:'taskRecover',messageId:task.id,actorUuid:a.uuid}));
  await execute(gm,{op:'taskRecover',messageId:task.id,actorUuid:a.uuid});
  assert.equal(task.getFlag(ID,'ongoing').successes,2);assert.equal(stack('fate').availableCards.length,deckSize);
  await assert.rejects(()=>execute(gm,{op:'taskRecover',messageId:task.id,actorUuid:a.uuid}));assert.equal(task.getFlag(ID,'ongoing').successes,2);
});

test('Task permissions reject player creation, foreign ownership, unapproved participants and skills before drawing',async()=>{
  const a=actor(),b=actor('Другой','fated',other);await execute(gm,{op:'setup'});
  const data={op:'taskCreate',name:'Двигатель',skills:['engineering'],aspect:'intellect',actorUuids:[a.uuid],tn:8,goal:6,limit:3};
  await assert.rejects(()=>execute(player,data));await execute(gm,data);
  const task=game.messages.find(m=>m.getFlag(ID,'ongoing')),size=stack('fate').availableCards.length;
  await assert.rejects(()=>run(a,'taskContribute',{messageId:task.id,skill:'engineering'},other));
  await assert.rejects(()=>run(b,'taskContribute',{messageId:task.id,skill:'engineering'},other));
  await assert.rejects(()=>run(a,'taskContribute',{messageId:task.id,skill:'pistol'}));
  assert.equal(stack('fate').availableCards.length,size);assert.equal(task.getFlag(ID,'ongoing').rows.length,0);
});

test('Walk does not invent a prone prohibition; malformed distances and turn processing still block payment',async()=>{
  const a=actor();combat(a);a.system.prone=true;
  await run(a,'walkAction',{distance:1,confirmed:true});assert.equal(a.system.ap.value,1);
  for(const distance of [0,-1,Infinity,'bad'])await assert.rejects(()=>run(a,'walkAction',{distance,confirmed:true}));
  game.combat.getFlag=()=> 'interrupted';
  await assert.rejects(()=>run(a,'focusAction'));await assert.rejects(()=>run(a,'walkAction',{distance:1,confirmed:true}));
  assert.equal(a.system.ap.value,1);assert.equal(a.system.effects.length,0);
});

test('Creation weapon preview reacts to current skill allocation, aspect modification and station replacement',()=>{
  const data={body:['1','0','-1','0'],mind:['3','0','0','-3'],root:['melee'],endeavor:['engineering'],mods:[]};
  const form={getAll:k=>data[k]??[],get:k=>data[k]??''},rows=[{station:{skill:'engineering'}},{},{root:[3]},{},{endeavor:[1]}];
  const item={system:{isWeapon:true,skill:'heavyMelee',attackBonus:1}};
  assert.equal(draftWeaponRating(form,rows,item).total,2);assert.equal(draftWeaponRating(form,rows,item).rank,0);
  data.stationSkill='heavyMelee';assert.equal(draftWeaponRating(form,rows,item).rank,1);assert.equal(draftWeaponRating(form,rows,item).total,3);
  data.stationSkill='notice';data.mods=['aspect.might','heavyMelee'];assert.equal(draftWeaponRating(form,rows,item).total,5);
  item.system.attackAspect='intellect';assert.equal(draftWeaponRating(form,rows,item).total,6);
});

test('All system templates compile with the installed Foundry Handlebars engine',async()=>{
  const require=createRequire(import.meta.url),Handlebars=require(`${process.env.FOUNDRY_APP??'C:/Program Files/Foundry Virtual Tabletop/resources/app'}/node_modules/handlebars`);
  for(const name of ['actor','item','table'])assert.doesNotThrow(()=>Handlebars.precompile(awaitableTemplates[name]));
});

test('Shared task appears once for GM and player, recovery carries parent message ID and actor UUID',()=>{
  const require=createRequire(import.meta.url),Handlebars=require(`${process.env.FOUNDRY_APP??'C:/Program Files/Foundry Virtual Tabletop/resources/app'}/node_modules/handlebars`);
  const template=Handlebars.compile(awaitableTemplates.table),task={id:'task-message-01',name:'UNIQUE_TASK',interval:1,duration:'5 минут',successes:0,goal:6,failures:0,limit:3,status:'open',open:true,canContribute:true,recovery:[{actorUuid:'Actor.test',name:'Участник'}]};
  const gmHTML=template({isGM:true,masterOnline:true,tasks:[{...task,isGM:true}]});
  assert.equal((gmHTML.match(/UNIQUE_TASK/g)??[]).length,1);
  assert.match(gmHTML,/data-op="taskRecover" data-message-id="task-message-01" data-actor-uuid="Actor.test"/);
  const playerHTML=template({isGM:false,masterOnline:true,tasks:[{...task,isGM:false}]});
  assert.equal((playerHTML.match(/UNIQUE_TASK/g)??[]).length,1);assert.match(playerHTML,/data-op="taskContribute"/);assert.doesNotMatch(playerHTML,/data-op="taskRecover"|data-op="taskNext"|data-op="taskClose"/);
});

test('GM dramatic time outside combat enables Dabbler failure bonus; players cannot change the state and ending clears it',async()=>{
  const a=actor();await execute(gm,{op:'setup'});
  const tables=JSON.parse(await readFile('through-the-breach/data/pursuit-progression.json','utf8')),rule=tables.pursuits.find(p=>p.name==='Дабблер');
  assert.ok(rule?.drawRequiresDramatic);
  const failed=()=>({...duelPlan(a,{kind:'duel',skill:'sorcery',aspect:'intellect',tn:10}).d,closed:true,stage:'closed',cards:[{id:'c',value:2,suit:'rams'}],selected:0});
  const before=failed();assert.equal(before.dramatic,false);assert.equal(qualifiesForBonus(rule,before),false);
  await assert.rejects(()=>execute(player,{op:'beginDrama'}));assert.notEqual(game.settings.get(ID,'dramaticTime'),true);
  await execute(gm,{op:'beginDrama'});assert.equal(game.combat,undefined);
  const during=failed();assert.equal(during.dramatic,true);assert.equal(qualifiesForBonus(rule,during),true);
  await assert.rejects(()=>execute(player,{op:'endDrama'}));assert.equal(game.settings.get(ID,'dramaticTime'),true);
  await execute(gm,{op:'endDrama'});const after=failed();assert.equal(after.dramatic,false);assert.equal(qualifiesForBonus(rule,after),false);
  assert.equal(qualifiesForBonus(rule,during),true,'Already flipped checks retain their original dramatic snapshot');
});

test('Shuffle-credit request error reaches its author immediately with the actionable reason',async()=>{
  game.user=player;const original=MockMessage.create,reason='Сначала возьмите или отклоните карту за перетасовку во вкладке «Судьба и рука».';
  MockMessage.create=async data=>{const m=await original.call(MockMessage,data);await m.setFlag(ID,'status','error');await m.setFlag(ID,'error',reason);m.content=`Действие не завершено: ${reason}`;return m;};
  try{await assert.rejects(()=>request({op:'duel',actorId:'owned'}),err=>err.message===reason);const m=game.messages.contents.at(-1);assert.ok(m.whisper.includes(player.id));assert.ok(!m.whisper.includes(other.id));assert.match(m.content,/Судьба и рука/);}finally{MockMessage.create=original;}
});

test('Focus is permitted in GM-declared Dramatic time outside combat and still pays one AP',async()=>{
  const a=actor();await execute(gm,{op:'beginDrama'});await run(a,'focusAction');
  assert.equal(a.system.ap.value,1);assert.equal(a.system.effects.find(x=>x.kind==='focus').value,1);
  await execute(gm,{op:'endDrama'});await assert.rejects(()=>run(a,'focusAction'));
});
