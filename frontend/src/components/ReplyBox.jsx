import React, { useState } from "react";
import axios from "axios";

const ReplyBox = ({ email, onReplySent }) => {
  const [reply, setReply] = useState("");

  const handleSendReply = async () => {
    if (!reply.trim()) return;
    try {
      const userEmail = localStorage.getItem("userEmail");
      const response = await axios.post(`/api/emails/${email.threadId}/reply`, {
        sender: userEmail || "me@example.com",
        body: reply,
        isInbound: false
      });
      
      if (response.data.success) {
        onReplySent(response.data.emailThread);
        setReply("");
      }
    } catch (error) {
      console.error("Error sending reply:", error);
    }
  };

  return (
    <div className="reply-box">
      <textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Type your reply..." />
      <button onClick={handleSendReply}>Send</button>
    </div>
  );
};

export default ReplyBox;
