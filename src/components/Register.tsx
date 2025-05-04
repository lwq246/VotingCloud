import emailjs from "@emailjs/browser";
import { signInWithCustomToken } from "firebase/auth";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL, auth } from "../config/firebase.tsx";
// Add Firebase Performance import
import { getPerformance, trace } from "firebase/performance";
 
const Register = () => {
  const form = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [sentOtp, setSentOtp] = useState("");
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const sendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    try {
      setIsLoading(true);
      const generatedOtp = generateOTP();
      setSentOtp(generatedOtp); // This happens too late

      if (form.current) {
        // Add OTP directly to form before sending
        const otpInput = form.current.querySelector(
          'input[name="otp_code"]'
        ) as HTMLInputElement;
        if (otpInput) {
          otpInput.value = generatedOtp;
        }

        await emailjs.sendForm(
          "service_pk78mw9",
          "template_o98pt6q",
          form.current,
          "7524vGpbai0gUct-F"
        );

        setSentOtp(generatedOtp); // Move this here after successful send
        setShowOtpInput(true);
        setError("");
      }
    } catch (error) {
      console.error("Error sending OTP:", error);
      setError(
        "Failed to send OTP. Please check your email address and try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Initialize performance monitoring
    const perf = getPerformance();
    const otpTrace = trace(perf, "otp_verification");
    otpTrace.start();

    if (otp !== sentOtp) {
      otpTrace.putAttribute("status", "invalid_otp");
      otpTrace.stop();
      setError("Invalid OTP");
      return;
    }

    try {
      // Verify OTP with backend
      const verifyResponse = await fetch(`${API_URL}/api/auth/verify-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, otp }),
      });

      if (!verifyResponse.ok) {
        throw new Error("OTP verification failed");
      }

      // Start registration trace
      const registerTrace = trace(perf, "user_registration");
      registerTrace.start();

      // Register user in backend
      const registerResponse = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          name,
        }),
      });

      if (!registerResponse.ok) {
        const errorData = await registerResponse.json();
        throw new Error(errorData.error || "Registration failed");
      }

      const userData = await registerResponse.json();
      registerTrace.putAttribute("status", "success");
      registerTrace.stop();

      // Sign in with custom token
      await signInWithCustomToken(auth, userData.customToken);

      // Store user data
      localStorage.setItem(
        "userData",
        JSON.stringify({
          ...userData,
          customToken: userData.customToken,
        })
      );

      otpTrace.putAttribute("status", "success");
      otpTrace.stop();

      navigate("/home");
    } catch (err: any) {
      otpTrace.putAttribute("status", "error");
      otpTrace.putAttribute("error_message", err.message);
      otpTrace.stop();
      setError(err.message);
      console.error("Registration error:", err);
    }
  };

  return (
    <div className="flex h-screen">
      {/* Left side remains the same */}
      <div className="hidden lg:flex lg:w-1/2 bg-indigo-600 items-center justify-center">
        <div className="text-center text-white">
          <h1 className="text-4xl font-bold mb-4">Welcome to VotingCloud</h1>
          <p className="text-xl">Create your account to get started</p>
        </div>
      </div>

      {/* Right side - Registration Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="max-w-md w-full">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-900">Create Account</h2>
            <p className="mt-2 text-sm text-gray-600">
              Register to start creating voting sessions
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          {!showOtpInput ? (
            // In the form, add this hidden input with the other form fields:
            <form ref={form} onSubmit={sendOTP} className="space-y-6">
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-gray-700"
                >
                  Full Name
                </label>
                <input
                  id="name"
                  name="to_name"
                  type="text"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700"
                >
                  Email Address
                </label>
                <input
                  id="email"
                  name="to_email"
                  type="email"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              {/* Hidden input for from_name */}
              <input type="hidden" name="from_name" value="VotingCloud" />
              <input type="hidden" name="otp_code" value={sentOtp} />
              {/* ... rest of the form ... */}
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Create a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-gray-700"
                >
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white !bg-[#782CBF] hover:!bg-[#5A189A] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400"
              >
                {isLoading ? (
                  <span className="flex items-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Sending...
                  </span>
                ) : (
                  "Send OTP"
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleOtpSubmit} className="space-y-6">
              <div>
                <label
                  htmlFor="otp"
                  className="block text-sm font-medium text-gray-700"
                >
                  Enter OTP
                </label>
                <input
                  id="otp"
                  type="text"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter the OTP sent to your email"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white !bg-[#782CBF] hover:!bg-[#5A189A] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Verify & Register
              </button>
            </form>
          )}

          <div className="text-center mt-4">
            <span className="text-sm text-gray-600">
              Already have an account?{" "}
            </span>
            <a
              href="/"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
            >
              Sign in
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
