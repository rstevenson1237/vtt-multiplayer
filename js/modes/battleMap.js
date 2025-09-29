export class BattleMapMode {
    constructor(eventBus, realtimeSync) {
        this.eventBus = eventBus;
        this.sync = realtimeSync;
        this.canvas = null;
        this.ctx = null;
        this.gridSize = 50;
        this.showGrid = true;
        this.tokens = {};
        this.selectedToken = null;
        this.isDrawing = false;
        this.currentUser = null;
        this.userRole = null;
        this.gameId = null;
    }

    initialize(gameId, user, role) {
        this.gameId = gameId;
        this.currentUser = user;
        this.userRole = role;
        
        this.canvas = document.getElementById('battleCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.setupCanvas();
        
        // Listen for token updates
        this.sync.listenToData('battleMap/tokens', (tokens) => {
            this.tokens = tokens || {};
            this.draw();
            this.updateInitiativeTracker();
        });

        // Listen for grid state
        this.sync.listenToData('battleMap/showGrid', (showGrid) => {
            this.showGrid = showGrid !== false;
            this.draw();
        });
    }

    setupCanvas() {
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        if (this.showGrid) {
            this.drawGrid();
        }
        
        this.drawTokens();
    }

    drawGrid() {
        this.ctx.strokeStyle = '#ddd';
        this.ctx.lineWidth = 1;
        
        for (let x = 0; x <= this.canvas.width; x += this.gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        
        for (let y = 0; y <= this.canvas.height; y += this.gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
    }

    drawTokens() {
        Object.entries(this.tokens).forEach(([id, token]) => {
            // Draw token
            this.ctx.fillStyle = token.color || '#3498db';
            this.ctx.beginPath();
            this.ctx.arc(token.x, token.y, token.size || 20, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Draw selection highlight
            if (this.selectedToken === id) {
                this.ctx.strokeStyle = '#f39c12';
                this.ctx.lineWidth = 3;
                this.ctx.stroke();
            }
            
            // Draw label
            this.ctx.fillStyle = '#000';
            this.ctx.font = '12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(token.name, token.x, token.y + 35);
            
            // Draw HP bar
            if (token.hp !== undefined && token.maxHp) {
                const barWidth = 40;
                const barHeight = 4;
                const hpPercent = token.hp / token.maxHp;
                
                this.ctx.fillStyle = '#e74c3c';
                this.ctx.fillRect(token.x - barWidth/2, token.y - 30, barWidth, barHeight);
                
                this.ctx.fillStyle = '#27ae60';
                this.ctx.fillRect(token.x - barWidth/2, token.y - 30, barWidth * hpPercent, barHeight);
            }
        });
    }

    async rollDice() {
        const diceType = document.getElementById('diceType').value;
        const diceCount = parseInt(document.getElementById('diceCount').value) || 1;
        const modifier = parseInt(document.getElementById('diceModifier').value) || 0;
        
        const rolls = [];
        let total = modifier;
        
        for (let i = 0; i < diceCount; i++) {
            const max = parseInt(diceType.substring(1));
            const roll = Math.floor(Math.random() * max) + 1;
            rolls.push(roll);
            total += roll;
        }
        
        const rollData = {
            type: diceType,
            count: diceCount,
            modifier,
            rolls,
            total,
            roller: this.currentUser.displayName || 'Player',
            timestamp: Date.now()
        };
        
        // Sync dice roll to Firebase
        await this.sync.pushItem('battleMap/diceRolls', rollData);
        
        // Send to chat
        this.eventBus.emit('chat:diceRoll', rollData);
    }

    async addToken() {
        const name = prompt('Enter token name:');
        if (!name) return;

        const token = {
            id: Date.now().toString(),
            name,
            x: Math.floor(Math.random() * (this.canvas.width / this.gridSize)) * this.gridSize + this.gridSize/2,
            y: Math.floor(Math.random() * (this.canvas.height / this.gridSize)) * this.gridSize + this.gridSize/2,
            size: 20,
            color: `hsl(${Math.random() * 360}, 70%, 50%)`,
            hp: 10,
            maxHp: 10,
            initiative: Math.floor(Math.random() * 20) + 1,
            owner: this.currentUser.uid,
            ownerName: this.currentUser.displayName || 'Player'
        };

        await this.sync.updateField(`battleMap/tokens/${token.id}`, token);
    }

    async deleteToken() {
        if (!this.selectedToken) {
            alert('Select a token first');
            return;
        }

        const token = this.tokens[this.selectedToken];
        if (!token) return;

        // Check permission
        if (this.userRole !== 'referee' && token.owner !== this.currentUser.uid) {
            alert('You can only delete your own tokens');
            return;
        }

        if (confirm(`Delete token "${token.name}"?`)) {
            await this.sync.removeItem(`battleMap/tokens/${this.selectedToken}`);
            this.selectedToken = null;
        }
    }

    async toggleGrid() {
        await this.sync.syncData('battleMap/showGrid', !this.showGrid);
    }

    clearSelection() {
        this.selectedToken = null;
        this.draw();
        this.updateSelectedTokenInfo();
    }

    onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Find clicked token
        let clickedToken = null;
        Object.entries(this.tokens).forEach(([id, token]) => {
            const dist = Math.sqrt((x - token.x) ** 2 + (y - token.y) ** 2);
            if (dist <= token.size) {
                clickedToken = id;
            }
        });
        
        if (clickedToken) {
            const token = this.tokens[clickedToken];
            // Check permission to move
            if (this.userRole === 'referee' || 
                token.owner === this.currentUser.uid || 
                this.userRole === 'player') {
                this.selectedToken = clickedToken;
                this.isDrawing = true;
                this.updateSelectedTokenInfo();
            } else {
                this.selectedToken = clickedToken;
                this.updateSelectedTokenInfo();
            }
        } else {
            this.selectedToken = null;
            this.updateSelectedTokenInfo();
        }
        
        this.draw();
    }

    onMouseMove(e) {
        if (!this.isDrawing || !this.selectedToken) return;
        
        const rect = this.canvas.getBoundingClientRect();
        let x = e.clientX - rect.left;
        let y = e.clientY - rect.top;
        
        // Snap to grid
        if (this.showGrid) {
            x = Math.round(x / this.gridSize) * this.gridSize;
            y = Math.round(y / this.gridSize) * this.gridSize;
        }
        
        // Update local display immediately for smooth movement
        this.tokens[this.selectedToken].x = x;
        this.tokens[this.selectedToken].y = y;
        this.draw();
    }

    async onMouseUp(e) {
        if (this.isDrawing && this.selectedToken) {
            const token = this.tokens[this.selectedToken];
            // Sync final position to Firebase
            await this.sync.updateField(`battleMap/tokens/${this.selectedToken}`, {
                x: token.x,
                y: token.y
            });
        }
        this.isDrawing = false;
    }

    updateInitiativeTracker() {
        const list = document.getElementById('initiativeList');
        list.innerHTML = '';
        
        // Sort tokens by initiative
        const sortedTokens = Object.entries(this.tokens)
            .sort(([, a], [, b]) => (b.initiative || 0) - (a.initiative || 0));
        
        sortedTokens.forEach(([id, token]) => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>${token.name}</span>
                <span>Init: ${token.initiative || 0}</span>
            `;
            li.onclick = () => {
                this.selectedToken = id;
                this.draw();
                this.updateSelectedTokenInfo();
            };
            
            if (this.selectedToken === id) {
                li.classList.add('current-turn');
            }
            
            list.appendChild(li);
        });
    }

    updateSelectedTokenInfo() {
        const infoDiv = document.getElementById('selectedTokenInfo');
        
        if (!this.selectedToken || !this.tokens[this.selectedToken]) {
            infoDiv.innerHTML = 'No token selected';
            return;
        }
        
        const token = this.tokens[this.selectedToken];
        infoDiv.innerHTML = `
            <div><strong>${token.name}</strong></div>
            <div>HP: ${token.hp}/${token.maxHp}</div>
            <div>Initiative: ${token.initiative || 0}</div>
            <div>Position: (${Math.round(token.x)}, ${Math.round(token.y)})</div>
            <div>Owner: ${token.ownerName || 'Unknown'}</div>
        `;
    }

    activate() {
        this.draw();
        this.updateInitiativeTracker();
        this.updateSelectedTokenInfo();
    }

    cleanup() {
        // Cleanup is handled by RealtimeSync
    }
}
