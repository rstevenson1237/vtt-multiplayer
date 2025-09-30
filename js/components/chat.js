export class ChatSystem {
    constructor(eventBus, database) {
        this.eventBus = eventBus;
        this.db = database;
        this.gameId = null;
        this.currentUser = null;
        this.messagesListener = null;
        this.minimized = false;
    }

    initialize(gameId, user) {
        this.gameId = gameId;
        this.currentUser = user;
        
        // Listen for new messages
        this.messagesListener = this.db.ref(`games/${gameId}/messages`)
            .orderByChild('timestamp')
            .limitToLast(50);
            
        this.messagesListener.on('child_added', (snapshot) => {
            const message = snapshot.val();
            this.displayMessage(message);
        });

        // Listen for dice rolls
        this.eventBus.on('chat:diceRoll', (rollData) => {
            this.sendDiceRoll(rollData);
        });

        // Listen for system messages
        this.eventBus.on('chat:message', (data) => {
            if (data.type === 'system') {
                this.sendSystemMessage(data.content);
            }
        });
    }

    async sendMessage() {
        const input = document.getElementById('chatInput');
        const content = input.value.trim();
        
        if (!content) return;
        
        const message = {
            author: this.currentUser.displayName || 'Player',
            authorId: this.currentUser.uid,
            content,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            type: 'message'
        };
        
        await this.db.ref(`games/${this.gameId}/messages`).push(message);
        input.value = '';
    }

    async sendSystemMessage(content) {
        const message = {
            author: 'System',
            authorId: 'system',
            content,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            type: 'system'
        };
        
        await this.db.ref(`games/${this.gameId}/messages`).push(message);
    }

    async sendDiceRoll(rollData) {
        const message = {
            author: rollData.roller,
            authorId: this.currentUser.uid,
            content: `Rolled ${rollData.count}${rollData.type}${rollData.modifier >= 0 ? '+' : ''}${rollData.modifier || ''}: ${rollData.rolls.join(', ')}`,
            diceResult: rollData.total,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            type: 'dice'
        };
        
        await this.db.ref(`games/${this.gameId}/messages`).push(message);
    }

    displayMessage(message) {
        const messagesDiv = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${message.type === 'dice' ? 'dice-roll' : ''}`;
        
        const time = new Date(message.timestamp).toLocaleTimeString();
        
        let content = `
            <div class="message-author">${message.author}</div>
            <div class="message-content">${message.content}</div>
        `;
        
        if (message.type === 'dice' && message.diceResult !== undefined) {
            content += `<div class="dice-result">Total: ${message.diceResult}</div>`;
        }
        
        content += `<div class="message-time">${time}</div>`;
        
        messageDiv.innerHTML = content;
        messagesDiv.appendChild(messageDiv);
        
        // Auto-scroll to bottom
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        
        // Limit messages shown
        while (messagesDiv.children.length > 50) {
            messagesDiv.removeChild(messagesDiv.firstChild);
        }
    }

    toggleChat() {
        const panel = document.getElementById('chatPanel');
        this.minimized = !this.minimized;
        panel.classList.toggle('minimized', this.minimized);
    }

    cleanup() {
        if (this.messagesListener) {
            this.messagesListener.off();
        }
        document.getElementById('chatMessages').innerHTML = '';
    }
}
