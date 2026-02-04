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
    suits: {
      'rams': 'TTB.SuitRams',
      'tomes': 'TTB.SuitTomes',
      'masks': 'TTB.SuitMasks',
      'crows': 'TTB.SuitCrows'
    }
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
    "equipment": "TTB.Equipment"
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

// Регистрация листов (исправленная версия для v13)
async function registerSheets() {
  try {
    console.log('Through the Breach | Registering sheets...');
    
    // Динамический импорт классов листов
    const characterSheetModule = await import('./actors/character-sheet.js');
    const npcSheetModule = await import('./actors/npc-sheet.js');
    const itemSheetModule = await import('./items/item-sheet.js');
    
    // Регистрируем листы акторов (ПРАВИЛЬНЫЙ способ для v13)
    // Используем правильный namespace для v13
    const DocumentSheetConfig = foundry.applications.apps.DocumentSheetConfig;
    const ActorSheet = foundry.appv1.sheets.ActorSheet;
    const ItemSheet = foundry.appv1.sheets.ItemSheet;
    
    // Сначала отменяем регистрацию стандартных листов
    DocumentSheetConfig.unregisterSheet(Actor, "core", ActorSheet);
    
    // Затем регистрируем наши листы для акторов
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
    console.error('Error details:', error.message);
  }
}

// Хук на создание актора
Hooks.on('preCreateActor', (actorData, options, userId) => {
  console.log('Through the Breach | Creating actor:', actorData.name);
  
  // Устанавливаем тип по умолчанию, если не указан
  if (!actorData.type) {
    actorData.type = 'character';
    console.log('Through the Breach | Set default actor type: character');
  }
  
  // Устанавливаем изображение по умолчанию
  if (!actorData.img) {
    actorData.img = 'icons/svg/mystery-man.svg';
  }
  
  // Инициализируем данные актора
  if (!actorData.system) {
    actorData.system = {};
  }
  
  // Устанавливаем базовую структуру данных для системы
  if (!actorData.system.abilities) {
    actorData.system.abilities = {
      strength: { value: 3, max: 13 },
      agility: { value: 3, max: 13 },
      intellect: { value: 3, max: 13 },
      cunning: { value: 3, max: 13 },
      willpower: { value: 3, max: 13 },
      presence: { value: 3, max: 13 }
    };
  }
  
  if (!actorData.system.attributes) {
    actorData.system.attributes = {
      health: { value: 10, max: 10 },
      fate: { value: 3, max: 3 },
      wounds: { value: 0 },
      experience: { value: 0 },
      rank: { value: 'Novice' }
    };
  }
  
  return actorData;
});

// Хук на создание предмета
Hooks.on('preCreateItem', (itemData, options, userId) => {
  console.log('Through the Breach | Creating item:', itemData);
  
  // Устанавливаем тип по умолчанию
  if (!itemData.type) {
    itemData.type = 'talent';
  }
  
  // Устанавливаем изображение по умолчанию
  if (!itemData.img) {
    switch (itemData.type) {
      case 'talent':
        itemData.img = 'icons/svg/upgrade.svg';
        break;
      case 'spell':
        itemData.img = 'icons/svg/fire.svg';
        break;
      case 'weapon':
        itemData.img = 'icons/svg/sword.svg';
        break;
      default:
        itemData.img = 'icons/svg/item-bag.svg';
    }
  }
  
  return itemData;
});

// Хук для добавления создания актора через диалог (исправляем ошибку createDialog)
Hooks.on('getActorDirectoryEntryContext', (html, options) => {
  options.push({
    name: "Create TtB Character",
    icon: '<i class="fas fa-user"></i>',
    condition: li => {
      const folder = li.closest('[data-folder-id]');
      return !folder || folder.dataset.folderId;
    },
    callback: li => {
      // Создаем актора с базовыми данными
      const actorData = {
        name: "New Character",
        type: "character",
        img: "icons/svg/mystery-man.svg",
        system: {}
      };
      
      Actor.create(actorData).then(actor => {
        console.log('Through the Breach | Actor created via context menu:', actor);
      });
    }
  });
});

