import { signOut } from "firebase/auth";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL, auth } from "../config/firebase";
// Add Firebase Performance import
import { getPerformance, trace } from "firebase/performance";

const Home = () => {
  const navigate = useNavigate();

  // Add this useEffect at the top of the component
  useEffect(() => {
    // Initialize performance monitoring
    const perf = getPerformance();
    const authTrace = trace(perf, "home_auth_check");
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

  const [searchId, setSearchId] = useState("");
  const [userSessions, setUserSessions] = useState<any[]>([]);

  // This is the only useEffect we need - it uses the Node.js backend
  useEffect(() => {
    const fetchUserSessions = async () => {
      try {
        if (!auth.currentUser?.email) return;

        // Get user data and token
        const userData = JSON.parse(localStorage.getItem("userData") || "{}");
        const userId = userData.userId;
        const token = await auth.currentUser?.getIdToken();

        if (!userId || !token) {
          throw new Error("Authentication required");
        }

        // Fetch sessions from Node.js backend with auth token
        const response = await fetch(`${API_URL}/api/sessions/${userId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Failed to fetch sessions");
        }

        const sessions = await response.json();
        setUserSessions(sessions);
      } catch (error) {
        console.error("Error fetching sessions:", error);
      }
    };

    fetchUserSessions();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem("userData"); // Clear user data
      localStorage.removeItem("token"); // Also clear the token
      navigate("/");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleAuditLogs = (sessionId: string) => {
    navigate(`/audit-logs/${sessionId}`);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchId.trim()) return;

    try {
      // Get the auth token
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error("Not authenticated");
      }

      // Check if session exists with auth token
      const response = await fetch(
        `${API_URL}/api/sessions/${searchId.trim()}/details`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Session not found");
      }

      // If session exists, navigate to it
      navigate(`/session/${searchId.trim()}`);
    } catch (error: any) {
      alert(error.message);
    }
  };

  const createSession = () => {
    navigate("/create-session");
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Navigation Bar */}
      <nav className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <img src="/Logo.png" alt="VotingCloud" className="h-10 w-auto" />
            </div>
            <div className="flex items-center">
              <button
                onClick={handleLogout}
                className="ml-4 px-4 py-2 text-sm text-red-600 hover:text-red-700"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Search Section */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <form onSubmit={handleSearch} className="flex gap-4">
            <input
              type="text"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              placeholder="Enter voting session ID"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              className="px-6 py-2 text-white rounded-md !bg-[#782CBF] hover:!bg-[#5A189A] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              Search
            </button>
          </form>
        </div>

        {/* User Sessions Section */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Your Voting Sessions</h2>
          <div className="space-y-4">
            {userSessions.map((session) => (
              <div
                key={session.id}
                className="border rounded-lg p-4 hover:bg-gray-50"
              >
                <div className="flex justify-between items-start">
                  <div
                    className="cursor-pointer flex-grow"
                    onClick={() => navigate(`/session/${session.id}`)}
                  >
                    <h3 className="text-lg font-medium text-gray-900">
                      {session.title}
                    </h3>
                    <p className="text-gray-600 mt-1">{session.description}</p>
                    <div className="mt-2 text-sm text-gray-500">
                      Status: {session.status}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAuditLogs(session.id)}
                      className="px-3 py-1 text-sm text-purple-600 hover:text-purple-800 border border-purple-600 rounded-md hover:bg-purple-50"
                    >
                      Audit Logs
                    </button>
                    <button
                      onClick={() => navigate(`/edit-session/${session.id}`)}
                      className="px-3 py-1 text-sm text-indigo-600 hover:text-indigo-800 border border-indigo-600 rounded-md hover:bg-indigo-50"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {userSessions.length === 0 && (
              <p className="text-gray-500 text-center py-4">
                You haven't created any voting sessions yet.
              </p>
            )}
          </div>
        </div>

        {/* Create Session Section */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="text-center">
            <h2 className="text-2xl font-semibold mb-4">
              Create New Voting Session
            </h2>
            <p className="text-gray-600 mb-6">
              Start a new voting session and share it with your participants
            </p>
            <button
              onClick={createSession}
              className="px-8 py-3 text-white rounded-md !bg-[#782CBF] hover:!bg-[#5A189A] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              Create Session
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
