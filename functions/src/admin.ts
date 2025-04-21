import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

if (!admin.apps.length) {
  admin.initializeApp();
}
 
export const firestore = admin.firestore();
export default admin;
export { FieldValue };
