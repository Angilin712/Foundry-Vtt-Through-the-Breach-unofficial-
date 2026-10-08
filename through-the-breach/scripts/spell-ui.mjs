import {ID,SUITS,ASPECTS,SKILLS,escapeHTML as e} from './rules.mjs';
import {compileSpell,spellComponent,immutoRule} from './spell-builder.mjs';
import {request} from './cards.mjs';
const {ApplicationV2,HandlebarsApplicationMixin}=foundry.applications.api;
const options=(list,selected)=>list.map(([k,v])=>`<option value="${e(k)}" ${String(k)===String(selected)?'selected':''}>${e(v)}</option>`).join('');
const label=(name,html)=>`<label>${e(name)}${html}</label>`;
export class SpellBuilder extends HandlebarsApplicationMixin(ApplicationV2){
  static DEFAULT_OPTIONS={classes:['ttb','ttb-spell-builder'],window:{title:'Конструктор заклинаний',resizable:true},position:{width:700,height:720},actions:{add:SpellBuilder.add,remove:SpellBuilder.remove,save:SpellBuilder.save}};
  static PARTS={body:{template:`systems/${ID}/templates/spell-builder.hbs`,scrollable:['.ttb-body']}};
  constructor(actor){super();this.actor=actor;this.draft={baseId:'',immutos:[]};this.spellName='';this.saving=false;}
  components(kind){return this.actor.items.filter(i=>{try{spellComponent(this.actor,i.id,kind);return true;}catch{return false;}});}
  rowHTML(row,index){
    const i=this.actor.items.get(row.itemId),rule=i?immutoRule(i):{max:1},s=i?.system;
    const field=(name,html)=>label(name,html),select=(name,values,value)=>`<select data-row="${index}" data-field="${name}">${options(values,value)}</select>`,input=(name,value,min,max)=>`<input data-row="${index}" data-field="${name}" type="number" min="${min}" max="${max}" value="${e(value)}">`;
    let html=field('Иммуто',select('itemId',[['','Выберите Иммуто'],...this.components('immuto').map(i=>[i.id,i.name])],row.itemId));
    if(i){html+=field('Количество применений',input('count',row.count,1,rule.max));
      if(rule.parameter==='suit')html+=field('Добавляемая обязательная масть',select('suit',Object.entries(SUITS),row.suit));
      if(rule.parameter==='range')html+=field('Направление (количество выше — число шагов)',select('choice',[['up','Увеличить: +2 СЛ за шаг'],['down','Уменьшить: −2 СЛ за шаг']],row.choice));
      if(rule.parameter==='delay'){html+=field('Тип задержки',select('choice',[['rounds','Раунды: +2 СЛ'],['condition','Условие: +5 СЛ']],row.choice));if(row.choice==='rounds')html+=field('Через сколько раундов',input('rounds',row.rounds,1,10));else html+=field('Условие срабатывания',`<input data-row="${index}" data-field="text" value="${e(row.text)}" maxlength="200">`);}
      if(rule.parameter==='focus'){
        html+=field('Объект фокуса',`<input data-row="${index}" data-field="text" value="${e(row.text)}" maxlength="200" ${s.focusObject?'readonly':''}>`);
        html+=field('Портативность',select('portability',[[0,'В кармане: 0'],[1,'В одной руке: −1'],[2,'В обеих руках: −2'],[3,'Практически неподвижен: −3']],row.portability));
        html+=field('Редкость',select('rarity',[[0,'Легко заменить: 0'],[1,'Трудно заменить: −1'],[2,'Изготовлен для кастера: −2'],[3,'Уникален: −3']],row.rarity));
        html+='<p class="ttb-help">Объект закрепляется при первом сохранении и должен присутствовать при применении. Позже изменить его может мастер в записи Иммуто.</p>';
      }
      if(rule.parameter==='magia')html+=field('Вторая Магия',select('magiaId',[['','Выберите вторую Магию'],...this.components('magia').filter(x=>x.id!==this.draft.baseId).map(x=>[x.id,x.name])],row.magiaId));
      html+=`<details><summary>Описание Иммуто</summary><p class="ttb-help">${e(s.description)}</p></details>`;
    }
    return `<section class="ttb-record">${html}<button type="button" data-action="remove" data-index="${index}">Убрать Иммуто</button></section>`;
  }
  preview(){try{const p=compileSpell(this.actor,this.draft);return `<strong>СЛ ${p.tn} ${e(p.required)} · ${p.ap} ОД</strong><p>${e(SKILLS[p.skill].label)} · ${e(ASPECTS[p.aspect])} · ${e(p.range)}${p.resistance?' · сопротивление: '+(p.resistance==='defense'?'Защита':'Сила воли'):''}</p><ul>${p.breakdown.map(t=>`<li>${e(t)}</li>`).join('')}</ul>${p.ap>2?'<p class="ttb-help">Больше 2 ОД: в бою потребуется достаточно ОД в текущем ходу. Особые правила теорий и произнесение через несколько ходов пока разрешаются вручную.</p>':''}`;}catch(err){return `<p class="ttb-alert">${e(err.message)}</p>`;}}
  async _prepareContext(){return {html:`<div class="ttb-body"><p>Выберите известную Магию, затем добавьте Иммуто. Если основ нет, добавьте Магии и Иммуто из библиотеки и настройтесь на их Гримуар.</p>${label('Название заклинания','<input data-name maxlength="120" value="'+e(this.spellName)+'">')}${label('1. Основа — Магия','<select data-base>'+options([['','Выберите Магию'],...this.components('magia').map(i=>[i.id,i.name])],this.draft.baseId)+'</select>')}<h3>2. Иммуто</h3>${this.draft.immutos.map((r,i)=>this.rowHTML(r,i)).join('')}<button type="button" data-action="add" ${!this.draft.baseId?'disabled':''}>Добавить Иммуто</button><section class="ttb-record ttb-spell-preview" aria-live="polite">${this.preview()}</section><p class="ttb-help">Система рассчитывает сложность произнесения, масти, ОД, дальность и замену сопротивления. Совместимость, теория, урон, длительность и остальные эффекты проверяются по описанию и разрешаются мастером.</p><button type="button" data-action="save" ${this.saving?'disabled':''}>Сохранить в лист персонажа</button></div>`};}
  _onRender(context,options){super._onRender(context,options);
    this.element.querySelector('[data-name]').addEventListener('input',event=>{this.spellName=event.target.value;});
    this.element.querySelector('[data-base]').addEventListener('change',event=>{this.draft.baseId=event.target.value;this.draft.immutos=[];if(!this.spellName)this.spellName=this.actor.items.get(this.draft.baseId)?.name??'';this.render();});
    this.element.querySelectorAll('[data-row]').forEach(el=>{
      const update=()=>{
      const row=this.draft.immutos[Number(el.dataset.row)],key=el.dataset.field;row[key]=['count','rounds','portability','rarity'].includes(key)?Number(el.value):el.value;
      if(key==='itemId'){const s=this.actor.items.get(row.itemId)?.system;Object.assign(row,{count:1,suit:'rams',choice:immutoRule(this.actor.items.get(row.itemId)||{system:{maxCopies:1}}).parameter==='delay'?'rounds':'up',rounds:1,text:s?.focusObject??'',portability:s?.focusPortability??0,rarity:s?.focusRarity??0,magiaId:''});}
      if(el.tagName==='SELECT')this.render();else this.element.querySelector('.ttb-spell-preview').innerHTML=this.preview();
      };
      el.addEventListener(el.tagName==='SELECT'?'change':'input',update);
    });
  }
  static add(){if(this.draft.immutos.length>=36)return;this.draft.immutos.push({itemId:'',count:1,suit:'rams',choice:'up',rounds:1,text:'',portability:0,rarity:0,magiaId:''});this.render();}
  static remove(_event,target){this.draft.immutos.splice(Number(target.dataset.index),1);this.render();}
  static async save(){if(this.saving)return;try{
    if(!this.actor.isOwner)throw Error('Нет прав на персонажа.');compileSpell(this.actor,this.draft);if(!this.spellName.trim())throw Error('Введите название заклинания.');
    this.saving=true;await this.render();await request({op:'buildSpell',actorUuid:this.actor.uuid,name:this.spellName,recipe:structuredClone(this.draft)});
    ui.notifications.info('Запрос на сохранение заклинания обработан мастером. Проверьте новую запись в листе.');await this.close();
  }catch(err){this.saving=false;ui.notifications.error(err.message);this.render();}}
}
