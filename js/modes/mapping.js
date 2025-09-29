export class MappingMode {
    constructor(eventBus, realtimeSync) {
        this.eventBus = eventBus;
        this.sync = realtimeSync;
        this.canvas = null;
        this.ctx = null;
        this.currentTool = 'select';
        this.shapes = [];
        this.isDrawing = false;
        this.currentUser = null;
        this.userRole = null;
    }

    initialize(gameId, user, role) {
        this.currentUser = user;
        this.userRole = role;
        
        this.canvas = document.getElementById('mappingCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.setupCanvas();
        this.setupTools();
        
        // Listen for shape updates
        this.sync.listenToData('mapping/shapes', (shapes) => {
            this.shapes = shapes ? Object.values(shapes) : [];
            this.draw();
        });
    }

    // Rest of the implementation similar to original but with sync calls
    // ... (abbreviated for space)
}
