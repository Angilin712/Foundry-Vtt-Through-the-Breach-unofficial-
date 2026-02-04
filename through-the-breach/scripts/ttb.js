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

// Регистрация листов (ИСПРАВЛЕННАЯ ВЕРСИЯ)
async function registerSheets() {
  try {
    console.log('Through the Breach | Registering sheets...');
    
    // Динамический импорт классов листов
    const characterSheetModule = await import('./actors/character-sheet.js');
    const npcSheetModule = await import('./actors/npc-sheet.js');
    const itemSheetModule = await import('./items/item-sheet.js');
    
    // Регистрируем листы акторов (НОВЫЙ API v13)
    foundry.documents.BaseActor.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
    
    foundry.documents.BaseActor.registerSheet("through-the-breach", characterSheetModule.TtBCharacterSheet, {
      types: ["character"],
      makeDefault: true,
      label: "TTB.CharacterSheet"
    });
    
    foundry.documents.BaseActor.registerSheet("through-the-breach", npcSheetModule.TtBNPCSheet, {
      types: ["npc"],
      makeDefault: true,
      label: "TTB.NPCSheet"
    });
    
    // Регистрируем листы предметов
    foundry.documents.BaseItem.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
    foundry.documents.BaseItem.registerSheet("through-the-breach", itemSheetModule.TtBItemSheet, {
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
  console.log('Through the Breach | Creating actor:', actorData);
  
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

// Хук для отладки ошибок
Hooks.on('error', (error, isFatal, metadata) => {
  console.error('Through the Breach | System Error:', error);
  if (metadata) {
    console.error('Error metadata:', metadata);
  }
});

// =============================================
// Базовый класс Актера
// =============================================
class TtBActor extends foundry.documents.BaseActor {
  /** @override */
  constructor(data, context) {
    console.log('Through the Breach | Creating TtBActor:', data.name || 'Unnamed');
    super(data, context);
  }

  /** @override */
  prepareData() {
    console.log('Through the Breach | Preparing actor data for:', this.name);
    super.prepareData();
    
    // Инициализация структур данных
    this._initializeSystemData();
    
    return this;
  }

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
    
    // Убедимся, что у нас есть данные
    if (!this.system) return;
    
    // Расчет защиты
    if (this.system.abilities?.agility) {
      const agility = this.system.abilities.agility.value || 3;
      if (!this.system.defenses) this.system.defenses = {};
      this.system.defenses.defense = { 
        value: 3 + Math.floor(agility / 2)
      };
    }
    
    // Расчет максимального здоровья
    if (this.system.abilities?.willpower) {
      const willpower = this.system.abilities.willpower.value || 3;
      const maxHealth = 10 + Math.floor(willpower / 2);
      this.system.attributes.health.max = maxHealth;
      
      // Корректируем текущее здоровье
      if (this.system.attributes.health.value > maxHealth) {
        this.system.attributes.health.value = maxHealth;
      }
    }
    
    // Расчет тоталов для навыков (для шаблона)
    if (this.system.skills) {
      this._calculateSkillTotals();
    }
  }

  // Инициализация данных системы
  _initializeSystemData() {
    // Устанавливаем тип, если не задан
    if (!this.type) {
      this.type = 'character';
    }
    
    // Убедимся, что system существует
    if (!this.system) this.system = {};
    
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
  
  // Расчет тоталов навыков
  _calculateSkillTotals() {
    if (!this.system.skills || !this.system.abilities) return;
    
    // Создаем объект с тоталами для шаблона
    this.system.skillsWithTotals = {};
    
    for (const [skillKey, skillData] of Object.entries(this.system.skills)) {
      const abilityValue = this.system.abilities[skillData.linked]?.value || 0;
      this.system.skillsWithTotals[skillKey] = {
        ...skillData,
        total: skillData.value + abilityValue
      };
    }
  }
}

// =============================================
// Базовый класс Предмета
// =============================================
class TtBItem extends foundry.documents.BaseItem {
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
}

// Экспорт классов
export { TtBActor, TtBItem };