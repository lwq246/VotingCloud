import emailjs from "@emailjs/browser";
import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import AuditLogs from "./components/AuditLogs";
import CreateSession from "./components/CreateSession";
import EditSession from "./components/EditSession";
import EmailTest from "./components/EmailTest";
import Home from "./components/Home";
import Login from "./components/Login";
import ManageVotes from "./components/ManageVotes"; // Add this import
import Register from "./components/Register";
import VotingSession from "./components/VotingSession";
 
function App() {
  useEffect(() => {
    emailjs.init("7524vGpbai0gUct-F");
  }, []);

  return (
    <div className="min-h-screen w-screen">
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/home" element={<Home />} />
        <Route path="/email-test" element={<EmailTest />} />
        <Route path="/create-session" element={<CreateSession />} />
        <Route path="/session/:sessionId" element={<VotingSession />} />
        <Route path="/edit-session/:sessionId" element={<EditSession />} />
        <Route path="/audit-logs/:sessionId" element={<AuditLogs />} />
        <Route path="/sessions/:sessionId/votes" element={<ManageVotes />} /> {/* Add this route */}
      </Routes>
    </div>
  );
}

export default App;
