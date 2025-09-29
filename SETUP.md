# Firebase Setup Instructions

## 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project"
3. Enter your project name and follow the setup wizard

## 2. Enable Authentication

1. In Firebase Console, go to **Authentication** section
2. Click "Get Started"
3. Go to "Sign-in method" tab
4. Enable **Email/Password** authentication
5. Enable **Anonymous** authentication (for guest users)

## 3. Create Realtime Database

1. In Firebase Console, go to **Realtime Database** section
2. Click "Create Database"
3. Choose your region
4. Start in **test mode** for initial setup
5. Click "Enable"

## 4. Set Database Rules

1. In Realtime Database, go to "Rules" tab
2. Replace the rules with:

```json
{
  "rules": {
    "games": {
      "$gameId": {
        ".read": "auth != null",
        ".write": "auth != null",
        "players": {
          "$playerId": {
            ".write": "$playerId === auth.uid || data.parent().child('gm').val() === auth.uid"
          }
        },
        "state": {
          ".write": "auth != null && data.parent().child('players').child(auth.uid).exists()"
        }
      }
    },
    "users": {
      "$uid": {
        ".read": "$uid === auth.uid",
        ".write": "$uid === auth.uid"
      }
    }
  }
}
```

3. Click "Publish"

## 5. Get Firebase Configuration

1. In Firebase Console, go to **Project Settings** (gear icon)
2. Scroll down to "Your apps" section
3. Click "Add app" and select Web (</> icon)
4. Register your app with a nickname
5. Copy the configuration object

## 6. Configure Your App

1. Copy `firebase-config.example.js` to `firebase-config.js`
2. Replace the placeholder values with your configuration:

```javascript
const firebaseConfig = {
    apiKey: "your-actual-api-key",
    authDomain: "your-project.firebaseapp.com",
    databaseURL: "https://your-project.firebaseio.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "your-sender-id",
    appId: "your-app-id"
};
```

## 7. Deploy to GitHub Pages

1. Create repository on GitHub
2. Push your code:
```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```
3. Enable GitHub Pages in repository settings

## 8. (Optional) Configure Custom Domain

1. In Firebase Console, go to **Hosting**
2. Add your custom domain
3. Follow DNS configuration instructions

## Testing Locally

```bash
# Start local server
python3 -m http.server 8000
# or
npx live-server
```

## Troubleshooting

- **Authentication errors**: Check that you've enabled the auth methods in Firebase
- **Database access denied**: Verify your database rules and that users are authenticated
- **CORS errors**: Make sure you're serving files from a web server, not file://
- **Firebase not defined**: Ensure firebase-config.js is created and properly configured
