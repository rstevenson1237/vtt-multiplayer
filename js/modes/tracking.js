export class TrackingMode {
    constructor(eventBus, realtimeSync) {
        this.eventBus = eventBus;
        this.sync = realtimeSync;
        this.entries = [];
        this.sessions = [];
        this.currentEntryId = null;
        this.currentUser = null;
    }

    initialize(gameId, user, role) {
        this.currentUser = user;
        this.userRole = role;
        
        // Listen for tracking updates
        this.sync.listenToData('tracking/entries', (entries) => {
            this.entries = entries ? Object.values(entries) : [];
            this.displaySessions();
            this.displayEntries();
        });

        // Listen for sessions
        this.sync.listenToData('tracking/sessions', (sessions) => {
            this.sessions = sessions ? Object.values(sessions) : [];
            this.displaySessions();
        });
    }

    async addEntry() {
        const title = document.getElementById('entryTitle').value || 'New Entry';
        const content = document.getElementById('entryContent').value;
        const date = document.getElementById('entryDate').value || new Date().toISOString();
        const tags = document.getElementById('entryTags').value
            .split(',')
            .map(tag => tag.trim())
            .filter(tag => tag);

        if (!content) {
            alert('Please enter some content');
            return;
        }

        const entry = {
            id: Date.now().toString(),
            title,
            content,
            date,
            tags,
            author: this.currentUser.displayName || 'Player',
            authorId: this.currentUser.uid,
            created: Date.now(),
            sessionId: this.getCurrentSessionId()
        };

        await this.sync.updateField(`tracking/entries/${entry.id}`, entry);
        this.clearEditor();
    }

    async saveEntry() {
        if (!this.currentEntryId) {
            this.addEntry();
            return;
        }

        const entry = this.entries.find(e => e.id === this.currentEntryId);
        if (!entry) return;

        // Check permissions
        if (entry.authorId !== this.currentUser.uid && this.userRole !== 'referee') {
            alert('You can only edit your own entries');
            return;
        }

        const updatedEntry = {
            ...entry,
            title: document.getElementById('entryTitle').value,
            content: document.getElementById('entryContent').value,
            date: document.getElementById('entryDate').value,
            tags: document.getElementById('entryTags').value
                .split(',')
                .map(tag => tag.trim())
                .filter(tag => tag),
            modified: Date.now(),
            modifiedBy: this.currentUser.displayName
        };

        await this.sync.updateField(`tracking/entries/${this.currentEntryId}`, updatedEntry);
        alert('Entry updated!');
    }

    displaySessions() {
        const sessionList = document.getElementById('sessionList');
        sessionList.innerHTML = '';

        // Group entries by session/date
        const sessionGroups = {};
        this.entries.forEach(entry => {
            const sessionKey = entry.sessionId || entry.date.split('T')[0];
            if (!sessionGroups[sessionKey]) {
                sessionGroups[sessionKey] = [];
            }
            sessionGroups[sessionKey].push(entry);
        });

        // Sort sessions by date (newest first)
        const sortedSessions = Object.keys(sessionGroups).sort((a, b) => b.localeCompare(a));

        sortedSessions.forEach(sessionKey => {
            const li = document.createElement('li');
            const entries = sessionGroups[sessionKey];
            const date = new Date(sessionKey).toLocaleDateString();
            
            li.innerHTML = `
                <div class="session-header">
                    <strong>Session ${date}</strong>
                    <span class="entry-count">${entries.length} entries</span>
                </div>
            `;
            
            li.onclick = () => this.filterBySession(sessionKey);
            sessionList.appendChild(li);
        });
    }

    displayEntries(filter = null) {
        const display = document.getElementById('trackingDisplay');
        display.innerHTML = '';

        let entriesToShow = this.entries;
        if (filter) {
            entriesToShow = this.entries.filter(entry => 
                entry.sessionId === filter || 
                entry.date.startsWith(filter)
            );
        }

        // Sort by date (newest first)
        entriesToShow.sort((a, b) => new Date(b.date) - new Date(a.date));

        entriesToShow.forEach(entry => {
            const entryDiv = document.createElement('div');
            entryDiv.className = 'tracking-entry';
            
            const date = new Date(entry.date).toLocaleString();
            const tags = entry.tags ? entry.tags.map(tag => 
                `<span class="tag">${tag}</span>`
            ).join('') : '';
            
            entryDiv.innerHTML = `
                <div class="entry-header">
                    <h3>${entry.title}</h3>
                    <div class="entry-meta">
                        <span class="author">${entry.author}</span>
                        <span class="date">${date}</span>
                    </div>
                </div>
                <div class="entry-content">${this.formatContent(entry.content)}</div>
                <div class="entry-tags">${tags}</div>
                <div class="entry-actions">
                    ${entry.authorId === this.currentUser.uid || this.userRole === 'referee' ? 
                        `<button onclick="tracking.editEntry('${entry.id}')">Edit</button>
                         <button onclick="tracking.deleteEntry('${entry.id}')" class="danger">Delete</button>` : 
                        ''
                    }
                </div>
            `;
            
            display.appendChild(entryDiv);
        });
    }

    formatContent(content) {
        // Convert line breaks to HTML
        return content.replace(/\n/g, '<br>');
    }

    filterBySession(sessionKey) {
        this.displayEntries(sessionKey);
    }

    editEntry(entryId) {
        const entry = this.entries.find(e => e.id === entryId);
        if (!entry) return;

        this.currentEntryId = entryId;
        document.getElementById('entryTitle').value = entry.title;
        document.getElementById('entryContent').value = entry.content;
        document.getElementById('entryDate').value = entry.date;
        document.getElementById('entryTags').value = entry.tags ? entry.tags.join(', ') : '';
        
        // Scroll to editor
        document.getElementById('trackingEditor').scrollIntoView({ behavior: 'smooth' });
    }

    async deleteEntry(entryId) {
        const entry = this.entries.find(e => e.id === entryId);
        if (!entry) return;

        // Check permissions
        if (entry.authorId !== this.currentUser.uid && this.userRole !== 'referee') {
            alert('You can only delete your own entries');
            return;
        }

        if (confirm(`Delete entry "${entry.title}"?`)) {
            await this.sync.removeItem(`tracking/entries/${entryId}`);
        }
    }

    clearEditor() {
        this.currentEntryId = null;
        document.getElementById('entryTitle').value = '';
        document.getElementById('entryContent').value = '';
        document.getElementById('entryDate').value = new Date().toISOString().slice(0, 16);
        document.getElementById('entryTags').value = '';
    }

    getCurrentSessionId() {
        // Generate a session ID based on current date
        return new Date().toISOString().split('T')[0];
    }

    exportData() {
        const exportData = {
            entries: this.entries,
            sessions: this.sessions,
            exported: new Date().toISOString(),
            gameName: this.currentGame?.name || 'Campaign'
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
        
        const exportName = `campaign_tracking_${Date.now()}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportName);
        linkElement.click();
    }

    activate() {
        this.displaySessions();
        this.displayEntries();
        this.clearEditor();
    }

    cleanup() {
        // Cleanup handled by RealtimeSync
    }
}