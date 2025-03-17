import React, { useEffect, useState } from "react";
import axios from "axios";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import EmailDetail from "./EmailDetail";
import EmailList from "./EmailList";
import { useNavigate } from "react-router-dom";

const EmailDashboard = () => {
  const navigate = useNavigate();
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchEmails = async () => {
    setLoading(true);
    try {
      const response = await axios.get("/api/emails");
      setEmails(response.data);
      
      // If we have a selected email, refresh its data
      if (selectedEmail) {
        const updatedEmail = response.data.find(email => email.threadId === selectedEmail.threadId);
        if (updatedEmail) {
          setSelectedEmail(updatedEmail);
        } else {
          // Email was probably archived or deleted
          setSelectedEmail(null);
        }
      }
    } catch (error) {
      console.error("Error fetching emails:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmails();
    
    // Set up a refresh interval (every 30 seconds)
    const intervalId = setInterval(fetchEmails, 30000);
    
    // Clean up the interval on component unmount
    return () => clearInterval(intervalId);
  }, []);

  const handleSelectEmail = (email) => {
    setSelectedEmail(email);
  };
  
  const handleEmailAction = () => {
    // Refresh emails after actions like reply or archive
    fetchEmails();
  };
  
  const handleArchive = (threadId) => {
    // Immediately update UI by filtering out the archived email
    setEmails(prevEmails => prevEmails.filter(email => email.threadId !== threadId));
    
    // Clear selected email if it was archived
    if (selectedEmail && selectedEmail.threadId === threadId) {
      setSelectedEmail(null);
    }
    
    // Also refresh the emails list to ensure everything is in sync
    fetchEmails();
  };

  return (
    <div className="dashboard-container">
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
      <nav className="nav-bar">
        <button onClick={() => navigate("/settings")}>Settings</button>
      </nav>
      <div>
        <h1>Inbox</h1>
        {loading && <span className="loading-indicator">Loading...</span>}
      </div>
      <div className="email-section">
        <EmailList emails={emails} onSelectEmail={handleSelectEmail} />
        {selectedEmail && (
          <EmailDetail 
            selectedEmail={selectedEmail} 
            onReply={handleEmailAction} 
            onArchive={handleArchive}
          />
        )}
      </div>
    </div>
  );
};

export default EmailDashboard;
