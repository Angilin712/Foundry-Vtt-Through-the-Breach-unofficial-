import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {actor,gm,player,ID,engine} from '../tests/harness.mjs';
const require=createRequire(pathToFileURL(`${engine}/package.json`));
const Handlebars=require('handlebars');
class App {constructor(options={}){Object.assign(this,options);this.isEditable=true;}async _prepareContext(){return {};}get document(){return this.actor;}}
foundry.applications={api:{ApplicationV2:App,HandlebarsApplicationMixin:C=>C,DialogV2:{}},sheets:{ActorSheetV2:App,ItemSheetV2:App}};
const {BreachSheet,FateTable}=await import('../through-the-breach/scripts/ui.mjs');
const {execute}=await import('../through-the-breach/scripts/cards.mjs');
game.system=JSON.parse(await readFile('through-the-breach/system.json','utf8'));
const a=actor('Эвелин Харт');a.img=pathToFileURL(path.resolve('through-the-breach/assets/cards/back.svg')).href;
a.system.aspects.might=1;a.system.aspects.grace=2;a.system.aspects.speed=1;a.system.aspects.cunning=2;a.system.aspects.resilience=1;
a.system.skills.pistol.rank=3;a.system.skills.notice.rank=2;a.system.skills.toughness.rank=2;
a.system.pursuit='Ганфайтер';a.system.station='Посыльная';a.system.player='Анна';a.system.gear='Револьвер · Пистолеты · 10 ярдов · 2/3/4 · 6 патронов\nДорожный плащ, записная книжка, фонарь.';
a.system.talents='Таланты записываются здесь. Их специальные эффекты в первой версии разрешает мастер.';
a.system.fate='Когда старый долг потребует платы, ты узнаешь цену данному слову.';
await execute(gm,{op:'setupActor',actorId:a.id});await execute(gm,{op:'prologue'});
Handlebars.registerHelper('checked',v=>v?'checked':'');
Handlebars.registerHelper('selectOptions',(values,options)=>new Handlebars.SafeString(Object.entries(values).map(([k,v])=>`<option value="${Handlebars.escapeExpression(k)}" ${k===options.hash.selected?'selected':''}>${Handlebars.escapeExpression(v)}</option>`).join('')));
const sheetTemplate=Handlebars.compile(await readFile('through-the-breach/templates/actor.hbs','utf8'));
const tableTemplate=Handlebars.compile(await readFile('through-the-breach/templates/table.hbs','utf8'));
const css=await readFile('through-the-breach/styles/system.css','utf8');
const out=path.resolve('output/preview');await mkdir(out,{recursive:true});
const bodies=[];
for(const tab of ['main','skills','fate','story']){const sheet=new BreachSheet({actor:a});sheet._tab=tab;bodies.push([tab,sheetTemplate(await sheet._prepareContext({}))]);}
bodies.push(['table',tableTemplate(await new FateTable()._prepareContext())]);
const npc=actor('Страж Гильдии','npc',gm);npc.img=a.img;const npcSheet=new BreachSheet({actor:npc});bodies.push(['npc',sheetTemplate(await npcSheet._prepareContext({}))]);
for(const [name,body] of bodies){const resolved=body.replaceAll(`systems/${ID}/`,pathToFileURL(path.resolve(`through-the-breach`)).href+'/');await writeFile(path.join(out,`${name}.html`),`<!doctype html><html lang="ru"><meta charset="utf-8"><title>Предпросмотр: ${name}</title><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#17292b}button,input,select,textarea{font:inherit}button{cursor:pointer}.app{width:880px;height:900px;margin:auto;border:1px solid #9f8b62;box-shadow:0 15px 50px #0005}.window-content{height:100%}${css}</style><div class="ttb app"><form class="window-content">${resolved.replaceAll(pathToFileURL(path.resolve(".")).href+"/", "../../")}</form></div></html>`,'utf8');}
console.log("Rendered previews in output/preview");
