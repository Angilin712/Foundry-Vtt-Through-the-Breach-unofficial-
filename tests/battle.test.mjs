import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {reset,actor,gm,player,other,setTop,ID} from './harness.mjs';
import {weaponData,reducedDamage,compareCombatants,criticalEffect} from '../through-the-breach/scripts/battle.mjs';
const {execute,stack}=await import('../through-the-breach/scripts/cards.mjs');
const {battleButtons}=await import('../through-the-breach/scripts/actions.mjs');
beforeEach(reset);
function weapon(a){const w={id:'weapon1',name:'Пистолет',system:{isWeapon:true,skill:'pistol',range:'10 ярдов',damage:'2/3/5',defense:'defense',ignoreArmor:false}};a.items.set(w.id,w);a.system.skills.pistol.rank=2;a.system.aspects.grace=2;return w;}
const last=()=>game.messages.filter(m=>m.getFlag(ID,'duel')).at(-1);
const finish=async m=>execute(gm,{op:'finish',messageId:m.id});
async function damage(target,value=8){const a=actor();await execute(gm,{op:'setup'});setTop(stack('fate'),[value]);await execute(gm,{op:'duel',actorId:a.id,kind:'damage',positive:0,negative:0,track:[2,3,5],targetUuid:target.uuid});const m=last();await finish(m);return m;}
test('Armor caps at three, minimum one, black zero and ignore armor',()=>{assert.equal(reducedDamage(2,3),1);assert.equal(reducedDamage(0,3),0);assert.equal(reducedDamage(5,3,true),5);assert.throws(()=>reducedDamage(3,4));assert.throws(()=>weaponData({system:{isWeapon:true,skill:'pistol',damage:'4/2/3'}}));});
test('Initiative uses Fated priority, Speed, then agreed order, without alphabetic tie-break',()=>{const a={id:'a',initiative:10,actor:{type:'fated',system:{aspects:{speed:1}}},flags:{[ID]:{tieOrder:2}}},b=structuredClone(a);b.id='b';b.flags[ID].tieOrder=1;assert.ok(compareCombatants(a,b)>0);b.actor.type='npc';b.actor.system.aspects.speed=9;assert.ok(compareCombatants(a,b)<0);b.initiative=11;assert.ok(compareCombatants(a,b)>0);});
test('Weapon attack snapshots skill and defense, damage gets accuracy, only GM applies',async()=>{const a=actor(),b=actor('Страж','npc',gm);weapon(a);await execute(gm,{op:'setup'});setTop(stack('fate'),[12]);await execute(player,{op:'attack',actorUuid:a.uuid,itemId:'weapon1',targetUuid:b.uuid,positive:0,negative:0});const attack=last();assert.equal(attack.getFlag(ID,'duel').tn,7);assert.equal(attack.getFlag(ID,'duel').base,4);await finish(attack);setTop(stack('fate'),[8]);await execute(player,{op:'attackDamage',messageId:attack.id});const d=last();assert.equal(d.getFlag(ID,'duel').mod,0);assert.deepEqual(d.getFlag(ID,'duel').track,[2,3,5]);await finish(d);await assert.rejects(()=>execute(player,{op:'applyDamage',messageId:d.id}));b.system.armor=2;await execute(gm,{op:'applyDamage',messageId:d.id});assert.equal(b.system.wounds.value,3);await assert.rejects(()=>execute(gm,{op:'applyDamage',messageId:d.id}));await execute(gm,{op:'undoDamage',messageId:d.id});assert.equal(b.system.wounds.value,4);});
test('NPC attacks use Fated defense flip, reverse modifiers and no attacker Fate flip',async()=>{const a=actor('Страж','npc',gm),b=actor();weapon(a);await execute(gm,{op:'setup'});setTop(stack('fate'),[2,3]);await execute(gm,{op:'attack',actorUuid:a.uuid,itemId:'weapon1',targetUuid:b.uuid,positive:1,negative:0});const m=last(),d=m.getFlag(ID,'duel');assert.equal(d.actorUuid,b.uuid);assert.equal(d.tn,9);assert.equal(d.mod,-1);assert.equal(d.cards.length,2);await finish(m);setTop(stack('fate'),[8,9]);await execute(gm,{op:'attackDamage',messageId:m.id});assert.equal(last().getFlag(ID,'duel').targetUuid,b.uuid);});
test('Undo refuses to overwrite later wound edits; failed save keeps intent and blocks replay',async()=>{const b=actor('Страж','npc',gm),m=await damage(b);await execute(gm,{op:'applyDamage',messageId:m.id});b.system.wounds.value=9;await assert.rejects(()=>execute(gm,{op:'undoDamage',messageId:m.id}));const c=actor('Второй','npc',gm),n=await damage(c);c.update=async()=>{throw Error('offline');};await assert.rejects(()=>execute(gm,{op:'applyDamage',messageId:n.id}));assert.equal(n.getFlag(ID,'duel').application.pending,true);await assert.rejects(()=>execute(gm,{op:'applyDamage',messageId:n.id}));});
test('Black damage applies zero and generates no critical; red grants severe at positive wounds',async()=>{const b=actor('Страж','npc',gm),m=await damage(b,0);await execute(gm,{op:'applyDamage',messageId:m.id});assert.equal(b.system.wounds.value,4);assert.equal(m.getFlag(ID,'duel').application.criticalLevel,null);b.system.wounds.value=20;const n=await damage(b,14);await execute(gm,{op:'applyDamage',messageId:n.id});assert.equal(n.getFlag(ID,'duel').application.criticalLevel,'severe');});
test('Critical tables transition, add negative wounds, persist effect, and undo restores wounds and notes',async()=>{assert.deepEqual(criticalEffect('weak',15),{reroll:'moderate',min:3});assert.deepEqual(criticalEffect('moderate',2),{reroll:'weak',max:14});assert.deepEqual(criticalEffect('severe',2),{reroll:'moderate',max:14});assert.equal(criticalEffect('weak',11).extra,1);const b=actor('Страж','npc',gm);b.system.wounds.value=1;b.system.conditions='Старая заметка';const m=await damage(b,8);await execute(gm,{op:'applyDamage',messageId:m.id});setTop(stack('fate'),[9]);await execute(gm,{op:'critical',messageId:m.id});assert.match(b.system.conditions,/Старая заметка/);assert.match(b.system.conditions,/Глубокая рана/);assert.equal(stack('active').cards.size,0);await assert.rejects(()=>execute(gm,{op:'critical',messageId:m.id}));await execute(gm,{op:'undoDamage',messageId:m.id});assert.equal(b.system.wounds.value,1);assert.equal(b.system.conditions,'Старая заметка');});
test('Damage and checks resolve synthetic token UUID without changing its prototype actor',async()=>{const prototype=actor('Страж','npc',gm),b=actor('Копия','npc',gm);b.uuid='Scene.test.Token.test.Actor.synthetic';const m=await damage(b);await execute(gm,{op:'applyDamage',messageId:m.id});assert.equal(b.system.wounds.value,1);assert.equal(prototype.system.wounds.value,4);await execute(gm,{op:'undoDamage',messageId:m.id});assert.equal(b.system.wounds.value,4);});
test('Consciousness: minion automatically fails, enforcer succeeds, Fated toughness TN10',async()=>{const b=actor('Страж','npc',gm);b.system.wounds.value=1;const m=await damage(b);await execute(gm,{op:'applyDamage',messageId:m.id});await execute(gm,{op:'consciousness',messageId:m.id});assert.equal(b.system.unconscious,true);const c=actor('Силовик','npc',gm);c.system.rank=6;c.system.wounds.value=1;const n=await damage(c);await execute(gm,{op:'applyDamage',messageId:n.id});await execute(gm,{op:'consciousness',messageId:n.id});assert.equal(c.system.unconscious,false);const f=actor();f.system.wounds.value=1;const k=await damage(f);await execute(gm,{op:'applyDamage',messageId:k.id});setTop(stack('fate'),[2]);await execute(gm,{op:'consciousness',messageId:k.id});const check=last();assert.equal(check.getFlag(ID,'duel').tn,10);await finish(check);assert.equal(f.system.unconscious,true);assert.equal(f.system.prone,true);assert.equal(f.system.ap.value,0);});
test('Fated opposed attacks flip both sides first, enforce cheat order, and aggressor wins ties',async()=>{const a=actor('Агрессор'),b=actor('Защитник','fated',other);weapon(a);await execute(gm,{op:'setup'});setTop(stack('fate'),[8,6]);await execute(gm,{op:'attack',actorUuid:a.uuid,itemId:'weapon1',targetUuid:b.uuid});const offense=last(),defense=game.messages.get(offense.getFlag(ID,'duel').opposed.otherId);assert.equal(stack('active').cards.size,2);await assert.rejects(()=>execute(player,{op:'finish',messageId:offense.id}));await execute(other,{op:'finish',messageId:defense.id});await execute(player,{op:'finish',messageId:offense.id});assert.match(offense.content,/Победа/);assert.equal(offense.getFlag(ID,'duel').tn,0);setTop(stack('fate'),[3,4,5]);await execute(player,{op:'attackDamage',messageId:offense.id});assert.equal(last().getFlag(ID,'duel').mod,-2);});
test('Critical exhaustion recycles only shared discard and grants each personal hand a credit',async()=>{const b=actor('Страж','npc',gm);b.system.wounds.value=1;const f=actor();await execute(gm,{op:'setupActor',actorId:f.id});const m=await damage(b,8);await execute(gm,{op:'applyDamage',messageId:m.id});const deck=stack('fate');await deck.pass(stack('discard'),deck.availableCards.map(c=>c.id));await execute(gm,{op:'critical',messageId:m.id});assert.equal(stack('hand',f.id).getFlag(ID,'credits'),1);assert.equal(stack('active').cards.size,0);assert.equal(deck.availableCards.length+stack('discard').cards.size,54);});
test('A pending shuffle credit blocks damage without consuming its one-use action',async()=>{const a=actor(),b=actor('Страж','npc',gm);weapon(a);await execute(gm,{op:'setupActor',actorId:a.id});setTop(stack('fate'),[12]);await execute(player,{op:'attack',actorUuid:a.uuid,itemId:'weapon1',targetUuid:b.uuid});const m=last();await finish(m);await execute(gm,{op:'shuffle'});await assert.rejects(()=>execute(player,{op:'attackDamage',messageId:m.id}));assert.equal(m.getFlag(ID,'duel').damageMessageId,undefined);await execute(player,{op:'declineCredit',actorId:a.id});await execute(player,{op:'attackDamage',messageId:m.id});assert.notEqual(m.getFlag(ID,'duel').damageMessageId,'pending');});

