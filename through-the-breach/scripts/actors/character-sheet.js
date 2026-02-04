export class TtBCharacterSheet extends foundry.appv1.sheets.ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["through-the-breach", "sheet", "actor", "character"],
      template: "systems/through-the-breach/templates/actor/character-sheet.html",
      width: 900,
      height: 750,
      tabs: [{
        navSelector: ".sheet-tabs",
        contentSelector: ".sheet-body",
        initial: "details"
      }],
      dragDrop: [{
        dragSelector: ".item",
        dropSelector: null
      }],
      scrollY: [".skills-list", ".items-list"]
    });
  }

  /** @override */
  getData() {
    const context = super.getData();
    const actor = this.actor;
    
    // Основные данные системы
    context.system = actor.system || {};
    context.actor = actor;
    
    // Инициализация контейнеров для локализации
    context.labels = {
      abilities: {},
      skills: {},
      suits: CONFIG.TTB?.suits || {},
      ranks: CONFIG.TTB?.ranks || ['Novice', 'Seasoned', 'Veteran', 'Master']
    };
    
    // Локализация характеристик
    for (const [key, value] of Object.entries(CONFIG.TTB?.abilities || {})) {
      context.labels.abilities[key] = game.i18n.localize(value);
    }
    
    // Локализация навыков
    for (const [key, value] of Object.entries(CONFIG.TTB?.skills || {})) {
      context.labels.skills[key] = game.i18n.localize(value);
    }
    
    // Локализация мастей (для заклинаний)
    if (CONFIG.TTB?.suits) {
      for (const [key, value] of Object.entries(CONFIG.TTB.suits)) {
        context.labels.suits[key] = game.i18n.localize(value);
      }
    }
    
    // Добавление itemTypes для группировки предметов
    context.itemTypes = actor.itemTypes || {
      talents: [],
      spells: [],
      weapons: [],
      equipment: [],
      armor: []
    };
    
    // Добавляем хелперы для шаблона
    context.helpers = {
      // Хелпер для фильтрации навыков по связанной характеристике
      getLinkedSkills: (skills, abilityKey) => {
        if (!skills) return [];
        
        return Object.entries(skills)
          .filter(([_, skill]) => skill.linked === abilityKey)
          .map(([key, _]) => game.i18n.localize(CONFIG.TTB?.skills[key] || key));
      },
      
      // Хелпер для отображения масти заклинания
      getSuitLabel: (suitKey) => {
        return context.labels.suits[suitKey] || suitKey;
      },
      
      // Проверка равенства (для шаблонов)
      eq: (a, b) => a === b
    };
    
    // Добавляем вычисленные тоталы навыков в контекст
    if (context.system.skills) {
      context.skillsWithTotals = Object.entries(context.system.skills).map(([key, skill]) => {
        const linkedValue = context.system.abilities[skill.linked]?.value || 0;
        return {
          key,
          ...skill,
          linkedValue,
          total: skill.value + linkedValue,
          label: context.labels.skills[key] || key
        };
      });
    }
    
    // Подготавливаем характеристики с дополнительными данными
    if (context.system.abilities) {
      context.abilitiesWithData = Object.entries(context.system.abilities).map(([key, ability]) => ({
        key,
        ...ability,
        label: context.labels.abilities[key] || key
      }));
    }
    
    return context;
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    
    // Регистрируем все обработчики
    this._registerEventListeners(html);
    
    // Инициализируем Drag&Drop
    this._initializeDragDrop(html);
  }

  /**
   * Регистрация всех обработчиков событий
   */
  _registerEventListeners(html) {
    // Броски характеристик
    html.find('.rollable[data-action="ability"]').click(this._onRollAbility.bind(this));
    
    // Броски навыков
    html.find('.rollable[data-action="skill"]').click(this._onRollSkill.bind(this));
    
    // Создание предметов
    html.find('.item-create').click(this._onItemCreate.bind(this));
    
    // Редактирование предметов
    html.find('.item-edit').click(this._onItemEdit.bind(this));
    
    // Удаление предметов
    html.find('.item-delete').click(this._onItemDelete.bind(this));
    
    // Изменение значений характеристик и навыков
    html.find('input[name^="system.abilities."], input[name^="system.skills."]').change(this._onStatChange.bind(this));
    
    // Прямой ввод в остальные поля
    html.find('input, textarea, select').not('.no-change').change(this._onInputChange.bind(this));
    
    // Сохранение при нажатии Enter в текстовых полях
    html.find('input[type="text"]').keydown(this._onTextInputKeydown.bind(this));
  }

  /**
   * Инициализация Drag&Drop
   */
  _initializeDragDrop(html) {
    // Делаем все элементы предметов перетаскиваемыми
    html.find('.item').each((i, li) => {
      li.setAttribute("draggable", true);
      li.addEventListener("dragstart", this._onDragStart.bind(this), false);
    });
    
    // Обработка зоны сброса
    const dropZone = html.find('.items-list')[0];
    if (dropZone) {
      dropZone.addEventListener("dragover", this._onDragOver.bind(this), false);
      dropZone.addEventListener("drop", this._onDrop.bind(this), false);
    }
  }

  /**
   * Обработчик броска характеристики
   */
  async _onRollAbility(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const abilityKey = element.dataset.ability;
    
    // Запрашиваем сложность у пользователя
    const difficulty = await this._getDifficultyDialog(abilityKey);
    if (difficulty === null) return; // Пользователь отменил
    
    // Выполняем бросок через метод актора
    await this.actor.rollAbility(abilityKey, difficulty);
  }

  /**
   * Обработчик броска навыка
   */
  async _onRollSkill(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const skillKey = element.dataset.skill;
    
    // Запрашиваем сложность
    const difficulty = await this._getDifficultyDialog(skillKey, true);
    if (difficulty === null) return;
    
    // Выполняем бросок через метод актора
    await this.actor.rollSkill(skillKey, difficulty);
  }

  /**
   * Диалог запроса сложности броска
   */
  async _getDifficultyDialog(statKey, isSkill = false) {
    const statType = isSkill ? 'Skill' : 'Ability';
    const statLabel = isSkill 
      ? game.i18n.localize(CONFIG.TTB?.skills[statKey] || statKey)
      : game.i18n.localize(CONFIG.TTB?.abilities[statKey] || statKey);
    
    return new Promise((resolve) => {
      new Dialog({
        title: `${statType} Check: ${statLabel}`,
        content: `
          <form>
            <div class="form-group">
              <label>Difficulty (Target Number):</label>
              <input type="number" name="difficulty" value="10" min="1" max="20" style="width: 100px; text-align: center;">
            </div>
            <div class="form-group">
              <label>Modifiers:</label>
              <input type="number" name="modifier" value="0" style="width: 100px; text-align: center;">
            </div>
          </form>
        `,
        buttons: {
          roll: {
            icon: '<i class="fas fa-dice-d20"></i>',
            label: "Roll",
            callback: html => {
              const form = html.find('form')[0];
              const formData = new FormData(form);
              const difficulty = parseInt(formData.get('difficulty')) || 10;
              const modifier = parseInt(formData.get('modifier')) || 0;
              
              // Пока не используем модификатор, но сохраняем для будущего
              resolve(difficulty + modifier);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "roll",
        close: () => resolve(null)
      }).render(true);
    });
  }

  /**
   * Создание нового предмета
   */
  async _onItemCreate(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const itemType = element.dataset.type;
    
    // Базовые данные для предмета
    const itemData = {
      name: `${game.i18n.localize(`TTB.${itemType.charAt(0).toUpperCase() + itemType.slice(1)}`)}`,
      type: itemType,
      system: {}
    };
    
    // Устанавливаем изображение по умолчанию
    switch (itemType) {
      case 'talent':
        itemData.img = 'icons/svg/upgrade.svg';
        itemData.system = {
          description: '',
          cost: 0,
          requirements: '',
          rank: 'Novice'
        };
        break;
      case 'spell':
        itemData.img = 'icons/svg/fire.svg';
        itemData.system = {
          description: '',
          suit: 'any',
          casting: 0,
          range: '',
          duration: '',
          effect: '',
          requirements: ''
        };
        break;
      case 'weapon':
        itemData.img = 'icons/svg/sword.svg';
        itemData.system = {
          description: '',
          damage: '2d6',
          critical: '3',
          range: 'melee',
          skill: 'melee',
          hands: 1,
          properties: []
        };
        break;
      case 'armor':
        itemData.img = 'icons/svg/shield.svg';
        itemData.system = {
          description: '',
          armor: 0,
          soak: 0,
          location: 'torso'
        };
        break;
      case 'equipment':
        itemData.img = 'icons/svg/item-bag.svg';
        itemData.system = {
          description: '',
          quantity: 1,
          weight: 0,
          price: 0
        };
        break;
    }
    
    // Создаем предмет
    await Item.create(itemData, { parent: this.actor });
    
    // Обновляем отображение листа
    this.render(true);
  }

  /**
   * Редактирование предмета
   */
  _onItemEdit(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const li = element.closest('.item');
    const itemId = li.dataset.itemId;
    const item = this.actor.items.get(itemId);
    
    if (item) {
      item.sheet.render(true);
    }
  }

  /**
   * Удаление предмета
   */
  async _onItemDelete(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const li = element.closest('.item');
    const itemId = li.dataset.itemId;
    const item = this.actor.items.get(itemId);
    
    if (!item) return;
    
    // Запрашиваем подтверждение
    const confirmed = await Dialog.confirm({
      title: game.i18n.format("TTB.DeleteItemTitle", { name: item.name }),
      content: game.i18n.format("TTB.DeleteItemContent", { name: item.name }),
      yes: () => true,
      no: () => false,
      defaultYes: false
    });
    
    if (confirmed) {
      await item.delete();
      this.render(true);
    }
  }

  /**
   * Обработчик изменения характеристик и навыков
   */
  _onStatChange(event) {
    event.preventDefault();
    const input = event.currentTarget;
    const name = input.name;
    let value = input.value;
    
    // Парсим числовые значения
    if (input.type === 'number') {
      value = parseInt(value) || 0;
      
      // Проверяем границы для характеристик
      if (name.includes('system.abilities.')) {
        const max = input.max ? parseInt(input.max) : 13;
        value = Math.min(Math.max(value, 1), max);
      }
      
      // Проверяем границы для навыков
      if (name.includes('system.skills.')) {
        value = Math.max(value, 0);
      }
    }
    
    // Обновляем данные
    this.actor.update({ [name]: value });
  }

  /**
   * Обработчик изменения других полей ввода
   */
  _onInputChange(event) {
    event.preventDefault();
    const input = event.currentTarget;
    const name = input.name;
    let value = input.value;
    
    // Особые обработки для разных типов полей
    switch (input.type) {
      case 'number':
        value = parseInt(value) || 0;
        break;
      case 'checkbox':
        value = input.checked;
        break;
      default:
        // Для текстовых полей оставляем как есть
        break;
    }
    
    // Обновляем данные
    this.actor.update({ [name]: value });
  }

  /**
   * Обработчик нажатия клавиш в текстовых полях
   */
  _onTextInputKeydown(event) {
    // Сохраняем при нажатии Enter
    if (event.key === 'Enter') {
      event.preventDefault();
      this._onInputChange(event);
    }
  }

  /**
   * Начало перетаскивания предмета
   */
  _onDragStart(event) {
    const li = event.currentTarget;
    const itemId = li.dataset.itemId;
    
    if (itemId) {
      event.dataTransfer.setData("text/plain", JSON.stringify({
        type: "Item",
        actorId: this.actor.id,
        itemId: itemId
      }));
      
      // Визуальная обратная связь
      li.classList.add("dragging");
    }
  }

  /**
   * Событие при перетаскивании над зоной сброса
   */
  _onDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    
    // Визуальная обратная связь
    event.currentTarget.classList.add("drag-over");
  }

  /**
   * Событие сброса предмета
   */
  async _onDrop(event) {
    event.preventDefault();
    
    try {
      const data = JSON.parse(event.dataTransfer.getData("text/plain"));
      
      // Проверяем, что это предмет
      if (data.type !== "Item") return;
      
      // Проверяем, что предмет не из этого же актора
      if (data.actorId === this.actor.id) return;
      
      // Получаем исходный актор и предмет
      const sourceActor = game.actors.get(data.actorId);
      if (!sourceActor) return;
      
      const item = sourceActor.items.get(data.itemId);
      if (!item) return;
      
      // Создаем копию предмета в текущем акторе
      await Item.create(item.toObject(), { parent: this.actor });
      
      // Убираем визуальные эффекты
      event.currentTarget.classList.remove("drag-over");
      
      // Обновляем лист
      this.render(true);
      
    } catch (error) {
      console.error("Error during item drop:", error);
      ui.notifications.error("Failed to drop item");
    }
  }

  /**
   * Переопределение стандартной логики обновления данных
   */
  async _updateObject(event, formData) {
    // Можно добавить дополнительную логику валидации здесь
    return this.object.update(formData);
  }

  /**
   * Хелпер для отладки (можно удалить в релизе)
   */
  _debugLog(message, data = null) {
    if (game.settings.get("through-the-breach", "debugMode")) {
      console.log(`TtB Character Sheet | ${message}`, data);
    }
  }
}