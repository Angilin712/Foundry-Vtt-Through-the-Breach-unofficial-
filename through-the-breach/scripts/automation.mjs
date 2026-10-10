import {t as ttbT,tr as ttbTr} from './localization.mjs';
import {statRank,ID,SKILLS,ASPECTS,assert,integer,parseSuits,derived,activeItems,outcome,containsSuits} from './rules.mjs';
import {actorFor,startDuel,requireReady,saveDuel,duelPlan,duelFateModifiers} from './cards.mjs';
import {canAct,spendAP,validateAP,actionPenalty} from './turns.mjs';
import {compileSpell} from './spell-builder.mjs';
import {spellCombatData} from './spell-effects.mjs';
import {chooseReward,adoptPursuit} from './pursuits.mjs';

export const AUTOMATION_OPS=['buildSpell','reload','useItem','buyItem','epilogue','advanceSkill','choosePursuitTalent','adoptPursuit','learnTrigger','declareTrigger','attune','castSpell','heal','recoverOperation'];
export function advancePlan(s,epilogueId,skill){
  const ep=s.epilogues.find(x=>x.id===epilogueId);
  assert(ep&&!ep.chosen&&!ep.closed,ttbT('Эпилог закрыт, повышение уже использовано или эпилог не найден.'));
  assert(skill in SKILLS&&ep.eligible.includes(skill),ttbT('Мастер не разрешил этот навык для эпилога.'));
  const rank=integer(s.skills[skill].rank,0,5);assert(rank<5,ttbT('Максимальный ранг навыка — 5.'));
  assert(s.xp>=rank,ttbT('Недостаточно опыта: стоимость равна текущему рангу.'));
  return {[`system.skills.${skill}.rank`]:rank+1,'system.xp':s.xp-rank,'system.epilogues':s.epilogues.map(x=>({...x,chosen:x.id===epilogueId?skill:x.chosen}))};
}
export function reloadPlan(s,cost){
  const capacity=integer(s.capacity,1,9999),loaded=integer(s.loaded,0,capacity),reserve=integer(s.reserve,0,9999);
  const total=integer(s.reloadCost,1,99),progress=integer(s.reloadProgress,0,total-1);
  assert(loaded<capacity&&reserve>0,ttbT('Магазин полон или нет запасных патронов.'));
  cost=integer(cost,1,total-progress);const done=progress+cost===total,amount=done?Math.min(capacity-loaded,reserve):0;
  return {'system.loaded':loaded+amount,'system.reserve':reserve-amount,'system.reloadProgress':done?0:progress+cost};
}
export function triggerPlan(s,p,creation=false){
  assert(p.skill in SKILLS,ttbT('Выберите навык.'));const rank=s.skills[p.skill].rank;
  assert(rank>=3,ttbT('Изучение триггера требует ранг навыка 3.'));
  assert(s.learnedTriggers.filter(x=>x.skill===p.skill).length<(rank>=5?2:1),ttbT('Для этого навыка нет свободного места триггера.'));
  assert(creation||s.xp>=1,ttbT('Требуется 1 опыт.'));assert(String(p.name??'').trim(),ttbT('Введите название триггера.'));assert(parseSuits(p.suits).length,ttbT('Укажите масти триггера.'));
  if(creation)assert(!s.learnedTriggers.some(x=>x.skill===p.skill),ttbT('При создании даётся один триггер за навык.'));
  return {'system.xp':s.xp-(creation?0:1),'system.learnedTriggers':[...s.learnedTriggers,{id:foundry.utils.randomID(),skill:p.skill,name:String(p.name).trim(),suits:String(p.suits??''),description:String(p.description??'')}]};
}
export function availableTriggers(s,d){const r=outcome(d);return r?(s.learnedTriggers??[]).filter(t=>t.skill===d.skill&&containsSuits(r.suits,parseSuits(t.suits))):[];}
export function spellPlan(actor,item,immutos=[],preview=false){
  const s=item?.system;assert(item?.type==='magic'&&['spell','magia'].includes(s.magicKind),ttbT('Выберите заклинание или Магию.'));
  if(s.spellBaseId){assert(!immutos.length,ttbT('Измените состав через конструктор; дополнительные Иммуто нельзя учитывать дважды.'));assert(s.equipped&&s.quantity>0,ttbT('Заклинание недоступно.'));return compileSpell(actor,{baseId:s.spellBaseId,immutos:s.spellImmutos});}
  assert(s.skill in SKILLS&&SKILLS[s.skill].group==='magic'&&s.aspect in ASPECTS,ttbT('Для магии нужен магический навык и известный аспект.'));
  assert(s.equipped&&s.quantity>0,ttbT('Заклинание недоступно.'));
  if(s.grimoireId){const g=actor.items.get(s.grimoireId);assert(g?.system.magicKind==='grimoire'&&g.system.attuned&&actor.system.activeGrimoire===g.id,ttbT('Нужна настройка на Гримуар этой Магии.'));}
  let tn=s.tn,ap=s.apCost;const used=new Map();
  for(const i of immutos){const x=i?.system;assert(i?.type==='magic'&&x.magicKind==='immuto'&&x.equipped&&x.quantity>0,ttbT('Выбран недоступный Иммуто.'));
    if(x.grimoireId)assert(x.grimoireId===actor.system.activeGrimoire&&actor.items.get(x.grimoireId)?.system.attuned,ttbT('Иммуто из другого или ненастроенного Гримуара.'));
    const count=(used.get(i.id)??0)+1;assert(count<=x.maxCopies,ttbT('Превышено число применений Иммуто.'));used.set(i.id,count);tn+=x.tnAdjustment;ap+=x.apAdjustment;
  }
  parseSuits(s.required);assert(ap>=0&&ap<=2,ttbT('Эта комбинация требует особого правила ОД; пока разрешите её вручную.'));
  const combat=spellCombatData(item,[...used].map(([id,count])=>({item:actor.items.get(id),count})),!preview);
  return {tn:integer(tn,0,99),ap,skill:s.skill,aspect:s.aspect,required:s.required,resistance:s.resistance,range:s.range,ignoreArmor:s.ignoreArmor,...combat};
}
export function duelModifiers(s,p){
  const selected=activeItems(s).filter(i=>i.system.bonusTarget===`skill.${p.skill}`||i.system.bonusTarget===p.skill);
  return {flips:selected.reduce((n,i)=>n+i.system.flipBonus,0),suits:selected.flatMap(i=>parseSuits(i.system.bonusSuits))};
}
export async function withOperation(actor,label,fn){
  assert(!actor.system.operationPending,ttbT('Операция прервана: мастер должен проверить ресурсы и снять блокировку в листе.'));
  await actor.update({'system.operationPending':label});
  const result=await fn();await actor.update({'system.operationPending':''});return result;
}
export async function consumeWeapon(actor,item,cost){
  assert(!actor.system.operationPending,ttbT('Предыдущая операция прервана. Обратитесь к мастеру.'));
  const tracked=item.system.capacity>0;
  if(tracked)assert(item.system.loaded>0&&item.system.loaded<=item.system.capacity,ttbT('Нет заряженных патронов или магазин переполнен.'));
  if(!tracked){if(game.combat?.started)await spendAP(actor,cost);return;}
  if(game.combat?.started)validateAP(actor,cost);
  await withOperation(actor,ttbTr`Атака: ${item.name}`,async()=>{
    if(game.combat?.started)await spendAP(actor,cost);
    await item.update({'system.loaded':item.system.loaded-1,'system.reloadProgress':0});
  });
}
export async function executeAutomation(user,p){
  const actor=actorFor(user,p.actorId,p.actorUuid),s=actor.system;
  if(p.op==='recoverOperation'){assert(user.isGM,ttbT('Блокировку снимает мастер после сверки ресурсов.'));return actor.update({'system.operationPending':''});}
  assert(!s.operationPending,ttbT('Операция прервана: обратитесь к мастеру.'));
  if(p.op==='buildSpell'){
    const name=String(p.name??'').trim();assert(name&&name.length<=120,ttbT('Введите название заклинания (до 120 символов).'));
    const plan=compileSpell(actor,p.recipe);
    return withOperation(actor,ttbTr`Создание заклинания: ${name}`,async()=>{
      for(const focus of plan.focusUpdates)await actor.items.get(focus.id).update({'system.focusObject':focus.text,'system.focusPortability':focus.portability,'system.focusRarity':focus.rarity});
      return actor.createEmbeddedDocuments('Item',[{name,type:'magic',img:plan.base.img,system:{magicKind:'spell',skill:plan.skill,aspect:plan.aspect,tn:plan.tn,required:plan.required,apCost:plan.ap,resistance:plan.resistance,range:plan.range,duration:plan.duration,ignoreArmor:plan.ignoreArmor,grimoireId:plan.base.system.grimoireId,description:plan.description,reference:plan.base.system.reference,spellBaseId:p.recipe.baseId,spellImmutos:p.recipe.immutos??[]}}]);
    });
  }
  if(p.op==='adoptPursuit')return adoptPursuit(actor,p.pursuitId);
  if(p.op==='choosePursuitTalent')return chooseReward(actor,p);
  if(p.op==='advanceSkill')return actor.update(advancePlan(s,p.epilogueId,p.skill));
  if(p.op==='learnTrigger'){assert(!p.creation||user.isGM,ttbT('Бесплатный триггер создания добавляет мастер.'));return actor.update(triggerPlan(s,p,p.creation===true));}
  if(p.op==='declareTrigger'){
    const m=game.messages.get(p.messageId),d=foundry.utils.deepClone(m?.getFlag(ID,'duel'));
    assert(m?.author?.isGM&&d?.closed&&d.stage!=='cancelled'&&d.actorUuid===actor.uuid&&!d.triggerId,ttbT('Нужна завершённая проверка персонажа без объявленного триггера.'));
    const trigger=availableTriggers(s,d).find(t=>t.id===p.triggerId);assert(trigger,ttbT('Триггер не изучен или не хватает мастей.'));assert(p.confirmed===true,ttbT('Подтвердите условия триггера по книге.'));
    d.triggerId=trigger.id;d.triggerText=`${trigger.name}: ${trigger.description}`;return saveDuel(m,d);
  }
  if(p.op==='epilogue'){
    assert(user.isGM&&actor.type==='fated',ttbT('Эпилог открывает мастер для Сужденного.'));const id=String(p.session??'').trim();assert(id&&!s.epilogues.some(x=>x.id===id),ttbT('Введите новое название сессии; повторная выдача за неё запрещена.'));
    assert(Array.isArray(p.eligible)&&p.eligible.length===2&&new Set(p.eligible).size===2&&p.eligible.every(k=>k in SKILLS),ttbT('Мастер выбирает два разных навыка.'));
    const pursuit=p.pursuitId?actor.items.get(p.pursuitId):null;assert(!p.pursuitId||pursuit?.type==='talent'&&pursuit.system.category==='pursuit',ttbT('Выберите запись Стремления.'));
    const current=s.currentPursuitId?actor.items.get(s.currentPursuitId):pursuit;
    assert(!s.currentPursuitId||current?.type==='talent'&&current.system.category==='pursuit',ttbT('Текущее Стремление не найдено.'));
    const additional=current?String(current.system.eligibleSkills).split(/[\s,;]+/).filter(Boolean):[];assert(additional.every(k=>k in SKILLS),ttbT('В Стремлении указаны неизвестные навыки. Используйте идентификаторы из подсказки.'));
    const progress=s.pursuitProgress.map(x=>({...x}));if(pursuit){let row=progress.find(x=>x.id===pursuit.id);if(!row){row={id:pursuit.id,step:0};progress.push(row);}assert(row.step<pursuit.system.stepMax,ttbT('Стремление завершено; выберите другое.'));row.step++;}
    assert(s.xp<9999,ttbT('Достигнут предел поля опыта.'));
    return actor.update({'system.xp':s.xp+1,'system.pursuitProgress':progress,'system.epilogues':[...s.epilogues.map(x=>({...x,closed:true})),{id,eligible:[...new Set([...p.eligible,...additional])],chosen:'',pursuitId:p.pursuitId??'',rewardStep:pursuit?progress.find(x=>x.id===pursuit.id).step:0,rewardChosen:'',closed:false}]});
  }
  if(p.op==='heal'){
    assert(user.isGM,ttbT('Объём исцеления подтверждает мастер после разрешения эффекта.'));const amount=integer(p.amount,1,999);assert(!s.dead,ttbT('Исцеление не воскрешает погибшего.'));
    const after=Math.min(derived(s).wounds,s.wounds.value+amount);
    return actor.update({'system.wounds.value':after,...(after>=1?{'system.unconscious':false}:{})});
  }
  const item=actor.items.get(p.itemId);assert(item,ttbT('Запись не найдена.'));
  if(p.op==='attune'){
    assert(user.isGM&&item.type==='magic'&&item.system.magicKind==='grimoire',ttbT('Настройку на Гримуар подтверждает мастер.'));
    return withOperation(actor,ttbT('Настройка на Гримуар'),async()=>{await item.update({'system.attuned':true});return actor.update({'system.activeGrimoire':item.id});});
  }
  if(p.op==='useItem'){
    assert(item.type==='equipment'&&item.system.isConsumable&&item.system.quantity>0,ttbT('Нет доступного расходуемого предмета.'));canAct(actor);
    return item.update({'system.quantity':item.system.quantity-1});
  }
  if(p.op==='buyItem'){
    assert(item.type==='equipment',ttbT('Покупаются только предметы снаряжения.'));const price=Number(item.system.price);assert(Number.isFinite(price)&&price>=0,ttbT('Некорректная цена.'));assert(s.scrip>=price,ttbT('Недостаточно скрипов.'));assert(item.system.quantity<9999,ttbT('Достигнут предел количества.'));
    return withOperation(actor,ttbTr`Покупка: ${item.name}`,async()=>{await actor.update({'system.scrip':Math.round((s.scrip-price)*100)/100});return item.update({'system.quantity':item.system.quantity+1});});
  }
  if(p.op==='reload'){
    assert(item.system.isWeapon,ttbT('Это не оружие.'));canAct(actor);
    const cost=game.combat?.started?integer(p.cost,1,99):item.system.reloadCost-item.system.reloadProgress;
    const plan=reloadPlan(item.system,cost);
    if(game.combat?.started)validateAP(actor,cost);
    return withOperation(actor,ttbTr`Перезарядка: ${item.name}`,async()=>{if(game.combat?.started)await spendAP(actor,cost);return item.update(plan);});
  }
  if(p.op==='castSpell'){
    assert(p.confirmed===true,ttbT('Подтвердите требования Магии, Иммуто и теории.'));
    const ids=p.immutoIds??[];assert(Array.isArray(ids)&&ids.length<=30,ttbT('Слишком много Иммуто.'));const plan=spellPlan(actor,item,ids.map(id=>actor.items.get(id)));
    const defPositive=integer(p.defPositive??0,0,99),defNegative=integer(p.defNegative??0,0,99);
    const positive=integer(p.positive??0,0,99),negative=integer(p.negative??0,0,99)+(p.earth?1:0),bonus=integer(p.bonus??0);
    let tn=plan.tn;const target=p.targetUuid?fromUuidSync(p.targetUuid):null;
    assert(!p.targetUuid||target?.documentName==='Actor',ttbT('Цель не найдена.'));
    assert(!plan.resistance||target,ttbT('Для сопротивления нужна цель.'));
    if(plan.resistance)assert(['defense','willpower'].includes(plan.resistance),ttbT('Неизвестное сопротивление.'));
    assert(plan.resistance!=='willpower'||!target?.system.immuneWillpower,ttbT('Цель невосприимчива к дуэлям Силы воли.'));
    const opposed=plan.resistance&&target.type==='fated'&&p.willing!==true&&!target.system.unconscious;
    if(opposed){assert(user.isGM,ttbT('Парное заклинание против сопротивляющегося Сужденного начинает мастер.'));requireReady(target);}
    const defenseTN=plan.resistance&&!p.willing&&!opposed?derived(target.system)[plan.resistance]+statRank(target.system,plan.resistance):null;
    if(defenseTN!==null)tn=Math.max(tn,defenseTN);
    canAct(actor);requireReady(actor);
    const npcVsFated=opposed&&actor.type==='npc';
    const cast={kind:'duel',skill:plan.skill,aspect:plan.aspect,required:plan.required,tn,positive,negative,bonus,action:true,useFocus:p.useFocus,sight:p.sight,npcVsFated};
    const defense={kind:'duel',skill:plan.resistance,tn:0,positive:defPositive,negative:defNegative};
    if(npcVsFated){
      const attackerFate=duelFateModifiers(actor.system,cast);
      defense.positive+=attackerFate.negative;defense.negative+=attackerFate.positive;
    }else if(plan.resistance&&!p.willing&&target.type==='npc'){
      const defenderFate=duelFateModifiers(target.system,defense);
      cast.positive+=defenderFate.negative;cast.negative+=defenderFate.positive;
    }
    duelPlan(actor,cast);
    if(opposed)duelPlan(target,defense);
    if(plan.damageTrack)assert(target,ttbT('Для заклинания с уроном выберите цель.'));
    const attack=plan.damageTrack?{kind:'spell',sourceUuid:actor.uuid,targetUuid:target.uuid,targetName:target.name,defenseTN:opposed?null:defenseTN??plan.tn,damageFocus:duelPlan(actor,cast).d.damageFocus,weapon:{name:item.name,track:plan.damageTrack,ignoreArmor:plan.ignoreArmor},delayed:plan.delayed,effects:plan.effects,effectsOnZero:plan.effectsOnZero,manualEffects:plan.manualEffects}:null;
    if(game.combat?.started)await spendAP(actor,plan.ap);
    if(opposed){
      const defenseMessage=await startDuel(target,defense);
      const offense=await startDuel(actor,{...cast,tn:plan.tn,checkReason:item.name,attack});
      const dd=foundry.utils.deepClone(defenseMessage.getFlag(ID,'duel')),od=foundry.utils.deepClone(offense.getFlag(ID,'duel'));
      dd.opposed={otherId:offense.id,role:'defense'};od.opposed={otherId:defenseMessage.id,role:'attack'};od.spellTN=od.tn;
      await saveDuel(defenseMessage,dd);await saveDuel(offense,od);return offense;
    }
    return startDuel(actor,{...cast,checkReason:`${item.name}; ${attack?ttbT('урон и эффекты — кнопкой атаки'):ttbT('эффект и длительность применяет мастер')}`,attack});
  }
  throw Error(ttbT('Неизвестная автоматизация.'));
}
