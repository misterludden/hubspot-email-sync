import React from "react";

const EmailList = ({ emails, onSelectEmail }) => {
  return (
    <div className="email-list">
      {emails.map((email) => (
        <div
          key={email.threadId}
          className={`email-list-item ${email.isUnread ? "unread" : ""}`}
          onClick={() => onSelectEmail(email)}
        >
          <p className="email-subject">{email.subject}</p>
          <p className="email-meta">From: {email.participants.join(", ")}</p>
          <p className="email-meta">Last Message: {new Date(email.latestTimestamp).toLocaleString()}</p>
        </div>
      ))}
    </div>
  );
};

export default EmailList;
