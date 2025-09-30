# vtt-multiplayer

A real-time multiplayer Virtual Tabletop (VTT) for tabletop role-playing games, powered by Firebase and hosted on GitHub Pages.

## Features

- **Real-time Multiplayer**: All players see the same game state in real-time
- **Game Sessions**: Create and join games with unique room codes
- **Authentication System**: Firebase Auth with user roles (Viewer, Player, Referee)
- **Battle Map Mode**: Synchronized dice rolling, token movement, and stat tracking
- **Mapping Mode**: Collaborative map drawing with real-time updates
- **Tracking Mode**: Shared campaign notes and session logs
- **Character Sheets**: Live character updates visible to all players
- **Chat System**: In-game messaging with dice roll integration
- **Presence System**: See who's online in your game

## Setup Instructions

### 1. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable Authentication:
   - Go to Authentication > Sign-in method
   - Enable Email/Password and Anonymous sign-in
4. Create a Realtime Database:
   - Go to Realtime Database > Create Database
   - Start in test mode (configure rules later)
5. Get your config:
   - Go to Project Settings > General
   - Scroll down to "Your apps" and click "Add app" > Web
   - Copy the configuration

### 2. Configure the App

1. Copy `firebase-config.example.js` to `firebase-config.js`
2. Paste your Firebase configuration

### 3. Database Rules

Add these rules to your Firebase Realtime Database:

```json
{
  "rules": {
    "games": {
      "$gameId": {
        ".read": "auth != null",
        ".write": "auth != null && (data.child('gm').val() === auth.uid || !data.exists())"
      }
    },
    "users": {
      "$uid": {
        ".read": "auth != null",
        ".write": "$uid === auth.uid"
      }
    }
  }
}
```

### 4. Local Development

```bash
# Install dependencies
npm install

# Run local development server
npm run dev
```

### 5. Deployment

```bash
# Deploy to GitHub Pages
npm run deploy
```

Access your site at: https://rstevenson1237.github.io/vtt-multiplayer/

## How to Play

### For Game Masters (Referees):
1. Click "Create New Game"
2. Share the generated Room Code with players
3. You have full control over all game elements

### For Players:
1. Enter the Room Code provided by your GM
2. Click "Join Game"
3. Create or select your character

## Technologies

- Firebase Realtime Database for state synchronization
- Firebase Authentication for user management
- Vanilla JavaScript (ES6+) with modules
- HTML5 Canvas for interactive maps
- CSS3 with CSS Variables
- GitHub Pages for hosting

## License

MIT License
