import { FaArrowLeft, FaArrowRight, FaReply } from "react-icons/fa";
import React, { useEffect, useState } from "react";

import ReplyBox from "./ReplyBox";

const EmailDetail = ({ email, latestReply, onSendReply }) => {
  if (!email) return <div className="email-detail">Select an email to view details</div>;

  // Maintain local state for replies and show/hide ReplyBox
  const [replies, setReplies] = useState([]);
  const [showReplyBox, setShowReplyBox] = useState(false);

  useEffect(() => {
    // Reset replies when switching emails and ensure newest first
    setReplies([...email.replies].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
    setShowReplyBox(false); // Hide reply box when switching emails
  }, [email]);

  useEffect(() => {
    // Add latest reply only if it belongs to this email
    if (latestReply && latestReply.emailId === email._id) {
      setReplies((prevReplies) => [latestReply, ...prevReplies]);
    }
  }, [latestReply]);

  return (
    <div className="email-detail">
      <h2 className="email-subject">{email.subject}</h2>
      <div className="email-meta">
        <strong>From:</strong> {email.sender} <br />
        <strong>To:</strong> {email.recipient} <br />
        <strong>Sent:</strong> {new Date(email.timestamp).toLocaleString()}
      </div>
      <hr />

      {/* Reply Button to Toggle ReplyBox */}
      <button className="reply-button" onClick={() => setShowReplyBox(!showReplyBox)}>
        <FaReply size={14} /> Reply
      </button>

      {/* Show ReplyBox when button is clicked */}
      {showReplyBox && (
        <ReplyBox
          emailId={email._id}
          recipient={email.sender}
          onSend={(message, sender) => {
            setShowReplyBox(false); // Hide reply box after sending
            onSendReply(message, sender, email._id); // Pass reply up
          }}
        />
      )}

      {/* Replies Section */}
      {replies.length > 0 && (
        <div className="email-thread">
          <h3>Thread</h3>
          {replies.map((reply, index) => (
            <div key={index} className="email-reply">
              <div className="email-reply-meta">
                {reply.isInbound ? (
                  <FaArrowLeft style={{ color: "green", marginRight: "5px" }} />
                ) : (
                  <FaArrowRight style={{ color: "blue", marginRight: "5px" }} />
                )}
                <strong>{reply.sender}</strong> - {new Date(reply.timestamp).toLocaleString()}
              </div>
              <div className="email-reply-body">{reply.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EmailDetail;
