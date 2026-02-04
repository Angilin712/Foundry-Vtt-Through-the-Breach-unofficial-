export class TtBNPCSheet extends foundry.appv1.sheets.ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["through-the-breach", "sheet", "actor", "npc"],
      template: "systems/through-the-breach/templates/actor/npc-sheet.html",
      width: 600,
      height: 600,
      tabs: [{
        navSelector: ".sheet-tabs",
        contentSelector: ".sheet-body",
        initial: "attributes"
      }]
    });
  }

  getData() {
    const context = super.getData();
    
    // Добавляем локализацию
    context.system = context.actor.system || {};
    context.labels = {
      abilities: {}
    };
    
    // Локализуем названия способностей
    for (const [key, ability] of Object.entries(context.system.abilities || {})) {
      context.labels.abilities[key] = game.i18n.localize(`TTB.Ability${key.charAt(0).toUpperCase() + key.slice(1)}`);
    }
    
    return context;
  }
  
  activateListeners(html) {
    super.activateListeners(html);
    
    // Простая обработка ввода для NPC
    html.find('input').change(ev => {
      this._onChangeInput(ev);
    });
  }
  
  _onChangeInput(event) {
    const input = event.currentTarget;
    const value = input.value;
    const name = input.name;
    
    // Обновляем данные актора
    this.actor.update({
      [name]: value
    });
  }
}