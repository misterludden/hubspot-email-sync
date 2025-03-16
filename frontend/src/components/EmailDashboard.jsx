import React, { useEffect, useState } from "react";

import EmailDetail from "./EmailDetail";
import EmailList from "./EmailList";
import { FaCog } from "react-icons/fa";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const EmailDashboard = () => {
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [latestReply, setLatestReply] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    axios
      .get("/api/emails")
      .then((response) => setEmails(response.data))
      .catch((error) => console.error("Error fetching emails:", error));
  }, []);

  const handleSendReply = (message, sender, emailId) => {
    const newReply = {
      emailId,
      sender,
      body: message,
      timestamp: new Date().toISOString(),
      isInbound: false,
    };

    setLatestReply(newReply);

    axios
      .post(`/api/emails/${emailId}/reply`, { sender, message, isInbound: false })
      .then((response) => console.log("Reply sent successfully:", response.data))
      .catch((error) => console.error("Error sending reply:", error));
  };

  return (
    <div className="email-dashboard">
      <div className="nav-bar">
        <h1>Email Dashboard</h1>
        <FaCog className="settings-icon" onClick={() => navigate("/settings")} />
      </div>
      <div className="email-section">
        <EmailList emails={emails} selectedEmail={selectedEmail} onSelectEmail={setSelectedEmail} />
        <div className="email-content">
          {selectedEmail && (
            <EmailDetail email={selectedEmail} latestReply={latestReply} onSendReply={handleSendReply} />
          )}
        </div>
      </div>
    </div>
  );
};

export default EmailDashboard;
