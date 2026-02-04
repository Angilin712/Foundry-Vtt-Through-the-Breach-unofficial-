// =============================================
// Through the Breach System for Foundry VTT v13
// Главный файл системы
// =============================================

console.log('Through the Breach | Loading system...');

// Инициализация системы
Hooks.once('init', async function() {
  console.log('Through the Breach | Initializing system');

  // Регистрация конфигурации системы
  CONFIG.TTB = {
    abilities: {
      strength: "TTB.AbilityStr",
      agility: "TTB.AbilityAgi", 
      intellect: "TTB.AbilityInt",
      cunning: "TTB.AbilityCun",
      willpower: "TTB.AbilityWil",
      presence: "TTB.AbilityPre"
    },
    
    skills: {
      melee: "TTB.SkillMelee",
      shooting: "TTB.SkillShooting",
      spellcasting: "TTB.SkillSpellcasting",
      stealth: "TTB.SkillStealth",
      notice: "TTB.SkillNotice",
      persuasion: "TTB.SkillPersuasion",
      intimidation: "TTB.SkillIntimidation",
      investigation: "TTB.SkillInvestigation",
      repair: "TTB.SkillRepair",
      survival: "TTB.SkillSurvival"
    },
    
    suits: {
      'rams': 'TTB.SuitRams',
      'tomes': 'TTB.SuitTomes',
      'masks': 'TTB.SuitMasks',
      'crows': 'TTB.SuitCrows'
    },
    
    ranks: ['Novice', 'Seasoned', 'Veteran', 'Master']
  };

  // Регистрируем типы акторов
  CONFIG.Actor.typeLabels = {
    "character": "TTB.Character",
    "npc": "TTB.NPC"
  };

  // Регистрируем типы предметов
  CONFIG.Item.typeLabels = {
    "talent": "TTB.Talent",
    "spell": "TTB.Spell", 
    "weapon": "TTB.Weapon",
    "equipment": "TTB.Equipment",
    "armor": "TTB.Armor"
  };

  // Назначаем классы документов
  CONFIG.Actor.documentClass = TtBActor;
  CONFIG.Item.documentClass = TtBItem;
  
  console.log('Through the Breach | System initialized');
});

// Хук для готовности
Hooks.once('ready', async function() {
  console.log('Through the Breach | System ready');
  
  // Регистрируем листы после полной загрузки
  await registerSheets();
});

// Регистрация листов
async function registerSheets() {
  try {
    console.log('Through the Breach | Registering sheets...');
    
    // Динамический импорт классов листов
    const characterSheetModule = await import('./actors/character-sheet.js');
    const npcSheetModule = await import('./actors/npc-sheet.js');
    const itemSheetModule = await import('./items/item-sheet.js');
    
    // Используем правильный namespace для v13
    const DocumentSheetConfig = foundry.applications.apps.DocumentSheetConfig;
    const ActorSheet = foundry.appv1.sheets.ActorSheet;
    const ItemSheet = foundry.appv1.sheets.ItemSheet;
    
    // Отменяем регистрацию стандартных листов
    DocumentSheetConfig.unregisterSheet(Actor, "core", ActorSheet);
    
    // Регистрируем наши листы для акторов
    DocumentSheetConfig.registerSheet(Actor, "through-the-breach", characterSheetModule.TtBCharacterSheet, {
      types: ["character"],
      makeDefault: true,
      label: "TTB.CharacterSheet"
    });
    
    DocumentSheetConfig.registerSheet(Actor, "through-the-breach", npcSheetModule.TtBNPCSheet, {
      types: ["npc"],
      makeDefault: true,
      label: "TTB.NPCSheet"
    });
    
    // Регистрируем листы предметов
    DocumentSheetConfig.unregisterSheet(Item, "core", ItemSheet);
    DocumentSheetConfig.registerSheet(Item, "through-the-breach", itemSheetModule.TtBItemSheet, {
      makeDefault: true,
      label: "TTB.ItemSheet"
    });
    
    console.log('Through the Breach | Sheets registered successfully');
  } catch (error) {
    console.error('Through the Breach | Error registering sheets:', error);
  }
}

