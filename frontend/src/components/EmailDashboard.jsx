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
  const [hubspotSyncing, setHubspotSyncing] = useState(false);
  const [hubspotAuthenticated, setHubspotAuthenticated] = useState(false);
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
    checkAuthStatusForAllProviders();
  }, [provider]);

  // Check authentication status for all providers
  const checkAuthStatusForAllProviders = async () => {
    const userEmail = localStorage.getItem("userEmail");
    if (!userEmail) return;
    
    try {
      const response = await axios.get('/api/email/auth-status', {
        params: { email: userEmail }
      });
      
      if (response.data.success && response.data.authStatus) {
        // Update HubSpot authentication status
        setHubspotAuthenticated(response.data.authStatus.hubspot || false);
        
        // If we don't have a provider set but have valid auth for one, set it
        const currentProvider = localStorage.getItem("emailProvider");
        if (!currentProvider) {
          // Check if we have valid auth for any email provider
          const providers = ['gmail', 'outlook'];
          for (const p of providers) {
            if (response.data.authStatus[p]) {
              console.log(`Found valid authentication for ${p}, setting as current provider`);
              localStorage.setItem("emailProvider", p);
              setProvider(p);
              fetchEmails();
              break;
            }
          }
        }
      }
    } catch (error) {
      console.error("Error checking authentication status:", error);
    }
  };

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
  

  
  // State for tracking HubSpot authentication process
  const [hubspotAuthLoading, setHubspotAuthLoading] = useState(false);

  // Authenticate with HubSpot
  const authenticateHubspot = async () => {
    const userEmail = localStorage.getItem("userEmail");
    if (!userEmail) {
      toast.error("Please connect an email account first");
      return;
    }
    
    try {
      setHubspotAuthLoading(true);
      toast.info("Preparing HubSpot authentication...");
      
      // Store the user email in the session before redirecting to HubSpot
      await axios.post('/api/session', { userEmail });
      console.log("User email stored in session for HubSpot auth");
      
      // Get the auth URL
      const response = await axios.get('/api/hubspot/auth-url');
      
      // Show a message to the user before redirecting
      toast.info("Redirecting to HubSpot. Please approve the requested permissions.", {
        autoClose: 5000
      });
      
      // Short delay to ensure the user sees the message
      setTimeout(() => {
        // Redirect to HubSpot for authentication
        window.location.href = response.data.authUrl;
      }, 1500);
    } catch (error) {
      console.error("Error starting HubSpot authentication:", error);
      toast.error("Failed to start HubSpot authentication");
      setHubspotAuthLoading(false);
    }
  };
  
  // Sync selected emails to HubSpot
  const syncToHubspot = async () => {
    const userEmail = localStorage.getItem("userEmail");
    if (!userEmail) {
      toast.error("Please connect an email account first");
      return;
    }
    
    if (!hubspotAuthenticated) {
      toast.error("Please authenticate with HubSpot first");
      return;
    }
    
    if (!selectedEmail) {
      toast.error("Please select an email to sync");
      return;
    }
    
    setHubspotSyncing(true);
    try {
      // Prepare the email for syncing
      const emailToSync = {
        messageId: selectedEmail.id,
        threadId: selectedEmail.threadId,
        subject: selectedEmail.subject,
        sender: selectedEmail.from,
        recipient: selectedEmail.to,
        body: selectedEmail.snippet || selectedEmail.body,
        timestamp: selectedEmail.timestamp,
        isInbound: selectedEmail.direction === 'inbound'
      };
      
      // Call the sync endpoint
      const response = await axios.post('/api/hubspot/sync-emails', {
        userEmail,
        emails: [emailToSync]
      });
      
      if (response.data.success) {
        toast.success("Email synced to HubSpot successfully");
      } else {
        toast.error("Failed to sync email to HubSpot");
      }
    } catch (error) {
      console.error("Error syncing email to HubSpot:", error);
      toast.error("Failed to sync email to HubSpot: " + (error.response?.data?.error || error.message));
    } finally {
      setHubspotSyncing(false);
    }
  };

  // Check for authentication status on component mount and when URL parameters change
  useEffect(() => {
    // Check if we're returning from HubSpot OAuth flow
    const urlParams = new URLSearchParams(window.location.search);
    const provider = urlParams.get('provider');
    const authStatus = urlParams.get('auth');
    
    if (provider === 'hubspot' && authStatus) {
      console.log('Detected HubSpot OAuth callback with status:', authStatus);
      
      // Clear the URL parameters
      const url = new URL(window.location.href);
      url.search = '';
      window.history.replaceState({}, document.title, url.toString());
      
      if (authStatus === 'success') {
        toast.success('HubSpot connected successfully!');
        // Add a small delay before checking auth status to ensure backend has completed processing
        setTimeout(() => {
          checkAuthStatusForAllProviders(); // Refresh the auth status
        }, 1000);
      } else {
        const errorMessage = urlParams.get('message') || 'Unknown error';
        console.error('HubSpot authentication error:', errorMessage);
        toast.error(`HubSpot connection failed: ${errorMessage}`);
      }
    }
  }, []);
  
  // Add a second useEffect to handle initial load and check auth status
  useEffect(() => {
    // Check authentication status for all providers on initial load
    checkAuthStatusForAllProviders();
  }, []);
  
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
          
          {/* HubSpot Integration Buttons */}
          <div className="hubspot-integration">
            {!hubspotAuthenticated ? (
              <button 
                onClick={authenticateHubspot}
                className="hubspot-auth-button"
                disabled={hubspotAuthLoading}
              >
                {hubspotAuthLoading ? "Connecting to HubSpot..." : "Connect HubSpot"}
              </button>
            ) : (
              <button 
                onClick={syncToHubspot}
                disabled={hubspotSyncing || !selectedEmail}
                className={hubspotSyncing ? "syncing" : ""}
              >
                {hubspotSyncing ? "Syncing to HubSpot..." : "Sync to HubSpot"}
              </button>
            )}
          </div>
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
