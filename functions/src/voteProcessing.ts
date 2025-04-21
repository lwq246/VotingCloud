
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { firestore } from './admin';

export const processVote = onDocumentWritten({
  document: 'votes/{voteId}',
  region: 'asia-southeast1'
}, async (event) => {
  const beforeData = event.data?.before?.data();
  const afterData = event.data?.after?.data();

  try {
    // Handle vote deletion
    if (!afterData) {
      if (beforeData) {
        const { sessionId, optionId } = beforeData;
        const sessionRef = firestore.collection('votingSessions').doc(sessionId);
        
        await firestore.runTransaction(async (transaction) => {
          const sessionDoc = await transaction.get(sessionRef);
          const currentCounts = sessionDoc.data()?.voteCounts || {};
          currentCounts[optionId] = Math.max((currentCounts[optionId] || 1) - 1, 0);
          transaction.update(sessionRef, { voteCounts: currentCounts });
        });
      }
      return;
    }

    // Handle vote creation/update
    const { sessionId, optionId } = afterData;
    const sessionRef = firestore.collection('votingSessions').doc(sessionId);

    await firestore.runTransaction(async (transaction) => {
      const sessionDoc = await transaction.get(sessionRef);
      const currentCounts = sessionDoc.data()?.voteCounts || {};

      // If there was a previous vote, decrease its count
      if (beforeData && beforeData.optionId !== optionId) {
        currentCounts[beforeData.optionId] = Math.max((currentCounts[beforeData.optionId] || 1) - 1, 0);
      }

      // Increment count for new vote
      currentCounts[optionId] = (currentCounts[optionId] || 0) + 1;

      transaction.update(sessionRef, { voteCounts: currentCounts });
    });
  } catch (error) {
    console.error('Error processing vote:', error);
  }
});
