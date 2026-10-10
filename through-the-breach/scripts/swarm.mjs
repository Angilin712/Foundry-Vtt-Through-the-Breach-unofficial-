import {t as ttbT,tr as ttbTr} from './localization.mjs';
import {assert,integer} from './rules.mjs';

// Multiple Bodies and Swarm Armour replace normal wounds, not just armour.
export function swarmDamage(system,damage,area=''){
  integer(damage,0,999);
  assert(['','blast','pulse'].includes(area),ttbT('Неизвестный тип урона по площади.'));
  if(!damage||area==='pulse'&&system.immunePulse)return 0;
  return area?Math.max(1,damage-(system.swarmAreaReduction??0)):1;
}
