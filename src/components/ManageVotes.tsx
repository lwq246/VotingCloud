import CryptoJS from "crypto-js";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import config from "../config/env";
import { API_URL, auth } from "../config/firebase";

// Add Firebase Performance import
import { getPerformance, trace } from "firebase/performance";

interface Vote {
  id: string;
  userId: string;
  userName: string; // Add this field
  optionId: string;
  timestamp: any;
}

const ManageVotes = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    // Initialize performance monitoring
    const perf = getPerformance();
    const authTrace = trace(perf, "manage_votes_auth_check");
    authTrace.start();

    const checkAuth = async () => {
      const token = localStorage.getItem("token");
      const userData = localStorage.getItem("userData");

      if (!token || !userData || !auth.currentUser) {
        console.log("Unauthorized access attempt - redirecting to login");
        authTrace.putAttribute("status", "unauthorized");
        authTrace.stop();
        navigate("/");
        return;
      }

      // Record successful authentication
      authTrace.putAttribute("status", "authorized");
      authTrace.stop();
    };

    checkAuth();
  }, [navigate]);

  useEffect(() => {
    const perf = getPerformance();
    const fetchTrace = trace(perf, "fetch_votes");
    fetchTrace.start();

    const decryptUserId = (encryptedUserId: string) => {
      const encryptionKey = config.ENCRYPTION_KEY;
      if (!encryptionKey) {
        throw new Error("Encryption key is not configured");
      }
      const bytes = CryptoJS.AES.decrypt(encryptedUserId, encryptionKey);
      return bytes.toString(CryptoJS.enc.Utf8);
    };

    const fetchVotes = async () => {
      try {
        setLoading(true);
        const token = await auth.currentUser?.getIdToken();

        const response = await fetch(
          `${API_URL}/api/sessions/${sessionId}/votes`,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (!response.ok) {
          throw new Error("Failed to fetch votes");
        }
        const data = await response.json();

        const decryptedVotes = data.map((vote: any) => ({
          ...vote,
          userId: decryptUserId(vote.userId),
        }));

        fetchTrace.putMetric("vote_count", decryptedVotes.length);
        fetchTrace.stop();

        setVotes(decryptedVotes);
      } catch (err: any) {
        fetchTrace.putAttribute("error", err.message);
        fetchTrace.stop();
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchVotes();
  }, [sessionId]);

  const handleDeleteVote = async (voteId: string) => {
    const perf = getPerformance();
    const deleteTrace = trace(perf, "delete_vote");
    deleteTrace.start();

    try {
      const voteToDelete = votes.find(vote => vote.id === voteId);
      if (!voteToDelete) {
        throw new Error("Vote not found in current list");
      }

      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error("Authentication token not found");
      }

      const response = await fetch(`${API_URL}/api/votes/${voteId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete vote");
      }

      deleteTrace.putAttribute("status", "success");
      deleteTrace.stop();

      setVotes(votes.filter((vote) => vote.id !== voteId));
    } catch (err: any) {
      deleteTrace.putAttribute("status", "error");
      deleteTrace.putAttribute("error_message", err.message);
      deleteTrace.stop();
      console.error("Error deleting vote:", err);
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-lg text-gray-600">Loading votes...</div>
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

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <img src="/Logo.png" alt="VotingCloud" className="h-10 w-auto" />
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate(`/edit-session/${sessionId}`)}
                className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900"
              >
                Back to Edit Session
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Manage Votes
          </h2>

          {votes.length === 0 ? (
            <p className="text-gray-500">No votes have been cast yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Vote Option
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {votes.map((vote) => (
                    <tr key={vote.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {vote.userName || vote.userId}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {vote.optionId}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(vote.timestamp).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleDeleteVote(vote.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ManageVotes;
