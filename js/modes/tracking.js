export class TrackingMode {
    constructor(eventBus, realtimeSync) {
        this.eventBus = eventBus;
        this.sync = realtimeSync;
        this.entries = [];
        this.currentEntry = null;
    }

    initialize(gameId, user, role) {
        // Listen for tracking updates
        this.sync.listenToData('tracking/entries', (entries) => {
            this.entries = entries ? Object.values(entries) : [];
            this.displaySessions();
        });
    }

    // Rest of implementation with sync...
}
