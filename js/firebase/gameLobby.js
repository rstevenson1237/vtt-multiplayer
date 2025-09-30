export class GameLobby {
    constructor(eventBus, database, auth) {
        this.eventBus = eventBus;
        this.db = database;
        this.auth = auth;
    }

    generateRoomCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    async createGame() {
        const gameName = document.getElementById('gameName').value || 'New Game';
        const gameSystem = document.getElementById('gameSystem').value;
        const user = this.auth.currentUser;

        if (!user) {
            alert('You must be logged in to create a game');
            return;
        }

        const roomCode = this.generateRoomCode();
        const gameId = this.db.ref('games').push().key;

        const gameData = {
            id: gameId,
            roomCode,
            name: gameName,
            system: gameSystem,
            gm: user.uid,
            gmName: user.displayName || 'GM',
            created: firebase.database.ServerValue.TIMESTAMP,
            players: {
                [user.uid]: {
                    name: user.displayName || 'GM',
                    role: 'referee',
                    joined: firebase.database.ServerValue.TIMESTAMP
                }
            },
            state: {
                currentMode: 'battlemap',
                battleMap: {},
                mapping: {},
                tracking: {},
                characters: {}
            }
        };

        try {
            // Create game in database
            await this.db.ref(`games/${gameId}`).set(gameData);
            
            // Add to user's games
            await this.db.ref(`users/${user.uid}/games/${gameId}`).set({
                name: gameName,
                roomCode,
                role: 'referee',
                joined: firebase.database.ServerValue.TIMESTAMP
            });

            this.eventBus.emit('game:created', {
                ...gameData,
                role: 'referee'
            });
        } catch (error) {
            console.error('Error creating game:', error);
            alert('Failed to create game');
        }
    }

    async joinGame() {
        const roomCode = document.getElementById('roomCode').value.toUpperCase();
        const role = document.getElementById('joinRole').value;
        const user = this.auth.currentUser;

        if (!roomCode) {
            alert('Please enter a room code');
            return;
        }

        if (!user) {
            alert('You must be logged in to join a game');
            return;
        }

        try {
            // Find game by room code
            const gamesSnapshot = await this.db.ref('games')
                .orderByChild('roomCode')
                .equalTo(roomCode)
                .once('value');

            const games = gamesSnapshot.val();
            if (!games) {
                alert('Game not found. Please check the room code.');
                return;
            }

            const gameId = Object.keys(games)[0];
            const game = games[gameId];

            // Add player to game
            await this.db.ref(`games/${gameId}/players/${user.uid}`).set({
                name: user.displayName || 'Player',
                role,
                joined: firebase.database.ServerValue.TIMESTAMP
            });

            // Add to user's games
            await this.db.ref(`users/${user.uid}/games/${gameId}`).set({
                name: game.name,
                roomCode,
                role,
                joined: firebase.database.ServerValue.TIMESTAMP
            });

            this.eventBus.emit('game:joined', {
                ...game,
                id: gameId,
                role
            });
        } catch (error) {
            console.error('Error joining game:', error);
            alert('Failed to join game');
        }
    }

    async loadRecentGames() {
        const user = this.auth.currentUser;
        if (!user) return;

        try {
            const userGamesSnapshot = await this.db.ref(`users/${user.uid}/games`)
                .orderByChild('joined')
                .limitToLast(5)
                .once('value');

            const userGames = userGamesSnapshot.val();
            if (!userGames) {
                document.getElementById('recentGames').classList.add('hidden');
                return;
            }

            const gamesList = document.getElementById('recentGamesList');
            gamesList.innerHTML = '';

            for (const [gameId, gameInfo] of Object.entries(userGames)) {
                // Get current player count
                const playersSnapshot = await this.db.ref(`games/${gameId}/players`).once('value');
                const players = playersSnapshot.val();
                const playerCount = players ? Object.keys(players).length : 0;

                const li = document.createElement('li');
                li.innerHTML = `
                    <div class="game-info">
                        <span class="game-name">${gameInfo.name}</span>
                        <span class="game-meta">Room: ${gameInfo.roomCode} • ${gameInfo.role}</span>
                    </div>
                    <span class="player-count">${playerCount} players</span>
                `;
                
                li.onclick = async () => {
                    // Rejoin game
                    const gameSnapshot = await this.db.ref(`games/${gameId}`).once('value');
                    const game = gameSnapshot.val();
                    if (game) {
                        this.eventBus.emit('game:joined', {
                            ...game,
                            id: gameId,
                            role: gameInfo.role
                        });
                    } else {
                        alert('Game no longer exists');
                        // Remove from user's games
                        await this.db.ref(`users/${user.uid}/games/${gameId}`).remove();
                        this.loadRecentGames();
                    }
                };

                gamesList.appendChild(li);
            }

            document.getElementById('recentGames').classList.remove('hidden');
        } catch (error) {
            console.error('Error loading recent games:', error);
        }
    }
}
