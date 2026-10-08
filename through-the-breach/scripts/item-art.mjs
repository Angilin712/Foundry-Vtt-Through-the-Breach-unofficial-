import {ID} from './rules.mjs';

// These illustrations ship with Foundry; no external downloads are needed.
const icon=path=>`icons/${path}.webp`;
const magicNames={
 'Исцеление':'magic/nature/root-vine-caduceus-healing',
 'Заштопать критическое':'magic/nature/root-vine-caduceus-healing',
 'Оживить конструкт':'magic/symbols/cog-glowing-green',
 'Оживить конечность':'magic/death/hand-undead-skeleton-fire-green',
 'Физическое усиление':'magic/control/buff-strength-muscle-damage-red',
 'Ментальное усиление':'magic/control/control-influence-crown-gold',
 'Перевертыш':'magic/nature/elemental-plant-humanoid',
 'Маска трупа':'magic/symbols/mask-metal-silver-white',
 'Приманка':'magic/control/control-influence-puppet',
 'Допрос':'magic/control/control-influence-crown-yellow',
 'Захоронить':'magic/death/grave-tombstone-glow-teal',
 'Контроль над разумом':'magic/control/control-influence-puppet',
 'Поглотить труп':'magic/unholy/strike-body-life-soul-green',
 'Воскрешение Нежити':'magic/death/hand-dirt-undead-zombie',
 'Ужасающая аура':'magic/control/fear-fright-jackolanter-orange',
 'Невидимость':'magic/defensive/illusion-evasion-echo-purple',
 'Призыв':'magic/symbols/ring-circle-smoke-blue',
 'Фокусы в гостинной':'magic/control/buff-luck-fortune-gold',
 'Гадание':'magic/symbols/rune-sigil-green-purple',
 'Призрак':'magic/death/skeleton-skull-soul-blue',
 'Вихревые иллюзии':'magic/air/air-burst-spiral-large-pink',
 'Телепорт':'magic/symbols/ring-circle-smoke-blue',
 'Элементальное оружие':'magic/fire/dagger-rune-enchant-blue',
 'Элементальный снаряд':'magic/water/projectile-bolts-salvo-blue',
 'Элементальный захват':'magic/control/debuff-chains-orb-movement-blue',
 'Элементальный удар':'magic/light/beam-impact-deflect-teal',
 'Элементальная Нова':'magic/air/air-burst-spiral-large-teal-green',
 'Сон':'magic/control/sleep-bubble-purple',
 'Телекинетическое Движение':'magic/air/air-wave-gust-blue',
 'Призыв Гамина':'magic/nature/elemental-plant-humanoid',
 'Телекинетический толчок':'magic/air/air-burst-spiral-blue-gray',
 'Навыворот':'magic/unholy/strike-body-explode-disintegrate',
 'Дополнительная Масть':'magic/symbols/clover-luck-white-green',
 'Изменение Дальности':'magic/symbols/arrowhead-green',
 'Альтернативная сопротивляемость':'magic/defensive/shield-barrier-deflect-teal',
 'Взрыв':'magic/light/beam-explosion-orange',
 'Род Конструкта':'magic/symbols/cog-orange-red',
 'Комбинированное заклинание':'magic/symbols/elements-air-earth-fire-water',
 'Задержка':'commodities/tech/clock-stopwatch-brass',
 'Объект фокуса':'magic/symbols/circled-gem-pink',
 'Усилить Импульс':'magic/air/air-burst-spiral-large-blue',
 'Повысить урон':'magic/control/buff-strength-muscle-damage-orange',
 'Игнорировать персонажа':'magic/defensive/illusion-evasion-echo-purple',
 'Увеличить ОД':'commodities/tech/clock-watch-stopwatch',
 'Повышение сопротивляемости':'magic/defensive/armor-shield-barrier-steel',
 'Неодушевленный род':'magic/symbols/cog-shield-white-blue',
 'Увеличенная длительность':'commodities/tech/clock-stopwatch-brass',
 'Импульс':'magic/air/air-wave-gust-blue',
 'Живой род':'magic/nature/leaf-glow-green',
 'Род Местности':'magic/nature/leaf-elm-beam-green',
 'Уменьшить ОД':'commodities/tech/clock-watch-stopwatch',
 'Уменьшить урон':'magic/defensive/shield-barrier-deflect-gold',
 'Снизить сопротивление':'magic/defensive/illusion-evasion-echo-purple',
 'Уменьшить тяжесть':'magic/control/buff-flight-wings-blue',
 'Род нежити':'magic/death/bones-crossed-gray',
 'Тьма':'magic/unholy/silhouette-robe-evil-glow',
 'Разложение':'magic/acid/dissolve-bone-skull',
 'Электричество':'commodities/tech/tube-chamber-lightning',
 'Огонь':'magic/light/beam-explosion-orange',
 'Лед':'magic/water/barrier-ice-crystal-wall-faceted-blue',
 'Заражение':'magic/acid/dissolve-arm-flesh',
 'Ужас':'magic/control/fear-fright-jackolantern-yellow',
 'Свет':'magic/light/beam-rays-teal',
 'Природа':'magic/nature/leaf-glow-maple-green',
 'Ветер':'magic/air/air-wave-gust-blue',
 'Яд':'consumables/potions/potion-bottle-skull-label-poison-teal',
 'Дух':'magic/death/skeleton-skull-soul-blue',
 'Вода':'magic/water/wave-water-teal'
};
export function defaultArtwork(item){
 const s=item.system??{},name=item.name??'';
 if(item.type==='magic'){
  if(s.magicKind==='grimoire')return icon('sundries/books/book-worn-teal');
  return icon(magicNames[name]??(s.skill==='necromancy'?'magic/death/skeleton-skull-soul-blue':s.skill==='enchanting'?'magic/control/control-influence-crown-gold':s.skill==='prestidigitation'?'magic/defensive/illusion-evasion-echo-purple':'magic/symbols/rune-sigil-rough-white-teal'));
 }
 if(item.type==='equipment'){
  if(s.armorSlot)return icon(({head:'equipment/head/helmet-hardhat',chest:'equipment/chest/suit-armored-chest-plated',arms:'equipment/hand/glove-armored-leather-steel-brown',legs:'equipment/feet/boots-armored-banded-steel'})[s.armorSlot]??'equipment/chest/suit-armored-chest-plated');
  if(s.isWeapon){
   if(s.skill==='pistol')return icon('weapons/guns/pistol-revolver-steel');
   if(['longArms','shotgun','heavyGuns'].includes(s.skill))return icon('weapons/guns/gun-double-barrel');
   if(/нож|штык/i.test(name))return icon('weapons/daggers/dagger-black');
   if(/топор/i.test(name))return icon('weapons/axes/axe-battle-worn-eye');
   if(/молот|дубин|тонфа|посох/i.test(name))return icon('tools/hand/hammer-maul-wood');
   return icon('weapons/swords/greatsword-guard-split-eyes');
  }
  if(s.category==='toolkit'||name.startsWith('Набор:'))return icon('tools/hand/hammer-and-nail');
  return icon('sundries/books/book-worn-brown');
 }
 if(s.category==='pursuit')return icon('sundries/books/book-worn-red');
 if(s.category==='station')return `systems/${ID}/assets/cards/back.svg`;
 if(s.category==='skill')return icon('sundries/books/book-worn-green');
 return icon('magic/symbols/rune-sigil-rough-white-teal');
}
export const needsArtwork=item=>!item.img||['icons/svg/item-bag.svg','icons/svg/book.svg'].includes(item.img);
export const itemArtwork=item=>needsArtwork(item)?defaultArtwork(item):item.img;

// Only default thumbnails change; user-selected art and gameplay fields are retained.
export async function refreshDefaultArtwork(){
 if(game.settings.get(ID,'artworkVersion')>=1)return;
 for(const pack of game.packs){
  if(!pack.collection.startsWith(`${ID}.`)||pack.documentName!=='Item')continue;
  const docs=await pack.getDocuments(),updates=docs.filter(needsArtwork).map(i=>({_id:i.id,img:defaultArtwork(i)}));
  if(!updates.length)continue;
  const locked=pack.locked;
  try{await pack.configure({locked:false});await pack.documentClass.updateDocuments(updates,{pack:pack.collection});}
  finally{await pack.configure({locked});}
 }
 for(const actor of game.actors){
  const updates=actor.items.filter(needsArtwork).map(i=>({_id:i.id,img:defaultArtwork(i)}));
  if(updates.length)await actor.updateEmbeddedDocuments('Item',updates);
 }
 for(const item of game.items??[])if(needsArtwork(item))await item.update({img:defaultArtwork(item)});
 await game.settings.set(ID,'artworkVersion',1);
}
