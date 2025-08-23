import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  FacebookAuthProvider,
  GithubAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  TwitterAuthProvider,
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  getRedirectResult,
  linkWithCredential,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  unlink,
  updateEmail,
  updatePassword,
  updateProfile,
  verifyBeforeUpdateEmail,
} from 'firebase/auth';
import admin from 'firebase-admin';
import { logger } from '../config/logger.js';

class FirebaseAuthService {
  constructor(database, dynamicConfig = null) {
    this.db = database;
    this.dynamicConfig = dynamicConfig;
    this.auth = null;
    this.adminAuth = null;
    this.initialized = false;
  }

  async getFirebaseConfiguration() {
    if (this.dynamicConfig) {
      return {
        client: {
          apiKey: await this.dynamicConfig.get(
            'firebase_web_api_key',
            process.env.FIREBASE_WEB_API_KEY
          ),
          authDomain: await this.dynamicConfig.get(
            'firebase_auth_domain',
            process.env.FIREBASE_AUTH_DOMAIN
          ),
          projectId: await this.dynamicConfig.get(
            'firebase_project_id',
            process.env.FIREBASE_PROJECT_ID
          ),
          storageBucket: await this.dynamicConfig.get(
            'firebase_storage_bucket',
            process.env.FIREBASE_STORAGE_BUCKET
          ),
          messagingSenderId: await this.dynamicConfig.get(
            'firebase_messaging_sender_id',
            process.env.FIREBASE_MESSAGING_SENDER_ID
          ),
          appId: await this.dynamicConfig.get('firebase_app_id', process.env.FIREBASE_APP_ID),
        },
        admin: {
          type: 'service_account',
          project_id: await this.dynamicConfig.get(
            'firebase_project_id',
            process.env.FIREBASE_PROJECT_ID
          ),
          private_key_id: await this.dynamicConfig.get(
            'firebase_private_key_id',
            process.env.FIREBASE_PRIVATE_KEY_ID
          ),
          private_key: (
            await this.dynamicConfig.get('firebase_private_key', process.env.FIREBASE_PRIVATE_KEY)
          )?.replace(/\\n/g, '\n'),
          client_email: await this.dynamicConfig.get(
            'firebase_client_email',
            process.env.FIREBASE_CLIENT_EMAIL
          ),
          client_id: await this.dynamicConfig.get(
            'firebase_client_id',
            process.env.FIREBASE_CLIENT_ID
          ),
          auth_uri: await this.dynamicConfig.get(
            'firebase_auth_uri',
            'https://accounts.google.com/o/oauth2/auth'
          ),
          token_uri: await this.dynamicConfig.get(
            'firebase_token_uri',
            'https://oauth2.googleapis.com/token'
          ),
          auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
          client_x509_cert_url: await this.dynamicConfig.get(
            'firebase_client_cert_url',
            process.env.FIREBASE_CLIENT_CERT_URL
          ),
        },
      };
    }

    // Fallback to environment variables
    return {
      client: {
        apiKey: process.env.FIREBASE_WEB_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID,
      },
      admin: {
        type: 'service_account',
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: process.env.FIREBASE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
        token_uri: process.env.FIREBASE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
      },
    };
  }

