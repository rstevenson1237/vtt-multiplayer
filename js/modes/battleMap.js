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
        this.backgroundData = {
            image: null,
            fitMode: 'fit', // 'stretch', 'fit', 'fill', 'tile', 'original'
            offsetX: 0,
            offsetY: 0,
            scale: 1,
            opacity: 1
        };
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
            if (bg) {
                this.loadBackground(bg);
            } else {
                this.loadBackground(null);
            }
        });

        // Listen for grid size
        this.sync.listenToData('battleMap/gridSize', (size) => {
            if (size) {
                this.gridSize = size;
                this.draw();
            }
        });

        // Add context menu handler
        this.canvas.addEventListener('contextmenu', (e) => this.onRightClick(e));
    }

// ADD THIS METHOD - Token Creation (around line 130, after initialize())
async addToken() {
    const name = prompt('Enter token name:');
    if (!name) return;

    // Calculate center of canvas for initial placement
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    
    // Snap to grid center
    let x, y;
    if (this.showGrid) {
        x = Math.round(centerX / this.gridSize) * this.gridSize + this.gridSize / 2;
        y = Math.round(centerY / this.gridSize) * this.gridSize + this.gridSize / 2;
    } else {
        x = centerX;
        y = centerY;
    }

    const tokenId = Date.now().toString();
    const newToken = {
        id: tokenId,
        name: name,
        x: x,
        y: y,
        size: 25, // Medium by default
        color: '#3498db',
        hp: 10,
        maxHp: 10,
        ac: 10,
        initiative: 0,
        initiativeBonus: 0,
        owner: this.currentUser.uid,
        ownerName: this.currentUser.displayName || 'Player',
        conditions: [],
        notes: ''
    };

    await this.sync.updateField(`battleMap/tokens/${tokenId}`, newToken);
    
    // Auto-select the new token
    this.selectedToken = tokenId;
    this.updateSelectedTokenInfo();
    this.draw();
    
    this.eventBus.emit('chat:message', {
        content: `${this.currentUser.displayName} added token: ${name}`,
        type: 'system'
    });
}

setupCanvas() {
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => {
        // NEW: Track mouse position for hover detection
        const rect = this.canvas.getBoundingClientRect();
        this.lastMouseX = e.clientX - rect.left;
        this.lastMouseY = e.clientY - rect.top;
        
        this.onMouseMove(e);
    });
    this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    
    // NEW: Add mouseleave to reset cursor
    this.canvas.addEventListener('mouseleave', () => {
        this.lastMouseX = undefined;
        this.lastMouseY = undefined;
        this.canvas.style.cursor = 'default';
    });
}

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw background image with fit modes
        if (this.backgroundImage && this.backgroundData.image) {
            this.drawBackground();
        }

        if (this.showGrid) {
            this.drawGrid();
        }

        this.drawTokens();
        this.drawMeasurement();
    }

    drawBackground() {
        const img = this.backgroundImage;
        const data = this.backgroundData;

        this.ctx.save();
        this.ctx.globalAlpha = data.opacity;

        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        const imgWidth = img.width;
        const imgHeight = img.height;

        switch (data.fitMode) {
            case 'stretch':
                // Stretch to fill entire canvas
                this.ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
                break;

            case 'fit':
                // Fit entire image, maintain aspect ratio, letterbox if needed
                const fitRatio = Math.min(canvasWidth / imgWidth, canvasHeight / imgHeight);
                const fitWidth = imgWidth * fitRatio * data.scale;
                const fitHeight = imgHeight * fitRatio * data.scale;
                const fitX = (canvasWidth - fitWidth) / 2 + data.offsetX;
                const fitY = (canvasHeight - fitHeight) / 2 + data.offsetY;
                this.ctx.drawImage(img, fitX, fitY, fitWidth, fitHeight);
                break;

            case 'fill':
                // Fill entire canvas, maintain aspect ratio, crop if needed
                const fillRatio = Math.max(canvasWidth / imgWidth, canvasHeight / imgHeight);
                const fillWidth = imgWidth * fillRatio * data.scale;
                const fillHeight = imgHeight * fillRatio * data.scale;
                const fillX = (canvasWidth - fillWidth) / 2 + data.offsetX;
                const fillY = (canvasHeight - fillHeight) / 2 + data.offsetY;
                this.ctx.drawImage(img, fillX, fillY, fillWidth, fillHeight);
                break;

            case 'tile':
                // Tile/repeat the image
                const tileWidth = imgWidth * data.scale;
                const tileHeight = imgHeight * data.scale;
                for (let x = data.offsetX % tileWidth - tileWidth; x < canvasWidth; x += tileWidth) {
                    for (let y = data.offsetY % tileHeight - tileHeight; y < canvasHeight; y += tileHeight) {
                        this.ctx.drawImage(img, x, y, tileWidth, tileHeight);
                    }
                }
                break;

            case 'original':
                // Original size, centered
                const origX = (canvasWidth - imgWidth * data.scale) / 2 + data.offsetX;
                const origY = (canvasHeight - imgHeight * data.scale) / 2 + data.offsetY;
                this.ctx.drawImage(img, origX, origY, imgWidth * data.scale, imgHeight * data.scale);
                break;
        }

        this.ctx.restore();
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
        
        // NEW: Add mouse cursor handling for hover feedback
        this.canvas.style.cursor = 'default';
        
        // Check if mouse is over any token
        const rect = this.canvas.getBoundingClientRect();
        if (this.lastMouseX !== undefined && this.lastMouseY !== undefined) {
            const x = this.lastMouseX;
            const y = this.lastMouseY;
            
            Object.entries(this.tokens).forEach(([id, token]) => {
                const dist = Math.sqrt((x - token.x) ** 2 + (y - token.y) ** 2);
                if (dist <= (token.size || 25)) {
                    this.canvas.style.cursor = 'pointer';
                }
            });
        }
    }

    startMeasure() {
        this.measuring = true;
        this.canvas.style.cursor = 'crosshair';
    }

