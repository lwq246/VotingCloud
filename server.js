import { Logging } from '@google-cloud/logging';
import cors from 'cors';
import CryptoJS from 'crypto-js';
import express from 'express';
import admin from 'firebase-admin';
import { createRequire } from 'module';
import { dirname, join } from 'path'; // Add join from path import
import { fileURLToPath } from 'url';
import config from "./env.js";

const require = createRequire(import.meta.url);
const serviceAccount = require('./service_account_key.json');
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Update the Cloud Logging initialization
const logging = new Logging({
  projectId: 'votingcloud-cb476',
  keyFilename: join(__dirname, 'votingCloud_Logging.json')  // Use join instead of path.join
});

// Create a more robust logging function
export async function logVotingActivity(sessionId, userId, action, details, severity = 'INFO', category = 'voting') {
  try {
    const log = logging.log('voting-activity');
    const metadata = {
      resource: {
        type: 'global',
        labels: {
          project_id: 'votingcloud-cb476'
        }
      },
      severity: severity,
      labels: {
        session_id: sessionId || 'unknown',
        user_id: userId || 'unknown',
        category: category
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

    await log.write(log.entry(metadata, logEntry));
    console.log('Log entry written successfully:', action);
  } catch (error) {
    console.error('Cloud Logging error:', error);
    // Fallback to local logging
    const db = admin.firestore();
    try {
      await db.collection('localAuditLogs').add({
        sessionId,
        userId,
        action,
        details,
        severity,
        category,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        error: error.message
      });
    } catch (fallbackError) {
      console.error('Fallback logging failed:', fallbackError);
    }
  }
}


// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();
app.use(cors());
app.use(express.json());

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

// Add a new endpoint to get classified logs
app.get('/api/cloud-logs/classified', verifyToken,async (req, res) => {
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

// Get voting sessions for a user
app.get('/api/sessions/:userId', verifyToken, async (req, res) => {
  try {
    // Log request initiation
    await logVotingActivity(
      'all',
      req.params.userId,
      'fetch_user_sessions_started',
      {
        userId: req.params.userId,
        timestamp: new Date().toISOString()
      },
      'INFO',
      'session_management'
    );

    const db = admin.firestore();
    const sessionsRef = db.collection('votingSessions');
    const snapshot = await sessionsRef
      .where('createdBy', '==', req.params.userId)
      .get();

    const sessions = [];
    snapshot.forEach(doc => {
      sessions.push({ id: doc.id, ...doc.data() });
    });

    // Log successful retrieval
    await logVotingActivity(
      'all',
      req.params.userId,
      'fetch_user_sessions_completed',
      {
        userId: req.params.userId,
        sessionCount: sessions.length,
        timestamp: new Date().toISOString()
      },
      'INFO',
      'session_management'
    );

    res.json(sessions);
  } catch (error) {
    // Log error
    await logVotingActivity(
      'all',
      req.params.userId,
      'fetch_user_sessions_failed',
      {
        userId: req.params.userId,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      },
      'ERROR',
      'session_management'
    );

    res.status(500).json({ error: error.message });
  }
});

// Create audit log
app.post('/api/audit-logs', verifyToken, async (req, res) => {
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
app.get('/api/sessions/:sessionId/details', verifyToken, async (req, res) => {
  try {
    console.log('Accessing session details:', req.params.sessionId, 'User:', req.user.uid);
    const db = admin.firestore();
    const sessionDoc = await db.collection('votingSessions').doc(req.params.sessionId).get();
    
    if (!sessionDoc.exists) {
      console.log('Session not found:', req.params.sessionId);
      await logVotingActivity(
        req.params.sessionId,
        req.user.uid,
        'session_access_failed',
        {
          reason: 'Session not found',
          timestamp: new Date().toISOString()
        },
        'WARNING'
      );
      return res.status(404).json({ 
        error: 'Session not found',
        sessionId: req.params.sessionId 
      });
    }

    const data = sessionDoc.data();
    console.log('Session found:', { id: sessionDoc.id, title: data.title });
    
    // Log successful access
    await logVotingActivity(
      req.params.sessionId,
      req.user.uid,
      'session_details_fetched',
      {
        sessionTitle: data.title,
        sessionStatus: data.status,
        timestamp: new Date().toISOString()
      },
      'INFO'
    );
    
    res.json({
      id: sessionDoc.id,
      title: data.title,
      description: data.description,
      status: data.status,
      startTime: data.startTime?.toDate?.() || data.startTime,
      endTime: data.endTime?.toDate?.() || data.endTime
    });
  } catch (error) {
    console.error('Session details error:', error);
    // Log error
    await logVotingActivity(
      req.params.sessionId,
      req.user?.uid || 'unknown',
      'session_details_error',
      {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      },
      'ERROR'
    );
    
    res.status(500).json({ 
      error: 'Failed to fetch session details',
      message: error.message,
      sessionId: req.params.sessionId
    });
  }
});

app.get('/api/audit-logs/:sessionId', verifyToken, async (req, res) => {
  try {
    const db = admin.firestore();
    const logsRef = db.collection('auditLogs');
    
    const snapshot = await logsRef
      .where('sessionId', '==', req.params.sessionId)
      .get();

    const logs = [];
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const bytes = CryptoJS.AES.decrypt(data.userId, config.ENCRYPTION_KEY);
      const decryptedUserId = bytes.toString(CryptoJS.enc.Utf8);
      // Get user details
      const userDoc = await db.collection('users').doc(decryptedUserId).get();
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

    // Return logs array directly instead of wrapping in an object
    res.json(logs);
  } catch (error) {
    console.error('Audit logs error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update the login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    // Log login attempt
    await logVotingActivity(
      'system',
      'anonymous',
      'login_attempt',
      {
        timestamp: new Date().toISOString()
      },
      'INFO',
      'authentication'
    );

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      await logVotingActivity(
        'system',
        'anonymous',
        'login_failed',
        {
          reason: 'No token provided',
          timestamp: new Date().toISOString()
        },
        'WARNING',
        'authentication'
      );
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
      await logVotingActivity(
        'system',
        uid,
        'login_failed',
        {
          reason: 'User not found in database',
          email,
          timestamp: new Date().toISOString()
        },
        'WARNING',
        'authentication'
      );
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userQuery.docs[0].data();
    
    // Create a custom token for additional security
    const customToken = await admin.auth().createCustomToken(uid);
    
    // Log successful login
    await logVotingActivity(
      'system',
      uid,
      'login_successful',
      {
        userId: userQuery.docs[0].id,
        email: userData.email,
        role: userData.role,
        timestamp: new Date().toISOString()
      },
      'INFO',
      'authentication'
    );
    
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
    // Log error
    await logVotingActivity(
      'system',
      'unknown',
      'login_error',
      {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      },
      'ERROR',
      'authentication'
    );
    res.status(401).json({ error: 'Authentication failed' });
  }
});



// Update registration endpoint
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    const db = admin.firestore();

    // Log registration attempt
    await logVotingActivity(
      'system',
      'anonymous',
      'registration_attempt',
      {
        email,
        timestamp: new Date().toISOString()
      },
      'INFO',
      'authentication'
    );

    // Check if user already exists
    const userQuery = await db.collection('users')
      .where('email', '==', email)
      .get();

    if (!userQuery.empty) {
      await logVotingActivity(
        'system',
        'anonymous',
        'registration_failed',
        {
          reason: 'User already exists',
          email,
          timestamp: new Date().toISOString()
        },
        'WARNING',
        'authentication'
      );
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

    // Log successful registration
    await logVotingActivity(
      'system',
      userRecord.uid,
      'registration_successful',
      {
        userId: userDoc.id,
        email,
        role: 'user',
        timestamp: new Date().toISOString()
      },
      'INFO',
      'authentication'
    );

    res.status(201).json({
      userId: userDoc.id,
      email,
      name,
      role: 'user',
      customToken
    });
  } catch (error) {
    console.error('Registration error:', error);
    // Log registration error
    await logVotingActivity(
      'system',
      'unknown',
      'registration_error',
      {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      },
      'ERROR',
      'authentication'
    );
    res.status(500).json({ error: error.message });
  }
});



// Create voting session
app.post('/api/sessions', verifyToken, async (req, res) => {
  try {
    const { title, description, options, createdBy, startTime, endTime, status = 'pending' } = req.body;
    
    // Log session creation attempt
    await logVotingActivity(
      'pending',
      createdBy,
      'session_creation_started',
      {
        title,
        optionsCount: options.length,
        timestamp: new Date().toISOString()
      },
      'INFO',
      'session_management'
    );

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

    // Log successful session creation
    await logVotingActivity(
      sessionRef.id,
      createdBy,
      'session_created',
      {
        title,
        status,
        optionsCount: options.length,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        timestamp: new Date().toISOString()
      },
      'INFO',
      'session_management'
    );

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
    // Log error
    await logVotingActivity(
      'error',
      req.body?.createdBy || 'unknown',
      'session_creation_failed',
      {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      },
      'ERROR',
      'session_management'
    );
    
    res.status(500).json({ error: error.message });
  }
});

// Update voting session
app.put('/api/sessions/:sessionId', verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { title, description, status } = req.body;
    
    // Log update attempt
    await logVotingActivity(
      sessionId,
      req.user.uid,
      'session_update_started',
      {
        sessionId,
        updatedFields: { title, description, status },
        timestamp: new Date().toISOString()
      },
      'INFO',
      'session_management'
    );

    const db = admin.firestore();
    
    await db.collection('votingSessions').doc(sessionId).update({
      title,
      description,
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Log successful update
    await logVotingActivity(
      sessionId,
      req.user.uid,
      'session_updated',
      {
        sessionId,
        title,
        status,
        timestamp: new Date().toISOString()
      },
      'INFO',
      'session_management'
    );

    res.json({ message: 'Session updated successfully' });
  } catch (error) {
    // Log error
    await logVotingActivity(
      sessionId,
      req.user?.uid || 'unknown',
      'session_update_failed',
      {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      },
      'ERROR',
      'session_management'
    );
    
    res.status(500).json({ error: error.message });
  }
});

// Get session results
app.get('/api/sessions/:sessionId/results', verifyToken, async (req, res) => {
  try {
    // Log request initiation
    await logVotingActivity(
      req.params.sessionId,
      req.user.uid,
      'fetch_session_results_started',
      {
        sessionId: req.params.sessionId,
        timestamp: new Date().toISOString()
      },
      'INFO',
      'session_management'
    );

    const db = admin.firestore();
    const sessionDoc = await db.collection('votingSessions').doc(req.params.sessionId).get();
    
    if (!sessionDoc.exists) {
      await logVotingActivity(
        req.params.sessionId,
        req.user.uid,
        'fetch_session_results_failed',
        {
          reason: 'Session not found',
          timestamp: new Date().toISOString()
        },
        'WARNING',
        'session_management'
      );
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

    // Log successful retrieval
    await logVotingActivity(
      req.params.sessionId,
      req.user.uid,
      'fetch_session_results_completed',
      {
        sessionTitle: data.title,
        optionsCount: options.length,
        totalVotes: Object.values(voteCounts).reduce((a, b) => a + b, 0),
        timestamp: new Date().toISOString()
      },
      'INFO',
      'session_management'
    );

    res.json({ 
      voteCounts, 
      options: voteOptions
    });
  } catch (error) {
    // Log error
    await logVotingActivity(
      req.params.sessionId,
      req.user?.uid || 'unknown',
      'fetch_session_results_error',
      {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      },
      'ERROR',
      'session_management'
    );
    res.status(500).json({ error: error.message });
  }
});

// Get user's vote for a session
app.get('/api/sessions/:sessionId/user-vote/:userId', verifyToken, async (req, res) => {
  try {
    const { sessionId, userId } = req.params;
    
    // Log request initiation
    await logVotingActivity(
      sessionId,
      userId,
      'fetch_user_vote_started',
      {
        sessionId,
        userId,
        timestamp: new Date().toISOString()
      },
      'INFO',
      'vote_management'
    );

    const db = admin.firestore();
    const voteQuery = await db.collection('votes')
      .where('sessionId', '==', sessionId)
      .get();

    if (voteQuery.empty) {
      await logVotingActivity(
        sessionId,
        userId,
        'fetch_user_vote_failed',
        {
          reason: 'No votes found for session',
          sessionId,
          timestamp: new Date().toISOString()
        },
        'WARNING',
        'vote_management'
      );
      return res.status(404).json({ error: 'No votes found for this session' });
    }

    // Decrypt and compare each vote's userId
    let userVote = null;
    for (const doc of voteQuery.docs) {
      const vote = doc.data();
      try {
        const bytes = CryptoJS.AES.decrypt(vote.userId, config.ENCRYPTION_KEY);
        const decryptedUserId = bytes.toString(CryptoJS.enc.Utf8);
        
        if (decryptedUserId === userId) {
          userVote = { optionId: vote.optionId };
          break;
        }
      } catch (decryptError) {
        await logVotingActivity(
          sessionId,
          userId,
          'decrypt_user_vote_failed',
          {
            error: decryptError.message,
            timestamp: new Date().toISOString()
          },
          'ERROR',
          'vote_management'
        );
        console.error('Error decrypting userId:', decryptError);
        continue;
      }
    }

    if (!userVote) {
      await logVotingActivity(
        sessionId,
        userId,
        'fetch_user_vote_failed',
        {
          reason: 'No vote found for user',
          sessionId,
          timestamp: new Date().toISOString()
        },
        'WARNING',
        'vote_management'
      );
      return res.status(404).json({ error: 'No vote found for this user' });
    }

    // Log successful retrieval
    await logVotingActivity(
      sessionId,
      userId,
      'fetch_user_vote_successful',
      {
        sessionId,
        optionId: userVote.optionId,
        timestamp: new Date().toISOString()
      },
      'INFO',
      'vote_management'
    );

    res.json(userVote);
  } catch (error) {
    // Log error
    await logVotingActivity(
      sessionId,
      userId,
      'fetch_user_vote_error',
      {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      },
      'ERROR',
      'vote_management'
    );
    res.status(500).json({ error: error.message });
  }
});



// // Update your vote endpoint
// app.post('/api/sessions/:sessionId/vote',verifyToken, async (req, res) => {
//   try {
//     const { sessionId } = req.params;
//     const { userId, option } = req.body;
//     const db = admin.firestore();

//     // Get previous vote if exists
//     const voteQuery = await db.collection('votes')
//       .where('sessionId', '==', sessionId)
//       .where('userId', '==', userId)
//       .get();

//     const previousVote = !voteQuery.empty ? voteQuery.docs[0].data().option : null;

//     // Record vote in database
//     if (!voteQuery.empty) {
//       await voteQuery.docs[0].ref.delete();
//     }

//     await db.collection('votes').add({
//       sessionId,
//       userId,
//       optionId: option,
//       option,
//       timestamp: admin.firestore.FieldValue.serverTimestamp()
//     });

//     // Log the voting activity
//     await logVotingActivity(sessionId, userId, previousVote ? 'change_vote' : 'new_vote', {
//       previousOption: previousVote,
//       newOption: option
//     });
//     console.log('Vote recorded successfully')
//     res.json({ message: 'Vote recorded successfully' });
//   } catch (error) {
//     console.error('Vote error:', error);
//     res.status(500).json({ error: error.message });
//   }
// });

// Get session for editing
app.get('/api/sessions/:sessionId/edit', verifyToken, async (req, res) => {
  try {
    // Log request initiation
    await logVotingActivity(
      req.params.sessionId,
      req.user.uid,
      'fetch_session_edit_started',
      {
        sessionId: req.params.sessionId,
        timestamp: new Date().toISOString()
      },
      'INFO',
      'session_management'
    );

    const db = admin.firestore();
    const sessionDoc = await db.collection('votingSessions').doc(req.params.sessionId).get();
    
    if (!sessionDoc.exists) {
      await logVotingActivity(
        req.params.sessionId,
        req.user.uid,
        'fetch_session_edit_failed',
        {
          reason: 'Session not found',
          timestamp: new Date().toISOString()
        },
        'WARNING',
        'session_management'
      );
      return res.status(404).json({ error: 'Session not found' });
    }

    const data = sessionDoc.data();

    // Log successful retrieval
    await logVotingActivity(
      req.params.sessionId,
      req.user.uid,
      'fetch_session_edit_completed',
      {
        sessionTitle: data.title,
        status: data.status,
        timestamp: new Date().toISOString()
      },
      'INFO',
      'session_management'
    );

    res.json({
      id: sessionDoc.id,
      ...data,
      startTime: data.startTime?.toDate?.() || data.startTime,
      endTime: data.endTime?.toDate?.() || data.endTime
    });
  } catch (error) {
    // Log error
    await logVotingActivity(
      req.params.sessionId,
      req.user?.uid || 'unknown',
      'fetch_session_edit_error',
      {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      },
      'ERROR',
      'session_management'
    );
    res.status(500).json({ error: error.message });
  }
});

// Add vote option
app.post('/api/sessions/:sessionId/options', verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { optionText } = req.body;

    // Log option addition attempt
    await logVotingActivity(
      sessionId,
      req.user.uid,
      'add_option_started',
      {
        sessionId,
        optionText,
        timestamp: new Date().toISOString()
      },
      'INFO',
      'option_management'
    );

    const db = admin.firestore();
    const sessionRef = db.collection('votingSessions').doc(sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      await logVotingActivity(
        sessionId,
        req.user.uid,
        'add_option_failed',
        {
          reason: 'Session not found',
          optionText,
          timestamp: new Date().toISOString()
        },
        'WARNING',
        'option_management'
      );
      return res.status(404).json({ error: 'Session not found' });
    }

    const sessionData = sessionDoc.data();
    const updatedOptions = [...(sessionData.options || []), optionText];
    const updatedVoteCounts = { ...sessionData.voteCounts, [optionText]: 0 };

    await sessionRef.update({
      options: updatedOptions,
      voteCounts: updatedVoteCounts
    });

    // Log successful option addition
    await logVotingActivity(
      sessionId,
      req.user.uid,
      'add_option_completed',
      {
        sessionTitle: sessionData.title,
        optionText,
        totalOptions: updatedOptions.length,
        timestamp: new Date().toISOString()
      },
      'INFO',
      'option_management'
    );

    res.status(201).json({
      id: optionText,
      text: optionText
    });
  } catch (error) {
    // Log error
    await logVotingActivity(
      sessionId,
      req.user?.uid || 'unknown',
      'add_option_error',
      {
        error: error.message,
        stack: error.stack,
        optionText: req.body?.optionText,
        timestamp: new Date().toISOString()
      },
      'ERROR',
      'option_management'
    );
    console.error('Add option error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete vote option
app.delete('/api/sessions/:sessionId/options/:optionId', verifyToken, async (req, res) => {
  try {
    const { sessionId, optionId } = req.params;

    // Log deletion attempt
    await logVotingActivity(
      sessionId,
      req.user.uid,
      'delete_option_started',
      {
        sessionId,
        optionId,
        timestamp: new Date().toISOString()
      },
      'INFO',
      'option_management'
    );

    const db = admin.firestore();
    const sessionDoc = await db.collection('votingSessions').doc(sessionId).get();
    
    if (!sessionDoc.exists) {
      await logVotingActivity(
        sessionId,
        req.user.uid,
        'delete_option_failed',
        {
          reason: 'Session not found',
          optionId,
          timestamp: new Date().toISOString()
        },
        'WARNING',
        'option_management'
      );
      return res.status(404).json({ error: 'Session not found' });
    }

    const sessionData = sessionDoc.data();
    const updatedOptions = sessionData.options.filter(opt => opt !== optionId);
    const { [optionId]: deletedCount, ...updatedVoteCounts } = sessionData.voteCounts;

    await db.collection('votingSessions').doc(sessionId).update({
      options: updatedOptions,
      voteCounts: updatedVoteCounts
    });

    const votesQuery = await db.collection('votes')
      .where('sessionId', '==', sessionId)
      .where('option', '==', optionId)
      .get();

    const batch = db.batch();
    votesQuery.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    // Log successful deletion
    await logVotingActivity(
      sessionId,
      req.user.uid,
      'delete_option_completed',
      {
        sessionTitle: sessionData.title,
        optionId,
        deletedVotes: votesQuery.size,
        remainingOptions: updatedOptions.length,
        timestamp: new Date().toISOString()
      },
      'INFO',
      'option_management'
    );

    res.json({ message: 'Option deleted successfully' });
  } catch (error) {
    // Log error
    await logVotingActivity(
      sessionId,
      req.user?.uid || 'unknown',
      'delete_option_error',
      {
        error: error.message,
        stack: error.stack,
        optionId,
        timestamp: new Date().toISOString()
      },
      'ERROR',
      'option_management'
    );
    console.error('Delete option error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update session
app.put('/api/sessions/:sessionId', verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { title, description, startTime, endTime, status } = req.body;

    // Log update attempt
    await logVotingActivity(
      sessionId,
      req.user.uid,
      'update_session_started',
      {
        sessionId,
        updatedFields: { title, description, startTime, endTime, status },
        timestamp: new Date().toISOString()
      },
      'INFO',
      'session_management'
    );

    const db = admin.firestore();
    
    // Get the current session data for comparison
    const sessionDoc = await db.collection('votingSessions').doc(sessionId).get();
    
    if (!sessionDoc.exists) {
      await logVotingActivity(
        sessionId,
        req.user.uid,
        'update_session_failed',
        {
          reason: 'Session not found',
          timestamp: new Date().toISOString()
        },
        'WARNING',
        'session_management'
      );
      return res.status(404).json({ error: 'Session not found' });
    }

    await db.collection('votingSessions').doc(sessionId).update({
      title,
      description,
      startTime: admin.firestore.Timestamp.fromDate(new Date(startTime)),
      endTime: admin.firestore.Timestamp.fromDate(new Date(endTime)),
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Log successful update
    await logVotingActivity(
      sessionId,
      req.user.uid,
      'update_session_completed',
      {
        sessionId,
        title,
        status,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        timestamp: new Date().toISOString()
      },
      'INFO',
      'session_management'
    );

    res.json({ message: 'Session updated successfully' });
  } catch (error) {
    // Log error
    await logVotingActivity(
      sessionId,
      req.user?.uid || 'unknown',
      'update_session_error',
      {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      },
      'ERROR',
      'session_management'
    );
    res.status(500).json({ error: error.message });
  }
});

// Add a test endpoint after your existing routes
app.post('/api/test/vote',async (req, res) => {
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
app.get('/api/audit-logs', verifyToken,async (req, res) => {
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
app.get('/api/cloud-logs', verifyToken,async (req, res) => {
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
app.get('/api/sessions/:sessionId/votes', verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Log request initiation
    await logVotingActivity(
      sessionId,
      req.user.uid,
      'fetch_session_votes_started',
      {
        sessionId,
        timestamp: new Date().toISOString()
      },
      'INFO',
      'vote_management'
    );

    const db = admin.firestore();
    const votesSnapshot = await db.collection('votes')
      .where('sessionId', '==', sessionId)
      .get();
    
    if (votesSnapshot.empty) {
      // Log when no votes found
      await logVotingActivity(
        sessionId,
        req.user.uid,
        'fetch_session_votes_empty',
        {
          reason: 'No votes found',
          sessionId,
          timestamp: new Date().toISOString()
        },
        'INFO',
        'vote_management'
      );
      return res.json([]);
    }
    
    const votes = votesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate?.() || doc.data().timestamp
    }));

    // Log successful retrieval
    await logVotingActivity(
      sessionId,
      req.user.uid,
      'fetch_session_votes_completed',
      {
        sessionId,
        voteCount: votes.length,
        timestamp: new Date().toISOString()
      },
      'INFO',
      'vote_management'
    );
    
    res.json(votes);
  } catch (error) {
    // Log error
    await logVotingActivity(
      sessionId,
      req.user?.uid || 'unknown',
      'fetch_session_votes_error',
      {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      },
      'ERROR',
      'vote_management'
    );
    console.error('Error fetching votes:', error);
    res.status(500).json({ error: error.message });
  }
});
// Delete a vote
app.delete('/api/votes/:voteId', verifyToken, async (req, res) => {
  try {
    const { voteId } = req.params;

    // Log deletion attempt
    await logVotingActivity(
      'pending',  // sessionId will be updated once we get the vote data
      req.user.uid,
      'delete_vote_started',
      {
        voteId,
        timestamp: new Date().toISOString()
      },
      'INFO',
      'vote_management'
    );
    
    if (!voteId || typeof voteId !== 'string') {
      await logVotingActivity(
        'system',
        req.user.uid,
        'delete_vote_failed',
        {
          reason: 'Invalid vote ID',
          voteId,
          timestamp: new Date().toISOString()
        },
        'WARNING',
        'vote_management'
      );
      return res.status(400).json({ error: 'Invalid vote ID' });
    }

    const db = admin.firestore();
    const voteRef = db.collection('votes').doc(voteId);
    const voteDoc = await voteRef.get();
    
    if (!voteDoc.exists) {
      await logVotingActivity(
        'system',
        req.user.uid,
        'delete_vote_failed',
        {
          reason: 'Vote not found',
          voteId,
          timestamp: new Date().toISOString()
        },
        'WARNING',
        'vote_management'
      );
      return res.status(404).json({ 
        error: 'Vote not found',
        details: `No vote found with ID: ${voteId}`
      });
    }

    const voteData = voteDoc.data();
    await voteRef.delete();

    // Log successful deletion
    await logVotingActivity(
      voteData.sessionId,
      req.user.uid,
      'delete_vote_completed',
      {
        voteId,
        deletedOption: voteData.option || voteData.optionId,
        timestamp: new Date().toISOString()
      },
      'INFO',
      'vote_management'
    );

    // Create audit log
    await db.collection('auditLogs').add({
      sessionId: voteData.sessionId,
      userId: voteData.userId,
      action: 'delete_vote',
      details: {
        deletedOption: voteData.option || voteData.optionId || 'Unknown Option'
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ 
      message: 'Vote deleted successfully',
      deletedVoteId: voteId
    });
  } catch (error) {
    // Log error
    await logVotingActivity(
      'system',
      req.user?.uid || 'unknown',
      'delete_vote_error',
      {
        error: error.message,
        stack: error.stack,
        voteId: req.params.voteId,
        timestamp: new Date().toISOString()
      },
      'ERROR',
      'vote_management'
    );
    console.error('Error deleting vote:', error);
    res.status(500).json({ 
      error: 'Failed to delete vote',
      details: error.message 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Update vote option
app.put('/api/sessions/:sessionId/options/:optionId', verifyToken,async (req, res) => {
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