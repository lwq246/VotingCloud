import cors from 'cors';
import express from 'express';
import admin from 'firebase-admin';
import { createRequire } from 'module';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const serviceAccount = require('./service_account_key.json');
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();
app.use(cors());
app.use(express.json());

// Get voting sessions for a user
app.get('/api/sessions/:userId', async (req, res) => {
  try {
    const db = admin.firestore();
    const sessionsRef = db.collection('votingSessions');
    const snapshot = await sessionsRef
      .where('createdBy', '==', req.params.userId)
      .get();

    const sessions = [];
    snapshot.forEach(doc => {
      sessions.push({ id: doc.id, ...doc.data() });
    });

    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create audit log
app.post('/api/audit-logs', async (req, res) => {
  try {
    const { sessionId, userId, action, details, timestamp } = req.body;
    const db = admin.firestore();
    
    await db.collection('auditLogs').add({
      sessionId,
      userId,
      action,
      details,
      timestamp: admin.firestore.Timestamp.fromDate(new Date(timestamp)),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(201).json({ message: 'Audit log created successfully' });
  } catch (error) {
    console.error('Audit log error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get session details
app.get('/api/sessions/:sessionId/details', async (req, res) => {
  try {
    const db = admin.firestore();
    const sessionDoc = await db.collection('votingSessions').doc(req.params.sessionId).get();
    
    if (!sessionDoc.exists) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const data = sessionDoc.data();
    res.json({
      id: sessionDoc.id,
      title: data.title,
      description: data.description,
      status: data.status,
      startTime: data.startTime?.toDate?.() || data.startTime,
      endTime: data.endTime?.toDate?.() || data.endTime
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get audit logs for a session
app.get('/api/audit-logs/:sessionId', async (req, res) => {
  try {
    const db = admin.firestore();
    const logsRef = db.collection('auditLogs');
    
    const snapshot = await logsRef
      .where('sessionId', '==', req.params.sessionId)
      .get();

    const logs = [];
    for (const doc of snapshot.docs) {
      const data = doc.data();
      
      // Get user details - changed to query by userId instead of uid
      const userDoc = await db.collection('users').doc(data.userId).get();
      const userName = userDoc.exists ? userDoc.data().name : 'Unknown User';

      logs.push({
        id: doc.id,
        sessionId: data.sessionId,
        userId: data.userId,
        userName: userName,
        action: data.action,
        details: {
          previousOption: data.details?.previousOption || null,
          newOption: data.details?.newOption || ''
        },
        timestamp: data.timestamp.toDate(),
        createdAt: data.createdAt.toDate()
      });
    }

    // Sort logs by timestamp locally
    logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    res.json({ logs });
  } catch (error) {
    console.error('Audit logs error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add this new route with your existing routes
// Add this middleware after the initial setup and before the routes
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Update the login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const { email, uid } = decodedToken;

    const db = admin.firestore();
    
    // Verify user exists in database
    const userQuery = await db
      .collection('users')
      .where('email', '==', email)
      .get();

    if (userQuery.empty) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userQuery.docs[0].data();
    
    // Create a custom token for additional security
    const customToken = await admin.auth().createCustomToken(uid);
    
    res.json({
      userId: userQuery.docs[0].id,
      email: userData.email,
      name: userData.name,
      role: userData.role,
      uid: userData.uid,
      createdAt: userData.createdAt,
      token: customToken
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
});



// Update registration endpoint
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    const db = admin.firestore();

    // Check if user already exists
    const userQuery = await db.collection('users')
      .where('email', '==', email)
      .get();

    if (!userQuery.empty) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Create user in Firebase Auth first
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name
    });

    // Create user document in Firestore with role
    const userDoc = await db.collection('users').add({
      uid: userRecord.uid,
      email,
      name,
      role: 'user', // Default role
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Generate custom token
    const customToken = await admin.auth().createCustomToken(userRecord.uid);

    res.status(201).json({
      userId: userDoc.id,
      email,
      name,
      role: 'user',
      customToken
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add OTP verification endpoint
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    // Add your OTP verification logic here
    // For now, we'll just return success
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create voting session
app.post('/api/sessions', async (req, res) => {
  try {
    const { title, description, options, createdBy, startTime, endTime, status = 'pending' } = req.body;
    const db = admin.firestore();
    
    const sessionRef = await db.collection('votingSessions').add({
      title,
      description,
      options,
      createdBy,
      status,
      startTime: admin.firestore.Timestamp.fromDate(new Date(startTime)),
      endTime: admin.firestore.Timestamp.fromDate(new Date(endTime)),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      voteCounts: options.reduce((acc, opt) => ({ ...acc, [opt]: 0 }), {})
    });

    res.status(201).json({ 
      id: sessionRef.id,
      title,
      description,
      options,
      status,
      startTime,
      endTime
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update voting session
app.put('/api/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { title, description, status } = req.body;
    const db = admin.firestore();
    
    await db.collection('votingSessions').doc(sessionId).update({
      title,
      description,
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ message: 'Session updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get session details
app.get('/api/sessions/:sessionId/details', async (req, res) => {
  try {
    const db = admin.firestore();
    const sessionDoc = await db.collection('votingSessions').doc(req.params.sessionId).get();
    
    if (!sessionDoc.exists) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const data = sessionDoc.data();
    // Convert options to the format expected by the frontend
    const voteOptions = data.options.map(optionText => ({
      optionId: optionText,
      optionText: optionText,
      sessionId: sessionDoc.id,
      createdAt: new Date()
    }));

    res.json({
      id: sessionDoc.id,
      ...data,
      startTime: data.startTime?.toDate?.() || data.startTime,
      endTime: data.endTime?.toDate?.() || data.endTime,
      voteOptions: voteOptions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get session results
app.get('/api/sessions/:sessionId/results', async (req, res) => {
  try {
    const db = admin.firestore();
    const sessionDoc = await db.collection('votingSessions').doc(req.params.sessionId).get();
    
    if (!sessionDoc.exists) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const data = sessionDoc.data();
    const { voteCounts, options } = data;

    // Convert options to the format expected by the frontend
    const voteOptions = options.map(optionText => ({
      optionId: optionText,
      optionText: optionText,
      sessionId: sessionDoc.id,
      createdAt: new Date()
    }));

    res.json({ 
      voteCounts, 
      options: voteOptions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user's vote for a session
app.get('/api/sessions/:sessionId/user-vote/:userId', async (req, res) => {
  try {
    const { sessionId, userId } = req.params;
    const db = admin.firestore();
    
    const voteQuery = await db.collection('votes')
      .where('sessionId', '==', sessionId)
      .where('userId', '==', userId)
      .get();

    if (voteQuery.empty) {
      return res.status(404).json({ error: 'No vote found' });
    }

    const vote = voteQuery.docs[0].data();
    res.json({ optionId: vote.optionId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add these imports at the top of your file
import { Logging } from '@google-cloud/logging';

// Initialize Cloud Logging
const logging = new Logging({
  projectId: 'votingcloud-cb476',
  keyFilename: './votingCloud_Logging.json'
});

const log = logging.log('voting-activity');

// Add this logging function
// Update the logVotingActivity function
async function logVotingActivity(sessionId, userId, action, details, severity = 'INFO', category = 'voting') {
  const metadata = {
    resource: {
      type: 'global',
      labels: {
        project_id: 'votingcloud-cb476'
      }
    },
    severity: severity, // Can be: DEBUG, INFO, NOTICE, WARNING, ERROR, CRITICAL
    labels: {
      session_id: sessionId,
      user_id: userId,
      category: category // Categories: voting, session, auth, system
    }
  };

  const logEntry = {
    sessionId,
    userId,
    action,
    details,
    category,
    timestamp: new Date().toISOString()
  };

  try {
    await log.write(log.entry(metadata, logEntry));
  } catch (error) {
    console.error('Logging error:', error);
  }
}

// Add a new endpoint to get classified logs
app.get('/api/cloud-logs/classified', async (req, res) => {
  try {
    const { severity, category } = req.query;
    let filter = 'resource.type="global"';
    
    if (severity) {
      filter += ` AND severity="${severity.toUpperCase()}"`;
    }
    if (category) {
      filter += ` AND labels.category="${category}"`;
    }

    const [entries] = await log.getEntries({
      pageSize: 50,
      orderBy: 'timestamp desc',
      filter: filter
    });

    const formattedLogs = entries.map(entry => ({
      timestamp: entry.metadata.timestamp,
      sessionId: entry.metadata.labels.session_id,
      userId: entry.metadata.labels.user_id,
      action: entry.data.action,
      details: entry.data.details,
      severity: entry.metadata.severity,
      category: entry.metadata.labels.category
    }));

    res.json({ logs: formattedLogs });
  } catch (error) {
    console.error('Cloud Logging error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update your vote endpoint
app.post('/api/sessions/:sessionId/vote', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userId, option } = req.body;
    const db = admin.firestore();

    // Get previous vote if exists
    const voteQuery = await db.collection('votes')
      .where('sessionId', '==', sessionId)
      .where('userId', '==', userId)
      .get();

    const previousVote = !voteQuery.empty ? voteQuery.docs[0].data().option : null;

    // Record vote in database
    if (!voteQuery.empty) {
      await voteQuery.docs[0].ref.delete();
    }

    await db.collection('votes').add({
      sessionId,
      userId,
      optionId: option,
      option,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    // Log the voting activity
    await logVotingActivity(sessionId, userId, previousVote ? 'change_vote' : 'new_vote', {
      previousOption: previousVote,
      newOption: option
    });
    console.log('Vote recorded successfully')
    res.json({ message: 'Vote recorded successfully' });
  } catch (error) {
    console.error('Vote error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get session for editing
app.get('/api/sessions/:sessionId/edit', async (req, res) => {
  try {
    const db = admin.firestore();
    const sessionDoc = await db.collection('votingSessions').doc(req.params.sessionId).get();
    
    if (!sessionDoc.exists) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const data = sessionDoc.data();
    res.json({
      id: sessionDoc.id,
      ...data,
      startTime: data.startTime?.toDate?.() || data.startTime,
      endTime: data.endTime?.toDate?.() || data.endTime
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add vote option
app.post('/api/sessions/:sessionId/options', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { optionText } = req.body;
      const db = admin.firestore();
  
      // Get the current session
      const sessionRef = db.collection('votingSessions').doc(sessionId);
      const sessionDoc = await sessionRef.get();
  
      if (!sessionDoc.exists) {
        return res.status(404).json({ error: 'Session not found' });
      }
  
      const sessionData = sessionDoc.data();
      const updatedOptions = [...(sessionData.options || []), optionText];
      const updatedVoteCounts = { ...sessionData.voteCounts, [optionText]: 0 };
  
      // Update the session with new option
      await sessionRef.update({
        options: updatedOptions,
        voteCounts: updatedVoteCounts
      });
  
      res.status(201).json({
        id: optionText,  // Using the text as ID for consistency
        text: optionText
      });
    } catch (error) {
      console.error('Add option error:', error);
      res.status(500).json({ error: error.message });
    }
  });

// Delete vote option
app.delete('/api/sessions/:sessionId/options/:optionId', async (req, res) => {
  try {
    const { sessionId, optionId } = req.params;
    const db = admin.firestore();

    // Get the session document
    const sessionDoc = await db.collection('votingSessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const sessionData = sessionDoc.data();
    // Remove the option from the options array
    const updatedOptions = sessionData.options.filter(opt => opt !== optionId);
    
    // Update voteCounts by removing the deleted option
    const { [optionId]: deletedCount, ...updatedVoteCounts } = sessionData.voteCounts;

    // Update the session document
    await db.collection('votingSessions').doc(sessionId).update({
      options: updatedOptions,
      voteCounts: updatedVoteCounts
    });

    // Delete associated votes
    const votesQuery = await db.collection('votes')
      .where('sessionId', '==', sessionId)
      .where('option', '==', optionId)
      .get();

    const batch = db.batch();
    votesQuery.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    res.json({ message: 'Option deleted successfully' });
  } catch (error) {
    console.error('Delete option error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update session
app.put('/api/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { title, description, startTime, endTime, status } = req.body;
    const db = admin.firestore();
    
    await db.collection('votingSessions').doc(sessionId).update({
      title,
      description,
      startTime: admin.firestore.Timestamp.fromDate(new Date(startTime)),
      endTime: admin.firestore.Timestamp.fromDate(new Date(endTime)),
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ message: 'Session updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add a test endpoint after your existing routes
app.post('/api/test/vote', async (req, res) => {
  try {
    const db = admin.firestore();
    const testData = {
      sessionId: 'test-session-123',
      userId: 'test-user-456',
      option: 'test-option-1'
    };

    // Test voting
    await db.collection('votes').add({
      sessionId: testData.sessionId,
      userId: testData.userId,
      optionId: testData.option,
      option: testData.option,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    // Test logging with specific labels
    await logVotingActivity(
      testData.sessionId,
      testData.userId,
      'test_vote',
      {
        testDetail: 'Test vote recorded',
        option: testData.option,
        isTest: true
      },
      'DEBUG',  // Set severity to DEBUG for test entries
      'test'    // Set category to 'test'
    );

    res.json({ 
      message: 'Test vote and log created successfully',
      testData
    });
  } catch (error) {
    console.error('Test error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all audit logs
app.get('/api/audit-logs', async (req, res) => {
  try {
    const db = admin.firestore();
    const logsRef = db.collection('auditLogs');
    
    // Get all logs, ordered by timestamp
    const snapshot = await logsRef
      .orderBy('timestamp', 'desc')
      .limit(100)  // Limit to last 100 logs for performance
      .get();

    const logs = [];
    for (const doc of snapshot.docs) {
      const data = doc.data();
      
      // Get user details
      const userDoc = await db.collection('users').doc(data.userId).get();
      const userName = userDoc.exists ? userDoc.data().name : 'Unknown User';

      // Get session details
      const sessionDoc = await db.collection('votingSessions').doc(data.sessionId).get();
      const sessionTitle = sessionDoc.exists ? sessionDoc.data().title : 'Unknown Session';

      logs.push({
        id: doc.id,
        sessionId: data.sessionId,
        sessionTitle: sessionTitle,
        userId: data.userId,
        userName: userName,
        action: data.action,
        details: data.details,
        timestamp: data.timestamp,
        createdAt: data.createdAt?.toDate() || null
      });
    }

    res.json({ logs });
  } catch (error) {
    console.error('Fetch audit logs error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add this endpoint to retrieve Cloud Logging entries
app.get('/api/cloud-logs', async (req, res) => {
  try {
    const [entries] = await log.getEntries({
      pageSize: 50,
      orderBy: 'timestamp desc',
      filter: 'resource.type="global"'
    });

    const formattedLogs = entries.map(entry => ({
      timestamp: entry.metadata.timestamp,
      sessionId: entry.metadata.labels.session_id,
      userId: entry.metadata.labels.user_id,
      action: entry.data.action,
      details: entry.data.details
    }));

    res.json({ logs: formattedLogs });
  } catch (error) {
    console.error('Cloud Logging error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all votes for a session
app.get('/api/sessions/:sessionId/votes', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const db = admin.firestore();
    
    const votesSnapshot = await db.collection('votes')
      .where('sessionId', '==', sessionId)
      .get();
    
    if (votesSnapshot.empty) {
      return res.json([]);
    }
    
    const votes = votesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate?.() || doc.data().timestamp
    }));
    
    res.json(votes);
  } catch (error) {
    console.error('Error fetching votes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a vote
app.delete('/api/votes/:voteId', async (req, res) => {
  try {
    const { voteId } = req.params;
    const db = admin.firestore();
    
    // Get the vote first to update vote counts
    const voteDoc = await db.collection('votes').doc(voteId).get();
    
    if (!voteDoc.exists) {
      return res.status(404).json({ error: 'Vote not found' });
    }
    
    const voteData = voteDoc.data();
    const { sessionId, option } = voteData;
    
    // Delete the vote
    await db.collection('votes').doc(voteId).delete();
    
    // Update vote count in the session
    const sessionDoc = await db.collection('votingSessions').doc(sessionId).get();
    if (sessionDoc.exists) {
      const sessionData = sessionDoc.data();
      const voteCounts = { ...sessionData.voteCounts };
      
      if (voteCounts[option] && voteCounts[option] > 0) {
        voteCounts[option]--;
        await db.collection('votingSessions').doc(sessionId).update({ voteCounts });
      }
    }
    
    // Create audit log for vote deletion
    await db.collection('auditLogs').add({
      sessionId,
      userId: voteData.userId,
      action: 'delete_vote',
      details: {
        deletedOption: option
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({ message: 'Vote deleted successfully' });
  } catch (error) {
    console.error('Error deleting vote:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Update vote option
app.put('/api/sessions/:sessionId/options/:optionId', async (req, res) => {
  try {
    const { sessionId, optionId } = req.params;
    const { optionText } = req.body;
    const db = admin.firestore();

    // Get the session document
    const sessionDoc = await db.collection('votingSessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const sessionData = sessionDoc.data();
    
    // Update the option in the options array
    const updatedOptions = sessionData.options.map(opt => 
      opt === optionId ? optionText : opt
    );

    // Update voteCounts with new option name
    const voteCounts = { ...sessionData.voteCounts };
    if (voteCounts[optionId] !== undefined) {
      voteCounts[optionText] = voteCounts[optionId];
      delete voteCounts[optionId];
    }

    // Update the session document
    await db.collection('votingSessions').doc(sessionId).update({
      options: updatedOptions,
      voteCounts: voteCounts
    });

    // Update all votes with this option
    const votesQuery = await db.collection('votes')
      .where('sessionId', '==', sessionId)
      .where('option', '==', optionId)
      .get();

    const batch = db.batch();
    votesQuery.docs.forEach(doc => {
      batch.update(doc.ref, { 
        option: optionText,
        optionId: optionText 
      });
    });
    await batch.commit();

    // Return the updated option data
    res.json({
      id: optionText,
      text: optionText,
      message: 'Option updated successfully'
    });
  } catch (error) {
    console.error('Update option error:', error);
    res.status(500).json({ error: error.message });
  }
});