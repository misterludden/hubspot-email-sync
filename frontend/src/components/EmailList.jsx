import React from "react";

const EmailList = ({ emails, onSelectEmail, selectedEmail }) => {
  // Separate emails into unread and read groups
  const unreadEmails = [];
  const readEmails = [];
  
  // Filter emails into read and unread categories
  emails.forEach(email => {
    const latestMessage = email.messages[email.messages.length - 1];
    if (!latestMessage?.isRead) {
      unreadEmails.push(email);
    } else {
      readEmails.push(email);
    }
  });
  
  // Sort each group by timestamp (newest first)
  const sortByTimestamp = (a, b) => new Date(b.latestTimestamp) - new Date(a.latestTimestamp);
  const sortedUnreadEmails = [...unreadEmails].sort(sortByTimestamp);
  const sortedReadEmails = [...readEmails].sort(sortByTimestamp);
  
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

  // Only filter out archived emails that are read
  // For unread emails, we want to show them even if they're in archived threads
  const filteredUnreadEmails = sortedUnreadEmails; // Show all unread emails, even if in archived threads
  const filteredReadEmails = sortedReadEmails.filter((email) => !email.isArchived);
  const userEmail = localStorage.getItem("userEmail");
  const provider = localStorage.getItem("emailProvider");
  
  return (
    <div className="email-list">
      {filteredUnreadEmails.length === 0 && filteredReadEmails.length === 0 ? (
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
        <>
          {/* Unread Messages Section - Always show this section */}
          <div className="email-section" id="unread-section">
            <div className="email-section-header">Unread ({filteredUnreadEmails.length})</div>
            {filteredUnreadEmails.length > 0 ? (
              filteredUnreadEmails.map((email) => {
                const latestMessage = email.messages[email.messages.length - 1];
                const isSelected = selectedEmail?.threadId === email.threadId;
                
                return (
                  <div
                    key={email.threadId}
                    className={`email-list-item unread ${isSelected ? "selected" : ""}`}
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
            ) : (
              <div className="empty-section-message">No unread messages</div>
            )}
          </div>
          
          {/* Read Messages Section - Always show this section */}
          <div className="email-section" id="read-section">
            <div className="email-section-header">Read ({filteredReadEmails.length})</div>
            {filteredReadEmails.length > 0 ? (
              filteredReadEmails.map((email) => {
                const latestMessage = email.messages[email.messages.length - 1];
                const isSelected = selectedEmail?.threadId === email.threadId;
                
                return (
                  <div
                    key={email.threadId}
                    className={`email-list-item ${isSelected ? "selected" : ""}`}
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
            ) : (
              <div className="empty-section-message">No read messages</div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default EmailList;
