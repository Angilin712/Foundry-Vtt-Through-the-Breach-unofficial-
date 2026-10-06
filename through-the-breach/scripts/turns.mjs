import {ID,assert,integer,escapeHTML as e} from './rules.mjs';
import {actorFor,requireReady,startDuel,stack} from './cards.mjs';

export const EFFECT_LABELS={stunned:'Ошеломлён: СЛ действий +2',negative:'Минус к дуэлям следующего хода',slow:'Замедлен',fast:'Быстр',paralyzed:'Парализован',hyperventilation:'Гипервентиляция: СЛ действий +2',pain:'Мучительная боль: на 1 ОД меньше',openWound:'Открытая рана: Кровотечение +1 в конце хода'};
export function hasEffect(s,kind){return (s.effects??[]).some(x=>x.kind===kind&&(!x.starts||x.starts<=(s.turnCount??0)));}
export function actionPenalty(s){return (hasEffect(s,'stunned')?2:0)+(hasEffect(s,'hyperventilation')?2:0);}
export function turnPlan(s,phase){
  const count=(s.turnCount??0)+(phase==='start'?1:0),next={...s,turnCount:count};
  if(phase==='start'){
    const blocked=s.dead||s.unconscious||hasEffect(next,'paralyzed');
    const fast=hasEffect(next,'fast'),slow=hasEffect(next,'slow');
    let ap=Math.max(0,(s.ap.max??2)-(hasEffect(next,'pain')?1:0));
    if(fast&&!slow)ap++;if(slow&&!fast)ap=Math.max(1,ap-1);if(blocked)ap=0;
    return {'system.turnCount':count,'system.ap.value':ap};
  }
  let bleeding=s.living?(s.bleeding??0):0;
  const open=s.living&&!s.dead?(s.effects??[]).filter(x=>x.kind==='openWound').length:0;
  if(s.openWoundFirst)bleeding+=open;
  if(bleeding>0&&!s.dead)bleeding++;
  if(!s.openWoundFirst)bleeding+=open;
  return {'system.ap.value':0,'system.bleeding':bleeding,'system.dead':s.dead||bleeding>=10,'system.effects':(s.effects??[]).filter(x=>!x.ends||x.ends>count)};
}
export function canAct(actor){assert(!actor.system.dead&&!actor.system.unconscious&&!hasEffect(actor.system,'paralyzed'),'Персонаж не может действовать: погиб, без сознания или парализован.');}
export async function spendAP(actor,cost){
  canAct(actor);cost=integer(cost,0,99);
  const combat=game.combat;
  if(combat?.started){assert(combat.combatant?.actor?.uuid===actor.uuid,'Сейчас ход другого персонажа.');assert(!combat.getFlag(ID,'turnPending'),'Начало или конец хода не завершены; мастер должен проверить последствия.');}
  assert(actor.system.ap.value>=cost,'Недостаточно очков действий.');
  await actor.update({'system.ap.value':actor.system.ap.value-cost});
}
export async function turnLifecycle(combat,combatant,context,phase){
  if(!combatant?.actor||context.skipped)return;
  const key=`${context.round}:${context.turn}:${combatant.id}:${phase}`;
  const done=combat.getFlag(ID,'turnLedger')??{};
  if(done[key])return;
  assert(!combat.getFlag(ID,'turnPending'),'Обработка хода прервана: проверьте ОД и последствия вручную.');
  await combat.setFlag(ID,'turnPending',key);
  const wasDead=combatant.actor.system.dead;
  await combatant.actor.update(turnPlan(combatant.actor.system,phase));
  await combat.setFlag(ID,'turnLedger',{...done,[key]:true});
  await combat.setFlag(ID,'turnPending','');
  if(phase==='end'&&!wasDead&&combatant.actor.system.dead)await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor:combatant.actor}),content:`<p>${e(combatant.actor.name)}: погиб от кровотечения. Мастер проверяет исключения способностей.</p>`});
}
export async function executeTurnAction(user,p){
  const actor=actorFor(user,p.actorId,p.actorUuid);
  if(p.op==='spendAP')return spendAP(actor,p.cost);
  if(p.op==='recoverTurn'){
    assert(user.isGM,'Прерванный ход подтверждает мастер.');const combat=game.combat,key=combat?.getFlag(ID,'turnPending');assert(key,'Нет прерванной обработки хода.');
    await combat.setFlag(ID,'turnLedger',{...(combat.getFlag(ID,'turnLedger')??{}),[key]:true});return combat.setFlag(ID,'turnPending','');
  }
  if(p.op==='addEffect'){
    assert(user.isGM&&p.kind in EFFECT_LABELS,'Состояние добавляет мастер.');
    const ends=p.temporary?actor.system.turnCount+1:0;
    let effects=foundry.utils.deepClone(actor.system.effects);
    const exists=effects.some(x=>x.kind===p.kind);
    effects.push({id:foundry.utils.randomID(),kind:p.kind,ends,starts:0,source:'manual'});
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
