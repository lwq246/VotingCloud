import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
// Add Firebase Performance import
import { getPerformance, trace } from "firebase/performance";
import { API_URL, auth } from "../config/firebase";

const CreateSession = () => {
  const navigate = useNavigate();
  const [sessionData, setSessionData] = useState({
    title: "",
    description: "",
    startTime: "",
    endTime: "",
  });
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [error, setError] = useState("");

  // Add this useEffect at the top of the component
  useEffect(() => {
    // Initialize performance monitoring
    const perf = getPerformance();
    const componentTrace = trace(perf, "create_session_load");
    componentTrace.start();

    const checkAuth = async () => {
      const token = localStorage.getItem("token");
      const userData = localStorage.getItem("userData");

      if (!token || !userData || !auth.currentUser) {
        console.log("Unauthorized access attempt - redirecting to login");
        navigate("/");
        return;
      }
    };

    checkAuth();

    return () => {
      // Stop the trace when component unmounts
      componentTrace.stop();
    };
  }, [navigate]);

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const addOption = () => {
    setOptions([...options, ""]);
  };

  const removeOption = (index: number) => {
    if (options.length <= 2) return; // Minimum 2 options
    const newOptions = options.filter((_, i) => i !== index);
    setOptions(newOptions);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Create trace for session creation
    const perf = getPerformance();
    const createSessionTrace = trace(perf, "create_session_submit");
    createSessionTrace.start();

    try {
      const user = auth.currentUser;
      if (!user?.email) {
        setError("You must be logged in to create a session");
        return;
      }

      // Get user data from localStorage
      const userData = JSON.parse(localStorage.getItem("userData") || "{}");
      const userId = userData.userId;

      if (!userId) {
        setError("User data not found");
        return;
      }

      // Format dates as ISO strings
      const startTime = new Date(sessionData.startTime).toISOString();
      const endTime = new Date(sessionData.endTime).toISOString();

      // Create session through Node.js backend
      // Inside handleSubmit function
      const response = await fetch(`${API_URL}/api/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await auth.currentUser?.getIdToken()}`,
        },
        body: JSON.stringify({
          title: sessionData.title,
          description: sessionData.description,
          startTime,
          endTime,
          createdBy: userId,
          status: "active",
          options: options.filter((opt) => opt.trim() !== ""),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create session");
      }

      const session = await response.json();
      
      // Record success in trace
      createSessionTrace.putAttribute("status", "success");
      createSessionTrace.stop();

      navigate(`/session/${session.id}`);
    } catch (error: any) {
      // Record error in trace
      createSessionTrace.putAttribute("status", "error");
      createSessionTrace.putAttribute("error_message", error.message);
      createSessionTrace.stop();

      setError(error.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <img src="/Logo.png" alt="VotingCloud" className="h-10 w-auto" />
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-2xl font-semibold mb-6">
            Create New Voting Session
          </h2>
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Title
              </label>
              <input
                type="text"
                required
                value={sessionData.title}
                onChange={(e) =>
                  setSessionData({ ...sessionData, title: e.target.value })
                }
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Description
              </label>
              <textarea
                required
                value={sessionData.description}
                onChange={(e) =>
                  setSessionData({
                    ...sessionData,
                    description: e.target.value,
                  })
                }
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Start Time
                </label>
                <input
                  type="datetime-local"
                  required
                  value={sessionData.startTime}
                  onChange={(e) =>
                    setSessionData({
                      ...sessionData,
                      startTime: e.target.value,
                    })
                  }
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  End Time
                </label>
                <input
                  type="datetime-local"
                  required
                  value={sessionData.endTime}
                  onChange={(e) =>
                    setSessionData({ ...sessionData, endTime: e.target.value })
                  }
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              {/* Add this new section before the buttons */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Voting Options
                </label>
                <div className="space-y-3">
                  {options.map((option, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={option}
                        placeholder={`Option ${index + 1}`}
                        onChange={(e) =>
                          handleOptionChange(index, e.target.value)
                        }
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      {options.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeOption(index)}
                          className="px-2 py-2 text-red-600 hover:text-red-800"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addOption}
                  className="mt-3 text-sm text-indigo-600 hover:text-indigo-800"
                >
                  + Add Option
                </button>
              </div>

              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={() => navigate("/home")}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white !bg-[#782CBF] hover:!bg-[#5A189A] rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Create Session
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateSession;
