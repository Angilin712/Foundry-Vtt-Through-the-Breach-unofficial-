export class TtBItemSheet extends foundry.appv1.sheets.ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["through-the-breach", "sheet", "item"],
      template: "systems/through-the-breach/templates/item/item-sheet.html",
      width: 500,
      height: 400
    });
  }
  
  getData() {
    const context = super.getData();
    context.system = context.item.system || {};
    return context;
  }
  
  activateListeners(html) {
    super.activateListeners(html);
    
    html.find('input, textarea').change(ev => {
      const input = ev.currentTarget;
      const name = input.name;
      const value = input.value;
      
      this.item.update({
        [name]: value
      });
    });
  }
}