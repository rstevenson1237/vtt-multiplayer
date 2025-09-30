export class CharacterMode {
    constructor(eventBus, realtimeSync) {
        this.eventBus = eventBus;
        this.sync = realtimeSync;
        this.characters = {};
        this.currentCharacterId = null;
        this.currentUser = null;
        this.userRole = null;
    }

    initialize(gameId, user, role) {
        this.currentUser = user;
        this.userRole = role;
        
        // Listen for character updates
        this.sync.listenToData('characters', (characters) => {
            this.characters = characters || {};
            this.populateCharacterSelect();
            if (this.currentCharacterId && this.characters[this.currentCharacterId]) {
                this.loadCharacter(this.currentCharacterId);
            }
        });

        // Setup event listeners
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Character selection
        document.getElementById('characterSelect').addEventListener('change', (e) => {
            if (e.target.value) {
                this.loadCharacter(e.target.value);
            }
        });

        // Attribute changes
        ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'].forEach(attr => {
            const input = document.getElementById(`attr${attr}`);
            input.addEventListener('change', () => {
                this.calculateModifier(attr);
                this.autoSave();
            });
        });

        // Auto-save on input changes
        const inputs = ['charName', 'charRace', 'charClass', 'charLevel', 
                       'currentHp', 'maxHp', 'armorClass', 'initiative', 
                       'speed', 'skills', 'inventory', 'charNotes'];
        
        inputs.forEach(id => {
            document.getElementById(id).addEventListener('input', () => {
                this.autoSave();
            });
        });
    }

    populateCharacterSelect() {
        const select = document.getElementById('characterSelect');
        const currentValue = select.value;
        
        select.innerHTML = '<option value="">Select Character</option>';
        
        Object.entries(this.characters).forEach(([id, char]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = `${char.name} (${char.owner === this.currentUser.uid ? 'Yours' : char.ownerName})`;
            select.appendChild(option);
        });
        
        if (currentValue && this.characters[currentValue]) {
            select.value = currentValue;
        }
    }

    async createNew() {
        const name = prompt('Enter character name:');
        if (!name) return;

        const characterId = Date.now().toString();
        const newCharacter = {
            id: characterId,
            name,
            owner: this.currentUser.uid,
            ownerName: this.currentUser.displayName || 'Player',
            race: '',
            class: '',
            level: 1,
            attributes: {
                str: 10, dex: 10, con: 10,
                int: 10, wis: 10, cha: 10
            },
            hp: 10,
            maxHp: 10,
            ac: 10,
            initiative: 0,
            speed: 30,
            skills: '',
            inventory: '',
            notes: '',
            created: Date.now(),
            lastModified: Date.now()
        };

        await this.sync.updateField(`characters/${characterId}`, newCharacter);
        this.currentCharacterId = characterId;
    }

    loadCharacter(characterId) {
        const char = this.characters[characterId];
        if (!char) return;

        this.currentCharacterId = characterId;

        // Load basic info
        document.getElementById('charName').value = char.name || '';
        document.getElementById('charRace').value = char.race || '';
        document.getElementById('charClass').value = char.class || '';
        document.getElementById('charLevel').value = char.level || 1;

        // Load attributes
        ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(attr => {
            const value = char.attributes?.[attr] || 10;
            document.getElementById(`attr${attr.charAt(0).toUpperCase() + attr.slice(1)}`).value = value;
            this.calculateModifier(attr.charAt(0).toUpperCase() + attr.slice(1));
        });

        // Load combat stats
        document.getElementById('currentHp').value = char.hp || 0;
        document.getElementById('maxHp').value = char.maxHp || 10;
        document.getElementById('armorClass').value = char.ac || 10;
        document.getElementById('initiative').value = char.initiative || 0;
        document.getElementById('speed').value = char.speed || 30;

        // Load text fields
        document.getElementById('skills').value = char.skills || '';
        document.getElementById('inventory').value = char.inventory || '';
        document.getElementById('charNotes').value = char.notes || '';
    }

    calculateModifier(attr) {
        const value = parseInt(document.getElementById(`attr${attr}`).value) || 10;
        const modifier = Math.floor((value - 10) / 2);
        const modSpan = document.getElementById(`mod${attr}`);
        modSpan.textContent = modifier >= 0 ? `+${modifier}` : modifier;
    }

    async saveCharacter() {
        if (!this.currentCharacterId) {
            alert('Please select or create a character first');
            return;
        }

        const char = this.characters[this.currentCharacterId];
        if (!char) return;

        // Check permissions
        if (char.owner !== this.currentUser.uid && this.userRole !== 'referee') {
            alert('You can only edit your own characters');
            return;
        }

        const updatedChar = {
            ...char,
            name: document.getElementById('charName').value,
            race: document.getElementById('charRace').value,
            class: document.getElementById('charClass').value,
            level: parseInt(document.getElementById('charLevel').value),
            attributes: {
                str: parseInt(document.getElementById('attrStr').value),
                dex: parseInt(document.getElementById('attrDex').value),
                con: parseInt(document.getElementById('attrCon').value),
                int: parseInt(document.getElementById('attrInt').value),
                wis: parseInt(document.getElementById('attrWis').value),
                cha: parseInt(document.getElementById('attrCha').value)
            },
            hp: parseInt(document.getElementById('currentHp').value),
            maxHp: parseInt(document.getElementById('maxHp').value),
            ac: parseInt(document.getElementById('armorClass').value),
            initiative: parseInt(document.getElementById('initiative').value),
            speed: parseInt(document.getElementById('speed').value),
            skills: document.getElementById('skills').value,
            inventory: document.getElementById('inventory').value,
            notes: document.getElementById('charNotes').value,
            lastModified: Date.now()
        };

        await this.sync.updateField(`characters/${this.currentCharacterId}`, updatedChar);
        alert('Character saved!');
    }

    autoSaveTimer = null;
    autoSave() {
        clearTimeout(this.autoSaveTimer);
        this.autoSaveTimer = setTimeout(() => {
            this.saveCharacter();
        }, 2000); // Auto-save after 2 seconds of no changes
    }

    async shareCharacter() {
        if (!this.currentCharacterId) {
            alert('Please select a character first');
            return;
        }

        const char = this.characters[this.currentCharacterId];
        if (char) {
            this.eventBus.emit('chat:message', {
                type: 'character-share',
                characterId: this.currentCharacterId,
                characterName: char.name,
                message: `${this.currentUser.displayName} shared character: ${char.name}`
            });
            alert('Character shared in chat!');
        }
    }

    exportCharacter() {
        if (!this.currentCharacterId) {
            alert('Please select a character first');
            return;
        }

        const char = this.characters[this.currentCharacterId];
        if (char) {
            const dataStr = JSON.stringify(char, null, 2);
            const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
            
            const exportName = `${char.name.replace(/\s+/g, '_')}_character.json`;
            
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportName);
            linkElement.click();
        }
    }

    activate() {
        // Refresh character list when mode becomes active
        if (this.currentCharacterId) {
            this.loadCharacter(this.currentCharacterId);
        }
    }

    cleanup() {
        clearTimeout(this.autoSaveTimer);
    }
}