// ADD THIS METHOD - Toggle Grid (around line 180)
async toggleGrid() {
    this.showGrid = !this.showGrid;
    await this.sync.syncData('battleMap/showGrid', this.showGrid);
    this.draw();
    
    // Update button text
    const btn = document.querySelector('[onclick="battleMap.toggleGrid()"]');
    if (btn) {
        btn.textContent = this.showGrid ? 'Hide Grid' : 'Show Grid';
    }
}

// ADD THIS METHOD - Clear Selection (around line 195)
clearSelection() {
    this.selectedToken = null;
    this.updateSelectedTokenInfo();
    this.draw();
}

// ADD THIS METHOD - Roll Dice (around line 203)
rollDice() {
    const diceType = document.getElementById('diceType').value;
    const diceCount = parseInt(document.getElementById('diceCount').value) || 1;
    const modifier = parseInt(document.getElementById('diceModifier').value) || 0;
    
    const rolls = [];
    let total = modifier;
    
    // Extract the number from dice type (e.g., "d20" -> 20)
    const sides = parseInt(diceType.substring(1));
    
    for (let i = 0; i < diceCount; i++) {
        const roll = Math.floor(Math.random() * sides) + 1;
        rolls.push(roll);
        total += roll;
    }
    
    // Emit to chat
    this.eventBus.emit('chat:diceRoll', {
        roller: this.currentUser.displayName || 'Player',
        type: diceType,
        count: diceCount,
        modifier: modifier,
        rolls: rolls,
        total: total
    });
    
    // Visual feedback
    const diceBtn = document.querySelector('[onclick="battleMap.rollDice()"]');
    if (diceBtn) {
        diceBtn.classList.add('dice-rolling');
        setTimeout(() => diceBtn.classList.remove('dice-rolling'), 500);
    }
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

    async loadBackground(backgroundData) {
        if (!backgroundData || !backgroundData.data) {
            this.backgroundImage = null;
            this.backgroundData = {
                image: null,
                fitMode: 'fit',
                offsetX: 0,
                offsetY: 0,
                scale: 1,
                opacity: 1
            };
            this.draw();
            return;
        }

        const img = new Image();
        img.onload = () => {
            this.backgroundImage = img;
            this.backgroundData = {
                image: img,
                fitMode: backgroundData.fitMode || 'fit',
                offsetX: backgroundData.offsetX || 0,
                offsetY: backgroundData.offsetY || 0,
                scale: backgroundData.scale || 1,
                opacity: backgroundData.opacity !== undefined ? backgroundData.opacity : 1,
                name: backgroundData.name
            };
            this.draw();
        };
        img.onerror = (error) => {
            console.error('Error loading background image:', error);
            this.backgroundImage = null;
        };
        img.src = backgroundData.data;
    }

    async uploadBackground() {
        // Create file input element
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Show loading indicator
            this.eventBus.emit('chat:message', {
                content: '⏳ Uploading background image...',
                type: 'system'
            });

            try {
                // Convert to base64 and compress
                const base64 = await this.compressAndConvertImage(file);

                // Store in Firebase
                await this.sync.syncData('battleMap/background', {
                    data: base64,
                    name: file.name,
                    fitMode: 'fit',
                    offsetX: 0,
                    offsetY: 0,
                    scale: 1,
                    opacity: 1,
                    uploadedBy: this.currentUser.displayName,
                    uploadedAt: Date.now()
                });

                this.eventBus.emit('chat:message', {
                    content: `✅ Background "${file.name}" uploaded successfully!`,
                    type: 'system'
                });
            } catch (error) {
                console.error('Error uploading background:', error);
                alert('Failed to upload image. File may be too large.');
            }
        };

        input.click();
    }

    async compressAndConvertImage(file, maxWidth = 2048, maxHeight = 2048, quality = 0.85) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                const img = new Image();

                img.onload = () => {
                    // Create canvas for compression
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    // Calculate new dimensions while preserving aspect ratio
                    if (width > maxWidth || height > maxHeight) {
                        const ratio = Math.min(maxWidth / width, maxHeight / height);
                        width = width * ratio;
                        height = height * ratio;
                    }

                    canvas.width = width;
                    canvas.height = height;

                    // Draw and compress
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    // Convert to base64
                    const base64 = canvas.toDataURL('image/jpeg', quality);

                    // Check size (Firebase has limits)
                    const sizeInMB = (base64.length * 3 / 4) / (1024 * 1024);
                    if (sizeInMB > 10) {
                        reject(new Error('Image too large. Please use a smaller image or lower quality.'));
                    } else {
                        resolve(base64);
                    }
                };

                img.onerror = reject;
                img.src = e.target.result;
            };

            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async uploadBackgroundFromURL() {
        const url = prompt('Enter background image URL:');
        if (!url) return;

        try {
            // Load image to convert to base64
            const response = await fetch(url);
            const blob = await response.blob();
            const base64 = await this.compressAndConvertImage(blob);

            await this.sync.syncData('battleMap/background', {
                data: base64,
                name: 'External Image',
                fitMode: 'fit',
                offsetX: 0,
                offsetY: 0,
                scale: 1,
                opacity: 1,
                uploadedBy: this.currentUser.displayName,
                uploadedAt: Date.now()
            });
        } catch (error) {
            console.error('Error loading URL:', error);
            alert('Failed to load image from URL. Check CORS/URL validity.');
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

    showBackgroundSettings() {
        if (!this.backgroundImage) {
            alert('No background image loaded. Upload one first!');
            return;
        }

        const dialog = document.createElement('div');
        dialog.className = 'modal';
        dialog.innerHTML = `
            <div class="modal-content background-settings-dialog">
                <h3>Background Settings</h3>

                <label>
                    Fit Mode:
                    <select id="bgFitMode">
                        <option value="stretch" ${this.backgroundData.fitMode === 'stretch' ? 'selected' : ''}>Stretch (Fill canvas, distort)</option>
                        <option value="fit" ${this.backgroundData.fitMode === 'fit' ? 'selected' : ''}>Fit (Show all, letterbox)</option>
                        <option value="fill" ${this.backgroundData.fitMode === 'fill' ? 'selected' : ''}>Fill (Cover canvas, crop)</option>
                        <option value="tile" ${this.backgroundData.fitMode === 'tile' ? 'selected' : ''}>Tile (Repeat)</option>
                        <option value="original" ${this.backgroundData.fitMode === 'original' ? 'selected' : ''}>Original Size</option>
                    </select>
                </label>

                <label>
                    Scale: <span id="bgScaleValue">${(this.backgroundData.scale * 100).toFixed(0)}%</span>
                    <input type="range" id="bgScale" min="10" max="300" value="${this.backgroundData.scale * 100}" step="5">
                </label>

                <label>
                    Opacity: <span id="bgOpacityValue">${(this.backgroundData.opacity * 100).toFixed(0)}%</span>
                    <input type="range" id="bgOpacity" min="0" max="100" value="${this.backgroundData.opacity * 100}" step="5">
                </label>

                <label>
                    Horizontal Offset: <span id="bgOffsetXValue">${this.backgroundData.offsetX}px</span>
                    <input type="range" id="bgOffsetX" min="-500" max="500" value="${this.backgroundData.offsetX}" step="10">
                </label>

                <label>
                    Vertical Offset: <span id="bgOffsetYValue">${this.backgroundData.offsetY}px</span>
                    <input type="range" id="bgOffsetY" min="-500" max="500" value="${this.backgroundData.offsetY}" step="10">
                </label>

                <div class="dialog-buttons">
                    <button onclick="this.closest('.modal').remove()">Cancel</button>
                    <button class="secondary" id="resetBgSettings">Reset</button>
                    <button class="primary" id="saveBgSettings">Apply</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        // Live preview
        const updatePreview = () => {
            this.backgroundData.fitMode = document.getElementById('bgFitMode').value;
            this.backgroundData.scale = document.getElementById('bgScale').value / 100;
            this.backgroundData.opacity = document.getElementById('bgOpacity').value / 100;
            this.backgroundData.offsetX = parseInt(document.getElementById('bgOffsetX').value);
            this.backgroundData.offsetY = parseInt(document.getElementById('bgOffsetY').value);

            document.getElementById('bgScaleValue').textContent = document.getElementById('bgScale').value + '%';
            document.getElementById('bgOpacityValue').textContent = document.getElementById('bgOpacity').value + '%';
            document.getElementById('bgOffsetXValue').textContent = document.getElementById('bgOffsetX').value + 'px';
            document.getElementById('bgOffsetYValue').textContent = document.getElementById('bgOffsetY').value + 'px';

            this.draw();
        };

        document.getElementById('bgFitMode').addEventListener('change', updatePreview);
        document.getElementById('bgScale').addEventListener('input', updatePreview);
        document.getElementById('bgOpacity').addEventListener('input', updatePreview);
        document.getElementById('bgOffsetX').addEventListener('input', updatePreview);
        document.getElementById('bgOffsetY').addEventListener('input', updatePreview);

        document.getElementById('resetBgSettings').onclick = () => {
            this.backgroundData.fitMode = 'fit';
            this.backgroundData.scale = 1;
            this.backgroundData.opacity = 1;
            this.backgroundData.offsetX = 0;
            this.backgroundData.offsetY = 0;
            dialog.remove();
            this.draw();
        };

        document.getElementById('saveBgSettings').onclick = async () => {
            // Get current background data from Firebase
            const currentBg = await this.sync.db.ref(
                `games/${this.gameId}/state/battleMap/background`
            ).once('value').then(s => s.val());

            // Update with new settings
            await this.sync.syncData('battleMap/background', {
                ...currentBg,
                fitMode: this.backgroundData.fitMode,
                scale: this.backgroundData.scale,
                opacity: this.backgroundData.opacity,
                offsetX: this.backgroundData.offsetX,
                offsetY: this.backgroundData.offsetY
            });

            dialog.remove();
        };
    }

    async alignGridToBackground() {
        if (!this.backgroundImage) {
            alert('Load a background image first!');
            return;
        }

        const squareSize = prompt('Enter grid square size in pixels:', this.gridSize);
        if (squareSize && !isNaN(squareSize)) {
            this.gridSize = parseInt(squareSize);
            await this.sync.syncData('battleMap/gridSize', this.gridSize);
            this.draw();
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
    // NEW: Show tooltip on first canvas interaction
    if (!this.hasShownTooltip && Object.keys(this.tokens).length > 0) {
        this.hasShownTooltip = true;
        this.eventBus.emit('chat:message', {
            content: '💡 Tip: Right-click tokens to edit, adjust HP, add conditions, or delete them!',
            type: 'system'
        });
    }
    
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
        
        // UPDATED: Snap to grid CENTER instead of corner
        if (this.showGrid) {
            x = Math.round(x / this.gridSize) * this.gridSize + this.gridSize / 2;
            y = Math.round(y / this.gridSize) * this.gridSize + this.gridSize / 2;
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
