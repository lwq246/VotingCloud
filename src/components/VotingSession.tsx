import CryptoJS from "crypto-js"; // Add this import
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import config from "../config/env";
import { API_URL, auth } from "../config/firebase";

interface VotingSessionData {
  title: string;
  description: string;
  startTime: Date; // Changed from Timestamp to Date
  endTime: Date; // Changed from Timestamp to Date
  createdBy: string;
  status: string;
}

// Add VoteOption interface
interface VoteOption {
  optionId: string;
  optionText: string;
  sessionId: string;
  createdAt: Date;
}

const VotingSession = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<VotingSessionData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [voteOptions, setVoteOptions] = useState<VoteOption[]>([]);

  // Add these new states after existing states
  const [selectedOption, setSelectedOption] = useState<string>("");
  const [userVote, setUserVote] = useState<string | null>(null);

  // Add new state for vote counts
  const [voteCounts, setVoteCounts] = useState<{ [key: string]: number }>({});

  useEffect(() => {
    const fetchSessionAndOptions = async () => {
      setLoading(true);
      try {
        if (!sessionId) throw new Error("No session ID provided");

        // Get user data from localStorage
        const userData = JSON.parse(localStorage.getItem("userData") || "{}");
        const userId = userData.userId;

        // Fetch session details
        const sessionResponse = await fetch(
          `${API_URL}/api/sessions/${sessionId}/details`,
          {
            headers: {
              Authorization: `Bearer ${await auth.currentUser?.getIdToken()}`,
            },
          }
        );
        if (!sessionResponse.ok) {
          throw new Error("Session not found");
        }
        const sessionData = await sessionResponse.json();

        // Convert Firestore timestamp to Date object
        const session = {
          ...sessionData,
          startTime: sessionData.startTime?._seconds
            ? new Date(sessionData.startTime._seconds * 1000)
            : new Date(sessionData.startTime),
          endTime: sessionData.endTime?._seconds
            ? new Date(sessionData.endTime._seconds * 1000)
            : new Date(sessionData.endTime),
        };
        setSession(session);

        // Fetch vote options and counts
        const resultsResponse = await fetch(
          `${API_URL}/api/sessions/${sessionId}/results`,
          {
            headers: {
              Authorization: `Bearer ${await auth.currentUser?.getIdToken()}`,
            },
          }
        );
        if (resultsResponse.ok) {
          const { voteCounts, options } = await resultsResponse.json();
          setVoteOptions(
            options.map((opt: any) => ({
              ...opt,
              createdAt: new Date(opt.createdAt),
            }))
          );
          setVoteCounts(voteCounts);
        }

        // Check user's vote if logged in
        if (userId) {
          const voteResponse = await fetch(
            `${API_URL}/api/sessions/${sessionId}/user-vote/${userId}`,
            {
              headers: {
                Authorization: `Bearer ${await auth.currentUser?.getIdToken()}`,
              },
            }
          );
          if (voteResponse.ok) {
            const { optionId } = await voteResponse.json();
            setUserVote(optionId);
            setSelectedOption(optionId);
          }
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false); // Add this line
      }
    };

    fetchSessionAndOptions();
  }, [sessionId]);

  const encryptUserId = (userId: string) => {
    const encryptionKey = config.ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error("Encryption key is not configured");
    }
    return CryptoJS.AES.encrypt(userId, encryptionKey).toString();
  };

  const hashUserId = (userId: string) => {
    return CryptoJS.SHA256(userId).toString(CryptoJS.enc.Hex);
  };

  const handleVoteSubmit = async () => {
    try {
      // Add time check
      const now = new Date();
      if (session && now > new Date(session.endTime)) {
        setError("Voting period has ended");
        return;
      }

      if (session?.status === "inactive") {
        setError("This voting session is currently inactive");
        return;
      }

      const user = auth.currentUser;
      if (!user?.email) {
        setError("You must be logged in to vote");
        return;
      }
      if (!selectedOption) {
        setError("Please select an option");
        return;
      }

      // Get user data from localStorage
      const userData = JSON.parse(localStorage.getItem("userData") || "{}");
      const userId = userData.userId;

      if (!userId) {
        setError("User data not found");
        return;
      }

      // Submit vote with optionText instead of optionId
      const selectedVoteOption = voteOptions.find(
        (opt) => opt.optionId === selectedOption
      );
      if (!selectedVoteOption) {
        setError("Selected option not found");
        return;
      }

      // Submit vote to server with all required parameters
      const voteResponse = await fetch(
        `https://asia-southeast1-votingcloud-cb476.cloudfunctions.net/submitVote/${sessionId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: encryptUserId(userId), // Encrypt the user ID
            hashedUserId: hashUserId(userId), // Hash the user ID
            optionId: selectedOption, // Use the correct field name
          }),
        }
      );

      // Optimistically update the UI
      const previousVote = userVote;
      setUserVote(selectedOption);

      // Update vote counts optimistically
      const newVoteCounts = { ...voteCounts };
      if (previousVote) {
        newVoteCounts[previousVote] = (newVoteCounts[previousVote] || 1) - 1;
      }
      newVoteCounts[selectedOption] = (newVoteCounts[selectedOption] || 0) + 1;
      setVoteCounts(newVoteCounts);

      if (!voteResponse.ok) {
        // Revert optimistic updates if server request fails
        setUserVote(previousVote);
        setVoteCounts(voteCounts);
        const errorData = await voteResponse.json();
        throw new Error(errorData.error || "Failed to submit vote");
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Add this before the main return
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-lg text-gray-600">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <p className="text-red-600">{error}</p>
          <button
            onClick={() => setError("")}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  if (!session) return null;
  const isVotingEnded = () => {
    if (!session) return false;
    const now = new Date();
    return now > new Date(session.endTime);
  };

  // Add this helper function near your other functions
  const getWinningOption = () => {
    if (!voteOptions.length) return null;
    const maxVotes = Math.max(...Object.values(voteCounts));
    const winners = voteOptions.filter(
      (opt) => voteCounts[opt.optionId] === maxVotes
    );
    return winners[0];
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <img src="/Logo.png" alt="VotingCloud" className="h-10 w-auto" />
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate("/home")}
                className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900"
              >
                Back to Home
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg p-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {session!.title}
            </h2>
            <p className="text-gray-600 mb-2">{session!.description}</p>
            <p className="text-sm text-gray-500">
              Session ID: <span className="font-mono">{sessionId}</span>
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <h3 className="text-sm font-medium text-gray-500">Start Time</h3>
              <p className="mt-1 text-gray-900">
                {session!.startTime.toLocaleString()}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">End Time</h3>
              <p className="mt-1 text-gray-900">
                {session!.endTime.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="border-t pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {isVotingEnded() ? "Final Results" : "Voting Options"}
              {session.status === "inactive" && (
                <span className="ml-2 text-red-600 text-sm">
                  (Voting is currently disabled)
                </span>
              )}
              {isVotingEnded() && (
                <span className="ml-2 text-amber-600 text-sm">
                  (Voting period has ended)
                </span>
              )}
            </h3>
            {isVotingEnded() && getWinningOption() && (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <h4 className="text-green-800 font-medium">Winning Option:</h4>
                <p className="text-green-700 mt-1">
                  {getWinningOption()?.optionText} -{" "}
                  {voteCounts[getWinningOption()?.optionId || ""] || 0} votes
                </p>
              </div>
            )}
            <div className="space-y-4">
              {voteOptions.map((option) => (
                <div
                  key={option.optionId}
                  className="flex items-center p-4 border rounded-lg hover:bg-gray-50"
                >
                  {!isVotingEnded() && (
                    <input
                      type="radio"
                      name="vote-option"
                      id={option.optionId}
                      value={option.optionId}
                      checked={selectedOption === option.optionId}
                      onChange={(e) => setSelectedOption(e.target.value)}
                      disabled={
                        session.status === "inactive" || isVotingEnded()
                      }
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                    />
                  )}
                  <label
                    htmlFor={option.optionId}
                    className="ml-3 flex-grow flex justify-between items-center"
                  >
                    <span className="text-sm font-medium text-gray-700">
                      {option.optionText}
                      {userVote === option.optionId && !isVotingEnded() && (
                        <span className="ml-2 text-indigo-600">
                          (Your vote)
                        </span>
                      )}
                    </span>
                    <span className="text-sm text-gray-500">
                      Votes: {voteCounts[option.optionId] || 0}
                    </span>
                  </label>
                </div>
              ))}
            </div>
            {!isVotingEnded() && (
              <div className="mt-6">
                <button
                  type="button"
                  onClick={handleVoteSubmit}
                  disabled={session.status === "inactive"}
                  className={`w-full px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                    session.status === "inactive"
                      ? "bg-gray-400 cursor-not-allowed"
                      : "!bg-[#782CBF] hover:!bg-[#5A189A]"
                  }`}
                >
                  {userVote ? "Change Vote" : "Submit Vote"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VotingSession;
