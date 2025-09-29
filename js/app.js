// Main Application Module with Firebase Integration
import { AuthManager } from './auth/authManager.js';
import { GameLobby } from './firebase/gameLobby.js';
import { GameSession } from './firebase/gameSession.js';
import { RealtimeSync } from './firebase/realtimeSync.js';
import { BattleMapMode } from './modes/battleMap.js';
import { MappingMode } from './modes/mapping.js';
import { TrackingMode } from './modes/tracking.js';
import { CharacterMode } from './modes/character.js';
import { ChatSystem } from './components/chat.js';
import { EventBus } from './utils/eventBus.js';

class VTTApp {
    constructor() {
        this.currentMode = null;
        this.currentUser = null;
        this.currentGame = null;
        this.modes = {};
        this.eventBus = new EventBus();
        this.db = firebase.database();
        this.auth = firebase.auth();
    }

    async init() {
        console.log('Initializing VTT Multiplayer Application...');
        
        // Initialize authentication
        this.authManager = new AuthManager(this.eventBus, this.auth);
        window.auth = this.authManager;
        
        // Initialize lobby
        this.lobby = new GameLobby(this.eventBus, this.db, this.auth);
        window.lobby = this.lobby;
        
        // Initialize game session manager
        this.gameSession = new GameSession(this.eventBus, this.db, this.auth);
        window.game = this.gameSession;
        
        // Initialize realtime sync
        this.realtimeSync = new RealtimeSync(this.eventBus, this.db);
        
        // Initialize chat system
        this.chat = new ChatSystem(this.eventBus, this.db);
        window.chat = this.chat;
        
        // Initialize modes
        this.modes.battlemap = new BattleMapMode(this.eventBus, this.realtimeSync);
        this.modes.mapping = new MappingMode(this.eventBus, this.realtimeSync);
        this.modes.tracking = new TrackingMode(this.eventBus, this.realtimeSync);
        this.modes.character = new CharacterMode(this.eventBus, this.realtimeSync);
        
        // Make modes available globally
        window.battleMap = this.modes.battlemap;
        window.mapping = this.modes.mapping;
        window.tracking = this.modes.tracking;
        window.character = this.modes.character;
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Check authentication state
        this.auth.onAuthStateChanged((user) => {
            document.getElementById('loadingScreen').classList.add('hidden');
            if (user) {
                this.onAuthSuccess(user);
            } else {
                this.showAuthModal();
            }
        });
    }

    setupEventListeners() {
        // Auth events
        this.eventBus.on('auth:success', (user) => this.onAuthSuccess(user));
        this.eventBus.on('auth:logout', () => this.onLogout());
        
        // Game events
        this.eventBus.on('game:created', (game) => this.onGameCreated(game));
        this.eventBus.on('game:joined', (game) => this.onGameJoined(game));
        this.eventBus.on('game:left', () => this.onGameLeft());
        
        // Mode switching
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.target.dataset.mode;
                this.switchMode(mode);
            });
        });
        
        // Chat input
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.chat.sendMessage();
            }
        });
    }

    showAuthModal() {
        document.getElementById('authModal').classList.remove('hidden');
        document.getElementById('gameLobby').classList.add('hidden');
        document.getElementById('mainNav').classList.add('hidden');
        document.getElementById('appContent').classList.add('hidden');
    }

    onAuthSuccess(user) {
        this.currentUser = user;
        document.getElementById('authModal').classList.add('hidden');
        
        // Show lobby
        document.getElementById('gameLobby').classList.remove('hidden');
        document.getElementById('lobbyUsername').textContent = user.displayName || user.email || 'Guest';
        
        // Load recent games
        this.lobby.loadRecentGames();
    }

    onGameCreated(game) {
        this.currentGame = game;
        this.enterGame(game);
    }

    onGameJoined(game) {
        this.currentGame = game;
        this.enterGame(game);
    }

    enterGame(game) {
        // Hide lobby, show game interface
        document.getElementById('gameLobby').classList.add('hidden');
        document.getElementById('mainNav').classList.remove('hidden');
        document.getElementById('appContent').classList.remove('hidden');
        
        // Display room code
        document.getElementById('roomCodeDisplay').textContent = `Room: ${game.roomCode}`;
        document.getElementById('currentUser').textContent = 
            `${this.currentUser.displayName || 'Guest'} (${game.role})`;
        
        // Initialize realtime sync for this game
        this.realtimeSync.initialize(game.id);
        
        // Initialize chat for this game
        this.chat.initialize(game.id, this.currentUser);
        
        // Initialize all modes with game context
        Object.values(this.modes).forEach(mode => {
            mode.initialize(game.id, this.currentUser, game.role);
        });
        
        // Start with battle map mode
        this.switchMode('battlemap');
        
        // Set up presence system
        this.gameSession.setupPresence(game.id);
    }

    onGameLeft() {
        this.currentGame = null;
        
        // Clean up realtime listeners
        this.realtimeSync.cleanup();
        this.chat.cleanup();
        
        // Clean up modes
        Object.values(this.modes).forEach(mode => {
            if (mode.cleanup) mode.cleanup();
        });
        
        // Return to lobby
        document.getElementById('mainNav').classList.add('hidden');
        document.getElementById('appContent').classList.add('hidden');
        document.getElementById('gameLobby').classList.remove('hidden');
        
        this.lobby.loadRecentGames();
    }

    onLogout() {
        this.currentUser = null;
        this.currentGame = null;
        
        // Clean up
        if (this.currentGame) {
            this.gameSession.leaveGame();
        }
        
        this.showAuthModal();
    }

    switchMode(modeName) {
        // Hide all modes
        document.querySelectorAll('.mode-container').forEach(container => {
            container.classList.add('hidden');
        });
        
        // Remove active state from all buttons
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Show selected mode
        if (modeName && this.modes[modeName]) {
            document.getElementById(`${modeName}Mode`).classList.remove('hidden');
            document.querySelector(`[data-mode="${modeName}"]`).classList.add('active');
            
            // Activate mode
            if (this.modes[modeName].activate) {
                this.modes[modeName].activate();
            }
            
            this.currentMode = modeName;
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new VTTApp();
    app.init();
});

export default VTTApp;
