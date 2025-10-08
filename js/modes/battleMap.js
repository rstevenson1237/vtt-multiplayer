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
            fitMode: 'fit',
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

        // Drawing/annotation properties
        this.annotations = [];
        this.drawingTool = null;
        this.isAnnotating = false;
        this.penPath = [];
        
        // Movement measurement
        this.showMovementDistance = true;
        this.movementStartPos = null;
        
        this.rightClickHandled = false;
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

        // Listen for annotations
        this.sync.listenToData('battleMap/annotations', (annotations) => {
            this.annotations = annotations || [];
            this.draw();
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

    async addToken() {
        const name = prompt('Enter token name:');
        if (!name) return;

        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
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
            sizeMultiplier: 1,
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
            const rect = this.canvas.getBoundingClientRect();
            this.lastMouseX = e.clientX - rect.left;
            this.lastMouseY = e.clientY - rect.top;
            this.onMouseMove(e);
        });
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        
        this.canvas.addEventListener('mouseleave', () => {
            this.lastMouseX = undefined;
            this.lastMouseY = undefined;
            this.canvas.style.cursor = 'default';
        });
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        if (this.backgroundImage) {
            this.drawBackground();
        }
        
        if (this.showGrid) {
            this.drawGrid();
        }
        
        this.drawAnnotations();
        this.drawTokens();
        this.drawMeasurement();
        
        if (this.penPath.length > 0) {
            this.ctx.save();
            this.ctx.strokeStyle = document.getElementById('drawColor').value;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.penPath.forEach((point, i) => {
                if (i === 0) {
                    this.ctx.moveTo(point.x, point.y);
                } else {
                    this.ctx.lineTo(point.x, point.y);
                }
            });
            this.ctx.stroke();
            this.ctx.restore();
        }
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
                this.ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
                break;

            case 'fit':
                const fitRatio = Math.min(canvasWidth / imgWidth, canvasHeight / imgHeight);
                const fitWidth = imgWidth * fitRatio * data.scale;
                const fitHeight = imgHeight * fitRatio * data.scale;
                const fitX = (canvasWidth - fitWidth) / 2 + data.offsetX;
                const fitY = (canvasHeight - fitHeight) / 2 + data.offsetY;
                this.ctx.drawImage(img, fitX, fitY, fitWidth, fitHeight);
                break;

            case 'fill':
                const fillRatio = Math.max(canvasWidth / imgWidth, canvasHeight / imgHeight);
                const fillWidth = imgWidth * fillRatio * data.scale;
                const fillHeight = imgHeight * fillRatio * data.scale;
                const fillX = (canvasWidth - fillWidth) / 2 + data.offsetX;
                const fillY = (canvasHeight - fillHeight) / 2 + data.offsetY;
                this.ctx.drawImage(img, fillX, fillY, fillWidth, fillHeight);
                break;

            case 'tile':
                const tileWidth = imgWidth * data.scale;
                const tileHeight = imgHeight * data.scale;
                for (let x = data.offsetX % tileWidth - tileWidth; x < canvasWidth; x += tileWidth) {
                    for (let y = data.offsetY % tileHeight - tileHeight; y < canvasHeight; y += tileHeight) {
                        this.ctx.drawImage(img, x, y, tileWidth, tileHeight);
                    }
                }
                break;

            case 'original':
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
            const radius = (token.sizeMultiplier || 1) * this.gridSize / 2;
            
            // Draw token circle
            this.ctx.fillStyle = token.color || '#3498db';
            this.ctx.beginPath();
            this.ctx.arc(token.x, token.y, radius, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Draw selection highlight
            if (this.selectedToken === id) {
                this.ctx.strokeStyle = '#f39c12';
                this.ctx.lineWidth = 3;
                this.ctx.stroke();
            }
            
            // Draw border
            this.ctx.strokeStyle = '#2c3e50';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            // Draw token name
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(token.name, token.x, token.y);
            
            // Draw HP bar
            if (token.hp !== undefined && token.maxHp) {
                const barWidth = radius * 2;
                const barHeight = 4;
                const barX = token.x - radius;
                const barY = token.y + radius + 5;
                
                // Background
                this.ctx.fillStyle = '#e74c3c';
                this.ctx.fillRect(barX, barY, barWidth, barHeight);
                
                // HP fill
                const hpPercent = token.hp / token.maxHp;
                this.ctx.fillStyle = hpPercent > 0.5 ? '#27ae60' : hpPercent > 0.25 ? '#f39c12' : '#e74c3c';
                this.ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
            }
            
            // Draw current turn indicator
            if (this.combatActive && this.currentTurn === id) {
                this.ctx.strokeStyle = '#27ae60';
                this.ctx.lineWidth = 4;
                this.ctx.setLineDash([5, 5]);
                this.ctx.beginPath();
                this.ctx.arc(token.x, token.y, radius + 5, 0, Math.PI * 2);
                this.ctx.stroke();
                this.ctx.setLineDash([]);
            }
            
            // Draw conditions
            if (token.conditions && token.conditions.length > 0) {
                this.ctx.fillStyle = 'rgba(155, 89, 182, 0.8)';
                this.ctx.font = '10px Arial';
                this.ctx.fillText(token.conditions.length + ' status', token.x, token.y - radius - 8);
            }
        });
    }

    drawAnnotations() {
        this.annotations.forEach(ann => {
            this.ctx.save();
            
            if (ann.type === 'pen') {
                this.ctx.strokeStyle = ann.color;
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                ann.path.forEach((point, i) => {
                    if (i === 0) {
                        this.ctx.moveTo(point.x, point.y);
                    } else {
                        this.ctx.lineTo(point.x, point.y);
                    }
                });
                this.ctx.stroke();
                
            } else if (ann.type === 'text') {
                this.ctx.fillStyle = ann.color;
                this.ctx.font = '16px Arial';
                this.ctx.fillText(ann.text, ann.x, ann.y);
            }
            
            this.ctx.restore();
        });
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

    async toggleGrid() {
        this.showGrid = !this.showGrid;
        await this.sync.syncData('battleMap/showGrid', this.showGrid);
        this.draw();
    }

    rollDice() {
        const diceType = document.getElementById('diceType').value;
        const diceCount = parseInt(document.getElementById('diceCount').value) || 1;
        const modifier = parseInt(document.getElementById('diceModifier').value) || 0;
        
        const rolls = [];
        let total = modifier;
        
        const sides = parseInt(diceType.substring(1));
        
        for (let i = 0; i < diceCount; i++) {
            const roll = Math.floor(Math.random() * sides) + 1;
            rolls.push(roll);
            total += roll;
        }
        
        this.eventBus.emit('chat:diceRoll', {
            roller: this.currentUser.displayName || 'Player',
            type: diceType,
            count: diceCount,
            modifier: modifier,
            rolls: rolls,
            total: total
        });
    }

    selectDrawTool(tool) {
        if (this.drawingTool === tool) {
            this.drawingTool = null;
            this.canvas.style.cursor = 'default';
        } else {
            this.drawingTool = tool;
            this.canvas.style.cursor = tool === 'pen' ? 'crosshair' : 'text';
        }
        
        document.querySelectorAll('[data-draw-tool]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.drawTool === this.drawingTool);
        });
    }

    async clearAnnotations() {
        if (confirm('Clear all annotations?')) {
            this.annotations = [];
            await this.sync.syncData('battleMap/annotations', []);
        }
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
        const feet = squares * 5;
        return { feet, squares, pixels };
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
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            this.eventBus.emit('chat:message', {
                content: '⏳ Uploading background image...',
                type: 'system'
            });

            try {
                const base64 = await this.compressAndConvertImage(file);

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
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth || height > maxHeight) {
                        const ratio = Math.min(maxWidth / width, maxHeight / height);
                        width = width * ratio;
                        height = height * ratio;
                    }

                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    const base64 = canvas.toDataURL('image/jpeg', quality);

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



    onRightClick(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        let clickedTokenId = null;
        Object.entries(this.tokens).forEach(([id, token]) => {
            const radius = (token.sizeMultiplier || 1) * this.gridSize / 2;
            const dist = Math.sqrt((x - token.x) ** 2 + (y - token.y) ** 2);
            if (dist <= radius) {
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

    showBattleMapSettings() {
        document.getElementById('battleMapSettings').classList.remove('hidden');
        this.setupSettingsModal();
    }

    migrateTokenSizes() {
        let wasMigrationNeeded = false;
        const updates = {};
        Object.entries(this.tokens).forEach(([id, token]) => {
            if (token.size && !token.sizeMultiplier) {
                wasMigrationNeeded = true;
                const newMultiplier = token.size / 25; // Assuming old default grid size of 50, so medium token size was 25
                updates[`${id}/sizeMultiplier`] = newMultiplier;
                updates[`${id}/size`] = null; // Remove the old size property
            }
        });

        if (wasMigrationNeeded) {
            this.sync.db.ref(`games/${this.gameId}/state/battleMap/tokens`).update(updates);
        }
    }

    setupSettingsModal() {
        // Tab switching
        const tabs = document.querySelectorAll('.settings-tabs .tab-btn');
        const tabContents = document.querySelectorAll('.settings-modal .tab-content');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const tabName = tab.dataset.tab;
                tabContents.forEach(content => {
                    content.classList.toggle('hidden', content.id !== `${tabName}Tab`);
                });
            });
        });

        // Background settings
        if (this.backgroundImage) {
            document.getElementById('bgFitMode').value = this.backgroundData.fitMode;
            document.getElementById('bgScale').value = this.backgroundData.scale * 100;
            document.getElementById('bgOpacity').value = this.backgroundData.opacity * 100;
            document.getElementById('bgOffsetX').value = this.backgroundData.offsetX;
            document.getElementById('bgOffsetY').value = this.backgroundData.offsetY;
        }

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
            document.getElementById('battleMapSettings').classList.add('hidden');
            this.draw();
        };

        document.getElementById('saveBgSettings').onclick = async () => {
            const currentBg = await this.sync.db.ref(
                `games/${this.gameId}/state/battleMap/background`
            ).once('value').then(s => s.val());

            await this.sync.syncData('battleMap/background', {
                ...currentBg,
                fitMode: this.backgroundData.fitMode,
                scale: this.backgroundData.scale,
                opacity: this.backgroundData.opacity,
                offsetX: this.backgroundData.offsetX,
                offsetY: this.backgroundData.offsetY
            });

            document.getElementById('battleMapSettings').classList.add('hidden');
        };

        // Grid size slider
        const gridSizeSlider = document.getElementById('gridSizeSlider');
        const gridSizeValue = document.getElementById('gridSizeValue');
        if (gridSizeSlider) {
            gridSizeSlider.value = this.gridSize;
            gridSizeValue.textContent = `${this.gridSize}px`;

            gridSizeSlider.addEventListener('input', () => {
                gridSizeValue.textContent = `${gridSizeSlider.value}px`;
            });

            gridSizeSlider.addEventListener('change', () => {
                this.migrateTokenSizes(); // Migrate old token sizes first
                const newSize = parseInt(gridSizeSlider.value, 10);
                this.gridSize = newSize;
                this.sync.syncData('battleMap/gridSize', newSize);
                this.draw();
            });
        }

        // Show grid checkbox
        const showGridCheckbox = document.getElementById('showGridCheckbox');
        if (showGridCheckbox) {
            showGridCheckbox.checked = this.showGrid;
            showGridCheckbox.addEventListener('change', () => {
                this.toggleGrid();
            });
        }
    }

    onMouseDown(e) {
        if (e.button === 2) {
            this.rightClickHandled = true;
            return;
        }
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (this.measuring) {
            if (!this.measureStart) {
                this.measureStart = { x, y };
            } else {
                this.measureEnd = { x, y };
                this.draw();
                setTimeout(() => {
                    this.measuring = false;
                    this.measureStart = null;
                    this.measureEnd = null;
                    this.canvas.style.cursor = 'default';
                    this.draw();
                }, 2000);
            }
            return;
        }
        
        if (this.drawingTool === 'pen') {
            this.startPenDrawing(x, y);
            return;
        } else if (this.drawingTool === 'text') {
            this.addTextAnnotation(x, y);
            return;
        } else if (this.drawingTool === 'eraser') {
            this.eraseAnnotationAt(x, y);
            return;
        }
        
        let clickedToken = null;
        Object.entries(this.tokens).forEach(([id, token]) => {
            const radius = (token.sizeMultiplier || 1) * this.gridSize / 2;
            const dist = Math.sqrt((x - token.x) ** 2 + (y - token.y) ** 2);
            if (dist <= radius) {
                clickedToken = id;
            }
        });
        
        if (clickedToken) {
            this.selectedToken = clickedToken;
            this.isDrawing = true;
            this.movementStartPos = { 
                x: this.tokens[clickedToken].x, 
                y: this.tokens[clickedToken].y 
            };
            this.updateSelectedTokenInfo();
        } else {
            this.selectedToken = null;
            this.updateSelectedTokenInfo();
        }
        
        this.draw();
    }

    onMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (this.measuring && this.measureStart) {
            this.measureEnd = { x, y };
            this.draw();
        }
        
        if (this.isDrawing && this.selectedToken) {
            const token = this.tokens[this.selectedToken];
            if (this.showGrid) {
                token.x = Math.floor(x / this.gridSize) * this.gridSize + this.gridSize / 2;
                token.y = Math.floor(y / this.gridSize) * this.gridSize + this.gridSize / 2;
            } else {
                token.x = x;
                token.y = y;
            }
            this.draw();
        }
        
        if (this.isAnnotating && this.drawingTool === 'pen') {
            this.penPath.push({ x, y });
            this.draw();
        }
    }

    async onMouseUp(e) {
        if (this.isAnnotating && this.drawingTool === 'pen') {
            this.finishPenDrawing();
        }
        
        if (this.isDrawing && this.selectedToken) {
            const token = this.tokens[this.selectedToken];
            await this.sync.updateField(`battleMap/tokens/${this.selectedToken}`, {
                x: token.x,
                y: token.y
            });
        }
        this.isDrawing = false;
        this.movementStartPos = null;
    }

    startPenDrawing(x, y) {
        this.isAnnotating = true;
        this.penPath = [{ x, y }];
    }

    finishPenDrawing() {
        if (this.penPath.length > 1) {
            const annotation = {
                type: 'pen',
                path: [...this.penPath],
                color: document.getElementById('drawColor').value,
                id: Date.now().toString()
            };
            this.annotations.push(annotation);
            this.syncAnnotations();
        }
        this.penPath = [];
        this.isAnnotating = false;
    }

    addTextAnnotation(x, y) {
        const text = prompt('Enter text:');
        if (text) {
            const annotation = {
                type: 'text',
                x, y,
                text,
                color: document.getElementById('drawColor').value,
                id: Date.now().toString()
            };
            this.annotations.push(annotation);
            this.syncAnnotations();
        }
    }

    eraseAnnotationAt(x, y) {
        const tolerance = 10;
        const toRemove = this.annotations.findIndex(ann => {
            if (ann.type === 'text') {
                const dist = Math.sqrt((x - ann.x) ** 2 + (y - ann.y) ** 2);
                return dist < tolerance;
            } else if (ann.type === 'pen') {
                return ann.path.some(point => {
                    const dist = Math.sqrt((x - point.x) ** 2 + (y - point.y) ** 2);
                    return dist < tolerance;
                });
            }
            return false;
        });
        
        if (toRemove !== -1) {
            this.annotations.splice(toRemove, 1);
            this.syncAnnotations();
        }
    }

    async syncAnnotations() {
        await this.sync.syncData('battleMap/annotations', this.annotations);
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

    updateInitiativeTracker() {
        const list = document.getElementById('initiativeList');
        list.innerHTML = '';
        
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
            
            if (this.combatActive && this.currentTurn === id) {
                li.classList.add('current-turn');
            }
            
            if (this.selectedToken === id) {
                li.classList.add('selected-token');
            }
            
            list.appendChild(li);
        });
    }

    updateSelectedTokenInfo() {
        const infoDiv = document.getElementById('selectedTokenInfo');
        
        if (!this.selectedToken || !this.tokens[this.selectedToken]) {
            infoDiv.innerHTML = `
                <em>No token selected</em>
                <p style="font-size: 0.85rem; margin-top: 0.5rem; color: #666;">
                    💡 Right-click any token for options
                </p>
            `;
            return;
        }
        
        const token = this.tokens[this.selectedToken];
        infoDiv.innerHTML = `
            <div><strong>${token.name}</strong></div>
            <div>HP: ${token.hp}/${token.maxHp}</div>
            <div>AC: ${token.ac || 10}</div>
            <div>Initiative: ${token.initiative || 0}</div>
            ${token.conditions && token.conditions.length > 0 ? 
                `<div>Status: ${token.conditions.join(', ')}</div>` : ''}
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