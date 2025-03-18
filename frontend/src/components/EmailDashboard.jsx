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
  const [syncing, setSyncing] = useState(false);
  const [provider, setProvider] = useState(() => {
    const storedProvider = localStorage.getItem("emailProvider");
    return storedProvider?.toLowerCase() || null;
  });

  const fetchEmails = async (polling = false) => {
    const currentProvider = localStorage.getItem("emailProvider")?.toLowerCase();
    const userEmail = localStorage.getItem("userEmail");
    
    if (!currentProvider || !userEmail) {
      setEmails([]);
      setSelectedEmail(null);
      return;
    }

    setLoading(true);
    try {
      let response;
      
      if (polling) {
        // Use the polling endpoint for regular updates
        console.log("Polling for new messages...");
        response = await axios.post(`/api/emails/${currentProvider}/poll`, {}, {
          params: { email: userEmail }
        });
        
        // The polling endpoint returns emails in the response
        if (response.data && response.data.emails && Array.isArray(response.data.emails)) {
          response = { data: response.data.emails };
        } else {
          console.warn("Polling response did not contain emails array:", response.data);
          // Fallback to regular fetch if polling doesn't return emails
          response = await axios.get(`/api/emails/${currentProvider}`, {
            params: { email: userEmail }
          });
        }
      } else {
        // Regular fetch for initial load
        response = await axios.get(`/api/emails/${currentProvider}`, {
          params: { email: userEmail }
        });
      }
      
      if (response.data && Array.isArray(response.data)) {
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
      } else {
        console.warn("Response data is not an array:", response.data);
        // Don't clear emails if we get an unexpected response during polling
        if (!polling) {
          setEmails([]);
          setSelectedEmail(null);
        }
      }
    } catch (error) {
      console.error("Error fetching emails:", error);
      if (error.response?.status === 401) {
        // Clear invalid credentials
        localStorage.removeItem("userEmail");
        localStorage.removeItem("emailProvider");
        setEmails([]);
        setSelectedEmail(null);
        toast.error("Please log in again to view your emails");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const currentProvider = localStorage.getItem("emailProvider")?.toLowerCase();
    if (currentProvider !== provider) {
      setProvider(currentProvider);
    }
    fetchEmails();
  }, [provider]);

  // Set up auto-refresh
  useEffect(() => {
    if (!provider) return;

    // Fetch emails immediately when the component mounts
    fetchEmails(false); // Initial load without polling
    
    // Then set up polling every 15 seconds using the polling endpoint
    const intervalId = setInterval(() => fetchEmails(true), 30000);
    return () => clearInterval(intervalId);
  }, [provider]);

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
  
  // Force sync emails from the server
  const forceSync = async () => {
    const currentProvider = localStorage.getItem("emailProvider")?.toLowerCase();
    const userEmail = localStorage.getItem("userEmail");
    
    if (!currentProvider || !userEmail) {
      toast.error("No email account connected");
      return;
    }
    
    setSyncing(true);
    try {
      // Call the sync endpoint
      await axios.post(`/api/emails/${currentProvider}/sync`, {
        days: 7 // Sync last 7 days
      }, {
        params: { email: userEmail }
      });
      
      toast.success("Email sync initiated");
      
      // Fetch emails after a short delay to allow sync to complete
      setTimeout(() => {
        fetchEmails();
        setSyncing(false);
      }, 3000);
    } catch (error) {
      console.error("Error syncing emails:", error);
      toast.error("Failed to sync emails");
      setSyncing(false);
    }
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
        <div className="nav-buttons">
          <button onClick={() => navigate("/settings")}>Settings</button>
          <button 
            onClick={forceSync} 
            disabled={syncing || loading}
            className={syncing ? "syncing" : ""}
          >
            {syncing ? "Syncing..." : "Force Sync"}
          </button>
        </div>
      </nav>
      <div className="main-content">
        <div className="list-section">
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e1e4e8' }}>
            <h1 style={{ margin: 0, fontSize: '1.25em' }}>Inbox</h1>
            {loading && <span className="loading-indicator">Loading...</span>}
          </div>
          <EmailList 
            emails={emails} 
            onSelectEmail={handleSelectEmail} 
            selectedEmail={selectedEmail}
          />
        </div>
        <div className="detail-section">
          <EmailDetail 
            selectedEmail={selectedEmail} 
            onReply={handleEmailAction} 
            onArchive={handleArchive}
          />
        </div>
      </div>
    </div>
  );
};

export default EmailDashboard;
