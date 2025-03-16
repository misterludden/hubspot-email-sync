import React, { useState } from "react";

const ReplyBox = ({ email, onReplySent }) => {
  const [reply, setReply] = useState("");

  const handleSendReply = async () => {
    if (!reply.trim()) return;
    const response = await fetch(`/emails/${email._id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sender: "me@example.com", message: reply, isInbound: false }),
    });
    if (response.ok) {
      const updatedEmail = await response.json();
      onReplySent(updatedEmail);
      setReply("");
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
