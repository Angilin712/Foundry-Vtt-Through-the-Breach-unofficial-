class CardManager {
  constructor() {
    this.deck = [];
    this.discard = [];
    this.initializeStandardDeck();
  }

  initializeStandardDeck() {
    const suits = ['rams', 'tomes', 'masks', 'crows'];
    const values = [
      {num: 1, name: 'Ace'}, {num: 2, name: '2'}, {num: 3, name: '3'},
      {num: 4, name: '4'}, {num: 5, name: '5'}, {num: 6, name: '6'},
      {num: 7, name: '7'}, {num: 8, name: '8'}, {num: 9, name: '9'},
      {num: 10, name: '10'}, {num: 11, name: 'Jack'}, {num: 12, name: 'Queen'},
      {num: 13, name: 'King'}
    ];

    this.deck = [];
    for (let suit of suits) {
      for (let value of values) {
        this.deck.push({
          suit: suit,
          value: value.num,
          name: `${value.name} of ${suit}`,
          id: `${suit}_${value.num}`
        });
      }
    }

    // Добавляем джокеров
    this.deck.push({suit: 'black', value: 0, name: 'Black Joker', id: 'black_joker'});
    this.deck.push({suit: 'red', value: 0, name: 'Red Joker', id: 'red_joker'});
    
    this.shuffle();
  }

  shuffle() {
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  }

  drawCard() {
    if (this.deck.length === 0) {
      this.resetDeck();
    }
    return this.deck.pop();
  }

  resetDeck() {
    this.deck = [...this.deck, ...this.discard];
    this.discard = [];
    this.shuffle();
  }

  async drawCardForPlayer(playerId, options = {}) {
    const card = this.drawCard();
    this.discard.push(card);
    
    // Отправка в чат
    await this.sendToChat(card, playerId, options);
    return card;
  }

  async sendToChat(card, playerId, options) {
    const content = await renderTemplate(
      'systems/through-the-breach/templates/chat/card-draw.html',
      { card, player: game.users.get(playerId), options }
    );

    ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({user: game.user}),
      content,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER
    });
  }
}