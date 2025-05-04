import cors from 'cors';
import { onRequest } from 'firebase-functions/v2/https';
import { FieldValue, firestore } from './admin';

const corsHandler = cors({ origin: true });
 
export const submitVote = onRequest({
  region: 'asia-southeast1',
  cors: true
}, async (req, res) => {
  return corsHandler(req, res, async () => {
    try {
      const urlParts = req.path.split('/');
      const sessionId = urlParts[urlParts.length - 1];
      const { userId: encryptedUserId, hashedUserId, optionId } = req.body;

      if (!sessionId || !encryptedUserId || !hashedUserId || !optionId) {
        throw new Error('Missing required parameters');
      }

      // Use hashedUserId for uniqueness check
      const voteQuery = await firestore.collection('votes')
        .where('sessionId', '==', sessionId)
        .where('hashedUserId', '==', hashedUserId)
        .get();

      const previousVote = !voteQuery.empty ? voteQuery.docs[0].data().optionId : null;

      if (!voteQuery.empty) {
        await voteQuery.docs[0].ref.delete();
      }

      await firestore.collection('votes').add({
        sessionId,
        userId: encryptedUserId,
        hashedUserId, // Store hashed user ID
        optionId,
        timestamp: FieldValue.serverTimestamp()
      });

      // Create audit log
      await firestore.collection('auditLogs').add({
        sessionId,
        userId: encryptedUserId,
        action: previousVote ? 'change_vote' : 'new_vote',
        details: {
          previousOption: previousVote || null,
          newOption: optionId
        },
        timestamp: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp()
      });

      res.json({ message: 'Vote recorded successfully' });
    } catch (error: any) {
      console.error('Vote error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});
