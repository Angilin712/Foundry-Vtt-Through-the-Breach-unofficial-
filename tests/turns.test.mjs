import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {reset,actor,gm,player,other,ID,setTop} from './harness.mjs';
const {turnPlan,turnLifecycle,actionPenalty}=await import('../through-the-breach/scripts/turns.mjs');
const {execute,stack}=await import('../through-the-breach/scripts/cards.mjs');
beforeEach(reset);
const effect=(kind,ends=0,starts=0)=>({id:kind,kind,ends,starts,source:'test'});
function combatFor(a){const flags={};const c={id:'combatant1',actor:a};const combat={id:'combat1',started:true,combatant:c,getFlag:(_s,k)=>flags[k],async setFlag(_s,k,v){flags[k]=structuredClone(v);return this;}};game.combat=combat;return {combat,c};}
test('Turn AP generation handles paralysis, unconsciousness, slow minimum and pain',()=>{
  const a=actor();assert.equal(turnPlan(a.system,'start')['system.ap.value'],2);
  a.system.effects=[effect('slow')];assert.equal(turnPlan(a.system,'start')['system.ap.value'],1);
  a.system.effects=[effect('pain')];assert.equal(turnPlan(a.system,'start')['system.ap.value'],1);
  a.system.effects=[effect('paralyzed')];assert.equal(turnPlan(a.system,'start')['system.ap.value'],0);
  a.system.effects=[];a.system.unconscious=true;assert.equal(turnPlan(a.system,'start')['system.ap.value'],0);
});
test('Bleeding grows, wounds stay unchanged, open wound starts bleeding, nonliving clears it',()=>{
  const a=actor();a.system.bleeding=8;assert.equal(turnPlan(a.system,'end')['system.bleeding'],9);
  a.system.bleeding=9;const p=turnPlan(a.system,'end');assert.equal(p['system.dead'],true);assert.equal(p['system.wounds.value'],undefined);
  a.system.bleeding=0;a.system.effects=[effect('openWound')];assert.equal(turnPlan(a.system,'end')['system.bleeding'],1);
  a.system.openWoundFirst=true;assert.equal(turnPlan(a.system,'end')['system.bleeding'],2);
  a.system.living=false;assert.equal(turnPlan(a.system,'end')['system.bleeding'],0);
});
test('Timed effects survive current end and expire after next turn; notes do not drive rules',()=>{
  const a=actor();a.system.turnCount=3;a.system.effects=[effect('slow',4),effect('pain')];a.system.conditions='Без сознания';
  assert.equal(turnPlan(a.system,'end')['system.effects'].length,2);
  a.system.turnCount=4;assert.deepEqual(turnPlan(a.system,'end')['system.effects'].map(x=>x.kind),['pain']);
  assert.equal(turnPlan(a.system,'start')['system.ap.value'],1);
});
test('Turn ledger prevents repeated start/end and refuses interrupted writes without replay',async()=>{
  const a=actor(),{combat,c}=combatFor(a),ctx={round:1,turn:0,skipped:false};
  await turnLifecycle(combat,c,ctx,'start');await turnLifecycle(combat,c,ctx,'start');assert.equal(a.system.turnCount,1);
  a.system.bleeding=1;await turnLifecycle(combat,c,ctx,'end');await turnLifecycle(combat,c,ctx,'end');assert.equal(a.system.bleeding,2);
  a.update=async()=>{throw Error('offline');};await assert.rejects(()=>turnLifecycle(combat,c,{...ctx,round:2},'start'));
  assert.ok(combat.getFlag(ID,'turnPending'));await assert.rejects(()=>turnLifecycle(combat,c,{...ctx,round:2},'start'));
});
test('Owner AP spend rejects foreign actor, insufficient AP, wrong turn and unconsciousness',async()=>{
  const a=actor(),b=actor('Другой','fated',other);combatFor(a);
  await execute(player,{op:'spendAP',actorUuid:a.uuid,cost:1});assert.equal(a.system.ap.value,1);
  await assert.rejects(()=>execute(player,{op:'spendAP',actorUuid:a.uuid,cost:2}));
  await assert.rejects(()=>execute(player,{op:'spendAP',actorUuid:b.uuid,cost:1}));
  await assert.rejects(()=>execute(other,{op:'spendAP',actorUuid:b.uuid,cost:1}));
  a.system.unconscious=true;await assert.rejects(()=>execute(player,{op:'spendAP',actorUuid:a.uuid,cost:0}));
});
test('Skip spends AP, raises TN for hyperventilation, success removes only that effect',async()=>{
  const a=actor();a.system.wounds.value=-2;a.system.effects=[effect('hyperventilation'),effect('pain')];
  assert.equal(actionPenalty(a.system),2);await execute(gm,{op:'setup'});setTop(stack('fate'),[13]);
  await execute(player,{op:'hyperventilation',actorUuid:a.uuid});assert.equal(a.system.ap.value,1);
  const m=game.messages.filter(m=>m.getFlag(ID,'duel')).at(-1);assert.equal(m.getFlag(ID,'duel').tn,12);
  await assert.rejects(()=>execute(player,{op:'hyperventilation',actorUuid:a.uuid}));assert.equal(a.system.ap.value,1);
  await execute(player,{op:'finish',messageId:m.id});assert.deepEqual(a.system.effects.map(x=>x.kind),['pain']);
});
test('New structured states serialize through actual Foundry model',()=>{
  const a=actor();const model=new a.system.constructor({effects:[effect('hyperventilation')],bleeding:3});
  const serialized=model.toObject();assert.equal(serialized.effects[0].kind,'hyperventilation');assert.equal(serialized.bleeding,3);
});
test('Critical slow changes next turn AP, expires, and blocks obsolete damage undo',async()=>{
  const a=actor(),b=actor('Цель','npc',gm);b.system.wounds.value=2;await execute(gm,{op:'setup'});setTop(stack('fate'),[3]);
  await execute(gm,{op:'duel',actorUuid:a.uuid,kind:'damage',track:[2,2,2]});const m=game.messages.filter(x=>x.getFlag(ID,'duel')).at(-1);
  const d=m.getFlag(ID,'duel');d.targetUuid=b.uuid;await execute(gm,{op:'finish',messageId:m.id});await execute(gm,{op:'applyDamage',messageId:m.id});
  setTop(stack('fate'),[9]);await execute(gm,{op:'critical',messageId:m.id});assert.equal(b.system.effects[0].kind,'slow');
  const {combat,c}=combatFor(b),ctx={round:1,turn:0};await turnLifecycle(combat,c,ctx,'start');assert.equal(b.system.ap.value,1);
  await turnLifecycle(combat,c,ctx,'end');assert.equal(b.system.effects.length,0);
  await assert.rejects(()=>execute(gm,{op:'undoDamage',messageId:m.id}));
});
test('Weapon attack in active combat spends AP once and rejects out-of-turn attack',async()=>{
  const a=actor(),b=actor('Страж','npc',gm),w={id:'gun',name:'Пистолет',system:{isWeapon:true,skill:'pistol',damage:'2/3/4',defense:'defense',apCost:1}};
  a.items.set(w.id,w);combatFor(a);await execute(gm,{op:'setup'});setTop(stack('fate'),[12]);
  await execute(player,{op:'attack',actorUuid:a.uuid,itemId:w.id,targetUuid:b.uuid});assert.equal(a.system.ap.value,1);
  const m=game.messages.filter(x=>x.getFlag(ID,'duel')).at(-1);await execute(player,{op:'finish',messageId:m.id});
  game.combat.combatant.actor=b;await assert.rejects(()=>execute(player,{op:'attack',actorUuid:a.uuid,itemId:w.id,targetUuid:b.uuid}));assert.equal(a.system.ap.value,1);
});
test('Only GM can repair pending turn; completed step remains protected against replay',async()=>{
  const a=actor(),{combat,c}=combatFor(a),ctx={round:1,turn:0};await combat.setFlag(ID,'turnPending','1:0:combatant1:start');
  await assert.rejects(()=>execute(player,{op:'recoverTurn',actorUuid:a.uuid}));
  await execute(gm,{op:'recoverTurn',actorUuid:a.uuid});await turnLifecycle(combat,c,ctx,'start');assert.equal(a.system.turnCount,0);
});
