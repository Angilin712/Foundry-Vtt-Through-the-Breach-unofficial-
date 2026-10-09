import {swarmDamage} from './swarm.mjs';
import {consumeWeapon} from './automation.mjs';
import {statRank,ID,SKILLS,assert,integer,derived,armorValue,outcome,accuracy,escapeHTML as e} from './rules.mjs';
import {weaponData,reducedDamage,criticalEffect} from './battle.mjs';
import {stack,startDuel,saveDuel,actorFor,drawFrom,requireReady,duelPlan,duelFateModifiers} from './cards.mjs';
import {canAct,hasEffect,actionPenalty} from './turns.mjs';

export function attackMargin(d){
  const r=outcome(d);if(!r||!d.attack)return null;
  if(d.attack.kind==='spell'&&!r.success)return null;
  if(d.opposed){const other=game.messages.get(d.opposed.otherId)?.getFlag(ID,'duel');if(!other?.closed||!d.closed||other.stage==='cancelled')return null;const margin=r.total-outcome(other).total;return margin>=0?margin:null;}
  if(d.attack.defending)return r.success?null:d.tn-r.total;
  return r.success?d.attack.kind==='spell'?Math.max(0,r.total-d.attack.defenseTN):r.margin:null;
}
export function battleButtons(d){
  if(d.stage==='cancelled')return '';
  let html='';
  if(d.closed&&d.attack&&attackMargin(d)!==null&&!d.damageMessageId)html+=`<button type="button" data-ttb="attackDamage">${d.attack.effectsOnZero?'Разрешить вторичные эффекты (без урона)':'Флип урона атаки'}</button>`;
  if(d.closed&&d.kind==='damage'&&d.targetUuid&&!d.application)html+='<button type="button" data-ttb="applyDamage">Применить урон к цели</button>';
  if(d.application&&!d.application.undone&&!d.application.pending&&!d.application.criticalPending){
    if(!d.consciousnessMessageId&&!d.criticalConsciousnessMessageId)html+='<button type="button" data-ttb="undoDamage">Отменить применение урона</button>';
    if(d.application.criticalLevel&&!d.criticalResult)html+='<button type="button" data-ttb="critical">Критический эффект</button>';
    if(d.application.resource!=='rank'&&d.application.amount>0&&d.application.after<=0&&!d.consciousnessMessageId)html+='<button type="button" data-ttb="consciousness">Проверка сознания</button>';
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
    const aspect=weapon.aspect||k.aspect,bonus=integer(p.bonus??0)+weapon.bonus;
    assert(weapon.defense!=='willpower'||!target.system.immuneWillpower,'Цель невосприимчива к дуэлям Силы воли.');
    const targetStat=derived(target.system)[weapon.defense];
    if(source.type==='fated'&&target.type==='fated'&&!target.system.unconscious)assert(user.isGM,'Дуэль двух Сужденных начинает мастер, задавая модификаторы обеих сторон.');
    requireReady(source);if(target.type==='fated'&&!target.system.unconscious)requireReady(target);
    integer(p.positive??0,0,99);integer(p.negative??0,0,99);integer(p.bonus??0);integer(p.defPositive??0,0,99);integer(p.defNegative??0,0,99);
    const sourceSpec={kind:'duel',skill:weapon.skill,aspect,tn:0,positive:p.positive,negative:p.negative,bonus,action:true,useFocus:p.useFocus,sight:p.sight!==false};
    const sourcePlan=duelPlan(source,sourceSpec),sourceFate=duelFateModifiers(source.system,sourceSpec);
    const targetFate=duelFateModifiers(target.system,{kind:'duel',skill:weapon.defense,positive:p.defPositive,negative:p.defNegative});
    if(target.type==='fated'&&!target.system.unconscious)duelPlan(target,{kind:'duel',skill:weapon.defense,tn:0,positive:p.defPositive??0,negative:p.defNegative??0});
    assert(source.items.get(p.itemId).system.equipped!==false&&source.items.get(p.itemId).system.quantity!==0,'Оружие недоступно или не подготовлено.');
    integer(targetStat+statRank(target.system,weapon.defense),0,99);
    await consumeWeapon(source,source.items.get(p.itemId),weapon.apCost);
    const attack={sourceUuid:source.uuid,targetUuid:target.uuid,targetName:target.name,weapon,damageFocus:sourcePlan.d.damageFocus,defending:source.type==='npc'&&target.type==='fated'&&!target.system.unconscious};
    if(attack.defending){
      const tn=sourcePlan.d.base-2*sourcePlan.d.mod+source.system.rank-actionPenalty(source.system);
      if(sourcePlan.focused.length)await source.update({'system.effects':source.system.effects.filter(x=>x.kind!=='focus')});
      return startDuel(target,{kind:'duel',skill:weapon.defense,tn,positive:sourceFate.negative+Number(p.defPositive??0),negative:sourceFate.positive+Number(p.defNegative??0),required:'',attack});
    }
    // Both Fated flip before either cheats. Ties are won by the aggressor.
    if(target.type==='fated'&&!target.system.unconscious){
      assert(user.isGM,'Дуэль двух Сужденных начинает мастер, задавая модификаторы обеих сторон.');
      requireReady(source);requireReady(target);
      const defense=await startDuel(target,{kind:'duel',skill:weapon.defense,tn:0,positive:p.defPositive??0,negative:p.defNegative??0});
      const offense=await startDuel(source,{...sourceSpec,bonus:bonus-actionPenalty(source.system),attack});
      const dd=foundry.utils.deepClone(defense.getFlag(ID,'duel')),od=foundry.utils.deepClone(offense.getFlag(ID,'duel'));
      dd.opposed={otherId:offense.id,role:'defense'};od.opposed={otherId:defense.id,role:'attack'};
      await saveDuel(defense,dd);await saveDuel(offense,od);return offense;
    }
    return startDuel(source,{...sourceSpec,tn:targetStat+statRank(target.system,weapon.defense),positive:Number(p.positive??0)+targetFate.negative,negative:Number(p.negative??0)+targetFate.positive,attack});
  }
  const {m,d}=messageOf(p.messageId);
  if(p.op==='attackDamage'){
    assert(d.closed&&d.stage!=='cancelled'&&attackMargin(d)!==null&&!d.damageMessageId,'Нет завершённой успешной атаки.');
    assert(!d.attack.delayed||user.isGM&&p.confirmed===true,'Срабатывание задержанного заклинания подтверждает мастер.');
    const a=actorFor(user,null,d.attack.sourceUuid),margin=attackMargin(d),mod=accuracy(margin)+(d.attack.damageFocus??d.damageFocus??0)+integer(p.positive??0,0,99)-integer(p.negative??0,0,99);
    requireReady(a);
    d.damageMessageId='pending';await saveDuel(m,d);
    const spec={kind:'damage',positive:Math.max(0,mod),negative:Math.max(0,-mod),track:d.attack.weapon.track,targetUuid:d.attack.targetUuid,ignoreArmor:d.attack.weapon.ignoreArmor,parentAttackId:m.id,damageEffects:d.attack.effects??[],effectsOnZero:d.attack.effectsOnZero===true,manualEffects:d.attack.manualEffects??[]};
    let child;
    if(spec.effectsOnZero){const effect=duelPlan(a,spec).d;Object.assign(effect,{cards:[{id:'effect-only',value:1,suit:'',name:'Вторичные эффекты — без флипа урона'}],selected:0,closed:true,stage:'closed'});child=await foundry.documents.ChatMessage.create({flags:{[ID]:{duel:effect}}});await saveDuel(child,effect);}
    else child=await startDuel(a,spec);
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
    assert(d.application&&d.application.resource!=='rank'&&d.application.amount>0&&!d.application.pending&&!d.application.criticalPending&&!d.application.undone&&d.application.after<=0&&!d.consciousnessMessageId,'Проверка сознания не требуется или уже выполнена.');
    const a=targetOf(d.targetUuid);assert(a.system.wounds.value===d.application.after,'Ранения цели изменились: проверьте сознание вручную по текущему состоянию.');
    if(a.type==='fated')requireReady(a);
    d.consciousnessMessageId='pending';await saveDuel(m,d);
    if(a.type==='npc'){
      const unconscious=a.system.rank<=6;
      if(unconscious)await a.update({'system.unconscious':true,'system.prone':true,'system.ap.value':0});d.consciousnessMessageId='rank';d.consciousnessResult=unconscious?'Прислужник/миньон теряет сознание, если критический эффект не игнорируется.':'Силовик или более высокий ранг автоматически сохраняет сознание.';
      return saveDuel(m,d);
    }
    const child=await startDuel(a,{kind:'duel',skill:'toughness',aspect:'resilience',tn:10,positive:0,negative:0,unconsciousCheck:true});d.consciousnessMessageId=child.id;return saveDuel(m,d);
  }
  const target=targetOf(d.targetUuid);
  if(p.op==='applyDamage'){
    assert(d.kind==='damage'&&d.closed&&d.stage!=='cancelled'&&!d.application,'Урон уже применён либо флип не завершён.');
    const r=outcome(d),swarm=target.type==='npc'&&target.system.rankWounds,resource=swarm?'rank':'wounds';
    const amount=swarm?swarmDamage(target.system,r.damage,p.areaDamage??''):reducedDamage(r.damage,armorValue(target.system),d.ignoreArmor||p.ignoreArmor===true),before=swarm?target.system.rank:target.system.wounds.value,after=swarm?Math.max(0,before-amount):before-amount;
    const level=swarm?null:r.critical?'severe':amount>0&&after<=0?(r.card.value<=5?'weak':r.card.value<=10?'moderate':'severe'):null;
    d.application={resource,before,after,amount,armor:armorValue(target.system),criticalLevel:level,beforeConditions:target.system.conditions,afterConditions:target.system.conditions,beforeUnconscious:target.system.unconscious};
    Object.assign(d.application,{beforeEffects:foundry.utils.deepClone(target.system.effects),afterEffects:foundry.utils.deepClone(target.system.effects),beforeBleeding:target.system.bleeding,afterBleeding:target.system.bleeding,beforeProne:target.system.prone,afterProne:target.system.prone,beforeDead:target.system.dead,afterDead:target.system.dead,beforeAP:target.system.ap.value,afterAP:target.system.ap.value});
    // Record intent before mutation. Interrupted application cannot be replayed silently.
    d.application.pending=true;await saveDuel(m,d);
    const changes={[swarm?'system.rank':'system.wounds.value']:after};
    if(amount>0||d.effectsOnZero&&r.card.value!==0){
      const effects=foundry.utils.deepClone(target.system.effects),wasSlow=hasEffect(target.system,'slow'),current=game.combat?.started&&game.combat.combatant?.actor?.uuid===target.uuid;
      for(const effect of d.damageEffects??[]){
        let kind=effect.kind;
        if(kind==='poison'&&!target.system.living)continue;
        if(kind==='ice')kind=effect.value>=2&&wasSlow?'paralyzed':'slow';
        assert(['burning','poison','slow','paralyzed'].includes(kind),'Неизвестный эффект урона.');
        if(kind==='slow'&&effects.some(x=>x.kind==='fast')){effects.splice(0,effects.length,...effects.filter(x=>!['fast','slow'].includes(x.kind)));if(current&&!wasSlow)changes['system.ap.value']=Math.max(0,target.system.ap.value-1);continue;}
        const value=['burning','poison'].includes(kind)?effect.value:1,old=effects.find(x=>x.kind===kind),ends=['slow','paralyzed'].includes(kind)?target.system.turnCount+(current?0:1):0;
        if(old){if(['burning','poison'].includes(kind))old.value=(old.value??1)+value;old.ends=!old.ends||!ends?0:Math.max(old.ends,ends);}
        else effects.push({id:foundry.utils.randomID(),kind,value,ends,starts:0,source:m.id,endPhase:'end'});
        if(kind==='paralyzed')changes['system.ap.value']=0;
        else if(kind==='slow'&&current&&!wasSlow)changes['system.ap.value']=Math.max(0,target.system.ap.value-1);
      }
      changes['system.effects']=effects;d.application.afterEffects=effects;d.application.afterAP=changes['system.ap.value']??target.system.ap.value;
    }
    if(swarm&&after===0){changes['system.dead']=true;changes['system.ap.value']=0;d.application.afterDead=true;d.application.afterAP=0;}
    await target.update(changes);d.application.pending=false;return saveDuel(m,d);
  }
  const app=d.application;assert(app&&!app.undone&&!app.pending&&!app.criticalPending,'Нет завершённого применения урона или критический эффект прерван.');
  assert((app.resource==='rank'?target.system.rank:target.system.wounds.value)===app.after&&target.system.conditions===app.afterConditions,'Цель изменилась после применения. Проверьте её лист вручную, чтобы не затереть новые изменения.');
  if(app.afterEffects)assert(JSON.stringify(target.system.effects)===JSON.stringify(app.afterEffects)&&target.system.bleeding===app.afterBleeding&&target.system.ap.value===app.afterAP&&target.system.prone===app.afterProne&&target.system.dead===app.afterDead,'Состояния или ОД цели изменились: восстановление вручную.');
  if(p.op==='undoDamage'){
    assert(!d.consciousnessMessageId&&!d.criticalConsciousnessMessageId,'После проверки сознания отмените последствия вручную, чтобы не затереть новые события.');
    const restore={[app.resource==='rank'?'system.rank':'system.wounds.value']:app.before,'system.conditions':app.beforeConditions,'system.unconscious':app.beforeUnconscious};
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
