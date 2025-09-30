export class MappingMode {
    constructor(eventBus, realtimeSync) {
        this.eventBus = eventBus;
        this.sync = realtimeSync;
        this.canvas = null;
        this.ctx = null;
        this.currentTool = 'select';
        this.shapes = [];
        this.isDrawing = false;
        this.currentShape = null;
        this.startPoint = null;
        this.drawColor = '#000000';
        this.lineWidth = 2;
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

    setupCanvas() {
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    }

    setupTools() {
        document.querySelectorAll('[data-tool]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.currentTool = e.target.dataset.tool;
                this.updateToolUI();
            });
        });

        document.getElementById('drawColor').addEventListener('change', (e) => {
            this.drawColor = e.target.value;
        });

        document.getElementById('lineWidth').addEventListener('change', (e) => {
            this.lineWidth = parseInt(e.target.value);
        });
    }

    onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        this.startPoint = { x, y };
        this.isDrawing = true;

        if (this.currentTool === 'text') {
            const text = prompt('Enter text:');
            if (text) {
                this.addShape({
                    type: 'text',
                    x, y,
                    text,
                    color: this.drawColor,
                    fontSize: this.lineWidth * 8
                });
            }
            this.isDrawing = false;
        }
    }

    onMouseMove(e) {
        if (!this.isDrawing) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Draw preview
        this.draw();
        this.drawPreview(x, y);
    }

    async onMouseUp(e) {
        if (!this.isDrawing) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const shape = this.createShape(x, y);
        if (shape) {
            await this.addShape(shape);
        }
        
        this.isDrawing = false;
    }

    createShape(endX, endY) {
        const shape = {
            id: Date.now().toString(),
            type: this.currentTool,
            startX: this.startPoint.x,
            startY: this.startPoint.y,
            endX,
            endY,
            color: this.drawColor,
            lineWidth: this.lineWidth,
            creator: this.currentUser.displayName
        };

        return shape;
    }

    async addShape(shape) {
        await this.sync.updateField(`mapping/shapes/${shape.id}`, shape);
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.shapes.forEach(shape => {
            this.drawShape(shape);
        });
    }

    drawShape(shape) {
        this.ctx.save();
        this.ctx.strokeStyle = shape.color;
        this.ctx.lineWidth = shape.lineWidth;
        this.ctx.fillStyle = shape.color;

        switch (shape.type) {
            case 'rectangle':
                this.ctx.strokeRect(
                    shape.startX, shape.startY,
                    shape.endX - shape.startX,
                    shape.endY - shape.startY
                );
                break;
            case 'circle':
                const radius = Math.hypot(
                    shape.endX - shape.startX,
                    shape.endY - shape.startY
                );
                this.ctx.beginPath();
                this.ctx.arc(shape.startX, shape.startY, radius, 0, Math.PI * 2);
                this.ctx.stroke();
                break;
            case 'line':
                this.ctx.beginPath();
                this.ctx.moveTo(shape.startX, shape.startY);
                this.ctx.lineTo(shape.endX, shape.endY);
                this.ctx.stroke();
                break;
            case 'text':
                this.ctx.font = `${shape.fontSize}px Arial`;
                this.ctx.fillText(shape.text, shape.x, shape.y);
                break;
        }
        
        this.ctx.restore();
    }

    drawPreview(x, y) {
        if (!this.isDrawing) return;
        
        const tempShape = this.createShape(x, y);
        if (tempShape) {
            this.drawShape(tempShape);
        }
    }

    async undo() {
        if (this.shapes.length > 0) {
            const lastShape = this.shapes[this.shapes.length - 1];
            await this.sync.removeItem(`mapping/shapes/${lastShape.id}`);
        }
    }

    async clearCanvas() {
        if (confirm('Clear all shapes?')) {
            await this.sync.syncData('mapping/shapes', {});
        }
    }

    updateToolUI() {
        document.querySelectorAll('[data-tool]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === this.currentTool);
        });
    }

    activate() {
        this.draw();
    }

    cleanup() {
        // Cleanup handled by RealtimeSync
    }
}