import { BattleMapUI } from './battleMapUI.js';

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
        this.backgroundImage = null;
        this.measuring = false;
        this.measureStart = null;
        this.measureEnd = null;
        this.currentTurn = null;
        this.combatActive = false;
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

        // Listen for combat state
        this.sync.listenToData('battleMap/combat', (combat) => {
            this.combatActive = combat?.active || false;
            this.currentTurn = combat?.currentTurn || null;
            this.updateCombatUI();
        });

        // Listen for background
        this.sync.listenToData('battleMap/background', (bg) => {
            if (bg?.url) {
                this.loadBackground(bg.url);
            }
        });

        // Add context menu handler
        this.canvas.addEventListener('contextmenu', (e) => this.onRightClick(e));
    }

    setupCanvas() {
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw background image first
        if (this.backgroundImage) {
            this.ctx.drawImage(
                this.backgroundImage, 
                0, 0, 
                this.canvas.width, 
                this.canvas.height
            );
        }
        
        if (this.showGrid) {
            this.drawGrid();
        }
        
        this.drawTokens();
        this.drawMeasurement();
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
            this.ctx.arc(token.x, token.y, token.size || 25, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Draw current turn indicator
            if (this.currentTurn === id && this.combatActive) {
                this.ctx.strokeStyle = '#f39c12';
                this.ctx.lineWidth = 4;
                this.ctx.setLineDash([5, 5]);
                this.ctx.stroke();
                this.ctx.setLineDash([]);
            }
            
            // Draw selection highlight
            if (this.selectedToken === id) {
                this.ctx.strokeStyle = '#e74c3c';
                this.ctx.lineWidth = 3;
                this.ctx.stroke();
            }
            
            // Draw label
            this.ctx.fillStyle = '#fff';
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = 3;
            this.ctx.font = 'bold 12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.strokeText(token.name, token.x, token.y + (token.size || 25) + 15);
            this.ctx.fillText(token.name, token.x, token.y + (token.size || 25) + 15);
            
            // Draw HP bar
            if (token.hp !== undefined && token.maxHp) {
                const barWidth = (token.size || 25) * 2;
                const barHeight = 6;
                const hpPercent = Math.max(0, token.hp / token.maxHp);
                const barY = token.y - (token.size || 25) - 10;
                
                // Background
                this.ctx.fillStyle = '#000';
                this.ctx.fillRect(token.x - barWidth/2, barY, barWidth, barHeight);
                
                // HP bar
                let barColor = '#27ae60';
                if (hpPercent < 0.3) barColor = '#e74c3c';
                else if (hpPercent < 0.6) barColor = '#f39c12';
                
                this.ctx.fillStyle = barColor;
                this.ctx.fillRect(token.x - barWidth/2, barY, barWidth * hpPercent, barHeight);
                
                // HP text
                this.ctx.fillStyle = '#fff';
                this.ctx.strokeStyle = '#000';
                this.ctx.font = 'bold 10px Arial';
                this.ctx.lineWidth = 2;
                const hpText = `${token.hp}/${token.maxHp}`;
                this.ctx.strokeText(hpText, token.x, barY + 4);
                this.ctx.fillText(hpText, token.x, barY + 4);
            }
            
            // Draw AC badge
            if (token.ac) {
                const acSize = 16;
                const acX = token.x + (token.size || 25);
                const acY = token.y - (token.size || 25);
                
                this.ctx.fillStyle = '#2c3e50';
                this.ctx.beginPath();
                this.ctx.arc(acX, acY, acSize/2, 0, Math.PI * 2);
                this.ctx.fill();
                
                this.ctx.fillStyle = '#fff';
                this.ctx.font = 'bold 10px Arial';
                this.ctx.fillText(token.ac, acX, acY + 3);
            }
            
            // Draw conditions
            if (token.conditions && token.conditions.length > 0) {
                const condY = token.y + (token.size || 25) + 25;
                this.ctx.font = '10px Arial';
                this.ctx.fillStyle = '#9b59b6';
                const condText = token.conditions.slice(0, 2).join(', ');
                this.ctx.fillText(condText, token.x, condY);
                
                if (token.conditions.length > 2) {
                    this.ctx.fillText(`+${token.conditions.length - 2} more`, token.x, condY + 12);
                }
            }
        });
    }

    startMeasure() {
        this.measuring = true;
        this.canvas.style.cursor = 'crosshair';
    }

    calculateDistance(x1, y1, x2, y2) {
        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        const pixels = Math.sqrt(dx * dx + dy * dy);
        const squares = pixels / this.gridSize;
        const feet = squares * 5; // Assuming 5ft squares
        return { feet, squares, pixels };
    }

    drawMeasurement() {
        if (!this.measuring || !this.measureStart || !this.measureEnd) return;

        this.ctx.strokeStyle = '#f39c12';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);

        this.ctx.beginPath();
        this.ctx.moveTo(this.measureStart.x, this.measureStart.y);
        this.ctx.lineTo(this.measureEnd.x, this.measureEnd.y);
        this.ctx.stroke();

        this.ctx.setLineDash([]);

        // Draw distance label
        const midX = (this.measureStart.x + this.measureEnd.x) / 2;
        const midY = (this.measureStart.y + this.measureEnd.y) / 2;
        const dist = this.calculateDistance(
            this.measureStart.x, this.measureStart.y,
            this.measureEnd.x, this.measureEnd.y
        );

        this.ctx.fillStyle = '#000';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`${Math.round(dist.feet)} ft`, midX, midY - 10);
    }

    async loadBackground(imageUrl) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            this.backgroundImage = img;
            this.draw();
        };
        img.src = imageUrl;
    }

    async uploadBackground() {
        const url = prompt('Enter background image URL:');
        if (url) {
            await this.sync.syncData('battleMap/background', { url });
        }
    }

    async clearBackground() {
        this.backgroundImage = null;
        await this.sync.removeItem('battleMap/background');
        this.draw();
    }

    onRightClick(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Find clicked token
        let clickedTokenId = null;
        Object.entries(this.tokens).forEach(([id, token]) => {
            const dist = Math.sqrt((x - token.x) ** 2 + (y - token.y) ** 2);
            if (dist <= (token.size || 25)) {
                clickedTokenId = id;
            }
        });
        
        if (clickedTokenId) {
            const token = this.tokens[clickedTokenId];
            BattleMapUI.showTokenContextMenu(e.clientX, e.clientY, token, {
                onEdit: () => this.editToken(clickedTokenId),
                onAdjustHP: () => this.adjustTokenHP(clickedTokenId),
                onRollInitiative: () => this.rollInitiativeForToken(clickedTokenId),
                onAddCondition: () => this.manageConditions(clickedTokenId),
                onDuplicate: () => this.duplicateToken(clickedTokenId),
                onDelete: () => this.deleteTokenById(clickedTokenId)
            });
        }
    }

    async editToken(tokenId) {
        const token = this.tokens[tokenId];
        if (!token) return;

        BattleMapUI.showTokenEditDialog(token, async (updates) => {
            await this.sync.updateField(`battleMap/tokens/${tokenId}`, updates);
        });
    }

    async adjustTokenHP(tokenId) {
        const token = this.tokens[tokenId];
        if (!token) return;

        BattleMapUI.showHPAdjustDialog(token, async (newHP) => {
            await this.sync.updateField(`battleMap/tokens/${tokenId}`, { hp: newHP });
            
            // Send HP change to chat
            this.eventBus.emit('chat:message', {
                content: `${token.name}'s HP: ${token.hp} → ${newHP}`,
                type: 'system'
            });
        });
    }

    async manageConditions(tokenId) {
        const token = this.tokens[tokenId];
        if (!token) return;

        BattleMapUI.showConditionDialog(
            token,
            token.conditions || [],
            async (conditions) => {
                await this.sync.updateField(`battleMap/tokens/${tokenId}`, { conditions });
            }
        );
    }

    async duplicateToken(tokenId) {
        const token = this.tokens[tokenId];
        if (!token) return;

        const newToken = {
            ...token,
            id: Date.now().toString(),
            name: `${token.name} (Copy)`,
            x: token.x + this.gridSize,
            y: token.y + this.gridSize
        };

        await this.sync.updateField(`battleMap/tokens/${newToken.id}`, newToken);
    }

    async deleteTokenById(tokenId) {
        const token = this.tokens[tokenId];
        if (!token) return;

        if (confirm(`Delete token "${token.name}"?`)) {
            await this.sync.removeItem(`battleMap/tokens/${tokenId}`);
        }
    }

    async rollInitiativeForToken(tokenId) {
        const token = this.tokens[tokenId];
        if (!token) return;

        const roll = Math.floor(Math.random() * 20) + 1;
        const bonus = token.initiativeBonus || 0;
        const total = roll + bonus;

        await this.sync.updateField(`battleMap/tokens/${tokenId}`, { 
            initiative: total,
            initiativeRoll: roll
        });

        this.eventBus.emit('chat:message', {
            content: `${token.name} rolled initiative: ${roll} + ${bonus} = ${total}`,
            type: 'system'
        });
    }

    async rollInitiativeForAll() {
        const updates = {};
        Object.entries(this.tokens).forEach(([id, token]) => {
            const roll = Math.floor(Math.random() * 20) + 1;
            const bonus = token.initiativeBonus || 0;
            updates[id] = {
                initiative: roll + bonus,
                initiativeRoll: roll
            };
        });

        for (const [id, update] of Object.entries(updates)) {
            await this.sync.updateField(`battleMap/tokens/${id}`, update);
        }

        this.eventBus.emit('chat:message', {
            content: 'Initiative rolled for all tokens!',
            type: 'system'
        });
    }

    async startCombat() {
        // Sort by initiative
        const sorted = Object.entries(this.tokens)
            .sort(([, a], [, b]) => (b.initiative || 0) - (a.initiative || 0));

        if (sorted.length === 0) {
            alert('No tokens on the map!');
            return;
        }

        const firstToken = sorted[0][0];
        await this.sync.syncData('battleMap/combat', {
            active: true,
            currentTurn: firstToken,
            round: 1
        });
    }

    async endCombat() {
        await this.sync.syncData('battleMap/combat', {
            active: false,
            currentTurn: null,
            round: 0
        });
    }

    async nextTurn() {
        if (!this.combatActive) return;

        const sorted = Object.entries(this.tokens)
            .sort(([, a], [, b]) => (b.initiative || 0) - (a.initiative || 0));

        const currentIndex = sorted.findIndex(([id]) => id === this.currentTurn);
        const nextIndex = (currentIndex + 1) % sorted.length;
        const nextToken = sorted[nextIndex][0];

        const combat = await this.sync.db.ref(
            `games/${this.gameId}/state/battleMap/combat`
        ).once('value').then(s => s.val());

        await this.sync.syncData('battleMap/combat', {
            ...combat,
            currentTurn: nextToken,
            round: nextIndex === 0 ? (combat.round || 1) + 1 : combat.round || 1
        });

        this.eventBus.emit('chat:message', {
            content: `It's now ${this.tokens[nextToken].name}'s turn!`,
            type: 'system'
        });
    }

    async previousTurn() {
        if (!this.combatActive) return;

        const sorted = Object.entries(this.tokens)
            .sort(([, a], [, b]) => (b.initiative || 0) - (a.initiative || 0));

        const currentIndex = sorted.findIndex(([id]) => id === this.currentTurn);
        const prevIndex = currentIndex === 0 ? sorted.length - 1 : currentIndex - 1;
        const prevToken = sorted[prevIndex][0];

        const combat = await this.sync.db.ref(
            `games/${this.gameId}/state/battleMap/combat`
        ).once('value').then(s => s.val());

        await this.sync.syncData('battleMap/combat', {
            ...combat,
            currentTurn: prevToken
        });
    }

    updateCombatUI() {
        const startBtn = document.getElementById('startCombatBtn');
        const endBtn = document.getElementById('endCombatBtn');
        const nextBtn = document.getElementById('nextTurnBtn');
        const prevBtn = document.getElementById('prevTurnBtn');

        if (this.combatActive) {
            startBtn?.classList.add('hidden');
            endBtn?.classList.remove('hidden');
            nextBtn?.classList.remove('hidden');
            prevBtn?.classList.remove('hidden');
        } else {
            startBtn?.classList.remove('hidden');
            endBtn?.classList.add('hidden');
            nextBtn?.classList.add('hidden');
            prevBtn?.classList.add('hidden');
        }

        this.updateInitiativeTracker();
        this.draw();
    }

    onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (this.measuring) {
            if (!this.measureStart) {
                this.measureStart = { x, y };
            } else {
                this.measureEnd = { x, y };
                this.measuring = false;
                this.canvas.style.cursor = 'default';
                this.draw();
                
                // Show distance
                const dist = this.calculateDistance(
                    this.measureStart.x, this.measureStart.y,
                    this.measureEnd.x, this.measureEnd.y
                );
                alert(`Distance: ${Math.round(dist.feet)} feet (${dist.squares.toFixed(1)} squares)`);
                
                this.measureStart = null;
                this.measureEnd = null;
            }
            return;
        }
        
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
        const rect = this.canvas.getBoundingClientRect();
        let x = e.clientX - rect.left;
        let y = e.clientY - rect.top;
        
        if (this.measuring && this.measureStart) {
            this.measureEnd = { x, y };
            this.draw();
            return;
        }
        
        if (!this.isDrawing || !this.selectedToken) return;
        
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
