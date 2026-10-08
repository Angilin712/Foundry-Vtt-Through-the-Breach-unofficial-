// Explicit faction wins over creature characteristics (a Neverborn can be undead).
export const FACTIONS = Object.freeze({
  neverborn:{label:'Нерождённые',color:'#8844bb'},
  resurrectionists:{label:'Воскрешатели',color:'#43a657'},
  guild:{label:'Гильдия',color:'#bd3838'},
  arcanists:{label:'Арканисты',color:'#368ac4'},
  outcasts:{label:'Изгои',color:'#d1b844'},
  tenThunders:{label:'Десять Громов',color:'#d88131'},
  bayou:{label:'Байу',color:'#9b6742'},
  neutral:{label:'Без фракции',color:'#668c8b'}
});
const normalize=s=>String(s??'').toLowerCase().replace(/ё/g,'е').replace(/[\s_-]+/g,' ');
export function factionFor({faction='',tags='',book='',page=0}={}){
  if(faction in FACTIONS)return faction;
  const explicit=normalize(faction);
  if(/ne[wv]erborn|нерожден|новорожден/.test(explicit))return 'neverborn';
  if(/resurrection|воскреш|воскрес/.test(explicit))return 'resurrectionists';
  const t=normalize(tags);
  if(/ne[wv]erborn|нерожден/.test(t))return 'neverborn';
  if(/resurrection|воскреш|воскрес/.test(t))return 'resurrectionists';
  // The Russian core bestiary is organised by faction. PDF page = printed page + 2.
  if(book==='book-13'){
    if(page>=323&&page<=336)return 'guild';
    if(page>=340&&page<=353)return 'outcasts';
    if(page>=354&&page<=363)return 'resurrectionists';
    if(page>=364&&page<=375)return 'neverborn';
    if(page>=376&&page<=383)return 'bayou';
    if(page>=384&&page<=395)return 'arcanists';
    if(page>=396&&page<=404)return 'tenThunders';
    if(page===408)return 'outcasts';
  }
  if(/nephilim|woe|mimic|nightmare|нефилим|горе|мимик|кошмар/.test(t))return 'neverborn';
  if(/undead|нежить/.test(t))return 'resurrectionists';
  if(/guardsman|witch hunter|death marshal|гвардеец|охотник на ведьм|маршал смерти/.test(t))return 'guild';
  if(/freikor|фра[йе]кор|void|пустота/.test(t))return 'outcasts';
  if(/gremlin|гремлин/.test(t))return 'bayou';
  return 'neutral';
}
export function tokenFrame({portrait, faction='neutral'}){
  const color=(FACTIONS[faction]??FACTIONS.neutral).color;
  if(!/^data:image\/(?:png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/.test(portrait))throw new Error('Токену требуется встроенный портрет.');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><clipPath id="portrait"><circle cx="256" cy="256" r="226"/></clipPath><radialGradient id="back"><stop stop-color="#404349"/><stop offset="1" stop-color="#15191e"/></radialGradient></defs><circle cx="256" cy="256" r="249" fill="#191e23"/><circle cx="256" cy="256" r="243" fill="${color}" stroke="#ceb477" stroke-width="4"/><g clip-path="url(#portrait)"><circle cx="256" cy="256" r="226" fill="url(#back)"/><image href="${portrait}" x="20" y="32" width="472" height="530" preserveAspectRatio="xMidYMin meet"/></g><circle cx="256" cy="256" r="226" fill="none" stroke="#dfc998" stroke-width="3"/><circle cx="256" cy="256" r="236" fill="none" stroke="#ffffff" stroke-opacity=".16" stroke-width="2"/></svg>`;
}
