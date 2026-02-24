export function logVotingActivity(
    sessionId: string,
    userId: string,
    action: string,
    details: any,
    severity?: string,
    category?: string
): Promise<void>;