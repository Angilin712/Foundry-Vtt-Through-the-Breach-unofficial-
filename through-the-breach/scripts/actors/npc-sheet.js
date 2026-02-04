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
    const actor = this.actor;
    
    context.system = actor.system || {};
    context.actor = actor;
    
    // Локализация характеристик
    context.labels = {
      abilities: {}
    };
    
    for (const [key, value] of Object.entries(CONFIG.TTB?.abilities || {})) {
      context.labels.abilities[key] = game.i18n.localize(value);
    }
    
    return context;
  }
  
  activateListeners(html) {
    super.activateListeners(html);
    
    // Простая обработка ввода
    html.find('input, textarea').change(ev => {
      const input = ev.currentTarget;
      const name = input.name;
      let value = input.value;
      
      if (input.type === 'number') {
        value = parseInt(value) || 0;
      }
      
      this.actor.update({ [name]: value });
    });
  }
}