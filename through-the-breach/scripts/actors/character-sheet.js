export class TtBCharacterSheet extends foundry.appv1.sheets.ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["through-the-breach", "sheet", "actor", "character"],
      template: "systems/through-the-breach/templates/actor/character-sheet.html",
      width: 800,
      height: 700,
      tabs: [{
        navSelector: ".sheet-tabs",
        contentSelector: ".sheet-body",
        initial: "attributes"
      }],
      dragDrop: [{ dragSelector: ".item", dropSelector: null }]
    });
  }

  getData() {
    const context = super.getData();
    
    // Добавляем локализацию
    context.system = context.actor.system || {};
    context.labels = {
      abilities: {},
      skills: {}
    };
    
    // Локализуем названия способностей
    for (const [key, ability] of Object.entries(context.system.abilities || {})) {
      context.labels.abilities[key] = game.i18n.localize(`TTB.Ability${key.charAt(0).toUpperCase() + key.slice(1)}`);
    }
    
    // Локализуем названия навыков
    for (const [key, skill] of Object.entries(context.system.skills || {})) {
      context.labels.skills[key] = game.i18n.localize(`TTB.Skill${key.charAt(0).toUpperCase() + key.slice(1)}`);
    }
    
    // Добавляем хелперы для шаблона
    context.helpers = {
      eq: (a, b) => a === b,
      sum: (a, b) => (parseInt(a) || 0) + (parseInt(b) || 0)
    };
    
    return context;
  }
  
  activateListeners(html) {
    super.activateListeners(html);
    
    // Роллабельные элементы
    html.find('.rollable').click(this._onRoll.bind(this));
    
    // Создание предметов
    html.find('.item-create').click(this._onItemCreate.bind(this));
    
    // Редактирование предметов
    html.find('.item-edit').click(ev => this._onItemEdit(ev));
    
    // Удаление предметов
    html.find('.item-delete').click(ev => this._onItemDelete(ev));
    
    // Drag & Drop
    html.find('.item').each((i, li) => {
      li.setAttribute("draggable", true);
      li.addEventListener("dragstart", event => this._onDragStart(event), false);
    });
  }
  
  _onRoll(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;
    
    if (dataset.roll === 'ability') {
      const ability = dataset.ability;
      const value = this.actor.system.abilities[ability].value;
      this._rollAbility(ability, value);
    } else if (dataset.roll === 'skill') {
      const skill = dataset.skill;
      const skillData = this.actor.system.skills[skill];
      const skillValue = skillData.value;
      const abilityValue = this.actor.system.abilities[skillData.linked].value;
      this._rollSkill(skill, skillValue + abilityValue);
    }
  }
  
  async _rollAbility(ability, value) {
    const roll = new Roll("1d13");
    await roll.evaluate();
    
    const success = roll.total <= value;
    const message = `
      <div class="ttb-roll">
        <h3>${game.i18n.localize(`TTB.Ability${ability.charAt(0).toUpperCase() + ability.slice(1)}`)} Check</h3>
        <p>Value: ${value}</p>
        <p>Roll: ${roll.total}</p>
        <p class="${success ? 'success' : 'failure'}">
          ${success ? game.i18n.localize('TTB.Success') : game.i18n.localize('TTB.Failure')}
        </p>
      </div>
    `;
    
    roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: message
    });
  }
  
  async _rollSkill(skill, total) {
    const roll = new Roll("1d13");
    await roll.evaluate();
    
    const success = roll.total <= total;
    const message = `
      <div class="ttb-roll">
        <h3>${game.i18n.localize(`TTB.Skill${skill.charAt(0).toUpperCase() + skill.slice(1)}`)} Check</h3>
        <p>Total: ${total}</p>
        <p>Roll: ${roll.total}</p>
        <p class="${success ? 'success' : 'failure'}">
          ${success ? game.i18n.localize('TTB.Success') : game.i18n.localize('TTB.Failure')}
        </p>
      </div>
    `;
    
    roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: message
    });
  }
  
  async _onItemCreate(event) {
    event.preventDefault();
    const type = event.currentTarget.dataset.type;
    
    const itemData = {
      name: `New ${type.charAt(0).toUpperCase() + type.slice(1)}`,
      type: type,
      system: {}
    };
    
    await Item.create(itemData, { parent: this.actor });
  }
  
  _onItemEdit(event) {
    event.preventDefault();
    const li = event.currentTarget.closest(".item");
    const item = this.actor.items.get(li.dataset.itemId);
    item.sheet.render(true);
  }
  
  async _onItemDelete(event) {
    event.preventDefault();
    const li = event.currentTarget.closest(".item");
    const item = this.actor.items.get(li.dataset.itemId);
    
    const confirmed = await Dialog.confirm({
      title: `Delete ${item.name}`,
      content: `<p>Are you sure you want to delete ${item.name}?</p>`,
      yes: () => true,
      no: () => false
    });
    
    if (confirmed) {
      await item.delete();
    }
  }
  
  _onDragStart(event) {
    const li = event.currentTarget;
    const itemId = li.dataset.itemId;
    
    if (itemId) {
      event.dataTransfer.setData("text/plain", JSON.stringify({
        type: "Item",
        actorId: this.actor.id,
        itemId: itemId
      }));
    }
  }
}