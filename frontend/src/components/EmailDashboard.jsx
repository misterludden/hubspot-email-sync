import React, { useEffect, useState } from "react";

import EmailDetail from "./EmailDetail";
import EmailList from "./EmailList";

const EmailDashboard = () => {
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);

  useEffect(() => {
    const fetchEmails = async () => {
      try {
        const response = await fetch("/api/emails");
        const data = await response.json();
        setEmails(data);
      } catch (error) {
        console.error("Error fetching emails:", error);
      }
    };
    fetchEmails();
  }, []);

  const handleSelectEmail = (email) => {
    setSelectedEmail(email);
  };

  return (
    <div className="email-section">
      <EmailList emails={emails} onSelectEmail={handleSelectEmail} />
      {selectedEmail && <EmailDetail email={selectedEmail} />}
    </div>
  );
};

export default EmailDashboard;
