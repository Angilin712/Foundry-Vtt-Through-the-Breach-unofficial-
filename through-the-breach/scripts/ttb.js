// =============================================
// Through the Breach System for Foundry VTT v13
// Главный файл системы
// =============================================

console.log('Through the Breach | Loading system...');

// Объявляем классы заранее, чтобы они были доступны для CONFIG
class TtBActor extends Actor {
  /** @override */
  constructor(data, context) {
    console.log('Through the Breach | Creating TtBActor:', data?.name || 'Unnamed');
    super(data, context);
  }

  /** @override */
  prepareData() {
    console.log('Through the Breach | Preparing actor data for:', this.name || 'Unnamed');
    super.prepareData();
    
    // Убедимся, что у нас есть данные
    if (!this.system) this.system = {};
    
    // Инициализация структур данных
    this._initializeSystemData();
    
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
    
    // Расчет производных значений
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
}

// Базовый класс Предмета
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
}

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

// Регистрация листов (исправленные пути)
async function registerSheets() {
  try {
    console.log('Through the Breach | Registering sheets...');
    
    // Правильные пути относительно ttb.js
    // ttb.js находится в scripts/, а листы - в scripts/actors/ и scripts/items/
    const characterSheetModule = await import('./actors/character-sheet.js');
    const npcSheetModule = await import('./actors/npc-sheet.js');
    const itemSheetModule = await import('./items/item-sheet.js');
    
    console.log('Through the Breach | Sheets modules loaded successfully');
    
    // Регистрируем листы акторов (совместимый способ)
    // Используем глобальные объекты для обратной совместимости
    if (typeof Actors !== 'undefined') {
      Actors.unregisterSheet("core", ActorSheet);
      Actors.registerSheet("through-the-breach", characterSheetModule.TtBCharacterSheet, {
        types: ["character"],
        makeDefault: true,
        label: "TTB.CharacterSheet"
      });
      
      Actors.registerSheet("through-the-breach", npcSheetModule.TtBNPCSheet, {
        types: ["npc"],
        makeDefault: true,
        label: "TTB.NPCSheet"
      });
      
      // Регистрируем листы предметов
      Items.unregisterSheet("core", ItemSheet);
      Items.registerSheet("through-the-breach", itemSheetModule.TtBItemSheet, {
        makeDefault: true,
        label: "TTB.ItemSheet"
      });
    } else {
      // Альтернативный способ для v13+
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
      
      foundry.documents.BaseItem.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
      foundry.documents.BaseItem.registerSheet("through-the-breach", itemSheetModule.TtBItemSheet, {
        makeDefault: true,
        label: "TTB.ItemSheet"
      });
    }
    
    console.log('Through the Breach | Sheets registered successfully');
  } catch (error) {
    console.error('Through the Breach | Error registering sheets:', error);
    console.error('Error stack:', error.stack);
    
    // Покажем подробности об ошибке загрузки модулей
    if (error.message.includes('Failed to fetch dynamically imported module')) {
      console.error('Through the Breach | Проверьте пути к файлам:');
      console.error('- character-sheet.js должен быть в scripts/actors/');
      console.error('- npc-sheet.js должен быть в scripts/actors/');
      console.error('- item-sheet.js должен быть в scripts/items/');
      console.error('Текущая базовая URL:', window.location.href);
    }
  }
}

// Хук на создание актора
Hooks.on('preCreateActor', (actorData, options, userId) => {
  console.log('Through the Breach | Creating actor:', actorData.name || 'Unnamed');
  
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
  console.log('Through the Breach | Creating item:', itemData.name || 'Unnamed');
  
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

// Хук на рендеринг листа (для отладки)
Hooks.on('renderActorSheet', (app, html, data) => {
  console.log('Through the Breach | Rendering actor sheet:', data.actor.name, data.actor.type);
});

// Хук на клик по роллабельным элементам (обработка бросков)
Hooks.on('renderChatMessage', (message, html, data) => {
  // Здесь можно добавить обработку кликов по сообщениям в чате
});

// Экспорт классов для использования в других модулях
export { TtBActor, TtBItem };