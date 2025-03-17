import React, { useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";

const EmailDetail = ({ selectedEmail, onReply, onArchive }) => {
  if (!selectedEmail) return <div className="email-detail">Select an email to view details</div>;

  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [archiving, setArchiving] = useState(false);

  const handleArchive = async () => {
    if (archiving) return;
    
    setArchiving(true);
    try {
      const userEmail = localStorage.getItem("userEmail");
      await axios.post("/api/gmail/archive", {
        threadId: selectedEmail.threadId,
        email: userEmail || selectedEmail.recipient,
      });
      
      toast.success("Email archived successfully");
      
      // Call the onArchive callback to update the UI immediately
      if (onArchive) {
        onArchive(selectedEmail.threadId);
      }
    } catch (error) {
      console.error("Error archiving email:", error);
      toast.error("Failed to archive email");
    } finally {
      setArchiving(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim()) return;
    
    const replyToastId = toast.loading("Sending reply...");
    
    try {
      const userEmail = localStorage.getItem("userEmail");
      await axios.post(`/api/emails/${selectedEmail.threadId}/reply`, {
        sender: userEmail || "me@example.com",
        body: replyText,
        isInbound: false
      });
      
      toast.update(replyToastId, { 
        render: "Reply sent successfully", 
        type: "success", 
        isLoading: false, 
        autoClose: 3000 
      });
      
      setReplyText("");
      setShowReplyBox(false);
      if (onReply) onReply();
    } catch (error) {
      console.error("Error sending reply:", error);
      toast.update(replyToastId, { 
        render: "Failed to send reply", 
        type: "error", 
        isLoading: false, 
        autoClose: 3000 
      });
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
          <textarea 
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Type your reply..." 
          />
          <button onClick={handleSendReply}>Send</button>
        </div>
      )}

      <div className="email-body">
        <p>{selectedEmail.messages[selectedEmail.messages.length - 1]?.body}</p>
      </div>
    </div>
  );
};

export default EmailDetail;
