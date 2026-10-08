import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {reset,actor,gm,setTop,ID} from './harness.mjs';
const {execute,stack}=await import('../through-the-breach/scripts/cards.mjs');
const {BreachItemModel}=await import('../through-the-breach/scripts/models.mjs');
beforeEach(reset);
const state=(kind,value=1)=>({id:kind,kind,value,ends:0,starts:0});
function spell(a,extra={}){a.system.skills.sorcery.rank=3;a.system.aspects.intellect=1;const i={id:'spell',type:'magic',name:'Spell',system:new BreachItemModel({magicKind:'spell',skill:'sorcery',aspect:'intellect',tn:8,resistance:'defense',required:'T',...extra}).toObject()};a.items.set(i.id,i);return i;}
function combat(a){game.combat={started:true,combatant:{actor:a},getFlag:()=>null};}
async function cast(a,b,extra={}){await execute(gm,{op:'setup'});setTop(stack('fate'),[2,3,4,5]);await execute(gm,{op:'castSpell',actorUuid:a.uuid,itemId:'spell',targetUuid:b.uuid,confirmed:true,...extra});return game.messages.contents.filter(m=>m.getFlag(ID,'duel'));}

test('Fated spell reverses NPC Defense bonuses before cancellation and preserves casting TN, suits and AP',async()=>{
  const a=actor(),b=actor('NPC','npc',gm);spell(a);combat(a);a.system.effects=[state('focus',1)];b.system.effects=[state('defensive',2)];const [m]=await cast(a,b,{useFocus:true});const d=m.getFlag(ID,'duel');assert.equal(d.mod,-1);assert.equal(d.tn,8);assert.deepEqual(d.required,['tomes']);assert.equal(d.base,4);assert.equal(d.cards.length,2);assert.equal(a.system.ap.value,1);assert.equal(a.system.effects.length,0);
});
test('NPC spell reverses Focus, Blind and negative state into Fated defense without a second numeric conversion',async()=>{
  const a=actor('NPC','npc',gm),b=actor();spell(a);combat(a);a.system.effects=[state('focus',1),state('blind'),state('negative')];const [defense,offense]=await cast(a,b,{useFocus:true,sight:true});const dd=defense.getFlag(ID,'duel'),od=offense.getFlag(ID,'duel');assert.equal(dd.mod,2);assert.equal(dd.cards.length,3);assert.equal(od.base,4);assert.equal(od.cards[0].value,5);assert.equal(od.mod,-2);assert.equal(od.damageFocus,1);assert.equal(od.spellTN,8);assert.deepEqual(od.required,['tomes']);assert.equal(a.system.effects.some(x=>x.kind==='focus'),false);assert.equal(a.system.ap.value,1);assert.equal(od.opposed.otherId,defense.id);
});
test('NPC spell still must meet its own casting TN and required suit despite defeating the defender',async()=>{
  const a=actor('NPC','npc',gm),b=actor();spell(a,{tn:10});combat(a);a.system.effects=[state('focus',1)];const [defense,offense]=await cast(a,b,{useFocus:true});let dd=defense.getFlag(ID,'duel');if(dd.selected===null)await execute(gm,{op:'pick',messageId:defense.id,index:0});await execute(gm,{op:'finish',messageId:defense.id});await execute(gm,{op:'finish',messageId:offense.id});assert.match(offense.content,/Поражение/);assert.match(offense.content,/не выполнена/);assert.equal(offense.getFlag(ID,'duel').base,4);assert.equal(a.system.ap.value,1);
});
test('NPC to NPC spell uses the numeric conversion, not Fated draw inversion twice',async()=>{
  const a=actor('NPC caster','npc',gm),b=actor('NPC target','npc',gm);spell(a);a.system.skills.sorcery.suits='T';a.system.effects=[state('focus',1)];b.system.effects=[state('defensive',2)];const [m]=await cast(a,b,{useFocus:true});const d=m.getFlag(ID,'duel');assert.equal(d.mod,-1);assert.equal(d.base,2);assert.equal(d.tn,8);assert.equal(d.cards.length,1);assert.equal(stack('fate').availableCards.length,54);
});
