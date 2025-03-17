import React, { useEffect, useState } from "react";

import axios from "axios";
import { useNavigate } from "react-router-dom";

const SettingsPage = () => {
  const [authUrl, setAuthUrl] = useState("");
  const [authStatus, setAuthStatus] = useState(null);
  const [syncDays, setSyncDays] = useState(1);
  const navigate = useNavigate();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const userEmailFromURL = urlParams.get("email");

    if (userEmailFromURL) {
      localStorage.setItem("userEmail", userEmailFromURL);
    }

    const storedUserEmail = userEmailFromURL || localStorage.getItem("userEmail");

    axios
      .get("/api/auth/gmail")
      .then((response) => setAuthUrl(response.data.url))
      .catch((error) => console.error("Error fetching OAuth URL:", error));

    const fetchAuthStatus = async () => {
      try {
        if (!storedUserEmail) {
          console.warn("No email available for auth check.");
          setAuthStatus(null);
          return;
        }

        const response = await axios.get(`/api/auth/status?email=${storedUserEmail}`);
        if (response.data.authenticated) {
          setAuthStatus(response.data);
          localStorage.setItem("userEmail", response.data.email); // Persist user email
        } else {
          setAuthStatus(null);
        }
      } catch (error) {
        console.error("Error fetching authentication status:", error);
        setAuthStatus(null);
      }
    };

    fetchAuthStatus();
  }, []);

  const handleDisconnect = () => {
    axios
      .post("/api/auth/disconnect", { email: authStatus?.email })
      .then(() => setAuthStatus(null))
      .catch((error) => console.error("Error disconnecting:", error));
  };

  const handleSync = () => {
    const userEmail = authStatus?.email || localStorage.getItem("userEmail");

    if (!userEmail) {
      console.error("No email found for syncing.");
      return;
    }

    axios
      .post("/api/auth/sync", { email: userEmail, days: syncDays })
      .then((response) => console.log("Sync successful:", response.data))
      .catch((error) => {
        console.error("Error syncing emails:", error.response ? error.response.data : error);
      });
  };

  return (
    <div className="settings-container">
      <nav className="nav-bar">
        <button onClick={() => navigate("/")}>Inbox</button>
      </nav>
      <h2>Settings</h2>
      {authStatus?.authenticated ? (
        <div>
          <div>
            <p>
              Connected with <strong>{authStatus.email}</strong>
            </p>
          </div>
          <div>
            <button onClick={handleDisconnect}>Disconnect</button>
          </div>
          <div>
            <label>Sync Emails from Last: </label>
            <select value={syncDays} onChange={(e) => setSyncDays(parseInt(e.target.value))}>
              <option value={1}>1 Day</option>
              <option value={7}>7 Days</option>
              <option value={30}>30 Days</option>
            </select>
            <button onClick={handleSync}>Sync Emails</button>
          </div>
        </div>
      ) : (
        <button onClick={() => (window.location.href = authUrl)}>Connect Gmail</button>
      )}
    </div>
  );
};

export default SettingsPage;
