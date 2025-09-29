export class CharacterMode {
    constructor(eventBus, realtimeSync) {
        this.eventBus = eventBus;
        this.sync = realtimeSync;
        this.characters = {};
        this.currentCharacter = null;
    }

    initialize(gameId, user, role) {
        // Listen for character updates
        this.sync.listenToData('characters', (characters) => {
            this.characters = characters || {};
            this.populateCharacterSelect();
        });
    }

    // Rest of implementation with sync...
}
