export interface User {
  userId: string;
  name: string;
  email: string;
  createdAt: Date;
}

export interface VotingSession {
  sessionId: string;
  createdBy: string; // Reference to User.userId
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  status: 'active' | 'closed';
  createdAt: Date;
}

export interface VoteOption {
  optionId: string;
  sessionId: string; // Reference to VotingSession.sessionId
  optionText: string;
  createdAt: Date;
}

export interface Vote {
  voteId: string;
  sessionId: string; // Reference to VotingSession.sessionId
  userId: string; // Reference to User.userId
  optionId: string; // Reference to VoteOption.optionId
  votedAt: Date;
}

export interface AuditLog {
  logId: string;
  userId: string; // Reference to User.userId
  action: string;
  timestamp: Date;
}