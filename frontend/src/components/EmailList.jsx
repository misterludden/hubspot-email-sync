import React from "react";

const EmailList = ({ emails, onSelectEmail }) => {
  // Sort emails: Unread first, then by timestamp
  const sortedEmails = [...emails].sort((a, b) => {
    if (!a.messages[a.messages.length - 1]?.isRead && b.messages[b.messages.length - 1]?.isRead) return -1;
    if (a.messages[a.messages.length - 1]?.isRead && !b.messages[b.messages.length - 1]?.isRead) return 1;
    return new Date(b.latestTimestamp) - new Date(a.latestTimestamp);
  });

  return (
    <div className="email-list">
      {sortedEmails
        .filter((email) => !email.isArchived) // Hide archived messages
        .map((email) => {
          const latestMessage = email.messages[email.messages.length - 1];
          return (
            <div
              key={email.threadId}
              className={`email-list-item ${latestMessage?.isRead ? "" : "unread"}`}
              onClick={() => onSelectEmail(email)}
            >
              <div className="email-list-header">
                <span className="email-sender">{email.sender}</span>
                <span className="email-time">{new Date(email.latestTimestamp).toLocaleTimeString()}</span>
              </div>
              <div className="email-subject">{email.subject}</div>
            </div>
          );
        })}
    </div>
  );
};

export default EmailList;
