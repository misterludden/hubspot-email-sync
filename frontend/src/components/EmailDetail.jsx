import React from "react";
import ReplyBox from "./ReplyBox";

const EmailDetail = ({ email, onReplySent }) => {
  return (
    <div className="email-detail">
      <h2>{email.subject}</h2>
      <p>
        <strong>From:</strong> {email.participants.join(", ")}
      </p>
      <div className="email-thread">
        {email.messages
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .map((msg, index) => (
            <div key={index} className={`email-reply ${msg.isInbound ? "inbound" : "outbound"}`}>
              <p className="email-reply-meta">
                {msg.sender} - {new Date(msg.timestamp).toLocaleString()}
              </p>
              <p className="email-reply-body">{msg.body}</p>
            </div>
          ))}
      </div>
      <ReplyBox email={email} onReplySent={onReplySent} />
    </div>
  );
};

export default EmailDetail;
