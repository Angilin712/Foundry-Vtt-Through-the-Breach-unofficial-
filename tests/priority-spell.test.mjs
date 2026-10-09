import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {reset,actor,gm,ID,MockMessage,setTop} from './harness.mjs';
const {spellCombatData}=await import('../through-the-breach/scripts/spell-effects.mjs');
const {attackMargin}=await import('../through-the-breach/scripts/actions.mjs');
const {execute,stack}=await import('../through-the-breach/scripts/cards.mjs');
beforeEach(reset);

const base=(damage='1/2/3',catalog='custom')=>({system:{magicDamage:true,damage},flags:{[ID]:{catalog:{key:catalog}}}});
const immuto=(name,count=1)=>({item:{name,flags:{[ID]:{catalog:{key:'immuto-'+name}}}},count});
const d=(card={value:8,suit:'tomes'},extra={})=>({kind:'damage',closed:true,stage:'closed',base:0,baseSuits:[],tn:0,required:[],mod:0,cards:[card],selected:0,replacement:null,redSuit:'',track:[1,2,3],...extra});
const condition=kind=>({id:kind,kind,value:1,ends:0,starts:0});

test('Printed274–275: fixed damage uses two Increase copies per +1, but each Reduce copy costs one damage',()=>{
  assert.deepEqual(spellCombatData(base('2/2/2'),[immuto('Повысить урон')]).damageTrack,[2,2,2]);
  assert.deepEqual(spellCombatData(base('2/2/2'),[immuto('Повысить урон',2)]).damageTrack,[3,3,3]);
  assert.deepEqual(spellCombatData(base('2/2/2'),[immuto('Уменьшить урон')]).damageTrack,[1,1,1]);
  assert.throws(()=>spellCombatData(base('1/1/1'),[immuto('Уменьшить урон')]));
});

test('Printed274–275: unlike ordinary tracks, equal Increase/Reduce counts do not cancel for fixed damage',()=>{
  assert.deepEqual(spellCombatData(base('2/2/2'),[immuto('Повысить урон'),immuto('Уменьшить урон')]).damageTrack,[1,1,1]);
  assert.deepEqual(spellCombatData(base(),[immuto('Повысить урон'),immuto('Уменьшить урон')]).damageTrack,[1,2,3]);
});

test('Printed274: ordinary damage advances exact rows rather than adding +1 to every component',()=>{
  assert.deepEqual(spellCombatData(base(),[immuto('Повысить урон')]).damageTrack,[1,3,4]);
  assert.deepEqual(spellCombatData(base(),[immuto('Повысить урон',2)]).damageTrack,[2,3,4]);
  assert.deepEqual(spellCombatData(base(),[immuto('Уменьшить урон')]).damageTrack,[1,1,2]);
});

test('Printed262,287,300: successful casting TN does not replace defender total for damage accuracy',()=>{
  const check={...d({value:12,suit:'tomes'}),kind:'duel',base:4,tn:16,required:['tomes'],attack:{kind:'spell',defenseTN:10}};
  assert.equal(attackMargin(check),6);
  check.cards[0].suit='masks';assert.equal(attackMargin(check),null);
  check.cards[0]={value:11,suit:'tomes'};assert.equal(attackMargin(check),null);
});

test('Printed276: elemental conditions are not silently added to a non-damaging Magia',()=>{
  const nondamage={system:{},flags:{[ID]:{catalog:{key:'magia-1'}}}};
  const p=spellCombatData(nondamage,[immuto('Огонь'),immuto('Яд'),immuto('Лед')]);
  assert.equal(p.damageTrack,null);assert.deepEqual(p.effects,[]);
});

async function apply(a,extra={}){
  const m=await MockMessage.create({flags:{[ID]:{duel:d(undefined,{targetUuid:a.uuid,damageEffects:[{kind:'ice',value:2}],...extra})}}});
  await execute(gm,{op:'applyDamage',messageId:m.id});
  return m.getFlag(ID,'duel');
}

test('Printed277: double Ice paralyzes only a target already Slow before the damage',async()=>{
  const fresh=actor(),slow=actor('Замедленный');slow.system.effects=[condition('slow')];
  await apply(fresh);await apply(slow);
  assert.ok(fresh.system.effects.some(x=>x.kind==='slow'));assert.ok(!fresh.system.effects.some(x=>x.kind==='paralyzed'));
  assert.ok(slow.system.effects.some(x=>x.kind==='paralyzed'));assert.equal(slow.system.ap.value,0);
});

test('Printed307–308: magical Ice and Fast cancel immediately, including current-turn AP correction',async()=>{
  const a=actor();a.system.effects=[condition('fast')];a.system.ap.value=3;
  game.combat={started:true,combatant:{actor:a},getFlag:()=>null};
  await apply(a,{damageEffects:[{kind:'ice',value:1}]});
  assert.ok(!a.system.effects.some(x=>x.kind==='slow'||x.kind==='fast'));assert.equal(a.system.ap.value,2);
});

test('Printed276: no actual damage means no Fire, and undo restores both HP and spell conditions',async()=>{
  const a=actor();
  const zero=await apply(a,{track:[0,0,0],damageEffects:[{kind:'burning',value:1}]});
  assert.equal(zero.application.amount,0);assert.ok(!a.system.effects.some(x=>x.kind==='burning'));
  const before=a.system.wounds.value;
  const m=await MockMessage.create({flags:{[ID]:{duel:d(undefined,{targetUuid:a.uuid,damageEffects:[{kind:'burning',value:1}]})}}});
  await execute(gm,{op:'applyDamage',messageId:m.id});assert.ok(a.system.effects.some(x=>x.kind==='burning'));
  await execute(gm,{op:'undoDamage',messageId:m.id});assert.equal(a.system.wounds.value,before);assert.equal(a.system.effects.length,0);
});

test('Printed276: Reduce Severity resolves Fire without flipping damage cards, including Black on top',async()=>{
  const source=actor(),target=actor('Цель');await execute(gm,{op:'setup'});
  setTop(stack('fate'),[0,14]);
  const before=stack('fate').availableCards.length;
  const m=await MockMessage.create({flags:{[ID]:{duel:d({value:12,suit:'tomes'},{kind:'duel',actorId:source.id,actorUuid:source.uuid,base:4,tn:10,attack:{kind:'spell',sourceUuid:source.uuid,targetUuid:target.uuid,targetName:target.name,defenseTN:10,weapon:{track:[0,0,0],ignoreArmor:false},effectsOnZero:true,effects:[{kind:'burning',value:1}]}})}}});
  await execute(gm,{op:'attackDamage',messageId:m.id});
  assert.equal(stack('fate').availableCards.length,before);
  const child=game.messages.get(m.getFlag(ID,'duel').damageMessageId);
  assert.equal(child.getFlag(ID,'duel').closed,true);
  await execute(gm,{op:'applyDamage',messageId:child.id});
  assert.equal(child.getFlag(ID,'duel').application.amount,0);
  assert.equal(child.getFlag(ID,'duel').application.criticalLevel,null);
  assert.ok(target.system.effects.some(x=>x.kind==='burning'));
  await assert.rejects(()=>execute(gm,{op:'attackDamage',messageId:m.id}));
  assert.equal(stack('fate').availableCards.length,before);
});
