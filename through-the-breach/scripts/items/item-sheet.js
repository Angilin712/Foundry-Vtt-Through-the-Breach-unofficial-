// Класс листа предмета
export class TtBItemSheet extends foundry.appv1.sheets.ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["through-the-breach", "sheet", "item"],
      template: "systems/through-the-breach/templates/item/item-sheet.html",
      width: 500,
      height: 400
    });
  }
}