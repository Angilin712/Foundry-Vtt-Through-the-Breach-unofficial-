import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {reset,actor,gm,player,setTop,ID} from './harness.mjs';
const {execute,stack,duelPlan}=await import('../through-the-breach/scripts/cards.mjs');
const {battleButtons}=await import('../through-the-breach/scripts/actions.mjs');
beforeEach(reset);
const last=()=>game.messages.contents.filter(m=>m.getFlag(ID,'duel')).at(-1);
const finish=async m=>{const d=m.getFlag(ID,'duel');if(d.selected===null)await execute(gm,{op:'pick',messageId:m.id,index:0});await execute(gm,{op:'finish',messageId:m.id});};
function weapon(a){a.system.skills.pistol.rank=2;a.system.aspects.grace=2;const w={id:'gun',name:'Gun',system:{isWeapon:true,skill:'pistol',damage:'2/3/5',defense:'defense',apCost:1}};a.items.set(w.id,w);return w;}
const state=(kind,value=1)=>({id:kind,kind,value,ends:0,starts:0});
async function attack(a,b,extra={}){weapon(a);await execute(gm,{op:'setup'});setTop(stack('fate'),[10,11,12,13]);await execute(gm,{op:'attack',actorUuid:a.uuid,targetUuid:b.uuid,itemId:'gun',...extra});return last();}
async function damage(b,value){const a=actor();await execute(gm,{op:'setup'});setTop(stack('fate'),[value]);await execute(gm,{op:'duel',actorUuid:a.uuid,kind:'damage',track:[2,3,5],targetUuid:b.uuid});const m=last();await finish(m);await execute(gm,{op:'applyDamage',messageId:m.id});return m;}

test('Rank six is a minion for ordinary unconsciousness; rank seven is an enforcer',async()=>{
  for(const rank of [6,7]){const b=actor('NPC','npc',gm);b.system.rank=rank;b.system.wounds.value=1;const m=await damage(b,8);await execute(gm,{op:'consciousness',messageId:m.id});assert.equal(b.system.unconscious,rank===6);}
});
test('Black joker cannot cause consciousness loss even when the target already has negative wounds',async()=>{
  const b=actor('NPC','npc',gm);b.system.wounds.value=-1;const m=await damage(b,0);assert.equal(m.getFlag(ID,'duel').application.amount,0);assert.doesNotMatch(battleButtons(m.getFlag(ID,'duel')),/data-ttb="consciousness"/);await assert.rejects(()=>execute(gm,{op:'consciousness',messageId:m.id}));assert.equal(b.system.unconscious,false);
});
test('Insanity reduces direct mental aspects and skill mental aspects, without reclassifying Willpower',async()=>{
  const a=actor();await execute(gm,{op:'setup'});a.system.aspects.intellect=3;a.system.effects=[state('insanity',2)];assert.equal(duelPlan(a,{kind:'duel',skill:'intellect',tn:5}).d.base,1);assert.equal(duelPlan(a,{kind:'duel',skill:'literacy',aspect:'intellect',tn:5}).d.base,1);assert.equal(duelPlan(a,{kind:'duel',skill:'willpower',tn:5}).d.base,2);
});
test('Voluntary skill actions are blocked for unconscious, dead and paralyzed actors before drawing cards',async()=>{
  const a=actor();await execute(gm,{op:'setup'});const count=stack('fate').availableCards.length;
  for(const kind of ['unconscious','dead','paralyzed']){a.system.unconscious=kind==='unconscious';a.system.dead=kind==='dead';a.system.effects=kind==='paralyzed'?[state(kind)]:[];await assert.rejects(()=>execute(player,{op:'duel',actorUuid:a.uuid,kind:'duel',skill:'athletics',aspect:'might',tn:5,action:true}));assert.equal(stack('fate').availableCards.length,count);assert.equal(game.messages.size,0);}
});
test('NPC defense flips reverse into the attacker before the combined modifier is capped',async()=>{
  const a=actor(),b=actor('NPC','npc',gm);b.system.effects=[state('defensive',3)];const m=await attack(a,b,{positive:5});assert.equal(m.getFlag(ID,'duel').mod,2);assert.equal(m.getFlag(ID,'duel').cards.length,3);
});
test('A focused weapon attack carries its consumed focus into damage exactly once',async()=>{
  const a=actor(),b=actor('NPC','npc',gm);a.system.effects=[state('focus',1)];b.system.effects=[state('defensive',2)];const m=await attack(a,b,{useFocus:true});assert.equal(m.getFlag(ID,'duel').mod,-1);assert.equal(a.system.effects.length,0);await finish(m);setTop(stack('fate'),[8,9]);await execute(player,{op:'attackDamage',messageId:m.id});assert.equal(last().getFlag(ID,'duel').mod,1);await assert.rejects(()=>execute(player,{op:'attackDamage',messageId:m.id}));
});
test('NPC focus and blindness reverse into Fated defense; focused damage survives focus consumption',async()=>{
  const a=actor('NPC','npc',gm),b=actor();weapon(a);a.system.effects=[state('focus',1),state('blind')];await execute(gm,{op:'setup'});setTop(stack('fate'),[2,3]);await execute(gm,{op:'attack',actorUuid:a.uuid,targetUuid:b.uuid,itemId:'gun',useFocus:true});const m=last(),d=m.getFlag(ID,'duel');assert.equal(d.mod,1);assert.equal(d.tn,9);assert.equal(d.attack.damageFocus,1);assert.equal(a.system.effects.some(x=>x.kind==='focus'),false);assert.equal(d.actorUuid,b.uuid);await finish(m);a.system.effects.push(state('focus',3));setTop(stack('fate'),[8]);await execute(gm,{op:'attackDamage',messageId:m.id});assert.equal(last().getFlag(ID,'duel').mod,0);assert.equal(a.system.effects.find(x=>x.kind==='focus').value,3);
});
test('Weapon attacks apply blindness by default and allow an explicit nonvisual exception',async()=>{
  const a=actor(),b=actor('NPC','npc',gm);a.system.effects=[state('blind')];let m=await attack(a,b);assert.equal(m.getFlag(ID,'duel').mod,-2);await finish(m);m=await attack(a,b,{sight:false});assert.equal(m.getFlag(ID,'duel').mod,0);
});
