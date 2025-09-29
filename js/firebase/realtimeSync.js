export class RealtimeSync {
    constructor(eventBus, database) {
        this.eventBus = eventBus;
        this.db = database;
        this.gameId = null;
        this.listeners = [];
    }

    initialize(gameId) {
        this.gameId = gameId;
    }

    // Generic method to sync data
    syncData(path, data) {
        if (!this.gameId) return Promise.reject('No game ID set');
        
        return this.db.ref(`games/${this.gameId}/state/${path}`).set(data);
    }

    // Listen to data changes
    listenToData(path, callback) {
        if (!this.gameId) return;

        const ref = this.db.ref(`games/${this.gameId}/state/${path}`);
        const listener = ref.on('value', (snapshot) => {
            callback(snapshot.val());
        });

        this.listeners.push({ ref, listener });
        return listener;
    }

    // Update specific field
    updateField(path, updates) {
        if (!this.gameId) return Promise.reject('No game ID set');
        
        return this.db.ref(`games/${this.gameId}/state/${path}`).update(updates);
    }

    // Push new item to list
    pushItem(path, item) {
        if (!this.gameId) return Promise.reject('No game ID set');
        
        return this.db.ref(`games/${this.gameId}/state/${path}`).push(item);
    }

    // Remove item
    removeItem(path) {
        if (!this.gameId) return Promise.reject('No game ID set');
        
        return this.db.ref(`games/${this.gameId}/state/${path}`).remove();
    }

    // Transaction for atomic updates
    transaction(path, updateFunction) {
        if (!this.gameId) return Promise.reject('No game ID set');
        
        return this.db.ref(`games/${this.gameId}/state/${path}`)
            .transaction(updateFunction);
    }

    // Clean up all listeners
    cleanup() {
        this.listeners.forEach(({ ref, listener }) => {
            ref.off('value', listener);
        });
        this.listeners = [];
        this.gameId = null;
    }
}
