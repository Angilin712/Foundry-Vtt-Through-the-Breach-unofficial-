import {ID,SKILLS,ASPECTS,assert,integer,parseSuits,derived,activeItems,outcome,containsSuits} from './rules.mjs';
import {actorFor,startDuel,requireReady,saveDuel,duelPlan} from './cards.mjs';
import {canAct,spendAP,validateAP,actionPenalty} from './turns.mjs';

export const AUTOMATION_OPS=['reload','useItem','buyItem','epilogue','advanceSkill','learnTrigger','declareTrigger','attune','castSpell','heal','recoverOperation'];
export function advancePlan(s,epilogueId,skill){
  const ep=s.epilogues.find(x=>x.id===epilogueId);
  assert(ep&&!ep.chosen&&!ep.closed,'Эпилог закрыт, повышение уже использовано или эпилог не найден.');
  assert(skill in SKILLS&&ep.eligible.includes(skill),'Мастер не разрешил этот навык для эпилога.');
  const rank=integer(s.skills[skill].rank,0,5);assert(rank<5,'Максимальный ранг навыка — 5.');
  assert(s.xp>=rank,'Недостаточно опыта: стоимость равна текущему рангу.');
  return {[`system.skills.${skill}.rank`]:rank+1,'system.xp':s.xp-rank,'system.epilogues':s.epilogues.map(x=>({...x,chosen:x.id===epilogueId?skill:x.chosen}))};
}
export function reloadPlan(s,cost){
  const capacity=integer(s.capacity,1,9999),loaded=integer(s.loaded,0,capacity),reserve=integer(s.reserve,0,9999);
  const total=integer(s.reloadCost,1,99),progress=integer(s.reloadProgress,0,total-1);
  assert(loaded<capacity&&reserve>0,'Магазин полон или нет запасных патронов.');
  cost=integer(cost,1,total-progress);const done=progress+cost===total,amount=done?Math.min(capacity-loaded,reserve):0;
  return {'system.loaded':loaded+amount,'system.reserve':reserve-amount,'system.reloadProgress':done?0:progress+cost};
}
export function triggerPlan(s,p,creation=false){
  assert(p.skill in SKILLS,'Выберите навык.');const rank=s.skills[p.skill].rank;
  assert(rank>=3,'Изучение триггера требует ранг навыка 3.');
  assert(s.learnedTriggers.filter(x=>x.skill===p.skill).length<(rank>=5?2:1),'Для этого навыка нет свободного места триггера.');
  assert(creation||s.xp>=1,'Требуется 1 опыт.');assert(String(p.name??'').trim(),'Введите название триггера.');assert(parseSuits(p.suits).length,'Укажите масти триггера.');
  if(creation)assert(!s.learnedTriggers.some(x=>x.skill===p.skill),'При создании даётся один триггер за навык.');
  return {'system.xp':s.xp-(creation?0:1),'system.learnedTriggers':[...s.learnedTriggers,{id:foundry.utils.randomID(),skill:p.skill,name:String(p.name).trim(),suits:String(p.suits??''),description:String(p.description??'')}]};
}
export function availableTriggers(s,d){const r=outcome(d);return r?(s.learnedTriggers??[]).filter(t=>t.skill===d.skill&&containsSuits(r.suits,parseSuits(t.suits))):[];}
export function spellPlan(actor,item,immutos=[]){
  const s=item?.system;assert(item?.type==='magic'&&['spell','magia'].includes(s.magicKind),'Выберите заклинание или Магию.');
  assert(s.skill in SKILLS&&SKILLS[s.skill].group==='magic'&&s.aspect in ASPECTS,'Для магии нужен магический навык и известный аспект.');
  assert(s.equipped&&s.quantity>0,'Заклинание недоступно.');
  if(s.grimoireId){const g=actor.items.get(s.grimoireId);assert(g?.system.magicKind==='grimoire'&&g.system.attuned&&actor.system.activeGrimoire===g.id,'Нужна настройка на Гримуар этой Магии.');}
  let tn=s.tn,ap=s.apCost;const used=new Map();
  for(const i of immutos){const x=i?.system;assert(i?.type==='magic'&&x.magicKind==='immuto'&&x.equipped&&x.quantity>0,'Выбран недоступный Иммуто.');
    if(x.grimoireId)assert(x.grimoireId===actor.system.activeGrimoire&&actor.items.get(x.grimoireId)?.system.attuned,'Иммуто из другого или ненастроенного Гримуара.');
    const count=(used.get(i.id)??0)+1;assert(count<=x.maxCopies,'Превышено число применений Иммуто.');used.set(i.id,count);tn+=x.tnAdjustment;ap+=x.apAdjustment;
  }
  parseSuits(s.required);assert(ap>=0&&ap<=2,'Эта комбинация требует особого правила ОД; пока разрешите её вручную.');
  return {tn:integer(tn,0,99),ap,skill:s.skill,aspect:s.aspect,required:s.required};
}
export function duelModifiers(s,p){
  const selected=activeItems(s).filter(i=>i.system.bonusTarget===`skill.${p.skill}`||i.system.bonusTarget===p.skill);
  return {flips:selected.reduce((n,i)=>n+i.system.flipBonus,0),suits:selected.flatMap(i=>parseSuits(i.system.bonusSuits))};
}
export async function withOperation(actor,label,fn){
  assert(!actor.system.operationPending,'Операция прервана: мастер должен проверить ресурсы и снять блокировку в листе.');
  await actor.update({'system.operationPending':label});
  const result=await fn();await actor.update({'system.operationPending':''});return result;
}
export async function consumeWeapon(actor,item,cost){
  assert(!actor.system.operationPending,'Предыдущая операция прервана. Обратитесь к мастеру.');
  const tracked=item.system.capacity>0;
  if(tracked)assert(item.system.loaded>0&&item.system.loaded<=item.system.capacity,'Нет заряженных патронов или магазин переполнен.');
  if(!tracked){if(game.combat?.started)await spendAP(actor,cost);return;}
  if(game.combat?.started)validateAP(actor,cost);
  await withOperation(actor,`Атака: ${item.name}`,async()=>{
    if(game.combat?.started)await spendAP(actor,cost);
    await item.update({'system.loaded':item.system.loaded-1,'system.reloadProgress':0});
  });
}
export async function executeAutomation(user,p){
  const actor=actorFor(user,p.actorId,p.actorUuid),s=actor.system;
  if(p.op==='recoverOperation'){assert(user.isGM,'Блокировку снимает мастер после сверки ресурсов.');return actor.update({'system.operationPending':''});}
  assert(!s.operationPending,'Операция прервана: обратитесь к мастеру.');
  if(p.op==='advanceSkill')return actor.update(advancePlan(s,p.epilogueId,p.skill));
  if(p.op==='learnTrigger'){assert(!p.creation||user.isGM,'Бесплатный триггер создания добавляет мастер.');return actor.update(triggerPlan(s,p,p.creation===true));}
  if(p.op==='declareTrigger'){
    const m=game.messages.get(p.messageId),d=foundry.utils.deepClone(m?.getFlag(ID,'duel'));
    assert(m?.author?.isGM&&d?.closed&&d.stage!=='cancelled'&&d.actorUuid===actor.uuid&&!d.triggerId,'Нужна завершённая проверка персонажа без объявленного триггера.');
    const trigger=availableTriggers(s,d).find(t=>t.id===p.triggerId);assert(trigger,'Триггер не изучен или не хватает мастей.');assert(p.confirmed===true,'Подтвердите условия триггера по книге.');
    d.triggerId=trigger.id;d.triggerText=`${trigger.name}: ${trigger.description}`;return saveDuel(m,d);
  }
  if(p.op==='epilogue'){
    assert(user.isGM&&actor.type==='fated','Эпилог открывает мастер для Сужденного.');const id=String(p.session??'').trim();assert(id&&!s.epilogues.some(x=>x.id===id),'Введите новое название сессии; повторная выдача за неё запрещена.');
    assert(Array.isArray(p.eligible)&&p.eligible.length===2&&new Set(p.eligible).size===2&&p.eligible.every(k=>k in SKILLS),'Мастер выбирает два разных навыка.');
    const pursuit=p.pursuitId?actor.items.get(p.pursuitId):null;assert(!p.pursuitId||pursuit?.type==='talent'&&pursuit.system.category==='pursuit','Выберите запись Стремления.');
    const current=s.currentPursuitId?actor.items.get(s.currentPursuitId):pursuit;
    assert(!s.currentPursuitId||current?.type==='talent'&&current.system.category==='pursuit','Текущее Стремление не найдено.');
    const additional=current?String(current.system.eligibleSkills).split(/[\s,;]+/).filter(Boolean):[];assert(additional.every(k=>k in SKILLS),'В Стремлении указаны неизвестные навыки. Используйте идентификаторы из подсказки.');
    const progress=s.pursuitProgress.map(x=>({...x}));if(pursuit){let row=progress.find(x=>x.id===pursuit.id);if(!row){row={id:pursuit.id,step:0};progress.push(row);}assert(row.step<pursuit.system.stepMax,'Стремление завершено; выберите другое.');row.step++;}
    assert(s.xp<9999,'Достигнут предел поля опыта.');
    return actor.update({'system.xp':s.xp+1,'system.pursuitProgress':progress,'system.epilogues':[...s.epilogues.map(x=>({...x,closed:true})),{id,eligible:[...new Set([...p.eligible,...additional])],chosen:'',pursuitId:p.pursuitId??'',closed:false}]});
  }
  if(p.op==='heal'){
    assert(user.isGM,'Объём исцеления подтверждает мастер после разрешения эффекта.');const amount=integer(p.amount,1,999);assert(!s.dead,'Исцеление не воскрешает погибшего.');
    const after=Math.min(derived(s).wounds,s.wounds.value+amount);
    return actor.update({'system.wounds.value':after,...(after>=1?{'system.unconscious':false}:{})});
  }
  const item=actor.items.get(p.itemId);assert(item,'Запись не найдена.');
  if(p.op==='attune'){
    assert(user.isGM&&item.type==='magic'&&item.system.magicKind==='grimoire','Настройку на Гримуар подтверждает мастер.');
    return withOperation(actor,'Настройка на Гримуар',async()=>{await item.update({'system.attuned':true});return actor.update({'system.activeGrimoire':item.id});});
  }
  if(p.op==='useItem'){
    assert(item.type==='equipment'&&item.system.isConsumable&&item.system.quantity>0,'Нет доступного расходуемого предмета.');canAct(actor);
    return item.update({'system.quantity':item.system.quantity-1});
  }
  if(p.op==='buyItem'){
    assert(item.type==='equipment','Покупаются только предметы снаряжения.');const price=Number(item.system.price);assert(Number.isFinite(price)&&price>=0,'Некорректная цена.');assert(s.scrip>=price,'Недостаточно скрипов.');assert(item.system.quantity<9999,'Достигнут предел количества.');
    return withOperation(actor,`Покупка: ${item.name}`,async()=>{await actor.update({'system.scrip':Math.round((s.scrip-price)*100)/100});return item.update({'system.quantity':item.system.quantity+1});});
  }
  if(p.op==='reload'){
    assert(item.system.isWeapon,'Это не оружие.');canAct(actor);
    const cost=game.combat?.started?integer(p.cost,1,99):item.system.reloadCost-item.system.reloadProgress;
    const plan=reloadPlan(item.system,cost);
    if(game.combat?.started)validateAP(actor,cost);
    return withOperation(actor,`Перезарядка: ${item.name}`,async()=>{if(game.combat?.started)await spendAP(actor,cost);return item.update(plan);});
  }
  if(p.op==='castSpell'){
    assert(p.confirmed===true,'Подтвердите требования Магии, Иммуто и теории.');
    const ids=p.immutoIds??[];assert(Array.isArray(ids)&&ids.length<=30,'Слишком много Иммуто.');const plan=spellPlan(actor,item,ids.map(id=>actor.items.get(id)));
    const defPositive=integer(p.defPositive??0,0,99),defNegative=integer(p.defNegative??0,0,99);
    const positive=integer(p.positive??0,0,99),negative=integer(p.negative??0,0,99)+(p.earth?1:0),bonus=integer(p.bonus??0);
    let tn=plan.tn;const target=p.targetUuid?fromUuidSync(p.targetUuid):null;
    assert(!p.targetUuid||target?.documentName==='Actor','Цель не найдена.');
    assert(!item.system.resistance||target,'Для сопротивления нужна цель.');
    if(item.system.resistance)assert(['defense','willpower'].includes(item.system.resistance),'Неизвестное сопротивление.');
    const opposed=item.system.resistance&&target.type==='fated'&&p.willing!==true&&!target.system.unconscious;
    if(opposed){assert(user.isGM,'Парное заклинание против сопротивляющегося Сужденного начинает мастер.');requireReady(target);}
    if(item.system.resistance&&!p.willing&&!opposed)tn=Math.max(tn,derived(target.system)[item.system.resistance]+(target.system.unconscious?0:target.system.rank));
    canAct(actor);requireReady(actor);
    duelPlan(actor,{kind:'duel',...plan,tn,positive,negative,bonus,action:true});
    if(opposed)duelPlan(target,{kind:'duel',skill:item.system.resistance,tn:0,positive:defPositive,negative:defNegative});
    if(game.combat?.started)await spendAP(actor,plan.ap);
    if(opposed){
      const defense=await startDuel(target,{kind:'duel',skill:item.system.resistance,tn:0,positive:defPositive,negative:defNegative});
      const offense=await startDuel(actor,{kind:'duel',...plan,tn:plan.tn,positive,negative,bonus,action:true,checkReason:item.name});
      const dd=foundry.utils.deepClone(defense.getFlag(ID,'duel')),od=foundry.utils.deepClone(offense.getFlag(ID,'duel'));
      dd.opposed={otherId:offense.id,role:'defense'};od.opposed={otherId:defense.id,role:'attack'};od.spellTN=od.tn;
      await saveDuel(defense,dd);await saveDuel(offense,od);return offense;
    }
    return startDuel(actor,{kind:'duel',...plan,tn,positive,negative,bonus,action:true,checkReason:`${item.name}; эффект и длительность применяет мастер`});
  }
  throw Error('Неизвестная автоматизация.');
}
