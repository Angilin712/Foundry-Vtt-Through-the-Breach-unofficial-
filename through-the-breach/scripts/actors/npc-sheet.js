export class TtBNPCSheet extends foundry.appv1.sheets.ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["through-the-breach", "sheet", "actor", "npc"],
      template: "systems/through-the-breach/templates/actor/npc-sheet.html",
      width: 600,
      height: 500
    });
  }
}