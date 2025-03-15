import React, { useState } from "react";

import axios from "axios";

const ReplyBox = ({ emailId, recipient, onSend }) => {
  const [message, setMessage] = useState("");
  const [sender, setSender] = useState(""); // Capture sender email

  const handleReplySubmit = () => {
    if (!message.trim() || !sender.trim()) {
        alert("Sender and message are required");
        return;
    }

    onSend(message, sender); // Send reply to EmailDetail
    setMessage("");
  };

  return (
    <div className="reply-box">
      <input type="email" placeholder="Your email" value={sender} onChange={(e) => setSender(e.target.value)} />
      <textarea placeholder={`Reply to ${recipient}`} value={message} onChange={(e) => setMessage(e.target.value)} />
      <button onClick={handleReplySubmit}>Send</button>
    </div>
  );
};

export default ReplyBox;
