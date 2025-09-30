export class AuthManager {
    constructor(eventBus, firebaseAuth) {
        this.eventBus = eventBus;
        this.auth = firebaseAuth;
        this.currentUser = null;
    }

    async login() {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const displayName = document.getElementById('displayName').value;

        if (!displayName) {
            alert('Please enter a display name');
            return;
        }

        try {
            let user;
            
            if (email && password) {
                // Try to sign in first
                try {
                    const result = await this.auth.signInWithEmailAndPassword(email, password);
                    user = result.user;
                } catch (error) {
                    if (error.code === 'auth/user-not-found') {
                        // Create new account
                        const result = await this.auth.createUserWithEmailAndPassword(email, password);
                        user = result.user;
                    } else {
                        throw error;
                    }
                }
            } else {
                // Guest login
                const result = await this.auth.signInAnonymously();
                user = result.user;
            }

            // Update display name
            await user.updateProfile({ displayName });
            
            // Store user data in database
            await firebase.database().ref(`users/${user.uid}`).update({
                displayName,
                email: email || null,
                lastLogin: firebase.database.ServerValue.TIMESTAMP
            });

            this.currentUser = user;
            this.eventBus.emit('auth:success', user);
        } catch (error) {
            console.error('Auth error:', error);
            alert(`Login failed: ${error.message}`);
        }
    }

    async loginAsGuest() {
        const displayName = document.getElementById('displayName').value || 'Guest';
        
        try {
            const result = await this.auth.signInAnonymously();
            const user = result.user;
            
            await user.updateProfile({ displayName });
            
            await firebase.database().ref(`users/${user.uid}`).update({
                displayName,
                isGuest: true,
                lastLogin: firebase.database.ServerValue.TIMESTAMP
            });

            this.currentUser = user;
            this.eventBus.emit('auth:success', user);
        } catch (error) {
            console.error('Guest login error:', error);
            alert('Failed to login as guest');
        }
    }

    async logout() {
        try {
            await this.auth.signOut();
            this.currentUser = null;
            this.eventBus.emit('auth:logout');
        } catch (error) {
            console.error('Logout error:', error);
        }
    }
}
