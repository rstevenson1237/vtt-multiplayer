export class GameSession {
    constructor(eventBus, database, auth) {
        this.eventBus = eventBus;
        this.db = database;
        this.auth = auth;
        this.currentGameId = null;
        this.presenceRef = null;
        this.onlineUsersListener = null;
    }

    async setupPresence(gameId) {
        const user = this.auth.currentUser;
        if (!user) return;

        this.currentGameId = gameId;

        // Set up presence for this user
        this.presenceRef = this.db.ref(`games/${gameId}/presence/${user.uid}`);
        
        // Set user as online
        await this.presenceRef.set({
            name: user.displayName || 'Player',
            online: true,
            lastSeen: firebase.database.ServerValue.TIMESTAMP
        });

        // Remove presence on disconnect
        this.presenceRef.onDisconnect().update({
            online: false,
            lastSeen: firebase.database.ServerValue.TIMESTAMP
        });

        // Listen for other users' presence
        this.onlineUsersListener = this.db.ref(`games/${gameId}/presence`);
        this.onlineUsersListener.on('value', (snapshot) => {
            const presence = snapshot.val() || {};
            this.updateOnlineUsers(presence);
        });
    }

    updateOnlineUsers(presence) {
        const onlineUsersDiv = document.getElementById('onlineUsers');
        onlineUsersDiv.innerHTML = '';

        Object.entries(presence).forEach(([uid, data]) => {
            if (data.online && uid !== this.auth.currentUser.uid) {
                const userDiv = document.createElement('div');
                userDiv.className = 'online-user';
                userDiv.setAttribute('data-name', data.name);
                userDiv.textContent = data.name.charAt(0).toUpperCase();
                onlineUsersDiv.appendChild(userDiv);
            }
        });
    }

    async leaveGame() {
        if (!this.currentGameId) return;

        const user = this.auth.currentUser;
        if (!user) return;

        try {
            // Update presence
            if (this.presenceRef) {
                await this.presenceRef.update({
                    online: false,
                    lastSeen: firebase.database.ServerValue.TIMESTAMP
                });
            }

            // Remove listeners
            if (this.onlineUsersListener) {
                this.onlineUsersListener.off();
            }

            this.currentGameId = null;
            this.eventBus.emit('game:left');
        } catch (error) {
            console.error('Error leaving game:', error);
        }
    }
}
