import React from "react";

const EmailList = ({ emails, onSelectEmail, selectedEmail }) => {
  // Sort emails: Unread first, then by timestamp
  const sortedEmails = [...emails].sort((a, b) => {
    if (!a.messages[a.messages.length - 1]?.isRead && b.messages[b.messages.length - 1]?.isRead) return -1;
    if (a.messages[a.messages.length - 1]?.isRead && !b.messages[b.messages.length - 1]?.isRead) return 1;
    return new Date(b.latestTimestamp) - new Date(a.latestTimestamp);
  });
  
  // Helper function to get sender name from email string
  const getSenderName = (senderString) => {
    if (!senderString) return 'Unknown Sender';
    return senderString.includes('<') ? senderString.split('<')[0].trim() : senderString;
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return "";

    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const filteredEmails = sortedEmails.filter((email) => !email.isArchived);
  const userEmail = localStorage.getItem("userEmail");
  const provider = localStorage.getItem("emailProvider");
  
  return (
    <div className="email-list">
      {filteredEmails.length === 0 ? (
        <div className="email-list-empty">
          {userEmail && provider ? (
            <div className="empty-state-content">
              <h3>No Emails Found</h3>
              <p>Your inbox is empty or emails are still syncing.</p>
              <p>If you just connected your account, try clicking the Sync button in Settings.</p>
              <button 
                className="primary-button"
                onClick={() => window.location.href = '/settings'}
              >
                Go to Settings
              </button>
            </div>
          ) : (
            <div className="empty-state-content">
              <h3>No Email Account Connected</h3>
              <p>Connect your email account in Settings to view your emails here.</p>
              <button 
                className="primary-button"
                onClick={() => window.location.href = '/settings'}
              >
                Connect Email Account
              </button>
            </div>
          )}
        </div>
      ) : (
        filteredEmails.map((email) => {
          const latestMessage = email.messages[email.messages.length - 1];
          const isSelected = selectedEmail?.threadId === email.threadId;
          
          return (
            <div
              key={email.threadId}
              className={`email-list-item ${latestMessage?.isRead ? "" : "unread"} ${isSelected ? "selected" : ""}`}
              onClick={() => onSelectEmail(email)}
            >
              <div className="email-list-header">
                <span className="email-sender" title={latestMessage?.sender || email.participants?.[0] || ''}>
                  {getSenderName(latestMessage?.sender || email.participants?.[0])}
                </span>
                <span className="email-time">{formatDate(email.latestTimestamp)}</span>
              </div>
              <div className="email-subject" title={email.subject}>{email.subject}</div>
              <div className="email-snippet">{latestMessage?.body?.slice(0, 100)}...</div>
            </div>
          );
        })
      )}
    </div>
  );
};

export default EmailList;
