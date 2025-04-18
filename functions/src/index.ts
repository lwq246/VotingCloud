import cors from 'cors';
import express from 'express';
import * as functions from 'firebase-functions';
import './admin'; // Just import, don't initialize again

const app = express();
app.use(cors());
app.use(express.json());

// Add your Express routes here
app.get('/test', (req, res) => {
  res.json({ message: 'API is working' });
});

// Export your functions
export const api = functions.https.onRequest(app);
export * from './voteProcessing';
export * from './voteSubmission';

