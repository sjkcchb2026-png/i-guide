/**
 * Re-export the authoritative Firebase client singleton from ../firebase.
 * This guarantees a single App and Firestore instance across all modules and prevents
 * "initializeFirestore() has already been called with different options" errors.
 */
export * from '../firebase';
export { app, db, auth, googleProvider, firebaseConfig, handleFirestoreError, OperationType } from '../firebase';
