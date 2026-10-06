import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {actor,reset,gm,player,other,ID,setTop} from './harness.mjs';
const {advancePlan,reloadPlan,spellPlan,triggerPlan}=await import('../through-the-breach/scripts/automation.mjs');
import {derived,skillValue,armorValue} from '../through-the-breach/scripts/rules.mjs';
const {turnPlan,spendAP}=await import('../through-the-breach/scripts/turns.mjs');
const {execute,stack}=await import('../through-the-breach/scripts/cards.mjs');
const {BreachItemModel}=await import('../through-the-breach/scripts/models.mjs');
beforeEach(reset);
function item(a,id,type='equipment',data={}){const i={id,name:id,type,system:new BreachItemModel(data).toObject(),async update(changes){for(const [k,v]of Object.entries(changes))foundry.utils.setProperty(this,k,structuredClone(v));return this;}};a.items.set(id,i);return i;}
function combat(a){game.combat={started:true,combatant:{actor:a},getFlag:()=>null};}
const run=(a,op,data={},user=player)=>execute(user,{op,actorUuid:a.uuid,...data});
test('Armor coverage counts distinct slots, requires a heavy slot for two, caps bonus at three and subtracts Defense',()=>{
  const a=actor();a.system.autoArmor=true;
  item(a,'helmet','equipment',{armorSlot:'head',armorType:'heavy'});item(a,'extra-helmet','equipment',{armorSlot:'head',armorType:'heavy'});
  assert.equal(armorValue(a.system),1);item(a,'arms','equipment',{armorSlot:'arms',armorType:'light'});item(a,'chest','equipment',{armorSlot:'chest',armorType:'light'});
  assert.equal(armorValue(a.system),2);assert.equal(derived(a.system).defense,0);
  const m=item(a,'spell-armor','talent',{bonusTarget:'armor',bonus:2});assert.equal(armorValue(a.system),3);m.system.equipped=false;assert.equal(armorValue(a.system),2);
});
test('Aspect and skill modifiers affect AV; unequipped and depleted gear cease to apply; rank is unchanged',()=>{
  const a=actor();a.system.aspects.grace=2;a.system.temporaryAspects.grace=-1;a.system.skills.pistol.rank=3;
  const g=item(a,'gloves','equipment',{bonusTarget:'aspect.grace',bonus:2,quantity:2});const t=item(a,'talent','talent',{bonusTarget:'skill.pistol',bonus:1});
  assert.equal(skillValue(a.system,'pistol'),7);g.system.quantity=0;assert.equal(skillValue(a.system,'pistol'),5);t.system.equipped=false;assert.equal(skillValue(a.system,'pistol'),4);assert.equal(a.system.skills.pistol.rank,3);
});
test('Reload persists partial AP across turns and conserves rounds on incomplete supply',async()=>{
  const a=actor(),w=item(a,'gun','equipment',{isWeapon:true,capacity:6,loaded:1,reserve:3,reloadCost:3});combat(a);
  await run(a,'reload',{itemId:w.id,cost:2});assert.equal(a.system.ap.value,0);assert.equal(w.system.loaded,1);assert.equal(w.system.reloadProgress,2);
  a.system.ap.value=2;await run(a,'reload',{itemId:w.id,cost:1});assert.equal(w.system.loaded,4);assert.equal(w.system.reserve,0);assert.equal(w.system.reloadProgress,0);assert.equal(a.system.ap.value,1);
  await assert.rejects(()=>run(a,'reload',{itemId:w.id,cost:1}));assert.equal(a.system.operationPending,'');
});
test('Invalid reload, insufficient AP and foreign actor cannot consume resources or leave a lock',async()=>{
  const a=actor(),w=item(a,'gun','equipment',{isWeapon:true,capacity:6,reserve:6,reloadCost:3});combat(a);
  await assert.rejects(()=>run(a,'reload',{itemId:w.id,cost:3}));await assert.rejects(()=>run(a,'reload',{itemId:w.id,cost:1},other));
  assert.equal(a.system.ap.value,2);assert.equal(w.system.reserve,6);assert.equal(a.system.operationPending,'');assert.throws(()=>reloadPlan({...w.system,loaded:7},1));
});
test('Weapon shot consumes exactly one loaded round; empty magazine blocks attack without AP or Fate loss',async()=>{
  const a=actor(),b=actor('NPC','npc',gm),w=item(a,'gun','equipment',{isWeapon:true,skill:'pistol',capacity:6,loaded:1});combat(a);
  await run(a,'setup',{},gm);setTop(stack('fate'),[8]);await run(a,'attack',{itemId:w.id,targetUuid:b.uuid});assert.equal(w.system.loaded,0);assert.equal(a.system.ap.value,1);
  const m=game.messages.contents.at(-1);await execute(player,{op:'finish',messageId:m.id});const cards=stack('fate').availableCards.length;
  await assert.rejects(()=>run(a,'attack',{itemId:w.id,targetUuid:b.uuid}));assert.equal(a.system.ap.value,1);assert.equal(stack('fate').availableCards.length,cards);
});
test('Interrupted cross-document reload blocks replay; only GM clears it after reconciliation',async()=>{
  const a=actor(),w=item(a,'gun','equipment',{isWeapon:true,capacity:6,reserve:6});combat(a);w.update=async()=>{throw Error('offline');};
  await assert.rejects(()=>run(a,'reload',{itemId:w.id,cost:1}));assert.match(a.system.operationPending,/Перезарядка/);assert.equal(a.system.ap.value,1);
  await assert.rejects(()=>run(a,'reload',{itemId:w.id,cost:1}));await assert.rejects(()=>run(a,'recoverOperation'));await run(a,'recoverOperation',{},gm);assert.equal(a.system.operationPending,'');
});
test('Epilogue grants once, advances one pursuit and permits only one eligible skill at current-rank XP cost',async()=>{
  const a=actor(),p=item(a,'pursuit','talent',{category:'pursuit',eligibleSkills:'pistol, notice'});a.system.xp=3;a.system.skills.pistol.rank=3;
  await run(a,'epilogue',{session:'Сессия 1',eligible:['evade','doctor'],pursuitId:p.id},gm);assert.equal(a.system.xp,4);assert.equal(a.system.pursuitProgress[0].step,1);
  await assert.rejects(()=>run(a,'epilogue',{session:'Сессия 1',eligible:['evade','doctor'],pursuitId:p.id},gm));
  await assert.rejects(()=>run(a,'advanceSkill',{epilogueId:'Сессия 1',skill:'sorcery'}));await run(a,'advanceSkill',{epilogueId:'Сессия 1',skill:'pistol'});assert.equal(a.system.xp,1);assert.equal(a.system.skills.pistol.rank,4);
  await assert.rejects(()=>run(a,'advanceSkill',{epilogueId:'Сессия 1',skill:'doctor'}));assert.equal(a.system.xp,1);
});
test('Untrained eligible skill is free; max rank and missing XP reject before any updates',()=>{
  const a=actor();a.system.epilogues=[{id:'e',eligible:['doctor','pistol'],chosen:''}];assert.equal(advancePlan(a.system,'e','doctor')['system.xp'],0);
  a.system.skills.pistol.rank=4;assert.throws(()=>advancePlan(a.system,'e','pistol'));a.system.skills.pistol.rank=5;a.system.xp=9;assert.throws(()=>advancePlan(a.system,'e','pistol'));
});
test('Triggers cost one XP, enforce rank slots and require matching final suits; only one declaration per check',async()=>{
  const a=actor();a.system.skills.pistol.rank=3;a.system.xp=2;
  await run(a,'learnTrigger',{skill:'pistol',name:'Test',suits:'R',description:'Проверить эффект'});assert.equal(a.system.xp,1);
  await assert.rejects(()=>run(a,'learnTrigger',{skill:'pistol',name:'Second',suits:'T'}));
  await run(a,'setup',{},gm);const r=stack('fate').availableCards.find(c=>c.value===8&&c.suit==='rams');r.sort=-100;
  await run(a,'duel',{kind:'duel',skill:'pistol',aspect:'grace',tn:4});const m=game.messages.contents.at(-1);await execute(player,{op:'finish',messageId:m.id});
  const data={messageId:m.id,triggerId:a.system.learnedTriggers[0].id,confirmed:true};await run(a,'declareTrigger',data);await assert.rejects(()=>run(a,'declareTrigger',data));assert.equal(m.getFlag(ID,'duel').triggerId,data.triggerId);
});
test('Creation trigger is free only for GM and cannot be granted twice for one skill',async()=>{
  const a=actor();a.system.skills.pistol.rank=5;const p={skill:'pistol',name:'Первый',suits:'T',creation:true};await assert.rejects(()=>run(a,'learnTrigger',p));await run(a,'learnTrigger',p,gm);assert.equal(a.system.xp,0);await assert.rejects(()=>run(a,'learnTrigger',p,gm));
});
test('Spell combines TN/AP, enforces one active grimoire, known magic skills and Immuto repetition limits',()=>{
  const a=actor(),g=item(a,'g','magic',{magicKind:'grimoire',attuned:true}),spell=item(a,'s','magic',{magicKind:'magia',skill:'sorcery',tn:8,required:'T',grimoireId:g.id}),i=item(a,'i','magic',{magicKind:'immuto',tnAdjustment:3,maxCopies:2,grimoireId:g.id});
  assert.throws(()=>spellPlan(a,spell,[i]));a.system.activeGrimoire=g.id;assert.equal(spellPlan(a,spell,[i,i]).tn,14);assert.throws(()=>spellPlan(a,spell,[i,i,i]));i.system.apAdjustment=2;assert.throws(()=>spellPlan(a,spell,[i]));spell.system.skill='pistol';assert.throws(()=>spellPlan(a,spell,[]));
});
test('Spell uses the higher of casting TN and NPC resistance, checks suits, adds Earth penalty and spends AP',async()=>{
  const a=actor(),b=actor('Маг','npc',gm),spell=item(a,'spell','magic',{skill:'sorcery',tn:12,resistance:'willpower',required:'T'});b.system.rank=8;combat(a);
  await run(a,'setup',{},gm);setTop(stack('fate'),[8,9]);await run(a,'castSpell',{itemId:spell.id,targetUuid:b.uuid,earth:true,confirmed:true});const d=game.messages.contents.at(-1).getFlag(ID,'duel');assert.equal(d.tn,12);assert.equal(d.mod,-1);assert.deepEqual(d.required,['tomes']);assert.equal(a.system.ap.value,1);
});
test('Unsupported resisting Fated spell is rejected without AP or card loss',async()=>{
  const a=actor(),b=actor('Игрок'),spell=item(a,'spell','magic',{skill:'sorcery',resistance:'willpower'});combat(a);await run(a,'setup',{},gm);const n=stack('fate').availableCards.length;
  await assert.rejects(()=>run(a,'castSpell',{itemId:spell.id,targetUuid:b.uuid,confirmed:true}));assert.equal(a.system.ap.value,2);assert.equal(stack('fate').availableCards.length,n);
});
test('Buying and consuming conserve money and quantity; healing caps wounds and restores consciousness at positive wounds',async()=>{
  const a=actor(),g=item(a,'tonic','equipment',{quantity:0,price:2.5,isConsumable:true});await run(a,'buyItem',{itemId:g.id});assert.equal(a.system.scrip,7.5);assert.equal(g.system.quantity,1);await run(a,'useItem',{itemId:g.id});await assert.rejects(()=>run(a,'useItem',{itemId:g.id}));
  a.system.wounds.value=-1;a.system.unconscious=true;a.system.prone=true;await assert.rejects(()=>run(a,'heal',{amount:99}));await run(a,'heal',{amount:99},gm);assert.equal(a.system.wounds.value,4);assert.equal(a.system.unconscious,false);assert.equal(a.system.prone,true);
});
test('Only one zero AP action per activation; start resets allowance',async()=>{
  const a=actor();combat(a);await spendAP(a,0);await assert.rejects(()=>spendAP(a,0));await a.update(turnPlan(a.system,'start'));await spendAP(a,0);assert.equal(a.system.ap.value,2);
});
test('Burning resolves once with armor; poison loses a level, deals one and clears on nonliving',()=>{
  const a=actor();a.system.armor=3;a.system.effects=[{id:'b',kind:'burning',value:2,ends:0},{id:'p',kind:'poison',value:2,ends:0}];const plan=turnPlan(a.system,'end');assert.equal(plan['system.wounds.value'],2);assert.equal(plan['system.effects'].length,1);assert.equal(plan['system.effects'][0].value,1);
  a.system.living=false;assert.equal(turnPlan(a.system,'end')['system.wounds.value'],3);assert.equal(turnPlan(a.system,'end')['system.effects'].length,0);
});
test('Unnumbered conditions merge by longest duration; numeric ones stack; defense expires at next start',async()=>{
  const a=actor();combat(a);a.system.turnCount=1;await run(a,'addEffect',{kind:'fast'},gm);await run(a,'addEffect',{kind:'fast',temporary:true},gm);assert.equal(a.system.effects.length,1);assert.equal(a.system.ap.value,3);assert.equal(a.system.effects[0].ends,2);
  await run(a,'addEffect',{kind:'defensive',value:2},gm);assert.equal(turnPlan(a.system,'start')['system.effects'].some(x=>x.kind==='defensive'),false);
  await run(a,'addEffect',{kind:'poison',value:2},gm);await run(a,'addEffect',{kind:'poison',value:3},gm);assert.equal(a.system.effects.find(x=>x.kind==='poison').value,5);
});

