import {assert,integer,SKILLS} from './rules.mjs';

export function weaponData(item){
  assert(item?.system.isWeapon,'Выберите предмет, отмеченный как оружие.');
  const s=item.system;assert(s.skill in SKILLS,'У оружия не выбран известный навык.');
  const track=String(s.damage).split('/').map(n=>integer(n,0,999));
  assert(track.length===3 && track.every((n,i)=>i===0||n>=track[i-1]),'Урон оружия: три возрастающих значения, например 2/3/4.');
  assert(['defense','willpower'].includes(s.defense),'Выберите Защиту или Силу воли.');
  return {id:item.id,name:item.name,skill:s.skill,range:s.range,track,defense:s.defense,ignoreArmor:s.ignoreArmor};
}
export function reducedDamage(raw,armor,ignore=false){
  raw=integer(raw,0,999);armor=integer(armor,0,3);
  return raw===0?0:Math.max(1,raw-(ignore?0:armor));
}
export function compareCombatants(a,b){
  const n=(b.initiative??-Infinity)-(a.initiative??-Infinity);
  if(n&&!Number.isNaN(n))return n;
  const f=Number(b.actor?.type==='fated')-Number(a.actor?.type==='fated');if(f)return f;
  return (b.actor?.system.aspects.speed??0)-(a.actor?.system.aspects.speed??0)
    || (a.flags?.['through-the-breach']?.tieOrder??0)-(b.flags?.['through-the-breach']?.tieOrder??0)
    || a.id.localeCompare(b.id);
}
export function criticalEffect(level,value){
  const rows={
    weak:['Критический эффект отсутствует.','Ошеломлён до конца следующего хода.','Сбит с ног.','Минус к дуэлям следующего хода.','Замедлен до конца следующего хода.','Ещё 1 повреждение, без нового критического эффекта.','Парализован до конца следующего хода.'],
    moderate:['','Уродливая рана: минус к социальным дуэлям, пока рана не скрыта.','Гипервентиляция: СЛ действий +2; действие «Пропуск» позволяет пройти Жесткость СЛ 8 + отрицательные Раны для снятия.','Бесполезная конечность до конца сцены; для груди или головы — Ошеломлён до конца сцены.','Немедленная проверка на потерю сознания: Жесткость, СЛ 8 + отрицательные Раны.','Глубокая рана: следующие критические эффекты в этом месте получают +2 к значению карты.','Проникающая рана: в начале хода выбрать Замедление либо получить 2 урона со слабым критическим эффектом.'],
    severe:['','Повреждены органы: ещё 2 повреждения, без нового критического эффекта.','Сломанная кость: конечность бесполезна; голова — минус к психическим Соревнованиям, грудь — минус к физическим.','Кровотечение +1.','Травма нервов: при связанных с поражённым местом действиях — проверка на потерю сознания СЛ 8 + отрицательные Раны.','Покалечен: постоянная потеря функции поражённого места; подробности — стр. 305.','Мучительная боль: в начале хода на 1 Общее ОД меньше.','Открытая рана: в конце каждого хода Кровотечение +1.','Разорванная артерия: Кровотечение +3; живой персонаж проверяет потерю сознания СЛ 8 + отрицательные Раны.','Оторвано: конечность уничтожена, Кровотечение +5; поражение головы или груди смертельно. Живой персонаж проверяет потерю сознания СЛ 10 + отрицательные Раны.','Кровавая баня: как «Оторвано», также дуэль Ужаса для живых в импульсе 4 ярда; см. стр. 305.']
  };
  assert(level in rows,'Неизвестная таблица критических эффектов.');
  if(level==='weak'&&value>=15)return {reroll:'moderate',min:3};
  if(level==='moderate'&&value<=2)return {reroll:'weak',max:14};
  if(level==='moderate'&&value>=15)return {reroll:'severe',min:3};
  if(level==='severe'&&value<=2)return {reroll:'moderate',max:14};
  const i=Math.min(rows[level].length-1,Math.max(0,Math.floor((value-1)/2)));
  const consciousness=level==='moderate'&&i===4?{baseTN:8,repeat:false,livingOnly:false}
    :level==='severe'&&i===4?{baseTN:8,repeat:true,livingOnly:false}
    :level==='severe'&&i>=8?{baseTN:i===8?8:10,repeat:false,livingOnly:true}:null;
  return {text:rows[level][i],extra:level==='weak'&&i===5?1:level==='severe'&&i===1?2:0,consciousness};
}
