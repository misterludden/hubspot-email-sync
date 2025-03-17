import React, { useState } from "react";

import axios from "axios";

const EmailDetail = ({ selectedEmail, onReply }) => {
  if (!selectedEmail) return <div className="email-detail">Select an email to view details</div>;

  const [showReplyBox, setShowReplyBox] = useState(false);

  const handleArchive = async () => {
    try {
      await axios.post("/api/auth/archive", {
        threadId: selectedEmail.threadId,
        email: selectedEmail.recipient,
      });
      alert("Email archived!");
    } catch (error) {
      console.error("Error archiving email:", error);
    }
  };

  return (
    <div className="email-detail">
      <h3>{selectedEmail.subject}</h3>
      <p className="email-meta">
        <strong>From:</strong> {selectedEmail.sender} <br />
        <strong>To:</strong> {selectedEmail.recipient} <br />
        <strong>Last Message:</strong> {new Date(selectedEmail.latestTimestamp).toLocaleString()}
      </p>
      <div className="email-actions">
        <button className="reply-button" onClick={() => setShowReplyBox(!showReplyBox)}>
          {showReplyBox ? "Cancel Reply" : "Reply"}
        </button>
        <button className="archive-button" onClick={handleArchive}>
          Archive
        </button>
      </div>

      {showReplyBox && (
        <div className="reply-box">
          <textarea placeholder="Type your reply..." />
          <button onClick={onReply}>Send</button>
        </div>
      )}

      <div className="email-body">
        <p>{selectedEmail.messages[selectedEmail.messages.length - 1]?.body}</p>
      </div>
    </div>
  );
};

export default EmailDetail;
