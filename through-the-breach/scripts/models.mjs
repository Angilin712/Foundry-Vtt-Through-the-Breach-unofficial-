import {ASPECTS,SKILLS,DEFAULT_TWIST,derived} from "./rules.mjs";
const {SchemaField,NumberField,StringField,BooleanField,ArrayField}=foundry.data.fields;
const number=(initial=0,min=-100,max=100)=>new NumberField({required:true,nullable:false,integer:true,initial,min,max});
const string=(initial="")=>new StringField({required:true,nullable:false,initial});
export class BreachActorModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {return {
    aspects:new SchemaField(Object.fromEntries(Object.keys(ASPECTS).map(k=>[k,number(0,-5,10)]))),
    skills:new SchemaField(Object.fromEntries(Object.values(SKILLS).map(k=>[k.id,new SchemaField({rank:number(0,0,5),aspect:string(k.aspect),suits:string(),trigger:string()})]))),
    bonuses:new SchemaField(Object.fromEntries(["defense","willpower","wounds","initiative","walk","charge"].map(k=>[k,number()]))),
    wounds:new SchemaField({value:number(4,-100,999)}),ap:new SchemaField({value:number(2,0,99),max:number(2,0,99)}),
    armor:number(0,0,3),height:number(2,0,99),rank:number(5,0,20),walkRoundUp:new BooleanField({initial:true}),unconscious:new BooleanField({initial:false}),prone:new BooleanField({initial:false}),
    living:new BooleanField({initial:true}),dead:new BooleanField({initial:false}),bleeding:number(0,0,99),turnCount:number(0,0,999999),
    openWoundFirst:new BooleanField({initial:false}),
    effects:new ArrayField(new SchemaField({id:string(),kind:string(),ends:number(0,0,999999),starts:number(0,0,999999),source:string()})),
    xp:number(0,0,9999),scrip:new NumberField({initial:10,min:0,required:true,nullable:false}),
    pursuit:string(),station:string(),characteristics:string("Живой, Сужденный"),player:string(),
    fate:string(),notes:string(),conditions:string(),magicTheory:string(),grimoire:string(),
    twist:new ArrayField(string(),{initial:DEFAULT_TWIST}),
    weapons:new ArrayField(new SchemaField({name:string(),skill:string("melee"),range:string(),damage:string("1/2/3"),notes:string()})),
    gear:string(),talents:string()
  };}
  prepareDerivedData(){super.prepareDerivedData();this.computed=derived(this);this.wounds.max=this.computed.wounds;}
}
export class BreachItemModel extends foundry.abstract.TypeDataModel {
  static defineSchema(){return {description:string(),quantity:number(1,0,9999),isWeapon:new BooleanField({initial:false}),skill:string("melee"),range:string("1 ярд"),damage:string("1/2/3"),defense:string("defense"),ignoreArmor:new BooleanField({initial:false}),apCost:number(1,0,99)};}
}
