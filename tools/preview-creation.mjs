// Static preview of the actual dialog renderer; never connects to a running world.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {actor,ID} from '../tests/harness.mjs';
const sources=JSON.parse(await readFile('through-the-breach/data/pack-sources.json','utf8'));
const tables=JSON.parse(await readFile('through-the-breach/data/tarot.json','utf8'));
game.packs=new Map(Object.entries(sources).map(([name,docs])=>[`${ID}.${name}`,{getDocuments:async()=>docs.map(d=>({...d,uuid:`Compendium.${ID}.${name}.Item.${d._id}`}))}]));
globalThis.fetch=async()=>({ok:true,json:async()=>tables});
foundry.applications={api:{DialogV2:{prompt:async opts=>{await mkdir('output/preview',{recursive:true});await writeFile('output/preview/creation.html',`<!doctype html><html lang="ru"><meta charset="utf-8"><title>Предпросмотр создания — 0.5.0</title><link rel="stylesheet" href="../../through-the-breach/styles/system.css"><style>body{background:#211d27;color:#eee;font:16px system-ui;margin:0}main{width:680px;margin:30px auto;background:#f4efe5;color:#201d1b;padding:22px;border-radius:10px}select,input,textarea{font:inherit;min-width:0;max-width:100%;padding:6px}h1{font-size:22px}button{padding:10px;margin-top:12px}</style><main><h1>${opts.window.title}</h1><p>Статический предпросмотр; игровой мир не изменяется.</p><form>${opts.content}<button>${opts.ok.label}</button></form></main></html>`);return null;}}}};
const a=actor('Новый Сужденный');a.getFlag=()=>({cards:[{value:1,suit:'rams'},{value:11,suit:'masks'},{value:14,suit:''},{value:1,suit:'crows'},{value:0,suit:''}],form:{}});
const {createCharacter}=await import('../through-the-breach/scripts/creation-ui.mjs');
await createCharacter(a);console.log('output/preview/creation.html');
