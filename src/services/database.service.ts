import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where
} from 'firebase/firestore';
import { db } from '../config/firebase.tsx';
import { AuditLog, User, Vote, VoteOption, VotingSession } from '../types/database.types';

// User Operations
export const createUser = async (userData: { name: string; email: string }) => {
  const userRef = doc(collection(db, 'users'));
  const user: User = {
    userId: userRef.id,
    name: userData.name,
    email: userData.email,
    createdAt: new Date()
  };
  await setDoc(userRef, user);
  return user;
};

// Voting Session Operations
export const createVotingSession = async (sessionData: Omit<VotingSession, 'sessionId' | 'createdAt'>) => {
  const sessionRef = doc(collection(db, 'votingSessions'));
  const session: VotingSession = {
    sessionId: sessionRef.id,
    ...sessionData,
    createdAt: new Date()
  };
  await setDoc(sessionRef, session);
  return session;
};

// Vote Option Operations
export const createVoteOption = async (optionData: Omit<VoteOption, 'optionId' | 'createdAt'>) => {
  const optionRef = doc(collection(db, 'voteOptions'));
  const option: VoteOption = {
    optionId: optionRef.id,
    ...optionData,
    createdAt: new Date()
  };
  await setDoc(optionRef, option);
  return option;
};

// Vote Operations
export const createVote = async (voteData: Omit<Vote, 'voteId' | 'votedAt'>) => {
  const voteRef = doc(collection(db, 'votes'));
  const vote: Vote = {
    voteId: voteRef.id,
    ...voteData,
    votedAt: new Date()
  };
  await setDoc(voteRef, vote);
  return vote;
};

// Audit Log Operations
export const createAuditLog = async (logData: Omit<AuditLog, 'logId' | 'timestamp'>) => {
  const logRef = doc(collection(db, 'auditLogs'));
  const log: AuditLog = {
    logId: logRef.id,
    ...logData,
    timestamp: new Date()
  };
  await setDoc(logRef, log);
  return log;
};

// Query Operations
export const getVotingSession = async (sessionId: string) => {
  const sessionRef = doc(db, 'votingSessions', sessionId);
  const sessionDoc = await getDoc(sessionRef);
  return sessionDoc.exists() ? sessionDoc.data() as VotingSession : null;
};

export const getUserVotingSessions = async (userId: string) => {
  const sessionsQuery = query(
    collection(db, 'votingSessions'),
    where('createdBy', '==', userId)
  );
  const querySnapshot = await getDocs(sessionsQuery);
  return querySnapshot.docs.map(doc => doc.data() as VotingSession);
};