// Хук на рендеринг листа (для отладки)
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
    console.log('Through the Breach | Preparing actor data for:', this.name);
    super.prepareData();
    
    // Убедимся, что у нас есть данные
    if (!this.system) this.system = {};
    
    // Инициализация структур данных
    this._initializeSystemData();
    
    // Вызываем расчет производных данных
    this.prepareDerivedData();
    
    return this;
  }

  /** @override */
  prepareBaseData() {
    super.prepareBaseData();
    // Дополнительная базовая подготовка
  }

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
    
    // Расчет защиты (Defense = 3 + Agility/2)
    if (this.system.abilities?.agility) {
      const agility = this.system.abilities.agility.value || 3;
      if (!this.system.defenses) this.system.defenses = {};
      this.system.defenses.defense = { 
        value: 3 + Math.floor(agility / 2)
      };
    }
    
    // Расчет максимального здоровья (Health = 10 + Willpower/2)
    if (this.system.abilities?.willpower) {
      const willpower = this.system.abilities.willpower.value || 3;
      const maxHealth = 10 + Math.floor(willpower / 2);
      this.system.attributes.health.max = maxHealth;
      
      // Корректируем текущее здоровье
      if (this.system.attributes.health.value > maxHealth) {
        this.system.attributes.health.value = maxHealth;
      }
    }
  }

  // Инициализация данных системы
  _initializeSystemData() {
    // Устанавливаем тип, если не задан
    if (!this.type) {
      this.type = 'character';
    }
    
    // Инициализация способностей
    if (!this.system.abilities) {
      this.system.abilities = {
        strength: { value: 3, max: 13 },
        agility: { value: 3, max: 13 },
        intellect: { value: 3, max: 13 },
        cunning: { value: 3, max: 13 },
        willpower: { value: 3, max: 13 },
        presence: { value: 3, max: 13 }
      };
    }
    
    // Инициализация атрибутов
    if (!this.system.attributes) {
      this.system.attributes = {
        health: { value: 10, max: 10 },
        fate: { value: 3, max: 3 },
        wounds: { value: 0 },
        experience: { value: 0 },
        rank: { value: 'Novice' }
      };
    }
    
    // Инициализация защиты
    if (!this.system.defenses) {
      this.system.defenses = {
        defense: { value: 3 },
        soak: { value: 0 },
        armor: { value: 0 }
      };
    }
    
    // Инициализация навыков
    if (!this.system.skills) {
      this.system.skills = {
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
      };
    }
    
    // Детали персонажа
    if (!this.system.details) {
      this.system.details = {
        profession: '',
        concept: '',
        pursuit: '',
        age: '',
        height: '',
        weight: '',
        appearance: '',
        biography: '',
        notes: ''
      };
    }
  }

  /** @override */
  static async createDialog(data={}, options={}) {
    console.log('Through the Breach | Creating actor via dialog');
    
    // Используем стандартный диалог создания актора
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
              // Используем стандартный FormData
              const formData = new FormData(form);
              const actorData = {
                type: formData.get('type'),
                name: formData.get('name') || 'New Actor',
                img: 'icons/svg/mystery-man.svg'
              };
              
              // Создаем актора
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
        break;
        
      case 'spell':
        if (!this.system.description) this.system.description = '';
        if (!this.system.suit) this.system.suit = 'any';
        if (this.system.casting === undefined) this.system.casting = 0;
        if (!this.system.range) this.system.range = '';
        if (!this.system.duration) this.system.duration = '';
        if (!this.system.effect) this.system.effect = '';
        break;
        
      case 'weapon':
        if (!this.system.description) this.system.description = '';
        if (!this.system.damage) this.system.damage = '2d6';
        if (!this.system.critical) this.system.critical = '3';
        if (!this.system.range) this.system.range = 'melee';
        if (this.system.hands === undefined) this.system.hands = 1;
        if (!this.system.properties) this.system.properties = [];
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
  static async createDialog(data={}, options={}) {
    console.log('Through the Breach | Creating item via dialog');
    
    // Используем стандартный диалог создания предмета
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
                  case 'talent':
                    itemData.img = 'icons/svg/upgrade.svg';
                    break;
                  case 'spell':
                    itemData.img = 'icons/svg/fire.svg';
                    break;
                  case 'weapon':
                    itemData.img = 'icons/svg/sword.svg';
                    break;
                  default:
                    itemData.img = 'icons/svg/item-bag.svg';
                }
              }
              
              // Создаем предмет
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