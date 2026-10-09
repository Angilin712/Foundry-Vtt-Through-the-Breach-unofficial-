import {ID,assert,integer} from './rules.mjs';

const elementalMagias=new Set(['magia-23','magia-24','magia-25']);
const elementalImmutos=new Set(['Тьма','Разложение','Электричество','Огонь','Лед','Заражение','Ужас','Свет','Природа','Ветер','Яд','Дух','Вода']);
const damageSteps=[[1,1,1],[1,1,2],[1,2,3],[1,3,4],[2,3,4],[2,4,5],[3,4,5],[3,5,6]];
export const catalogKey=i=>i?.getFlag?.(ID,'catalog')?.key??i?.flags?.[ID]?.catalog?.key??'';
export function spellCombatData(base,immutos=[],validate=true){
  const key=catalogKey(base),supportedDamage=elementalMagias.has(key)||base.system.magicDamage===true;
  let track=supportedDamage?String(base.system.magicDamage?base.system.damage:'1/2/3').split('/').map(n=>integer(n,0,999)):null;
  if(track)assert(track.length===3,'Урон магии требует три значения.');
  const effects=[],manualEffects=[];let delayed=false,elemental=false,damageAdjustment=0,trackAdjustment=0,increase=0,decrease=0,effectsOnZero=false,ignoreArmor=base.system.ignoreArmor===true;
  for(const {item,count=1} of immutos){
    const name=catalogKey(item).replace(/^immuto-/,'');elemental||=elementalImmutos.has(name);
    if(name==='Повысить урон'&&track){trackAdjustment+=count;increase+=count;}
    if(name==='Уменьшить урон'&&track){trackAdjustment-=count;decrease+=count;}
    if(['Электричество','Дух'].includes(name))ignoreArmor=true;
    if(name==='Уменьшить тяжесть'&&track)effectsOnZero=true;
    if(name==='Огонь'&&track)effects.push({kind:'burning',value:count});
    else if(name==='Яд'&&track)effects.push({kind:'poison',value:count});
    else if(name==='Лед'&&track)effects.push({kind:'ice',value:count});
    else if(elementalImmutos.has(name)&&!['Электричество','Дух'].includes(name))manualEffects.push(item.name);
    if(['Взрыв','Импульс','Игнорировать персонажа','Род Местности'].includes(name))manualEffects.push(`${item.name}: дополнительные цели и область разрешает мастер`);
    if(name==='Задержка'){delayed=true;manualEffects.push('Задержка: мастер подтверждает момент срабатывания перед применением');}
    if(name==='Комбинированное заклинание')manualEffects.push('Вторая Магия: дополнительный эффект разрешает мастер');
  }
  if(validate&&elementalMagias.has(key))assert(elemental,'Элементальная Магия требует хотя бы один Элементальный Иммуто.');
  if(track&&(increase||decrease)){
    if(track.every(n=>n===track[0])){const value=track[0]+Math.floor(increase/2)-decrease;assert(value>=1,'Фиксированный урон нельзя уменьшить ниже 1.');track=[value,value,value];}
    else {const index=damageSteps.findIndex(row=>row.join('/')===track.join('/'));assert(index>=0,'Шкала урона отсутствует в таблице Иммуто: разрешите изменение вручную.');assert(index+trackAdjustment>=0&&index+trackAdjustment<damageSteps.length,'Изменение урона выходит за таблицу книги.');track=[...damageSteps[index+trackAdjustment]];}
  }
  if(effectsOnZero)track=[0,0,0];
  return {damageTrack:track,effects,effectsOnZero,manualEffects,damageAdjustment,supportedDamage,ignoreArmor,delayed};
}
