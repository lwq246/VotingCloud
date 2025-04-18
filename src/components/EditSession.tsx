import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_URL, auth } from "../config/firebase";

const EditSession = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [sessionData, setSessionData] = useState({
    title: "",
    description: "",
    startTime: "",
    endTime: "",
    status: "",
  });

  // Add new state for vote options
  const [voteOptions, setVoteOptions] = useState<
    Array<{ id: string; text: string }>
  >([]);
  const [newOption, setNewOption] = useState("");

  // Modify useEffect to fetch vote options
  useEffect(() => {
    const fetchSession = async () => {
      try {
        if (!sessionId || !auth.currentUser?.email) return;

        const response = await fetch(
          `${API_URL}/api/sessions/${sessionId}/edit`
        );
        if (!response.ok) {
          throw new Error("Failed to fetch session");
        }

        const data = await response.json();
        setSessionData({
          title: data.title,
          description: data.description,
          startTime: new Date(data.startTime).toISOString().slice(0, 16),
          endTime: new Date(data.endTime).toISOString().slice(0, 16),
          status: data.status,
        });

        // Set vote options
        if (data.options) {
          setVoteOptions(
            data.options.map((opt: string) => ({
              id: opt,
              text: opt,
            }))
          );
        }
      } catch (err: any) {
        setError(err.message);
      }
    };

    fetchSession();
  }, [sessionId]);

  const handleAddOption = async () => {
    if (!newOption.trim()) return;

    try {
      const response = await fetch(
        `${API_URL}/api/sessions/${sessionId}/options`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ optionText: newOption.trim() }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to add option");
      }

      const data = await response.json();
      setVoteOptions([...voteOptions, { id: data.id, text: data.text }]);
      setNewOption("");
    } catch (err: any) {
      setError(err.message);
      console.error("Error adding option:", err);
    }
  };

  const handleRemoveOption = async (optionId: string) => {
    try {
      const response = await fetch(
        `${API_URL}/api/sessions/${sessionId}/options/${optionId}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete option");
      }

      setVoteOptions(voteOptions.filter((opt) => opt.id !== optionId));
    } catch (err: any) {
      setError(err.message);
      console.error("Error deleting option:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/api/sessions/${sessionId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sessionData),
      });

      if (!response.ok) {
        throw new Error("Failed to update session");
      }

      navigate("/home");
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-indigo-600">VotingCloud</h1>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold">Edit Voting Session</h2>
            <button
              type="button"
              onClick={() => navigate(`/sessions/${sessionId}/votes`)}
              className="px-4 py-2 text-sm font-medium text-white !bg-[#782CBF] hover:!bg-[#5A189A] rounded-md"
            >
              Manage Votes
            </button>
          </div>
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

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Status
                </label>
                <select
                  value={sessionData.status}
                  onChange={(e) =>
                    setSessionData({ ...sessionData, status: e.target.value })
                  }
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>

            {/* Add this voting options section before the buttons */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Voting Options
              </label>
              <div className="space-y-3">
                {voteOptions.map((option) => (
                  <div key={option.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={option.text}
                      disabled
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(option.id)}
                      className="px-2 py-2 text-red-600 hover:text-red-800"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newOption}
                    onChange={(e) => setNewOption(e.target.value)}
                    placeholder="New option"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddOption}
                    className="px-4 py-2 text-sm font-medium text-white !bg-[#782CBF] hover:!bg-[#5A189A] rounded-md"
                  >
                    Add
                  </button>
                </div>
              </div>
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
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EditSession;