test('Critical consciousness table thresholds distinguish immediate, recurring and living-only checks',()=>{
  assert.deepEqual(criticalEffect('moderate',9).consciousness,{baseTN:8,repeat:false,livingOnly:false});
  assert.equal(criticalEffect('moderate',8).consciousness,null);
  assert.equal(criticalEffect('moderate',11).consciousness,null);
  assert.deepEqual(criticalEffect('severe',10).consciousness,{baseTN:8,repeat:true,livingOnly:false});
  assert.deepEqual(criticalEffect('severe',18).consciousness,{baseTN:8,repeat:false,livingOnly:true});
  assert.equal(criticalEffect('severe',19).consciousness.baseTN,10);
  assert.equal(criticalEffect('severe',21).consciousness.baseTN,10);
});
async function criticalWound(target,damageCard,criticalCard){
  const m=await damage(target,damageCard);await execute(gm,{op:'applyDamage',messageId:m.id});
  setTop(stack('fate'),[criticalCard]);await execute(gm,{op:'critical',messageId:m.id});return m;
}
test('Rank 6 NPC must resolve critical consciousness normally, not auto-pass; GM only, no card drawn',async()=>{
  const b=actor('Силовик','npc',gm);b.system.rank=6;b.system.wounds.value=2;
  const m=await criticalWound(b,8,8);assert.equal(m.getFlag(ID,'duel').application.after,-1);
  await assert.rejects(()=>execute(player,{op:'criticalConsciousness',messageId:m.id}));
  const count=stack('fate').availableCards.length;await execute(gm,{op:'criticalConsciousness',messageId:m.id});
  const check=last();assert.equal(check.getFlag(ID,'duel').tn,9);assert.equal(check.getFlag(ID,'duel').cards[0].rank,true);
  assert.equal(stack('fate').availableCards.length,count);await finish(check);assert.equal(b.system.unconscious,true);
  assert.equal(b.system.prone,true);assert.equal(b.system.ap.value,0);
  await assert.rejects(()=>execute(gm,{op:'criticalConsciousness',messageId:m.id}));
  await assert.rejects(()=>execute(gm,{op:'undoDamage',messageId:m.id}));
  assert.doesNotMatch(battleButtons(m.getFlag(ID,'duel')),/undoDamage/);
});
test('Fated special check uses current wounds and owner can finish; ordinary check stays separate',async()=>{
  const b=actor();b.system.wounds.value=2;const m=await criticalWound(b,8,8);
  b.system.wounds.value=-3;setTop(stack('fate'),[12]);await execute(gm,{op:'criticalConsciousness',messageId:m.id});
  const check=last();assert.equal(check.getFlag(ID,'duel').tn,11);await execute(player,{op:'finish',messageId:check.id});
  assert.equal(b.system.unconscious,false);assert.equal(m.getFlag(ID,'duel').consciousnessMessageId,undefined);
});
test('Nerve injury repeats only after prior check closes; immediate living-only check requires applicability',async()=>{
  const b=actor('Силовик','npc',gm);b.system.rank=10;b.system.wounds.value=4;
  const m=await criticalWound(b,11,8);await execute(gm,{op:'criticalConsciousness',messageId:m.id});
  await assert.rejects(()=>execute(gm,{op:'criticalConsciousness',messageId:m.id}));await finish(last());
  b.system.wounds.value=-2;await execute(gm,{op:'criticalConsciousness',messageId:m.id});assert.equal(last().getFlag(ID,'duel').tn,10);await finish(last());
  const c=actor('Живая цель','npc',gm);c.system.wounds.value=-4;const n=await criticalWound(c,11,8);
  await assert.rejects(()=>execute(gm,{op:'criticalConsciousness',messageId:n.id}));
  assert.equal(n.getFlag(ID,'duel').criticalConsciousnessMessageId,undefined);
  await execute(gm,{op:'criticalConsciousness',messageId:n.id,living:true});assert.equal(last().getFlag(ID,'duel').tn,17);
});
