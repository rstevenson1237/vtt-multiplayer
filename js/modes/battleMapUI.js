export class BattleMapUI {
static showTokenContextMenu(x, y, token, callbacks) {
    // Remove existing menu
    const existing = document.getElementById('tokenContextMenu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.id = 'tokenContextMenu';
    menu.className = 'context-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    const menuItems = [
        { label: '✏️ Edit Token', action: () => callbacks.onEdit(token), description: 'Change name, stats, color' },
        { label: '❤️ Adjust HP', action: () => callbacks.onAdjustHP(token), description: 'Quick HP changes' },
        { label: '🎲 Roll Initiative', action: () => callbacks.onRollInitiative(token), description: 'Roll for combat order' },
        { label: '🎭 Conditions', action: () => callbacks.onAddCondition(token), description: 'Add/remove status effects' },
        { label: '📋 Duplicate', action: () => callbacks.onDuplicate(token), description: 'Create a copy' },
        { label: '🗑️ Delete', action: () => callbacks.onDelete(token), className: 'danger', description: 'Remove token' }
    ];

    menuItems.forEach(item => {
        const menuItem = document.createElement('div');
        menuItem.className = `context-menu-item ${item.className || ''}`;
        menuItem.innerHTML = `
            <div style="display: flex; flex-direction: column;">
                <strong>${item.label}</strong>
                ${item.description ? `<small style="color: #666; font-size: 0.85em;">${item.description}</small>` : ''}
            </div>
        `;
        menuItem.onclick = () => {
            item.action();
            menu.remove();
        };
        menu.appendChild(menuItem);
    });

    document.body.appendChild(menu);

    // Close on click outside
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 0);
}

    static showTokenEditDialog(token, onSave) {
        const dialog = document.createElement('div');
        dialog.className = 'modal';
        dialog.innerHTML = `
            <div class="modal-content token-edit-dialog">
                <h3>Edit Token</h3>
                <label>Name: <input type="text" id="editTokenName" value="${token.name}"></label>
                <label>HP: <input type="number" id="editTokenHP" value="${token.hp}"> / 
                       <input type="number" id="editTokenMaxHP" value="${token.maxHp}"></label>
                <label>AC: <input type="number" id="editTokenAC" value="${token.ac || 10}"></label>
                <label>Initiative Bonus: <input type="number" id="editTokenInitBonus" value="${token.initiativeBonus || 0}"></label>
                <label>Size: 
                    <select id="editTokenSize">
                        <option value="15" ${token.size === 15 ? 'selected' : ''}>Tiny</option>
                        <option value="20" ${token.size === 20 ? 'selected' : ''}>Small</option>
                        <option value="25" ${(token.size === 25 || !token.size) ? 'selected' : ''}>Medium</option>
                        <option value="37.5" ${token.size === 37.5 ? 'selected' : ''}>Large</option>
                        <option value="50" ${token.size === 50 ? 'selected' : ''}>Huge</option>
                        <option value="75" ${token.size === 75 ? 'selected' : ''}>Gargantuan</option>
                    </select>
                </label>
                <label>Color: <input type="color" id="editTokenColor" value="${token.color}"></label>
                <label>Notes: <textarea id="editTokenNotes" rows="3">${token.notes || ''}</textarea></label>
                <div class="dialog-buttons">
                    <button onclick="this.closest('.modal').remove()">Cancel</button>
                    <button class="primary" id="saveTokenEdit">Save</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        document.getElementById('saveTokenEdit').onclick = () => {
            const updatedToken = {
                name: document.getElementById('editTokenName').value,
                hp: parseInt(document.getElementById('editTokenHP').value),
                maxHp: parseInt(document.getElementById('editTokenMaxHP').value),
                ac: parseInt(document.getElementById('editTokenAC').value),
                initiativeBonus: parseInt(document.getElementById('editTokenInitBonus').value),
                size: parseFloat(document.getElementById('editTokenSize').value),
                color: document.getElementById('editTokenColor').value,
                notes: document.getElementById('editTokenNotes').value
            };
            onSave(updatedToken);
            dialog.remove();
        };
    }

static showHPAdjustDialog(token, onAdjust) {
    const dialog = document.createElement('div');
    dialog.className = 'modal';
    
    // FIX: Make adjustment buttons work properly
    let currentHP = token.hp;
    
    dialog.innerHTML = `
        <div class="modal-content hp-adjust-dialog">
            <h3>Adjust HP: ${token.name}</h3>
            <div class="hp-display" id="hpPreview">
                Current: <span id="currentHPDisplay">${currentHP}</span> / ${token.maxHp}
            </div>
            <div class="hp-buttons">
                <button class="hp-adjust-btn" data-adjust="-10">-10</button>
                <button class="hp-adjust-btn" data-adjust="-5">-5</button>
                <button class="hp-adjust-btn" data-adjust="-1">-1</button>
                <input type="number" id="hpAdjustAmount" value="0" placeholder="Custom">
                <button class="hp-adjust-btn" data-adjust="1">+1</button>
                <button class="hp-adjust-btn" data-adjust="5">+5</button>
                <button class="hp-adjust-btn" data-adjust="10">+10</button>
            </div>
            <div class="dialog-buttons">
                <button onclick="this.closest('.modal').remove()">Cancel</button>
                <button class="primary" id="applyHPAdjust">Apply</button>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);
    
    // FIX: Add event listeners properly
    dialog.querySelectorAll('.hp-adjust-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const adjust = parseInt(e.target.dataset.adjust);
            currentHP = Math.max(0, Math.min(token.maxHp, currentHP + adjust));
            document.getElementById('currentHPDisplay').textContent = currentHP;
        });
    });
    
    document.getElementById('applyHPAdjust').onclick = () => {
        const customAdjust = parseInt(document.getElementById('hpAdjustAmount').value) || 0;
        if (customAdjust !== 0) {
            currentHP = Math.max(0, Math.min(token.maxHp, token.hp + customAdjust));
        }
        onAdjust(currentHP);
        dialog.remove();
    };
}

    static showConditionDialog(token, currentConditions, onUpdate) {
        const conditions = [
            'Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled',
            'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified',
            'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious',
            'Concentrating', 'Hasted', 'Slowed', 'Blessed', 'Cursed'
        ];

        const dialog = document.createElement('div');
        dialog.className = 'modal';
        dialog.innerHTML = `
            <div class="modal-content condition-dialog">
                <h3>Conditions: ${token.name}</h3>
                <div class="condition-list">
                    ${conditions.map(cond => `
                        <label class="condition-item">
                            <input type="checkbox" value="${cond}" 
                                ${currentConditions?.includes(cond) ? 'checked' : ''}>
                            ${cond}
                        </label>
                    `).join('')}
                </div>
                <div class="dialog-buttons">
                    <button onclick="this.closest('.modal').remove()">Cancel</button>
                    <button class="primary" id="saveConditions">Save</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        document.getElementById('saveConditions').onclick = () => {
            const selected = Array.from(dialog.querySelectorAll('input[type="checkbox"]:checked'))
                .map(cb => cb.value);
            onUpdate(selected);
            dialog.remove();
        };
    }
}
