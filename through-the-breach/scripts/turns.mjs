import {ID,assert,integer,armorValue,derived,escapeHTML as e} from './rules.mjs';
import {actorFor,requireReady,startDuel,stack} from './cards.mjs';

export function walkPlan(s,p){
  const distance=Number(p.distance),difficult=p.difficult===true||p.difficult==='on',maxDistance=derived(s).walk,paidDistance=distance*(difficult?2:1);
  assert(Number.isFinite(distance)&&distance>0&&paidDistance<=maxDistance+1e-6,'Путь превышает Ходьбу за 1 ОД; трудная местность удваивает стоимость расстояния.');
  return {cost:1,distance,difficult,maxDistance,paidDistance};
}

export const EFFECT_LABELS={stunned:'Ошеломлён: СЛ действий +2',negative:'Минус к дуэлям следующего хода',slow:'Замедлен',fast:'Быстр',paralyzed:'Парализован',hyperventilation:'Гипервентиляция: СЛ действий +2',pain:'Мучительная боль: на 1 ОД меньше',openWound:'Открытая рана: Кровотечение +1 в конце хода',burning:'Горит',poison:'Отравлен',defensive:'Оборона',focus:'Сосредоточенность',insanity:'Безумие',blind:'Слеп: −− при использовании зрения'};
export function hasEffect(s,kind){return (s.effects??[]).some(x=>x.kind===kind&&(!x.starts||x.starts<=(s.turnCount??0)));}
export function actionPenalty(s){return (hasEffect(s,'stunned')?2:0)+(hasEffect(s,'hyperventilation')?2:0);}
export function turnPlan(s,phase){
  const count=(s.turnCount??0)+(phase==='start'?1:0),next={...s,turnCount:count};
  if(phase==='start'){
    const blocked=s.dead||s.unconscious||hasEffect(next,'paralyzed');
    const fast=hasEffect(next,'fast'),slow=hasEffect(next,'slow');
    let ap=Math.max(0,(s.ap.max??2)-(hasEffect(next,'pain')?1:0));
    if(fast&&!slow)ap++;if(slow&&!fast)ap=Math.max(1,ap-1);if(blocked)ap=0;
    return {'system.turnCount':count,'system.ap.value':ap,'system.freeActionUsed':false,'system.effects':(s.effects??[]).filter(x=>x.endPhase!=='start'||!x.ends||x.ends>count)};
  }
  let bleeding=s.living?(s.bleeding??0):0;
  const open=s.living&&!s.dead?(s.effects??[]).filter(x=>x.kind==='openWound').length:0;
  if(s.openWoundFirst)bleeding+=open;
  if(bleeding>0&&!s.dead)bleeding++;
  if(!s.openWoundFirst)bleeding+=open;
  const burn=(s.effects??[]).filter(x=>x.kind==='burning').reduce((n,x)=>n+(x.value??1),0),poison=s.living?(s.effects??[]).some(x=>x.kind==='poison'):false;
  const changes={'system.ap.value':0,'system.bleeding':bleeding,'system.dead':s.dead||bleeding>=10,'system.effects':(s.effects??[]).filter(x=>x.kind!=='burning'&&(x.kind!=='poison'||s.living&&(x.value??1)>1)&&(x.endPhase==='start'||!x.ends||x.ends>count)).map(x=>x.kind==='poison'?{...x,value:x.value-1}:x)};
  if(!s.dead&&(burn||poison)){
    if(s.rankWounds){changes['system.rank']=Math.max(0,s.rank-(burn?1:0)-(poison?1:0));if(!changes['system.rank'])changes['system.dead']=true;}
    else changes['system.wounds.value']=s.wounds.value-(burn?Math.max(1,burn-armorValue(s)):0)-(poison?1:0);
  }
  return changes;
}
export function canAct(actor){assert(!actor.system.dead&&!actor.system.unconscious&&!hasEffect(actor.system,'paralyzed'),'Персонаж не может действовать: погиб, без сознания или парализован.');}
export function validateAP(actor,cost){
  canAct(actor);cost=integer(cost,0,99);
  const combat=game.combat;
  if(combat?.started){assert(combat.combatant?.actor?.uuid===actor.uuid,'Сейчас ход другого персонажа.');assert(!combat.getFlag(ID,'turnPending'),'Начало или конец хода не завершены; мастер должен проверить последствия.');}
  assert(actor.system.ap.value>=cost,'Недостаточно очков действий.');
  if(combat?.started&&cost===0)assert(!actor.system.freeActionUsed,'В свой ход можно выполнить только одно действие (0).');
}
export async function spendAP(actor,cost){
  validateAP(actor,cost);cost=integer(cost,0,99);
  await actor.update({'system.ap.value':actor.system.ap.value-cost,...(game.combat?.started&&cost===0?{'system.freeActionUsed':true}:{})});
}
export async function turnLifecycle(combat,combatant,context,phase){
  if(!combatant?.actor||context.skipped)return;
  const key=`${context.round}:${context.turn}:${combatant.id}:${phase}`;
  const done=combat.getFlag(ID,'turnLedger')??{};
  if(done[key])return;
  assert(!combat.getFlag(ID,'turnPending'),'Обработка хода прервана: проверьте ОД и последствия вручную.');
  await combat.setFlag(ID,'turnPending',key);
  const wasDead=combatant.actor.system.dead,beforeWounds=combatant.actor.system.wounds.value,beforeRank=combatant.actor.system.rank;
  await combatant.actor.update(turnPlan(combatant.actor.system,phase));
  await combat.setFlag(ID,'turnLedger',{...done,[key]:true});
  await combat.setFlag(ID,'turnPending','');
  if(phase==='end'&&!wasDead&&combatant.actor.system.dead)await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor:combatant.actor}),content:`<p>${e(combatant.actor.name)}: ${combatant.actor.system.rankWounds&&combatant.actor.system.rank===0?'рой распался':'погиб от кровотечения'}. Мастер проверяет исключения способностей.</p>`});
  if(phase==='end'&&combatant.actor.system.rankWounds&&combatant.actor.system.rank<beforeRank)await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor:combatant.actor}),content:`<p>${e(combatant.actor.name)}: урон Горения / Яда, ранг роя ${beforeRank} → ${combatant.actor.system.rank}.</p>`});
  if(phase==='end'&&!combatant.actor.system.rankWounds&&combatant.actor.system.wounds.value<beforeWounds)await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor:combatant.actor}),content:`<p>${e(combatant.actor.name)}: урон Горения / Яда, ранения ${beforeWounds} → ${combatant.actor.system.wounds.value}.${combatant.actor.system.wounds.value<=0?' Мастер разрешает проверку сознания и слабый критический эффект отдельно за каждый источник урона (книга, стр. 302–303).':''}</p>`});
}
export async function executeTurnAction(user,p){
  const actor=actorFor(user,p.actorId,p.actorUuid);
  if(p.op==='focusAction'){
    assert(game.combat?.started||game.settings.get(ID,'dramaticTime')===true,'Сосредоточенность — действие в Драматическое время; мастер должен объявить его или начать бой.');
    validateAP(actor,1);const s=actor.system,value=(s.effects??[]).filter(x=>x.kind==='focus').reduce((n,x)=>n+(x.value??1),0);
    assert(value<3,'Сосредоточенность уже достигла максимального флипа +++.');
    return actor.update({'system.ap.value':s.ap.value-1,'system.effects':[...s.effects.filter(x=>x.kind!=='focus'),{id:foundry.utils.randomID(),kind:'focus',ends:s.turnCount||1,starts:0,source:'focus-action',value:value+1,endPhase:'end'}]});
  }
  if(p.op==='walkAction'){
    assert(p.confirmed===true,'Подтвердите путь на карте, видимость и условия движения.');const plan=walkPlan(actor.system,p);validateAP(actor,1);
    await actor.update({'system.ap.value':actor.system.ap.value-1});
    return foundry.documents.ChatMessage.create({speaker:foundry.documents.ChatMessage.getSpeaker({actor}),content:`<p>${e(actor.name)}: Ходьба ${plan.distance} ярд${plan.difficult?'ов по трудной местности':''}, оплачено 1 ОД. Допустимый путь ${plan.maxDistance} ярдов. Переместите токен измеренным путём; выход из бучи и опасную местность разрешает мастер.</p>`});
  }
  if(p.op==='spendAP')return spendAP(actor,p.cost);
  if(p.op==='recoverTurn'){
    assert(user.isGM,'Прерванный ход подтверждает мастер.');const combat=game.combat,key=combat?.getFlag(ID,'turnPending');assert(key,'Нет прерванной обработки хода.');
    await combat.setFlag(ID,'turnLedger',{...(combat.getFlag(ID,'turnLedger')??{}),[key]:true});return combat.setFlag(ID,'turnPending','');
  }
  if(p.op==='addEffect'){
    assert(user.isGM&&p.kind in EFFECT_LABELS,'Состояние добавляет мастер.');
    const current=game.combat?.started&&game.combat.combatant?.actor?.uuid===actor.uuid;
    const standard=['fast','slow','focus','paralyzed','defensive'].includes(p.kind);
    const ends=p.temporary?actor.system.turnCount+1:standard?actor.system.turnCount+(current&&p.kind!=='defensive'?0:1):0;
    let effects=foundry.utils.deepClone(actor.system.effects);
    const exists=effects.some(x=>x.kind===p.kind);
    const value=integer(p.value??1,1,99),old=effects.find(x=>x.kind===p.kind);
    if(old){old.ends=!old.ends||!ends?0:Math.max(old.ends,ends);if(['burning','poison','defensive','focus','insanity'].includes(p.kind))old.value=(old.value??1)+value;}
    else effects.push({id:foundry.utils.randomID(),kind:p.kind,ends,starts:0,source:'manual',value,endPhase:p.kind==='defensive'?'start':'end'});
    const changes={'system.effects':effects};
    if(game.combat?.started&&game.combat.combatant?.actor?.uuid===actor.uuid&&!exists){
      if(p.kind==='slow')changes['system.ap.value']=Math.max(0,actor.system.ap.value-1);
      if(p.kind==='fast')changes['system.ap.value']=Math.min(99,actor.system.ap.value+1);
    }
    if(p.kind==='paralyzed')changes['system.ap.value']=0;
    if(effects.some(x=>x.kind==='slow')&&effects.some(x=>x.kind==='fast'))changes['system.effects']=effects.filter(x=>!['slow','fast'].includes(x.kind));
    return actor.update(changes);
  }
  if(p.op==='clearEffect'){
    assert(user.isGM,'Снятие состояния подтверждает мастер.');
    assert(actor.system.effects.some(x=>x.id===p.effectId),'Состояние уже снято.');
    return actor.update({'system.effects':actor.system.effects.filter(x=>x.id!==p.effectId)});
  }
  if(p.op==='endSceneEffects'){
    assert(user.isGM,'Конец сцены подтверждает мастер.');
    return actor.update({'system.effects':actor.system.effects.filter(x=>!x.ends),'system.ap.value':0});
  }
  if(p.op==='hyperventilation'){
    const effect=actor.system.effects.find(x=>x.kind==='hyperventilation');assert(effect,'Нет гипервентиляции.');
    requireReady(actor);canAct(actor);
    const tn=8+Math.max(0,-actor.system.wounds.value)+actionPenalty(actor.system);
    integer(tn,0,99);await spendAP(actor,1);
    return startDuel(actor,{kind:'duel',skill:'toughness',aspect:'resilience',tn,positive:0,negative:0,removeEffectId:effect.id,checkReason:'Пропуск: снять гипервентиляцию'});
  }
  throw Error('Неизвестное действие хода.');
}