test('Opposed spell requires both final casting TN with suits and the Fated defense total',async()=>{
  const a=actor(),b=actor('Цель'),spell=item(a,'spell','magic',{skill:'sorcery',tn:15,resistance:'willpower'});combat(a);await run(a,'setup',{},gm);setTop(stack('fate'),[1,12]);
  await run(a,'castSpell',{itemId:spell.id,targetUuid:b.uuid,confirmed:true},{...gm});
  const [defense,offense]=game.messages.contents.filter(m=>m.getFlag(ID,'duel')).slice(-2);
  assert.equal(offense.getFlag(ID,'duel').spellTN,15);assert.equal(a.system.ap.value,1);
  await execute(gm,{op:'finish',messageId:defense.id});await execute(player,{op:'finish',messageId:offense.id});
  assert.match(offense.content,/Поражение/);assert.match(offense.content,/не выполнена/);
});

test('Focus is consumed only on declared use, capped at three before cancellation, and state bonus appears in the flip',async()=>{
  const a=actor();a.system.effects=[{id:'focus',kind:'focus',value:5,ends:0}];combat(a);await run(a,'setup',{},gm);setTop(stack('fate'),[4,6,8]);
  await run(a,'duel',{kind:'duel',skill:'pistol',aspect:'grace',tn:10,action:true,useFocus:true,negative:1});const d=game.messages.contents.at(-1).getFlag(ID,'duel');assert.equal(d.mod,2);assert.equal(d.cards.length,3);assert.equal(a.system.effects.some(x=>x.kind==='focus'),false);
});
test('Advanced pursuit progression keeps eligible skills from the current pursuit',async()=>{
  const a=actor(),current=item(a,'current','talent',{category:'pursuit',eligibleSkills:'pistol'}),advanced=item(a,'advanced','talent',{category:'pursuit',eligibleSkills:'necromancy'});a.system.currentPursuitId=current.id;
  await run(a,'epilogue',{session:'Advanced',eligible:['doctor','evade'],pursuitId:advanced.id},gm);assert.equal(a.system.epilogues[0].eligible.includes('pistol'),true);assert.equal(a.system.epilogues[0].eligible.includes('necromancy'),false);assert.equal(a.system.pursuitProgress[0].id,advanced.id);
});

test('A new epilogue closes the previous unspent skill choice; XP remains saved',async()=>{
  const a=actor();await run(a,'epilogue',{session:'First',eligible:['pistol','doctor']},gm);await run(a,'epilogue',{session:'Second',eligible:['pistol','doctor']},gm);assert.equal(a.system.xp,2);
  await assert.rejects(()=>run(a,'advanceSkill',{epilogueId:'First',skill:'doctor'}));await run(a,'advanceSkill',{epilogueId:'Second',skill:'doctor'});assert.equal(a.system.xp,2);
});
