import * as admin from 'firebase-admin';

admin.initializeApp();
export const firestore = admin.firestore();
firestore.settings({ ignoreUndefinedProperties: true });

export const FieldValue = admin.firestore.FieldValue;
