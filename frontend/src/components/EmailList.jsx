import React from "react";

const EmailList = ({ emails, selectedEmail, onSelectEmail }) => {
  return (
    <div className="email-list">
      {emails.map((email) => {
        // Get the latest timestamp (either email timestamp or last reply timestamp)
        const latestTimestamp =
          email.replies.length > 0
            ? new Date(email.replies[email.replies.length - 1].timestamp) // Most recent reply
            : new Date(email.timestamp); // Email timestamp if no replies

        return (
          <div
            key={email._id}
            className={`email-list-item ${selectedEmail?._id === email._id ? "selected" : ""}`}
            onClick={() => onSelectEmail(email)}
          >
            <strong>{email.subject}</strong> - {email.sender}
            <div className="email-timestamp">
              {latestTimestamp.toLocaleString()} {/* Display newest timestamp */}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default EmailList;