// Хук на создание актора
Hooks.on('preCreateActor', (actorData, options, userId) => {
  console.log('Through the Breach | Creating actor:', actorData.name);
  
  if (!actorData.type) actorData.type = 'character';
  if (!actorData.img) actorData.img = 'icons/svg/mystery-man.svg';
  if (!actorData.system) actorData.system = {};
  
  // Полная инициализация данных для персонажа
  if (actorData.type === 'character') {
    actorData.system = {
      details: {
        concept: '',
        profession: '',
        pursuit: '',
        gender: '',
        age: '',
        height: '',
        weight: '',
        appearance: '',
        background: '',
        notes: ''
      },
      abilities: {
        strength: { value: 3, max: 13 },
        agility: { value: 3, max: 13 },
        intellect: { value: 3, max: 13 },
        cunning: { value: 3, max: 13 },
        willpower: { value: 3, max: 13 },
        presence: { value: 3, max: 13 }
      },
      skills: {
        melee: { value: 0, linked: 'strength' },
        shooting: { value: 0, linked: 'agility' },
        spellcasting: { value: 0, linked: 'willpower' },
        stealth: { value: 0, linked: 'agility' },
        notice: { value: 0, linked: 'intellect' },
        persuasion: { value: 0, linked: 'presence' },
        intimidation: { value: 0, linked: 'presence' },
        investigation: { value: 0, linked: 'intellect' },
        repair: { value: 0, linked: 'intellect' },
        survival: { value: 0, linked: 'cunning' }
      },
      attributes: {
        health: { value: 10, max: 10 },
        fate: { value: 3, max: 3 },
        wounds: { value: 0 },
        experience: { value: 0 },
        rank: { value: 'Novice' }
      },
      defenses: {
        defense: { value: 0 },
        soak: { value: 0 },
        armor: { value: 0 }
      }
    };
  }
  
  return actorData;
});

// Хук на создание предмета
Hooks.on('preCreateItem', (itemData, options, userId) => {
  console.log('Through the Breach | Creating item:', itemData);
  
  if (!itemData.type) itemData.type = 'talent';
  if (!itemData.img) {
    switch (itemData.type) {
      case 'talent': itemData.img = 'icons/svg/upgrade.svg'; break;
      case 'spell': itemData.img = 'icons/svg/fire.svg'; break;
      case 'weapon': itemData.img = 'icons/svg/sword.svg'; break;
      case 'armor': itemData.img = 'icons/svg/shield.svg'; break;
      default: itemData.img = 'icons/svg/item-bag.svg';
    }
  }
  
  return itemData;
});

// Хук на рендеринг листа для отладки
Hooks.on('renderActorSheet', (app, html, data) => {
  console.log('Through the Breach | Rendering actor sheet:', data.actor?.name, data.actor?.type);
});

// =============================================
// Базовый класс Актера
// =============================================
class TtBActor extends Actor {
  /** @override */
  constructor(data, context) {
    console.log('Through the Breach | Creating TtBActor instance:', data.name);
    super(data, context);
  }

  /** @override */
  prepareData() {
    super.prepareData();
    
    if (!this.system) this.system = {};
    
    // Инициализация всех структур данных
    this._initializeSystemData();
    
    // Вызываем расчет производных данных
    this.prepareDerivedData();
    
    // Подготавливаем встроенные документы (предметы)
    this.prepareEmbeddedDocuments();
    
    return this;
  }

  /** @override */
  prepareBaseData() {
    super.prepareBaseData();
  }

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
    
    const system = this.system;
    
    // 1. Расчет Защиты (Defense): 3 + половина Ловкости (Agility)
    if (system.abilities?.agility) {
      const agility = system.abilities.agility.value || 3;
      if (!system.defenses) system.defenses = {};
      system.defenses.defense.value = 3 + Math.floor(agility / 2);
    }
    