  /**
   * Initialize Firebase client and admin SDKs
   */
  async initialize() {
    try {
      const config = await this.getFirebaseConfiguration();

      // Initialize Firebase client SDK
      if (this.isConfigValid(config.client)) {
        let app;
        if (getApps().length === 0) {
          app = initializeApp(config.client);
        } else {
          app = getApp();
        }

        this.auth = getAuth(app);

        // Connect to Firebase Auth Emulator if in development
        if (process.env.NODE_ENV === 'development' && process.env.FIREBASE_AUTH_EMULATOR_HOST) {
          connectAuthEmulator(this.auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`);
        }

        logger.info('Firebase client SDK initialized successfully');
      } else {
        logger.warn('Firebase client configuration incomplete, skipping client SDK initialization');
      }

      // Initialize Firebase Admin SDK
      if (this.isConfigValid(config.admin, true)) {
        if (admin.apps.length === 0) {
          admin.initializeApp({
            credential: admin.credential.cert(config.admin),
            projectId: config.admin.project_id,
          });
        }

        this.adminAuth = admin.auth();
        logger.info('Firebase Admin SDK initialized successfully');
      } else {
        logger.warn('Firebase admin configuration incomplete, skipping admin SDK initialization');
      }

      this.initialized = true;
      return true;
    } catch (error) {
      logger.error('Failed to initialize Firebase:', error);
      throw error;
    }
  }

  /**
   * Check if Firebase configuration is valid
   */
  isConfigValid(config, isAdmin = false) {
    if (isAdmin) {
      return !!(config.project_id && config.private_key && config.client_email);
    }
    return !!(config.apiKey && config.authDomain && config.projectId);
  }

  /**
   * Create user with email and password
   */
  async createUserWithEmail(email, password, additionalInfo = {}) {
    try {
      if (!this.auth) {
        throw new Error('Firebase client not initialized');
      }

      const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
      const user = userCredential.user;

      // Update profile if additional info provided
      if (additionalInfo.displayName) {
        await updateProfile(user, {
          displayName: additionalInfo.displayName,
          photoURL: additionalInfo.photoURL || null,
        });
      }

      // Sync user to local database
      await this.syncUserToDatabase(user, additionalInfo);

      logger.info('Firebase user created successfully:', {
        uid: user.uid,
        email: user.email,
      });

      return {
        success: true,
        user: {
          uid: user.uid,
          email: user.email,
          emailVerified: user.emailVerified,
          displayName: user.displayName,
          photoURL: user.photoURL,
        },
      };
    } catch (error) {
      logger.error('Failed to create Firebase user:', {
        email,
        error: error.message,
      });

      return {
        success: false,
        error: this.mapFirebaseError(error),
      };
    }
  }

  /**
   * Sign in user with email and password
   */
  async signInWithEmail(email, password) {
    try {
      if (!this.auth) {
        throw new Error('Firebase client not initialized');
      }

      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      const user = userCredential.user;

      // Update last login in database
      await this.updateUserLastLogin(user.uid);

      logger.info('Firebase user signed in successfully:', {
        uid: user.uid,
        email: user.email,
      });

      return {
        success: true,
        user: {
          uid: user.uid,
          email: user.email,
          emailVerified: user.emailVerified,
          displayName: user.displayName,
          photoURL: user.photoURL,
        },
      };
    } catch (error) {
      logger.error('Failed to sign in Firebase user:', {
        email,
        error: error.message,
      });

      return {
        success: false,
        error: this.mapFirebaseError(error),
      };
    }
  }

  /**
   * Sign in with Google
   */
  async signInWithGoogle() {
    try {
      if (!this.auth) {
        throw new Error('Firebase client not initialized');
      }

      const provider = new GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');

      const result = await signInWithPopup(this.auth, provider);
      const user = result.user;
      const credential = GoogleAuthProvider.credentialFromResult(result);

      // Sync user to local database
      await this.syncUserToDatabase(user, {
        provider: 'google',
        accessToken: credential.accessToken,
      });

      logger.info('Firebase Google sign in successful:', {
        uid: user.uid,
        email: user.email,
      });

      return {
        success: true,
        user: {
          uid: user.uid,
          email: user.email,
          emailVerified: user.emailVerified,
          displayName: user.displayName,
          photoURL: user.photoURL,
        },
      };
    } catch (error) {
      logger.error('Failed to sign in with Google:', error);

      return {
        success: false,
        error: this.mapFirebaseError(error),
      };
    }
  }

  /**
   * Sign in with Facebook
   */
  async signInWithFacebook() {
    try {
      if (!this.auth) {
        throw new Error('Firebase client not initialized');
      }

      const provider = new FacebookAuthProvider();
      provider.addScope('email');

      const result = await signInWithPopup(this.auth, provider);
      const user = result.user;
      const credential = FacebookAuthProvider.credentialFromResult(result);

      // Sync user to local database
      await this.syncUserToDatabase(user, {
        provider: 'facebook',
        accessToken: credential.accessToken,
      });

      logger.info('Firebase Facebook sign in successful:', {
        uid: user.uid,
        email: user.email,
      });

      return {
        success: true,
        user: {
          uid: user.uid,
          email: user.email,
          emailVerified: user.emailVerified,
          displayName: user.displayName,
          photoURL: user.photoURL,
        },
      };
    } catch (error) {
      logger.error('Failed to sign in with Facebook:', error);

      return {
        success: false,
        error: this.mapFirebaseError(error),
      };
    }
  }

  /**
   * Sign in with GitHub
   */
  async signInWithGitHub() {
    try {
      if (!this.auth) {
        throw new Error('Firebase client not initialized');
      }

      const provider = new GithubAuthProvider();
      provider.addScope('user:email');

      const result = await signInWithPopup(this.auth, provider);
      const user = result.user;
      const credential = GithubAuthProvider.credentialFromResult(result);

      // Sync user to local database
      await this.syncUserToDatabase(user, {
        provider: 'github',
        accessToken: credential.accessToken,
      });

      logger.info('Firebase GitHub sign in successful:', {
        uid: user.uid,
        email: user.email,
      });

      return {
        success: true,
        user: {
          uid: user.uid,
          email: user.email,
          emailVerified: user.emailVerified,
          displayName: user.displayName,
          photoURL: user.photoURL,
        },
      };
    } catch (error) {
      logger.error('Failed to sign in with GitHub:', error);

      return {
        success: false,
        error: this.mapFirebaseError(error),
      };
    }
  }

  /**
   * Sign in with Twitter
   */
  async signInWithTwitter() {
    try {
      if (!this.auth) {
        throw new Error('Firebase client not initialized');
      }

      const provider = new TwitterAuthProvider();

      const result = await signInWithPopup(this.auth, provider);
      const user = result.user;
      const credential = TwitterAuthProvider.credentialFromResult(result);

      // Sync user to local database
      await this.syncUserToDatabase(user, {
        provider: 'twitter',
        accessToken: credential.accessToken,
      });

      logger.info('Firebase Twitter sign in successful:', {
        uid: user.uid,
        email: user.email,
      });

      return {
        success: true,
        user: {
          uid: user.uid,
          email: user.email,
          emailVerified: user.emailVerified,
          displayName: user.displayName,
          photoURL: user.photoURL,
        },
      };
    } catch (error) {
      logger.error('Failed to sign in with Twitter:', error);

      return {
        success: false,
        error: this.mapFirebaseError(error),
      };
    }
  }

  /**
   * Sign in with Microsoft
   */
  async signInWithMicrosoft() {
    try {
      if (!this.auth) {
        throw new Error('Firebase client not initialized');
      }

      const provider = new OAuthProvider('microsoft.com');
      provider.addScope('email');
      provider.addScope('profile');

      const result = await signInWithPopup(this.auth, provider);
      const user = result.user;
      const credential = OAuthProvider.credentialFromResult(result);

      // Sync user to local database
      await this.syncUserToDatabase(user, {
        provider: 'microsoft',
        accessToken: credential.accessToken,
      });

      logger.info('Firebase Microsoft sign in successful:', {
        uid: user.uid,
        email: user.email,
      });

      return {
        success: true,
        user: {
          uid: user.uid,
          email: user.email,
          emailVerified: user.emailVerified,
          displayName: user.displayName,
          photoURL: user.photoURL,
        },
      };
    } catch (error) {
      logger.error('Failed to sign in with Microsoft:', error);

      return {
        success: false,
        error: this.mapFirebaseError(error),
      };
    }
  }

  /**
   * Sign in with Apple
   */
  async signInWithApple() {
    try {
      if (!this.auth) {
        throw new Error('Firebase client not initialized');
      }

      const provider = new OAuthProvider('apple.com');
      provider.addScope('email');
      provider.addScope('name');

      const result = await signInWithPopup(this.auth, provider);
      const user = result.user;
      const credential = OAuthProvider.credentialFromResult(result);

      // Sync user to local database
      await this.syncUserToDatabase(user, {
        provider: 'apple',
        accessToken: credential.accessToken,
      });

      logger.info('Firebase Apple sign in successful:', {
        uid: user.uid,
        email: user.email,
      });

      return {
        success: true,
        user: {
          uid: user.uid,
          email: user.email,
          emailVerified: user.emailVerified,
          displayName: user.displayName,
          photoURL: user.photoURL,
        },
      };
    } catch (error) {
      logger.error('Failed to sign in with Apple:', error);

      return {
        success: false,
        error: this.mapFirebaseError(error),
      };
    }
  }

  /**
   * Sign in anonymously
   */
  async signInAnonymously() {
    try {
      if (!this.auth) {
        throw new Error('Firebase client not initialized');
      }

      const result = await signInAnonymously(this.auth);
      const user = result.user;

      // Sync anonymous user to local database
      await this.syncUserToDatabase(user, {
        provider: 'anonymous',
        displayName: `Anonymous User`,
        firstName: 'Anonymous',
        lastName: 'User',
      });

      logger.info('Firebase anonymous sign in successful:', {
        uid: user.uid,
        isAnonymous: user.isAnonymous,
      });

      return {
        success: true,
        user: {
          uid: user.uid,
          email: user.email,
          emailVerified: user.emailVerified,
          displayName: user.displayName,
          photoURL: user.photoURL,
          isAnonymous: user.isAnonymous,
        },
      };
    } catch (error) {
      logger.error('Failed to sign in anonymously:', error);

      return {
        success: false,
        error: this.mapFirebaseError(error),
      };
    }
  }

  /**
   * Sign out current user
   */
  async signOutUser() {
    try {
      if (!this.auth) {
        throw new Error('Firebase client not initialized');
      }

      await signOut(this.auth);

      logger.info('Firebase user signed out successfully');

      return { success: true };
    } catch (error) {
      logger.error('Failed to sign out Firebase user:', error);

      return {
        success: false,
        error: this.mapFirebaseError(error),
      };
    }
  }

  /**
   * Verify Firebase ID token (server-side)
   */
  async verifyIdToken(idToken) {
    try {
      if (!this.adminAuth) {
        throw new Error('Firebase Admin not initialized');
      }

      const decodedToken = await this.adminAuth.verifyIdToken(idToken);

      return {
        success: true,
        user: {
          uid: decodedToken.uid,
          email: decodedToken.email,
          emailVerified: decodedToken.email_verified,
          name: decodedToken.name,
          picture: decodedToken.picture,
          firebase: decodedToken,
        },
      };
    } catch (error) {
      logger.error('Failed to verify Firebase ID token:', error);

      return {
        success: false,
        error: 'Invalid or expired token',
      };
    }
  }

  /**
   * Create custom token for user
   */
  async createCustomToken(uid, additionalClaims = {}) {
    try {
      if (!this.adminAuth) {
        throw new Error('Firebase Admin not initialized');
      }

      const customToken = await this.adminAuth.createCustomToken(uid, additionalClaims);

      return {
        success: true,
        token: customToken,
      };
    } catch (error) {
      logger.error('Failed to create custom token:', error);

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Sync Firebase user to local database
   */
  async syncUserToDatabase(firebaseUser, additionalInfo = {}) {
    try {
      const userData = {
        firebase_uid: firebaseUser.uid,
        email: firebaseUser.email,
        name: firebaseUser.displayName || additionalInfo.displayName || 'User',
        first_name: additionalInfo.firstName || firebaseUser.displayName?.split(' ')[0] || 'User',
        last_name:
          additionalInfo.lastName || firebaseUser.displayName?.split(' ').slice(1).join(' ') || '',
        avatar_url: firebaseUser.photoURL || additionalInfo.photoURL,
        is_verified: firebaseUser.emailVerified,
        provider: additionalInfo.provider || 'email',
        last_login: new Date(),
      };

      // Check if user already exists
      const existingUser = await this.db.query(
        'SELECT id FROM users WHERE email = $1 OR firebase_uid = $2',
        [firebaseUser.email, firebaseUser.uid]
      );

      if (existingUser.rows.length > 0) {
        // Update existing user
        await this.db.query(
          `UPDATE users SET 
                        firebase_uid = $1,
                        name = $2,
                        first_name = $3,
                        last_name = $4,
                        avatar_url = $5,
                        is_verified = $6,
                        last_login = $7,
                        login_count = login_count + 1,
                        updated_at = NOW()
                     WHERE id = $8`,
          [
            userData.firebase_uid,
            userData.name,
            userData.first_name,
            userData.last_name,
            userData.avatar_url,
            userData.is_verified,
            userData.last_login,
            existingUser.rows[0].id,
          ]
        );

        return existingUser.rows[0].id;
      } else {
        // Get starting credits from dynamic configuration
        let startingCredits = 0;
        if (this.dynamicConfig) {
          try {
            startingCredits = await this.dynamicConfig.get('new_user_starting_credits', 0);
          } catch (error) {
            logger.warn('Failed to get starting credits from config, using default 0:', error);
          }
        }

        // Create new user
        const result = await this.db.query(
          `INSERT INTO users (
                        firebase_uid, email, name, first_name, last_name, avatar_url,
                        is_verified, last_login, login_count, credits, created_at, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, NOW(), NOW())
                    RETURNING id`,
          [
            userData.firebase_uid,
            userData.email,
            userData.name,
            userData.first_name,
            userData.last_name,
            userData.avatar_url,
            userData.is_verified,
            userData.last_login,
            startingCredits,
          ]
        );

        // Create email preferences for new user
        try {
          await this.db.query(
            `INSERT INTO user_email_preferences (user_id, unsubscribe_token)
                         VALUES ($1, $2)`,
            [result.rows[0].id, require('crypto').randomBytes(32).toString('hex')]
          );
        } catch (emailPrefError) {
          logger.warn('Failed to create email preferences for Firebase user:', emailPrefError);
        }

        return result.rows[0].id;
      }
    } catch (error) {
      logger.error('Failed to sync Firebase user to database:', error);
      throw error;
    }
  }

  /**
   * Update user last login time
   */
  async updateUserLastLogin(firebaseUid) {
    try {
      await this.db.query(
        `UPDATE users SET 
                    last_login = NOW(),
                    last_activity = NOW(),
                    login_count = login_count + 1
                 WHERE firebase_uid = $1`,
        [firebaseUid]
      );
    } catch (error) {
      logger.warn('Failed to update user last login:', error);
    }
  }

  /**
   * Get user by Firebase UID
   */
  async getUserByFirebaseUid(firebaseUid) {
    try {
      const result = await this.db.query('SELECT * FROM users WHERE firebase_uid = $1', [
        firebaseUid,
      ]);

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get user by Firebase UID:', error);
      throw error;
    }
  }

  /**
   * Delete user from Firebase and local database
   */
  async deleteUserAccount(firebaseUid) {
    try {
      // Get local user first
      const localUser = await this.getUserByFirebaseUid(firebaseUid);

      if (!localUser) {
        throw new Error('User not found in local database');
      }

      // Delete from Firebase
      if (this.adminAuth) {
        await this.adminAuth.deleteUser(firebaseUid);
      }

      // Delete from local database
      await this.db.query('DELETE FROM users WHERE firebase_uid = $1', [firebaseUid]);

      logger.info('User account deleted successfully:', {
        firebaseUid,
        localUserId: localUser.id,
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to delete user account:', error);
      throw error;
    }
  }

  /**
   * Send email verification to user
   */
  async sendEmailVerificationToUser(user) {
    try {
      await sendEmailVerification(user);

      logger.info('Email verification sent successfully:', {
        uid: user.uid,
        email: user.email,
      });

      return {
        success: true,
        message: 'Verification email sent successfully',
      };
    } catch (error) {
      logger.error('Failed to send email verification:', error);

      return {
        success: false,
        error: this.mapFirebaseError(error),
      };
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmailToUser(email, actionCodeSettings = null) {
    try {
      if (!this.auth) {
        throw new Error('Firebase client not initialized');
      }

      await sendPasswordResetEmail(this.auth, email, actionCodeSettings);

      logger.info('Password reset email sent successfully:', { email });

      return {
        success: true,
        message: 'Password reset email sent successfully',
      };
    } catch (error) {
      logger.error('Failed to send password reset email:', error);

      return {
        success: false,
        error: this.mapFirebaseError(error),
      };
    }
  }

  /**
   * Verify email action code
   */
  async verifyEmailActionCode(actionCode) {
    try {
      if (!this.auth) {
        throw new Error('Firebase client not initialized');
      }

      const info = await checkActionCode(this.auth, actionCode);
      await applyActionCode(this.auth, actionCode);

      // Update user verification status in database
      if (info.data && info.data.email) {
        await this.db.query('UPDATE users SET is_verified = true WHERE email = $1', [
          info.data.email,
        ]);
      }

      logger.info('Email verification successful:', {
        email: info.data?.email,
        operation: info.operation,
      });

      return {
        success: true,
        operation: info.operation,
        email: info.data?.email,
      };
    } catch (error) {
      logger.error('Failed to verify email action code:', error);

      return {
        success: false,
        error: this.mapFirebaseError(error),
      };
    }
  }

  /**
   * Confirm password reset with action code
   */
  async confirmPasswordResetWithCode(actionCode, newPassword) {
    try {
      if (!this.auth) {
        throw new Error('Firebase client not initialized');
      }

      await confirmPasswordReset(this.auth, actionCode, newPassword);

      logger.info('Password reset confirmed successfully');

      return {
        success: true,
        message: 'Password reset completed successfully',
      };
    } catch (error) {
      logger.error('Failed to confirm password reset:', error);

      return {
        success: false,
        error: this.mapFirebaseError(error),
      };
    }
  }

  /**
   * Update user profile information
   */
  async updateUserProfile(user, profileData) {
    try {
      await updateProfile(user, profileData);

      // Sync updated profile to local database
      await this.syncUserToDatabase(user, {
        displayName: profileData.displayName,
        photoURL: profileData.photoURL,
      });

      logger.info('User profile updated successfully:', {
        uid: user.uid,
        email: user.email,
      });

      return {
        success: true,
        user: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
        },
      };
    } catch (error) {
      logger.error('Failed to update user profile:', error);

      return {
        success: false,
        error: this.mapFirebaseError(error),
      };
    }
  }

  /**
   * Update user email with verification
   */
  async updateUserEmail(user, newEmail, actionCodeSettings = null) {
    try {
      await verifyBeforeUpdateEmail(user, newEmail, actionCodeSettings);

      logger.info('Email update verification sent:', {
        uid: user.uid,
        oldEmail: user.email,
        newEmail,
      });

      return {
        success: true,
        message: 'Email update verification sent. Please check your new email.',
      };
    } catch (error) {
      logger.error('Failed to update user email:', error);

      return {
        success: false,
        error: this.mapFirebaseError(error),
      };
    }
  }

  /**
   * Update user password
   */
  async updateUserPassword(user, newPassword) {
    try {
      await updatePassword(user, newPassword);

      logger.info('User password updated successfully:', {
        uid: user.uid,
        email: user.email,
      });

      return {
        success: true,
        message: 'Password updated successfully',
      };
    } catch (error) {
      logger.error('Failed to update user password:', error);

      return {
        success: false,
        error: this.mapFirebaseError(error),
      };
    }
  }

  /**
   * Link authentication provider to existing account
   */
  async linkAccountWithCredential(user, credential) {
    try {
      const result = await linkWithCredential(user, credential);

      // Update user in local database with new provider info
      await this.syncUserToDatabase(result.user, {
        provider: credential.providerId,
        linkedProvider: true,
      });

      logger.info('Account linked successfully:', {
        uid: user.uid,
        email: user.email,
        provider: credential.providerId,
      });

      return {
        success: true,
        user: {
          uid: result.user.uid,
          email: result.user.email,
          emailVerified: result.user.emailVerified,
          displayName: result.user.displayName,
          photoURL: result.user.photoURL,
          providerData: result.user.providerData,
        },
      };
    } catch (error) {
      logger.error('Failed to link account:', error);

      return {
        success: false,
        error: this.mapFirebaseError(error),
      };
    }
  }

  /**
   * Unlink authentication provider from account
   */
  async unlinkAccountProvider(user, providerId) {
    try {
      const result = await unlink(user, providerId);

      // Log the unlinking event
      await this.db.query(
        `INSERT INTO user_auth_events (user_id, event_type, provider, ip_address, user_agent, created_at)
                 VALUES ((SELECT id FROM users WHERE firebase_uid = $1), 'provider_unlinked', $2, $3, $4, NOW())`,
        [user.uid, providerId, 'system', 'FirebaseAuthService']
      );

      logger.info('Provider unlinked successfully:', {
        uid: user.uid,
        email: user.email,
        provider: providerId,
      });

      return {
        success: true,
        user: {
          uid: result.uid,
          email: result.email,
          emailVerified: result.emailVerified,
          displayName: result.displayName,
          photoURL: result.photoURL,
          providerData: result.providerData,
        },
      };
    } catch (error) {
      logger.error('Failed to unlink provider:', error);

      return {
        success: false,
        error: this.mapFirebaseError(error),
      };
    }
  }

  /**
   * Get user's linked providers
   */
  async getUserProviders(user) {
    try {
      return {
        success: true,
        providers: user.providerData.map(provider => ({
          providerId: provider.providerId,
          uid: provider.uid,
          email: provider.email,
          displayName: provider.displayName,
          photoURL: provider.photoURL,
        })),
      };
    } catch (error) {
      logger.error('Failed to get user providers:', error);
      return {
        success: false,
        error: this.mapFirebaseError(error),
      };
    }
  }

  /**
   * Link provider to account using ID token
   */
  async linkProviderToAccount(idToken, providerData) {
    try {
      // First verify the user's ID token
      const tokenResult = await this.verifyIdToken(idToken);
      if (!tokenResult.success) {
        return { success: false, error: 'Invalid authentication token' };
      }

      // Get user record from Admin SDK
      if (!this.adminAuth) {
        throw new Error('Firebase Admin not initialized');
      }

      const userRecord = await this.adminAuth.getUser(tokenResult.user.uid);

      // Check if provider is already linked
      const isAlreadyLinked = userRecord.providerData.some(
        provider => provider.providerId === providerData.providerId
      );

      if (isAlreadyLinked) {
        return { success: false, error: 'This provider is already linked to your account' };
      }

      // Create provider credential based on provider type
      let credential;
      switch (providerData.providerId) {
        case 'google.com':
          credential = GoogleAuthProvider.credential(
            providerData.idToken,
            providerData.accessToken
          );
          break;
        case 'facebook.com':
          credential = FacebookAuthProvider.credential(providerData.accessToken);
          break;
        case 'github.com':
          credential = GithubAuthProvider.credential(providerData.accessToken);
          break;
        case 'twitter.com':
          credential = TwitterAuthProvider.credential(
            providerData.accessToken,
            providerData.secret
          );
          break;
        case 'microsoft.com':
          const microsoftProvider = new OAuthProvider('microsoft.com');
          credential = microsoftProvider.credential({
            idToken: providerData.idToken,
            accessToken: providerData.accessToken,
          });
          break;
        case 'apple.com':
          const appleProvider = new OAuthProvider('apple.com');
          credential = appleProvider.credential({
            idToken: providerData.idToken,
          });
          break;
        default:
          return { success: false, error: 'Unsupported provider' };
      }

      // Link the credential using Admin SDK
      await this.adminAuth.updateUser(userRecord.uid, {
        providerToLink: credential,
      });

      // Log the linking event
      await this.db.query(
        `INSERT INTO user_auth_events (user_id, event_type, provider, ip_address, user_agent, created_at)
                 VALUES ((SELECT id FROM users WHERE firebase_uid = $1), 'provider_linked', $2, $3, $4, NOW())`,
        [userRecord.uid, providerData.providerId, 'system', 'FirebaseAuthService']
      );

      logger.info('Provider linked successfully:', {
        uid: userRecord.uid,
        email: userRecord.email,
        provider: providerData.providerId,
      });

      return {
        success: true,
        user: {
          uid: userRecord.uid,
          email: userRecord.email,
          emailVerified: userRecord.emailVerified,
          displayName: userRecord.displayName,
          photoURL: userRecord.photoURL,
          providerData: userRecord.providerData,
        },
      };
    } catch (error) {
      logger.error('Failed to link provider to account:', error);
      return {
        success: false,
        error: this.mapFirebaseError(error).message,
      };
    }
  }

  /**
   * Unlink provider from account using ID token
   */
  async unlinkProviderFromAccount(idToken, providerId) {
    try {
      // First verify the user's ID token
      const tokenResult = await this.verifyIdToken(idToken);
      if (!tokenResult.success) {
        return { success: false, error: 'Invalid authentication token' };
      }

      // Get user record from Admin SDK
      if (!this.adminAuth) {
        throw new Error('Firebase Admin not initialized');
      }

      const userRecord = await this.adminAuth.getUser(tokenResult.user.uid);

      // Check if provider is linked
      const isLinked = userRecord.providerData.some(provider => provider.providerId === providerId);

      if (!isLinked) {
        return { success: false, error: 'This provider is not linked to your account' };
      }

      // Check if this is the only provider (prevent account lockout)
      if (userRecord.providerData.length === 1 && !userRecord.passwordHash) {
        return { success: false, error: 'Cannot unlink the only authentication method' };
      }

      // Unlink the provider using Admin SDK
      const providerIds = userRecord.providerData
        .filter(provider => provider.providerId !== providerId)
        .map(provider => provider.providerId);

      await this.adminAuth.updateUser(userRecord.uid, {
        providersToDelete: [providerId],
      });

      // Log the unlinking event
      await this.db.query(
        `INSERT INTO user_auth_events (user_id, event_type, provider, ip_address, user_agent, created_at)
                 VALUES ((SELECT id FROM users WHERE firebase_uid = $1), 'provider_unlinked', $2, $3, $4, NOW())`,
        [userRecord.uid, providerId, 'system', 'FirebaseAuthService']
      );

      logger.info('Provider unlinked successfully:', {
        uid: userRecord.uid,
        email: userRecord.email,
        provider: providerId,
      });

      // Get updated user record
      const updatedUserRecord = await this.adminAuth.getUser(userRecord.uid);

      return {
        success: true,
        user: {
          uid: updatedUserRecord.uid,
          email: updatedUserRecord.email,
          emailVerified: updatedUserRecord.emailVerified,
          displayName: updatedUserRecord.displayName,
          photoURL: updatedUserRecord.photoURL,
          providerData: updatedUserRecord.providerData,
        },
      };
    } catch (error) {
      logger.error('Failed to unlink provider from account:', error);
      return {
        success: false,
        error: this.mapFirebaseError(error).message,
      };
    }
  }

  /**
   * Change user email with verification
   */
  async changeUserEmail(idToken, newEmail) {
    try {
      // First verify the user's ID token
      const tokenResult = await this.verifyIdToken(idToken);
      if (!tokenResult.success) {
        return { success: false, error: 'Invalid authentication token' };
      }

      // Get user record from Admin SDK
      if (!this.adminAuth) {
        throw new Error('Firebase Admin not initialized');
      }

      const userRecord = await this.adminAuth.getUser(tokenResult.user.uid);

      // Check if new email is different from current email
      if (userRecord.email === newEmail) {
        return { success: false, error: 'New email is the same as current email' };
      }

      // Check if new email is already in use
      try {
        await this.adminAuth.getUserByEmail(newEmail);
        return { success: false, error: 'This email is already in use by another account' };
      } catch (emailCheckError) {
        // Email not found - good, we can proceed
      }

      // Update email using Admin SDK (this will require verification)
      await this.adminAuth.updateUser(userRecord.uid, {
        email: newEmail,
        emailVerified: false, // Reset verification status
      });

      // Send verification email to new address
      await this.adminAuth.generateEmailVerificationLink(newEmail);

      // Update local database
      await this.db.query(
        'UPDATE users SET email = $1, is_verified = false WHERE firebase_uid = $2',
        [newEmail, userRecord.uid]
      );

      // Log the email change event
      await this.db.query(
        `INSERT INTO user_auth_events (user_id, event_type, provider, details, ip_address, user_agent, created_at)
                 VALUES ((SELECT id FROM users WHERE firebase_uid = $1), 'email_changed', 'system', $2, $3, $4, NOW())`,
        [
          userRecord.uid,
          JSON.stringify({ oldEmail: userRecord.email, newEmail }),
          'system',
          'FirebaseAuthService',
        ]
      );

      logger.info('Email change initiated:', {
        uid: userRecord.uid,
        oldEmail: userRecord.email,
        newEmail,
      });

      return {
        success: true,
        verificationSent: true,
      };
    } catch (error) {
      logger.error('Failed to change user email:', error);
      return {
        success: false,
        error: this.mapFirebaseError(error).message,
      };
    }
  }

  /**
   * Create user via Admin SDK with custom claims
   */
  async createUserWithClaims(userData, customClaims = {}) {
    try {
      if (!this.adminAuth) {
        throw new Error('Firebase Admin not initialized');
      }

      const userRecord = await this.adminAuth.createUser({
        email: userData.email,
        password: userData.password,
        displayName: userData.displayName,
        photoURL: userData.photoURL,
        emailVerified: userData.emailVerified || false,
        disabled: userData.disabled || false,
      });

      // Set custom claims if provided
      if (Object.keys(customClaims).length > 0) {
        await this.adminAuth.setCustomUserClaims(userRecord.uid, customClaims);
      }

      // Sync to local database
      const firebaseUser = {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        photoURL: userRecord.photoURL,
        emailVerified: userRecord.emailVerified,
      };

      await this.syncUserToDatabase(firebaseUser, {
        ...userData,
        customClaims,
        createdViaAdmin: true,
      });

      logger.info('User created via Admin SDK:', {
        uid: userRecord.uid,
        email: userRecord.email,
        claims: customClaims,
      });

      return {
        success: true,
        user: {
          uid: userRecord.uid,
          email: userRecord.email,
          displayName: userRecord.displayName,
          photoURL: userRecord.photoURL,
          emailVerified: userRecord.emailVerified,
          disabled: userRecord.disabled,
          customClaims,
        },
      };
    } catch (error) {
      logger.error('Failed to create user with claims:', error);

      return {
        success: false,
        error: this.mapFirebaseError(error),
      };
    }
  }

  /**
   * Update user via Admin SDK
   */
  async updateUserViaAdmin(uid, updates) {
    try {
      if (!this.adminAuth) {
        throw new Error('Firebase Admin not initialized');
      }

      const userRecord = await this.adminAuth.updateUser(uid, updates);

      // Update local database
      const dbUpdates = {};
      if (updates.email) dbUpdates.email = updates.email;
      if (updates.displayName) {
        dbUpdates.name = updates.displayName;
        const nameParts = updates.displayName.split(' ');
        dbUpdates.first_name = nameParts[0] || '';
        dbUpdates.last_name = nameParts.slice(1).join(' ') || '';
      }
      if (updates.photoURL) dbUpdates.avatar_url = updates.photoURL;
      if (updates.emailVerified !== undefined) dbUpdates.is_verified = updates.emailVerified;
      if (updates.disabled !== undefined) dbUpdates.is_active = !updates.disabled;

      if (Object.keys(dbUpdates).length > 0) {
        const setClause = Object.keys(dbUpdates)
          .map((key, index) => `${key} = $${index + 2}`)
          .join(', ');
        await this.db.query(
          `UPDATE users SET ${setClause}, updated_at = NOW() WHERE firebase_uid = $1`,
          [uid, ...Object.values(dbUpdates)]
        );
      }

      logger.info('User updated via Admin SDK:', {
        uid,
        updates: Object.keys(updates),
      });

      return {
        success: true,
        user: {
          uid: userRecord.uid,
          email: userRecord.email,
          displayName: userRecord.displayName,
          photoURL: userRecord.photoURL,
          emailVerified: userRecord.emailVerified,
          disabled: userRecord.disabled,
        },
      };
    } catch (error) {
      logger.error('Failed to update user via Admin:', error);

      return {
        success: false,
        error: this.mapFirebaseError(error),
      };
    }
  }

  /**
   * Set custom claims for user
   */
  async setCustomClaims(uid, claims) {
    try {
      if (!this.adminAuth) {
        throw new Error('Firebase Admin not initialized');
      }

      await this.adminAuth.setCustomUserClaims(uid, claims);

      // Store claims in local database for tracking
      await this.db.query(
        `UPDATE users SET custom_claims = $1, updated_at = NOW() WHERE firebase_uid = $2`,
        [JSON.stringify(claims), uid]
      );

      logger.info('Custom claims set:', {
        uid,
        claims,
      });

      return {
        success: true,
        claims,
      };
    } catch (error) {
      logger.error('Failed to set custom claims:', error);

      return {
        success: false,
        error: this.mapFirebaseError(error),
      };
    }
  }

  /**
   * Get user by UID via Admin SDK
   */
  async getUserByUid(uid) {
    try {
      if (!this.adminAuth) {
        throw new Error('Firebase Admin not initialized');
      }

      const userRecord = await this.adminAuth.getUser(uid);

      return {
        success: true,
        user: {
          uid: userRecord.uid,
          email: userRecord.email,
          displayName: userRecord.displayName,
          photoURL: userRecord.photoURL,
          emailVerified: userRecord.emailVerified,
          disabled: userRecord.disabled,
          metadata: {
            creationTime: userRecord.metadata.creationTime,
            lastSignInTime: userRecord.metadata.lastSignInTime,
            lastRefreshTime: userRecord.metadata.lastRefreshTime,
          },
          providerData: userRecord.providerData,
          customClaims: userRecord.customClaims || {},
        },
      };
    } catch (error) {
      logger.error('Failed to get user by UID:', error);

      return {
        success: false,
        error: this.mapFirebaseError(error),
      };
    }
  }

  /**
   * List users with pagination
   */
  async listUsers(maxResults = 1000, pageToken = null) {
    try {
      if (!this.adminAuth) {
        throw new Error('Firebase Admin not initialized');
      }

      const listUsersResult = await this.adminAuth.listUsers(maxResults, pageToken);

      return {
        success: true,
        users: listUsersResult.users.map(userRecord => ({
          uid: userRecord.uid,
          email: userRecord.email,
          displayName: userRecord.displayName,
          photoURL: userRecord.photoURL,
          emailVerified: userRecord.emailVerified,
          disabled: userRecord.disabled,
          metadata: {
            creationTime: userRecord.metadata.creationTime,
            lastSignInTime: userRecord.metadata.lastSignInTime,
          },
          providerData: userRecord.providerData,
          customClaims: userRecord.customClaims || {},
        })),
        pageToken: listUsersResult.pageToken,
      };
    } catch (error) {
      logger.error('Failed to list users:', error);

      return {
        success: false,
        error: this.mapFirebaseError(error),
      };
    }
  }

  /**
   * Bulk user operations
   */
  async bulkUserOperation(operation, userIds, data = {}) {
    try {
      const results = [];
      const errors = [];

      for (const uid of userIds) {
        try {
          let result;
          switch (operation) {
            case 'disable':
              result = await this.updateUserViaAdmin(uid, { disabled: true });
              break;
            case 'enable':
              result = await this.updateUserViaAdmin(uid, { disabled: false });
              break;
            case 'delete':
              result = await this.deleteUserAccount(uid);
              break;
            case 'setClaims':
              result = await this.setCustomClaims(uid, data.claims || {});
              break;
            default:
              throw new Error(`Unsupported operation: ${operation}`);
          }

          if (result.success) {
            results.push({ uid, success: true });
          } else {
            errors.push({ uid, error: result.error });
          }
        } catch (error) {
          errors.push({ uid, error: error.message });
        }
      }

      logger.info('Bulk operation completed:', {
        operation,
        total: userIds.length,
        successful: results.length,
        failed: errors.length,
      });

      return {
        success: true,
        results,
        errors,
        summary: {
          total: userIds.length,
          successful: results.length,
          failed: errors.length,
        },
      };
    } catch (error) {
      logger.error('Failed to perform bulk operation:', error);

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Log security event
   */
  async logSecurityEvent(eventType, userId, details = {}, ipAddress = null, userAgent = null) {
    try {
      await this.db.query(
        `INSERT INTO user_auth_events (user_id, event_type, details, ip_address, user_agent, created_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())`,
        [userId, eventType, JSON.stringify(details), ipAddress, userAgent]
      );

      // Check for suspicious activity
      await this.checkSuspiciousActivity(userId, eventType, ipAddress);
    } catch (error) {
      logger.error('Failed to log security event:', error);
    }
  }

  /**
   * Check for suspicious activity
   */
  async checkSuspiciousActivity(userId, eventType, ipAddress) {
    try {
      // Check for multiple failed login attempts
      if (eventType === 'login_failed') {
        const result = await this.db.query(
          `SELECT COUNT(*) as failed_attempts FROM user_auth_events 
                     WHERE user_id = $1 AND event_type = 'login_failed' 
                     AND created_at > NOW() - INTERVAL '1 hour'`,
          [userId]
        );

        const failedAttempts = parseInt(result.rows[0].failed_attempts);
        if (failedAttempts >= 5) {
          await this.logSecurityEvent(
            userId,
            'suspicious_activity',
            {
              type: 'multiple_failed_logins',
              attempts: failedAttempts,
              timeWindow: '1 hour',
            },
            ipAddress
          );
        }
      }

      // Check for logins from multiple locations
      if (eventType === 'login_success' && ipAddress) {
        const result = await this.db.query(
          `SELECT DISTINCT ip_address FROM user_auth_events 
                     WHERE user_id = $1 AND event_type = 'login_success' 
                     AND created_at > NOW() - INTERVAL '24 hours' 
                     AND ip_address IS NOT NULL`,
          [userId]
        );

        if (result.rows.length > 3) {
          await this.logSecurityEvent(
            userId,
            'suspicious_activity',
            {
              type: 'multiple_locations',
              locations: result.rows.length,
              timeWindow: '24 hours',
            },
            ipAddress
          );
        }
      }
    } catch (error) {
      logger.warn('Failed to check suspicious activity:', error);
    }
  }

  /**
   * Map Firebase errors to user-friendly messages
   */
  mapFirebaseError(error) {
    const errorMap = {
      'auth/user-not-found': 'No account found with this email address',
      'auth/wrong-password': 'Incorrect password',
      'auth/email-already-in-use': 'An account with this email already exists',
      'auth/weak-password': 'Password should be at least 6 characters',
      'auth/invalid-email': 'Please enter a valid email address',
      'auth/user-disabled': 'This account has been disabled',
      'auth/too-many-requests': 'Too many failed attempts, please try again later',
      'auth/network-request-failed': 'Network error, please check your connection',
      'auth/popup-closed-by-user': 'Sign-in popup was closed',
      'auth/cancelled-popup-request': 'Sign-in popup was cancelled',
      'auth/popup-blocked': 'Sign-in popup was blocked by browser',
    };

    return {
      code: error.code || 'auth/unknown-error',
      message: errorMap[error.code] || error.message || 'An unexpected error occurred',
    };
  }

  /**
   * Get Firebase authentication state
   */
  getAuthState() {
    return {
      initialized: this.initialized,
      clientAvailable: !!this.auth,
      adminAvailable: !!this.adminAuth,
    };
  }
}

export default FirebaseAuthService;
