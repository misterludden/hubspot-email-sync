import React, { useEffect, useState } from "react";

import EmailDetail from "./EmailDetail";
import EmailList from "./EmailList";
import { FaReply } from "react-icons/fa";
import ReplyBox from "./ReplyBox";
import axios from "axios";

const EmailDashboard = () => {
  const [emails, setEmails] = useState([]);
  const [filteredEmails, setFilteredEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterLabel, setFilterLabel] = useState("");
  const [sortOption, setSortOption] = useState("date-desc");
  const [showReplyBox, setShowReplyBox] = useState(false);

  useEffect(() => {
    axios
      .get("/api/emails")
      .then((response) => {
        setEmails(response.data);
        setFilteredEmails(response.data);
      })
      .catch((error) => console.error("Error fetching emails:", error));
  }, []);

  useEffect(() => {
    let filtered = emails;
    if (searchQuery) {
      filtered = filtered.filter(
        (email) =>
          email.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
          email.sender.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    if (filterLabel) {
      filtered = filtered.filter((email) => email.labels.includes(filterLabel));
    }

    if (sortOption === "date-asc") {
      filtered.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    } else {
      filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    setFilteredEmails([...filtered]);
  }, [searchQuery, filterLabel, sortOption, emails]);

  useEffect(() => {
    let sortedEmails = [...emails];

    sortedEmails.sort((a, b) => {
      const latestA =
        a.replies.length > 0 ? new Date(a.replies[a.replies.length - 1].timestamp) : new Date(a.timestamp);

      const latestB =
        b.replies.length > 0 ? new Date(b.replies[b.replies.length - 1].timestamp) : new Date(b.timestamp);

      return latestB - latestA; // Sort newest to oldest
    });

    setFilteredEmails(sortedEmails);
  }, [emails]);

  const [latestReply, setLatestReply] = useState(null);

  const handleSendReply = (message, sender, emailId) => {
    const newReply = {
      emailId,
      sender,
      body: message,
      timestamp: new Date().toISOString(),
      isInbound: false,
    };

    setLatestReply(newReply); // Instantly update UI before sending to backend

    axios
      .post(`/api/emails/${emailId}/reply`, { sender, message, isInbound: false })
      .then((response) => {
        console.log("Reply sent successfully:", response.data);
      })
      .catch((error) => {
        console.error("Error sending reply:", error);
      });
  };

  return (
    <div className="app-container">
      <h1>HubSpot Email Sync</h1>
      <div className="filters">
        <input
          type="text"
          placeholder="Search emails..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select value={filterLabel} onChange={(e) => setFilterLabel(e.target.value)}>
          <option value="">All Labels</option>
          <option value="Work">Work</option>
          <option value="Client">Client</option>
          <option value="Support">Support</option>
          <option value="Meeting">Meeting</option>
          <option value="Marketing">Marketing</option>
        </select>
        <select value={sortOption} onChange={(e) => setSortOption(e.target.value)}>
          <option value="date-desc">Newest First</option>
          <option value="date-asc">Oldest First</option>
        </select>
      </div>
      <div className="email-section">
        <EmailList
          emails={filteredEmails}
          selectedEmail={selectedEmail}
          onSelectEmail={(email) => {
            setSelectedEmail(email);
            setLatestReply(null);
          }}
        />
        <div className="email-content">
          {selectedEmail && (
            <>
              <EmailDetail email={selectedEmail} latestReply={latestReply} onSendReply={handleSendReply} />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmailDashboard;
