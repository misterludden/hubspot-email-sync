import React, { useEffect, useState } from "react";

import axios from "axios";

const SettingsPage = () => {
  const [authUrl, setAuthUrl] = useState("");
  const [authStatus, setAuthStatus] = useState(null);

  useEffect(() => {
    axios
      .get("/api/auth/gmail")
      .then((response) => setAuthUrl(response.data.url))
      .catch((error) => console.error("Error fetching OAuth URL:", error));

    axios
      .get("/api/auth/status")
      .then((response) => setAuthStatus(response.data))
      .catch((error) => console.error("Error fetching authentication status:", error));
  }, []);

  const handleDisconnect = () => {
    axios.post("/api/auth/disconnect")
        .then(() => setAuthStatus(null))
        .catch(error => console.error("Error disconnecting:", error));
};

  return (
    <div className="settings-page">
      <h2>Settings</h2>
      {authStatus?.authenticated ? (
                <div>
                    <p>Connected with {authStatus.email}</p>
                    <button onClick={handleDisconnect}>Disconnect</button>
                </div>
      ) : (
        <button onClick={() => window.location.href = authUrl}>Connect Gmail</button>
      )}
    </div>
  );
};

export default SettingsPage;
