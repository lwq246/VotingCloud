import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_URL, auth } from "../config/firebase";

// Add Firebase Performance import
import { getPerformance, trace } from "firebase/performance";

interface AuditLog {
  id: string;
  sessionId: string;
  userId: string;
  userName: string;
  action: string;
  details: {
    previousOption: string | null;
    newOption: string;
  };
  timestamp: Date;
  createdAt: Date;
}

const AuditLogsPage = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionTitle, setSessionTitle] = useState("");

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem("token");
      const userData = localStorage.getItem("userData");

      if (!token || !userData || !auth.currentUser) {
        console.log("Unauthorized access attempt - redirecting to login");
        navigate("/");
        return;
      }
      return token;
    };

    // Initialize performance monitoring
    const perf = getPerformance();
    const componentTrace = trace(perf, "audit_logs_load");
    componentTrace.start();

    const fetchData = async () => {
      try {
        const token = await checkAuth();
        if (!token) return;

        // Create trace for session details fetch
        const sessionTrace = trace(perf, "fetch_session_details");
        sessionTrace.start();

        // Fetch session details
        const sessionResponse = await fetch(
          `${API_URL}/api/sessions/${sessionId}/details`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        const sessionData = await sessionResponse.json();
        setSessionTitle(sessionData.title);

        sessionTrace.stop();

        // Create trace for audit logs fetch
        const logsTrace = trace(perf, "fetch_audit_logs");
        logsTrace.start();

        // Fetch audit logs
        const logsResponse = await fetch(
          `${API_URL}/api/audit-logs/${sessionId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (!logsResponse.ok) {
          throw new Error("Failed to fetch audit logs");
        }
        const logsData = await logsResponse.json();

        logsTrace.stop();

        // Validate and transform logs data
        const validatedLogs = logsData.map((log: AuditLog) => ({
          ...log,
          userId: log.userId || "unknown",
          userName: log.userName || "Unknown User",
          details: {
            previousOption: log.details?.previousOption || null,
            newOption: log.details?.newOption || "",
          },
        }));

        setLogs(validatedLogs);
      } catch (error) {
        console.error("Error fetching audit logs:", error);
      } finally {
        setLoading(false);
        componentTrace.stop();
      }
    };

    fetchData();
  }, [sessionId, navigate]);

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <img src="/Logo.png" alt="VotingCloud" className="h-10 w-auto" />
            </div>
            <div className="flex items-center">
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
          <h2 className="text-xl font-semibold mb-4">
            Audit Logs - {sessionTitle}
          </h2>
          {loading ? (
            <div>Loading audit logs...</div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className="p-4 border rounded-lg">
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900">
                          {new Date(log.timestamp).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(log.timestamp).toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <span className="text-xs font-medium px-2 py-1 rounded bg-blue-100 text-blue-800">
                        {log.action}
                      </span>
                    </div>
                    <div className="text-sm">
                      <p className="text-gray-600">
                        {log.action === "change_vote"
                          ? `Changed vote from "${log.details.previousOption}" to "${log.details.newOption}"`
                          : `Voted for "${log.details.newOption}"`}
                      </p>
                      <div className="mt-2 text-xs text-gray-500">
                        <p>User: {log.userName || "Unknown User"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {logs.length === 0 && (
                <p className="text-gray-500 text-center py-4">
                  No audit logs found for this session.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuditLogsPage;