    // 2. Расчет макс. Здоровья (Health): 10 + половина Силы Воли (Willpower)
    if (system.abilities?.willpower) {
      const willpower = system.abilities.willpower.value || 3;
      system.attributes.health.max = 10 + Math.floor(willpower / 2);
      
      // Корректируем текущее здоровье
      if (system.attributes.health.value > system.attributes.health.max) {
        system.attributes.health.value = system.attributes.health.max;
      }
    }
    
    // 3. Расчет тоталов навыков (Skill Totals)
    if (system.skills && system.abilities) {
      this._calculateSkillTotals();
    }
    
    // 4. Расчет Стойкости (Soak): Базовая + Бонус от Силы (Strength)
    if (system.abilities?.strength) {
      const strength = system.abilities.strength.value || 3;
      const baseSoak = system.defenses?.soak?.value || 0;
      system.defenses.soak.value = baseSoak + Math.floor(strength / 2);
    }
    
    console.log(`Through the Breach | Derived stats calculated for: ${this.name}`);
  }

  /** @override */
  prepareEmbeddedDocuments() {
    super.prepareEmbeddedDocuments();
    
    // Сортируем предметы по типам для удобного доступа
    if (this.items) {
      this.itemTypes = {
        talents: this.items.filter(i => i.type === 'talent'),
        spells: this.items.filter(i => i.type === 'spell'),
        weapons: this.items.filter(i => i.type === 'weapon'),
        equipment: this.items.filter(i => i.type === 'equipment'),
        armor: this.items.filter(i => i.type === 'armor')
      };
    }
  }

  // Инициализация данных системы
  _initializeSystemData() {
    if (!this.type) this.type = 'character';
    
    const system = this.system;
    
    // Инициализация деталей персонажа
    if (!system.details) system.details = {};
    const details = system.details;
    if (!details.concept) details.concept = '';
    if (!details.profession) details.profession = '';
    if (!details.pursuit) details.pursuit = '';
    if (!details.gender) details.gender = '';
    if (!details.age) details.age = '';
    if (!details.height) details.height = '';
    if (!details.weight) details.weight = '';
    if (!details.appearance) details.appearance = '';
    if (!details.background) details.background = '';
    if (!details.notes) details.notes = '';
    
    // Инициализация характеристик
    if (!system.abilities) system.abilities = {};
    const abilities = ['strength', 'agility', 'intellect', 'cunning', 'willpower', 'presence'];
    abilities.forEach(ability => {
      if (!system.abilities[ability]) {
        system.abilities[ability] = { value: 3, max: 13 };
      }
    });
    
    // Инициализация навыков
    if (!system.skills) system.skills = {};
    const skillDefinitions = {
      melee: 'strength',
      shooting: 'agility',
      spellcasting: 'willpower',
      stealth: 'agility',
      notice: 'intellect',
      persuasion: 'presence',
      intimidation: 'presence',
      investigation: 'intellect',
      repair: 'intellect',
      survival: 'cunning'
    };
    
    Object.entries(skillDefinitions).forEach(([skill, linkedAbility]) => {
      if (!system.skills[skill]) {
        system.skills[skill] = { value: 0, linked: linkedAbility };
      }
    });
    
    // Инициализация атрибутов
    if (!system.attributes) system.attributes = {};
    if (!system.attributes.health) system.attributes.health = { value: 10, max: 10 };
    if (!system.attributes.fate) system.attributes.fate = { value: 3, max: 3 };
    if (system.attributes.wounds === undefined) system.attributes.wounds = 0;
    if (system.attributes.experience === undefined) system.attributes.experience = 0;
    if (!system.attributes.rank) system.attributes.rank = { value: 'Novice' };
    
    // Инициализация защиты
    if (!system.defenses) system.defenses = {};
    if (system.defenses.defense === undefined) system.defenses.defense = { value: 0 };
    if (system.defenses.soak === undefined) system.defenses.soak = { value: 0 };
    if (system.defenses.armor === undefined) system.defenses.armor = { value: 0 };
  }

  // Расчет тоталов навыков
  _calculateSkillTotals() {
    const system = this.system;
    
    if (!system.skillTotals) system.skillTotals = {};
    
    Object.entries(system.skills).forEach(([skillKey, skillData]) => {
      const abilityKey = skillData.linked;
      const abilityValue = system.abilities[abilityKey]?.value || 0;
      const skillValue = skillData.value || 0;
      
      // Общий бонус навыка = значение навыка + значение связанной характеристики
      system.skillTotals[skillKey] = skillValue + abilityValue;
      
      // Также сохраняем связанную характеристику для быстрого доступа
      skillData.linkedValue = abilityValue;
      skillData.total = system.skillTotals[skillKey];
    });
  }

  // Метод для проверки характеристики
  async rollAbility(abilityKey, difficulty = 10, options = {}) {
    const ability = this.system.abilities[abilityKey];
    if (!ability) {
      console.error(`Ability ${abilityKey} not found`);
      return null;
    }
    
    const abilityValue = ability.value;
    const roll = new Roll("1d13");
    await roll.evaluate();
    
    const success = roll.total <= abilityValue;
    const degree = abilityValue - roll.total; // Степень успеха
    
    const message = `
      <div class="ttb-roll ability-roll">
        <h3>${game.i18n.localize(`TTB.Ability${abilityKey.charAt(0).toUpperCase() + abilityKey.slice(1)}`)} Check</h3>
        <p><strong>Value:</strong> ${abilityValue}</p>
        <p><strong>Roll:</strong> ${roll.total}</p>
        <p><strong>Difficulty:</strong> ${difficulty}</p>
        <p class="result ${success ? 'success' : 'failure'}">
          <strong>${success ? game.i18n.localize('TTB.Success') : game.i18n.localize('TTB.Failure')}</strong>
          ${success ? ` (Degree: +${degree})` : ''}
        </p>
      </div>
    `;
    
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: message,
      flavor: `Ability Check: ${abilityKey}`
    });
    
    return {
      success,
      degree,
      roll: roll.total,
      ability: abilityValue
    };
  }

  // Метод для проверки навыка
  async rollSkill(skillKey, difficulty = 10, options = {}) {
    const skill = this.system.skills[skillKey];
    if (!skill) {
      console.error(`Skill ${skillKey} not found`);
      return null;
    }
    
    const total = skill.total || 0;
    const roll = new Roll("1d13");
    await roll.evaluate();
    
    const success = roll.total <= total;
    const degree = total - roll.total;
    
    const message = `
      <div class="ttb-roll skill-roll">
        <h3>${game.i18n.localize(`TTB.Skill${skillKey.charAt(0).toUpperCase() + skillKey.slice(1)}`)} Check</h3>
        <p><strong>Total:</strong> ${total} (Skill: ${skill.value} + ${skill.linked}: ${skill.linkedValue})</p>
        <p><strong>Roll:</strong> ${roll.total}</p>
        <p><strong>Difficulty:</strong> ${difficulty}</p>
        <p class="result ${success ? 'success' : 'failure'}">
          <strong>${success ? game.i18n.localize('TTB.Success') : game.i18n.localize('TTB.Failure')}</strong>
          ${success ? ` (Degree: +${degree})` : ''}
        </p>
      </div>
    `;
    
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: message,
      flavor: `Skill Check: ${skillKey}`
    });
    
    return {
      success,
      degree,
      roll: roll.total,
      total
    };
  }

  /** @override */
  static async createDialog(data = {}, options = {}) {
    console.log('Through the Breach | Creating actor via dialog');
    
    return new Promise((resolve) => {
      new Dialog({
        title: "Create Actor",
        content: `
          <form>
            <div class="form-group">
              <label>Actor Type:</label>
              <select name="type" style="width: 100%">
                <option value="character">Character</option>
                <option value="npc">NPC</option>
              </select>
            </div>
            <div class="form-group">
              <label>Name:</label>
              <input type="text" name="name" value="New Actor" style="width: 100%">
            </div>
          </form>
        `,
        buttons: {
          create: {
            icon: '<i class="fas fa-check"></i>',
            label: "Create",
            callback: html => {
              const form = html.find('form')[0];
              const formData = new FormData(form);
              const actorData = {
                type: formData.get('type'),
                name: formData.get('name') || 'New Actor',
                img: 'icons/svg/mystery-man.svg'
              };
              
              Actor.create(actorData).then(resolve);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "create",
        close: () => resolve(null)
      }).render(true);
    });
  }
}

// =============================================
// Базовый класс Предмета
// =============================================
class TtBItem extends Item {
  /** @override */
  prepareData() {
    super.prepareData();
    
    // Инициализация данных предмета
    this._initializeSystemData();
    
    return this;
  }

  // Инициализация данных предмета
  _initializeSystemData() {
    if (!this.system) this.system = {};
    
    // Базовая структура для разных типов предметов
    switch (this.type) {
      case 'talent':
        if (!this.system.description) this.system.description = '';
        if (this.system.cost === undefined) this.system.cost = 0;
        if (!this.system.requirements) this.system.requirements = '';
        if (!this.system.rank) this.system.rank = 'Novice';
        if (!this.system.activation) this.system.activation = { type: 'none', cost: 0 };
        break;
        
      case 'spell':
        if (!this.system.description) this.system.description = '';
        if (!this.system.suit) this.system.suit = 'any';
        if (this.system.casting === undefined) this.system.casting = 0;
        if (!this.system.range) this.system.range = '';
        if (!this.system.duration) this.system.duration = '';
        if (!this.system.effect) this.system.effect = '';
        if (!this.system.requirements) this.system.requirements = '';
        break;
        
      case 'weapon':
        if (!this.system.description) this.system.description = '';
        if (!this.system.damage) this.system.damage = '2d6';
        if (!this.system.critical) this.system.critical = '3';
        if (!this.system.range) this.system.range = 'melee';
        if (!this.system.skill) this.system.skill = 'melee';
        if (this.system.hands === undefined) this.system.hands = 1;
        if (!this.system.properties) this.system.properties = [];
        break;
        
      case 'armor':
        if (!this.system.description) this.system.description = '';
        if (this.system.armor === undefined) this.system.armor = 0;
        if (this.system.soak === undefined) this.system.soak = 0;
        if (!this.system.location) this.system.location = 'torso';
        break;
        
      case 'equipment':
        if (!this.system.description) this.system.description = '';
        if (this.system.quantity === undefined) this.system.quantity = 1;
        if (this.system.weight === undefined) this.system.weight = 0;
        if (this.system.price === undefined) this.system.price = 0;
        break;
    }
  }

  /** @override */
  static async createDialog(data = {}, options = {}) {
    console.log('Through the Breach | Creating item via dialog');
    
    return new Promise((resolve) => {
      new Dialog({
        title: "Create Item",
        content: `
          <form>
            <div class="form-group">
              <label>Item Type:</label>
              <select name="type" style="width: 100%">
                <option value="talent">Talent</option>
                <option value="spell">Spell</option>
                <option value="weapon">Weapon</option>
                <option value="armor">Armor</option>
                <option value="equipment">Equipment</option>
              </select>
            </div>
            <div class="form-group">
              <label>Name:</label>
              <input type="text" name="name" value="New Item" style="width: 100%">
            </div>
          </form>
        `,
        buttons: {
          create: {
            icon: '<i class="fas fa-check"></i>',
            label: "Create",
            callback: html => {
              const form = html.find('form')[0];
              const formData = new FormData(form);
              const itemData = {
                type: formData.get('type'),
                name: formData.get('name') || 'New Item'
              };
              
              // Устанавливаем изображение по умолчанию
              if (!itemData.img) {
                switch (itemData.type) {
                  case 'talent': itemData.img = 'icons/svg/upgrade.svg'; break;
                  case 'spell': itemData.img = 'icons/svg/fire.svg'; break;
                  case 'weapon': itemData.img = 'icons/svg/sword.svg'; break;
                  case 'armor': itemData.img = 'icons/svg/shield.svg'; break;
                  default: itemData.img = 'icons/svg/item-bag.svg';
                }
              }
              
              Item.create(itemData).then(resolve);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "create",
        close: () => resolve(null)
      }).render(true);
    });
  }
}

// Экспорт классов
export { TtBActor, TtBItem };