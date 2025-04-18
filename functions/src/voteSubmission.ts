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
      // Get sessionId from URL path segments
      const urlParts = req.path.split('/');
      const sessionId = urlParts[urlParts.length - 1];  // Get the last segment
      const { userId, option } = req.body;

      if (!sessionId || !userId || !option) {
        throw new Error('Missing required parameters');
      }

      // Get previous vote if exists
      const voteQuery = await firestore.collection('votes')
        .where('sessionId', '==', sessionId)
        .where('userId', '==', userId)
        .get();

      const previousVote = !voteQuery.empty ? voteQuery.docs[0].data().option : null;

      // Record vote in database
      if (!voteQuery.empty) {
        await voteQuery.docs[0].ref.delete();
      }

      await firestore.collection('votes').add({
        sessionId,
        userId,
        optionId: option,
        option,
        timestamp: FieldValue.serverTimestamp()
      });

      // Create audit log
      await firestore.collection('auditLogs').add({
        sessionId,
        userId,
        action: previousVote ? 'change_vote' : 'new_vote',
        details: {
          previousOption: previousVote,
          newOption: option
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