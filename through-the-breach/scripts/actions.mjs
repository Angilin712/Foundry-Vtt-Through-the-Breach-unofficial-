import {consumeWeapon} from './automation.mjs';
import {ID,SKILLS,assert,integer,derived,armorValue,skillValue,outcome,accuracy,escapeHTML as e} from './rules.mjs';
import {weaponData,reducedDamage,criticalEffect} from './battle.mjs';
import {stack,startDuel,saveDuel,actorFor,drawFrom,requireReady,duelPlan} from './cards.mjs';
import {spendAP,canAct,hasEffect,actionPenalty} from './turns.mjs';

export function attackMargin(d){
  const r=outcome(d);if(!r||!d.attack)return null;
  if(d.opposed){const other=game.messages.get(d.opposed.otherId)?.getFlag(ID,'duel');if(!other?.closed||!d.closed||other.stage==='cancelled')return null;const margin=r.total-outcome(other).total;return margin>=0?margin:null;}
  if(d.attack.defending)return r.success?null:d.tn-r.total;
  return r.success?r.margin:null;
}
export function battleButtons(d){
  if(d.stage==='cancelled')return '';
  let html='';
  if(d.closed&&d.attack&&attackMargin(d)!==null&&!d.damageMessageId)html+='<button type="button" data-ttb="attackDamage">Флип урона атаки</button>';
  if(d.closed&&d.kind==='damage'&&d.targetUuid&&!d.application)html+='<button type="button" data-ttb="applyDamage">Применить урон к цели</button>';
  if(d.application&&!d.application.undone&&!d.application.pending&&!d.application.criticalPending){
    if(!d.consciousnessMessageId&&!d.criticalConsciousnessMessageId)html+='<button type="button" data-ttb="undoDamage">Отменить применение урона</button>';
    if(d.application.criticalLevel&&!d.criticalResult)html+='<button type="button" data-ttb="critical">Критический эффект</button>';
    if(d.application.after<=0&&!d.consciousnessMessageId)html+='<button type="button" data-ttb="consciousness">Проверка сознания</button>';
    if(d.criticalConsciousness&&(!d.criticalConsciousnessMessageId||d.criticalConsciousness.repeat&&game.messages.get(d.criticalConsciousnessMessageId)?.getFlag(ID,'duel')?.closed))html+=`<button type="button" data-ttb="criticalConsciousness">${d.criticalConsciousness.repeat?'Сознание при действии (травма нервов)':'Сознание от критической раны'}</button>`;
  }
  return html;
}
function targetOf(uuid){const a=fromUuidSync(uuid);assert(a?.documentName==='Actor','Цель не найдена.');return a;}
function messageOf(id){const m=game.messages.get(id);assert(m?.author?.isGM&&m.getFlag(ID,'duel'),'Проверка не найдена.');return {m,d:foundry.utils.deepClone(m.getFlag(ID,'duel'))};}
export async function executeBattle(user,p){
  if(p.op==='attack'){
    const source=actorFor(user,p.actorId,p.actorUuid),target=targetOf(p.targetUuid);
    assert(source.uuid!==target.uuid,'Нельзя выбрать себя целью атаки.');
    canAct(source);
    const weapon=weaponData(source.items.get(p.itemId)),k=source.system.skills[weapon.skill];
    const targetStat=derived(target.system)[weapon.defense];
    if(source.type==='fated'&&target.type==='fated'&&!target.system.unconscious)assert(user.isGM,'Дуэль двух Сужденных начинает мастер, задавая модификаторы обеих сторон.');
    requireReady(source);if(target.type==='fated'&&!target.system.unconscious)requireReady(target);
    integer(p.positive??0,0,99);integer(p.negative??0,0,99);integer(p.bonus??0);integer(p.defPositive??0,0,99);integer(p.defNegative??0,0,99);
    duelPlan(source,{kind:'duel',skill:weapon.skill,aspect:k.aspect,tn:0,positive:p.positive,negative:p.negative,bonus:p.bonus,action:true,useFocus:p.useFocus});
    if(target.type==='fated'&&!target.system.unconscious)duelPlan(target,{kind:'duel',skill:weapon.defense,tn:0,positive:p.defPositive??0,negative:p.defNegative??0});
    assert(source.items.get(p.itemId).system.equipped!==false&&source.items.get(p.itemId).system.quantity!==0,'Оружие недоступно или не подготовлено.');
    integer(targetStat+(target.system.unconscious?0:target.system.rank),0,99);
    await consumeWeapon(source,source.items.get(p.itemId),weapon.apCost);
    const attack={sourceUuid:source.uuid,targetUuid:target.uuid,targetName:target.name,weapon,defending:source.type==='npc'&&target.type==='fated'&&!target.system.unconscious};
    if(attack.defending){
      const tn=skillValue(source.system,weapon.skill,k.aspect)+source.system.rank+integer(p.bonus??0)-actionPenalty(source.system)-(hasEffect(source.system,'negative')?2:0);
      return startDuel(target,{kind:'duel',skill:weapon.defense,tn,positive:p.negative,negative:p.positive,required:'',attack});
    }
    // Both Fated flip before either cheats. Ties are won by the aggressor.
    if(target.type==='fated'&&!target.system.unconscious){
      assert(user.isGM,'Дуэль двух Сужденных начинает мастер, задавая модификаторы обеих сторон.');
      requireReady(source);requireReady(target);
      const defense=await startDuel(target,{kind:'duel',skill:weapon.defense,tn:0,positive:p.defPositive??0,negative:p.defNegative??0});
      const offense=await startDuel(source,{kind:'duel',skill:weapon.skill,aspect:k.aspect,tn:0,positive:p.positive,negative:p.negative,bonus:Number(p.bonus??0)-actionPenalty(source.system),attack,action:true,useFocus:p.useFocus});
      const dd=foundry.utils.deepClone(defense.getFlag(ID,'duel')),od=foundry.utils.deepClone(offense.getFlag(ID,'duel'));
      dd.opposed={otherId:offense.id,role:'defense'};od.opposed={otherId:defense.id,role:'attack'};
      await saveDuel(defense,dd);await saveDuel(offense,od);return offense;
    }
    return startDuel(source,{kind:'duel',skill:weapon.skill,aspect:k.aspect,tn:targetStat+(target.system.unconscious?0:target.system.rank),positive:p.positive,negative:p.negative,bonus:p.bonus,attack,action:true,useFocus:p.useFocus});
  }
  const {m,d}=messageOf(p.messageId);
  if(p.op==='attackDamage'){
    assert(d.closed&&d.stage!=='cancelled'&&attackMargin(d)!==null&&!d.damageMessageId,'Нет завершённой успешной атаки.');
    const a=actorFor(user,null,d.attack.sourceUuid),margin=attackMargin(d),mod=accuracy(margin)+integer(p.positive??0,0,99)-integer(p.negative??0,0,99);
    requireReady(a);
    d.damageMessageId='pending';await saveDuel(m,d);
    const child=await startDuel(a,{kind:'damage',positive:Math.max(0,mod),negative:Math.max(0,-mod),track:d.attack.weapon.track,targetUuid:d.attack.targetUuid,ignoreArmor:d.attack.weapon.ignoreArmor,parentAttackId:m.id});
    d.damageMessageId=child.id;return saveDuel(m,d);
  }
  assert(user.isGM,'Урон, критические последствия и отмену применения подтверждает мастер.');
  if(p.op==='criticalConsciousness'){
    const effect=d.criticalConsciousness;
    assert(effect&&d.application&&!d.application.undone&&!d.application.pending&&!d.application.criticalPending,'Нет завершённой критической раны с проверкой сознания.');
    const previous=d.criticalConsciousnessMessageId;
    assert(!previous||effect.repeat&&game.messages.get(previous)?.getFlag(ID,'duel')?.closed,'Проверка уже начата или выполнена.');
    assert(!effect.livingOnly||p.living===true,'Этот эффект требует живую цель; применимость подтверждает мастер.');
    const a=targetOf(d.targetUuid);assert(!a.system.unconscious&&!a.system.dead,'Цель уже без сознания или погибла.');assert(!effect.livingOnly||a.system.living,'Цель отмечена как неживая.');requireReady(a);
    const tn=integer(effect.baseTN+Math.max(0,-a.system.wounds.value),0,99),positive=integer(p.positive??0,0,99),negative=integer(p.negative??0,0,99);
    d.criticalConsciousnessMessageId='pending';await saveDuel(m,d);
    const child=await startDuel(a,{kind:'duel',skill:'toughness',aspect:'resilience',tn,positive,negative,unconsciousCheck:true,checkReason:effect.repeat?'Травма нервов: сознание при действии':'Сознание от критической раны'});
    d.criticalConsciousnessMessageId=child.id;return saveDuel(m,d);
  }
  if(p.op==='consciousness'){
    assert(d.application&&!d.application.pending&&!d.application.criticalPending&&!d.application.undone&&d.application.after<=0&&!d.consciousnessMessageId,'Проверка сознания не требуется или уже выполнена.');
    const a=targetOf(d.targetUuid);assert(a.system.wounds.value===d.application.after,'Ранения цели изменились: проверьте сознание вручную по текущему состоянию.');
    if(a.type==='fated')requireReady(a);
    d.consciousnessMessageId='pending';await saveDuel(m,d);
    if(a.type==='npc'){
      const unconscious=a.system.rank<=5;
      if(unconscious)await a.update({'system.unconscious':true,'system.prone':true,'system.ap.value':0});d.consciousnessMessageId='rank';d.consciousnessResult=unconscious?'Прислужник/миньон теряет сознание, если критический эффект не игнорируется.':'Силовик или более высокий ранг автоматически сохраняет сознание.';
      return saveDuel(m,d);
    }
    const child=await startDuel(a,{kind:'duel',skill:'toughness',aspect:'resilience',tn:10,positive:0,negative:0,unconsciousCheck:true});d.consciousnessMessageId=child.id;return saveDuel(m,d);
  }
  const target=targetOf(d.targetUuid);
  if(p.op==='applyDamage'){
    assert(d.kind==='damage'&&d.closed&&d.stage!=='cancelled'&&!d.application,'Урон уже применён либо флип не завершён.');
    const r=outcome(d),amount=reducedDamage(r.damage,armorValue(target.system),d.ignoreArmor||p.ignoreArmor===true),before=target.system.wounds.value,after=before-amount;
    const level=r.critical?'severe':amount>0&&after<=0?(r.card.value<=5?'weak':r.card.value<=10?'moderate':'severe'):null;
    d.application={before,after,amount,armor:armorValue(target.system),criticalLevel:level,beforeConditions:target.system.conditions,afterConditions:target.system.conditions,beforeUnconscious:target.system.unconscious};
    Object.assign(d.application,{beforeEffects:foundry.utils.deepClone(target.system.effects),afterEffects:foundry.utils.deepClone(target.system.effects),beforeBleeding:target.system.bleeding,afterBleeding:target.system.bleeding,beforeProne:target.system.prone,afterProne:target.system.prone,beforeDead:target.system.dead,afterDead:target.system.dead,beforeAP:target.system.ap.value,afterAP:target.system.ap.value});
    // Record intent before mutation. Interrupted application cannot be replayed silently.
    d.application.pending=true;await saveDuel(m,d);
    await target.update({'system.wounds.value':after});d.application.pending=false;return saveDuel(m,d);
  }
  const app=d.application;assert(app&&!app.undone&&!app.pending&&!app.criticalPending,'Нет завершённого применения урона или критический эффект прерван.');
  assert(target.system.wounds.value===app.after&&target.system.conditions===app.afterConditions,'Цель изменилась после применения. Проверьте её лист вручную, чтобы не затереть новые изменения.');
  if(app.afterEffects)assert(JSON.stringify(target.system.effects)===JSON.stringify(app.afterEffects)&&target.system.bleeding===app.afterBleeding&&target.system.ap.value===app.afterAP&&target.system.prone===app.afterProne&&target.system.dead===app.afterDead,'Состояния или ОД цели изменились: восстановление вручную.');
  if(p.op==='undoDamage'){
    assert(!d.consciousnessMessageId&&!d.criticalConsciousnessMessageId,'После проверки сознания отмените последствия вручную, чтобы не затереть новые события.');
    const restore={'system.wounds.value':app.before,'system.conditions':app.beforeConditions,'system.unconscious':app.beforeUnconscious};
    if(app.beforeEffects)Object.assign(restore,{'system.effects':app.beforeEffects,'system.bleeding':app.beforeBleeding,'system.prone':app.beforeProne,'system.dead':app.beforeDead,'system.ap.value':app.beforeAP});
    await target.update(restore);app.undone=true;return saveDuel(m,d);
  }
  if(p.op==='critical'){
    assert(app.criticalLevel&&!d.criticalResult&&!app.criticalPending,'Критический эффект не требуется, уже разрешён или прерван. Проверьте лист и сброс вручную.');
    const bonus=integer(p.bonus??0,-99,99);
    app.criticalPending=true;await saveDuel(m,d);
    let level=app.criticalLevel,min=0,max=Infinity,result,card;const flips=[];
    for(let i=0;i<4;i++){
      const drawn=await drawFrom(stack('fate'),stack('discard'),stack('active'),1,true);card=drawn[0];
      await stack('active').pass(stack('discard'),[card.id],{chatNotification:false});
      const value=Math.max(min,Math.min(max,card.value+Math.max(0,-app.after)+bonus));flips.push(`${card.name}: ${value}`);result=criticalEffect(level,value);
      if(!result.reroll)break;level=result.reroll;min=result.min??0;max=result.max??Infinity;
    }
    assert(result?.text,'Требуется ручное разрешение перехода между таблицами.');
    const location={rams:'грудь',tomes:'голова',crows:'рука',masks:'нога'}[card.suit]??'место выбирает мастер (джокер)';
    d.criticalResult=`Критический эффект (${location}): ${result.text} Карты: ${flips.join('; ')}. Состояния и их сроки контролирует мастер.`;
    d.criticalConsciousness=result.consciousness;
    app.after-=result.extra;app.afterConditions=[app.afterConditions,d.criticalResult].filter(Boolean).join('\n');
    const effects=foundry.utils.deepClone(target.system.effects??[]),count=target.system.turnCount??0;
    for(const kind of result.effects??[]){const temporary=['stunned','negative','slow','paralyzed'].includes(kind);effects.push({id:`${m.id}-${kind}`,kind,source:m.id,ends:temporary?count+1:0,starts:kind==='negative'?count+1:0});}
    app.afterEffects=effects;app.afterBleeding=target.system.living?target.system.bleeding+(result.bleeding??0):0;
    const current=game.combat?.started&&game.combat.combatant?.actor?.uuid===target.uuid;
    const changes={'system.wounds.value':app.after,'system.conditions':app.afterConditions,'system.effects':effects,'system.bleeding':app.afterBleeding};
    if(result.prone)changes['system.prone']=true;
    if(app.afterBleeding>=10){changes['system.dead']=true;changes['system.ap.value']=0;}
    if(result.effects?.includes('paralyzed'))changes['system.ap.value']=0;
    else if(current&&result.effects?.includes('slow')&&!hasEffect(target.system,'slow'))changes['system.ap.value']=Math.max(0,target.system.ap.value-1);
    app.afterAP=changes['system.ap.value']??target.system.ap.value;
    app.afterProne=changes['system.prone']??target.system.prone;app.afterDead=changes['system.dead']??target.system.dead;
    await target.update(changes);app.criticalPending=false;return saveDuel(m,d);
  }
  throw new Error('Неизвестное боевое действие.');
}
