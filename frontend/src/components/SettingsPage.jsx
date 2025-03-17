import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const SettingsPage = () => {
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState('gmail');
  const [authUrls, setAuthUrls] = useState({});
  const [authStatus, setAuthStatus] = useState({});
  const [syncDays, setSyncDays] = useState(1);
  const [syncStatus, setSyncStatus] = useState({});
  const [initialSyncRequired, setInitialSyncRequired] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    // Fetch available providers
    axios
      .get("/api/auth/providers")
      .then((response) => {
        if (response.data.providers && response.data.providers.length > 0) {
          setProviders(response.data.providers);
          // Default to first provider if none selected
          if (!selectedProvider) {
            setSelectedProvider(response.data.providers[0]);
          }
        }
      })
      .catch((error) => console.error("Error fetching providers:", error));

    // Check URL parameters for auth callback
    const urlParams = new URLSearchParams(window.location.search);
    const userEmailFromURL = urlParams.get("email");
    const providerFromURL = urlParams.get("provider");

    if (userEmailFromURL && providerFromURL) {
      localStorage.setItem("userEmail", userEmailFromURL);
      localStorage.setItem("provider", providerFromURL);
      setSelectedProvider(providerFromURL);
      
      // Set initial sync required flag for this provider
      setInitialSyncRequired(prev => ({
        ...prev,
        [providerFromURL]: true
      }));
    }
  }, []);

  // Fetch auth URLs for all providers
  useEffect(() => {
    if (providers.length > 0) {
      providers.forEach(provider => {
        axios
          .get(`/api/auth/${provider}`)
          .then((response) => {
            setAuthUrls(prev => ({
              ...prev,
              [provider]: response.data.url
            }));
          })
          .catch((error) => console.error(`Error fetching ${provider} OAuth URL:`, error));
      });
    }
  }, [providers]);

  // Fetch auth status for all connected providers
  useEffect(() => {
    const fetchAuthStatuses = async () => {
      const storedEmail = localStorage.getItem("userEmail");
      if (!storedEmail) return;

      for (const provider of providers) {
        try {
          const response = await axios.get(`/api/auth/${provider}/status?email=${storedEmail}`);
          
          setAuthStatus(prev => ({
            ...prev,
            [provider]: response.data
          }));

          // Check if this provider needs initial sync
          if (response.data.authenticated) {
            const syncStatusResponse = await axios.get(`/api/email/${provider}/sync-status`);
            setSyncStatus(prev => ({
              ...prev,
              [provider]: syncStatusResponse.data
            }));

            // If not synced yet, mark as requiring initial sync
            if (!syncStatusResponse.data.synced) {
              setInitialSyncRequired(prev => ({
                ...prev,
                [provider]: true
              }));
            }
          }
        } catch (error) {
          console.error(`Error fetching ${provider} authentication status:`, error);
        }
      }
    };

    if (providers.length > 0) {
      fetchAuthStatuses();
    }
  }, [providers]);

  const handleDisconnect = (provider) => {
    const userEmail = authStatus[provider]?.email || localStorage.getItem("userEmail");
    
    if (!userEmail) {
      console.error("No email found for disconnecting.");
      return;
    }
    
    axios
      .post(`/api/auth/${provider}/disconnect`, { email: userEmail })
      .then(() => {
        // Update only the specific provider's auth status
        setAuthStatus(prev => ({
          ...prev,
          [provider]: { authenticated: false }
        }));
        
        // Clear sync status for this provider
        setSyncStatus(prev => ({
          ...prev,
          [provider]: null
        }));
        
        // If this was the last connected provider, clear email from localStorage
        const stillConnected = Object.values(authStatus).some(
          (status, key) => key !== provider && status?.authenticated
        );
        
        if (!stillConnected) {
          localStorage.removeItem("userEmail");
        }
      })
      .catch((error) => console.error(`Error disconnecting ${provider}:`, error));
  };

  const handleSync = (provider) => {
    const userEmail = authStatus[provider]?.email || localStorage.getItem("userEmail");

    if (!userEmail) {
      console.error("No email found for syncing.");
      return;
    }

    // Validate sync days (1-30)
    const days = Math.min(Math.max(syncDays, 1), 30);

    axios
      .post(`/api/email/${provider}/sync`, { email: userEmail, days })
      .then((response) => {
        console.log(`${provider} sync initiated:`, response.data);
        
        // Mark this provider as no longer requiring initial sync
        setInitialSyncRequired(prev => ({
          ...prev,
          [provider]: false
        }));
        
        // Update sync status
        setSyncStatus(prev => ({
          ...prev,
          [provider]: { syncing: true }
        }));
        
        // Check sync status after a delay
        setTimeout(() => checkSyncStatus(provider), 2000);
      })
      .catch((error) => {
        console.error(`Error syncing ${provider} emails:`, error.response ? error.response.data : error);
      });
  };
  
  const checkSyncStatus = (provider) => {
    axios
      .get(`/api/email/${provider}/sync-status`)
      .then((response) => {
        setSyncStatus(prev => ({
          ...prev,
          [provider]: response.data
        }));
        
        // If still syncing, check again after a delay
        if (!response.data.synced) {
          setTimeout(() => checkSyncStatus(provider), 2000);
        }
      })
      .catch((error) => {
        console.error(`Error checking ${provider} sync status:`, error);
      });
  };

  return (
    <div className="settings-container">
      <nav className="nav-bar">
        <button onClick={() => navigate("/")}>Inbox</button>
      </nav>
      <h2>Email Integration Settings</h2>
      
      {/* Provider selection */}
      <div className="provider-selection">
        <h3>Email Providers</h3>
        <div className="provider-tabs">
          {providers.map(provider => (
            <button 
              key={provider}
              className={`provider-tab ${selectedProvider === provider ? 'active' : ''}`}
              onClick={() => setSelectedProvider(provider)}
            >
              {provider.charAt(0).toUpperCase() + provider.slice(1)}
            </button>
          ))}
        </div>
      </div>
      
      {/* Selected provider settings */}
      <div className="provider-settings">
        <h3>{selectedProvider.charAt(0).toUpperCase() + selectedProvider.slice(1)} Settings</h3>
        
        {authStatus[selectedProvider]?.authenticated ? (
          <div className="connected-provider">
            <div className="connection-info">
              <p>
                Connected with <strong>{authStatus[selectedProvider].email}</strong>
              </p>
              <button 
                className="disconnect-btn" 
                onClick={() => handleDisconnect(selectedProvider)}
              >
                Disconnect
              </button>
            </div>
            
            <div className="sync-controls">
              <h4>Email Synchronization</h4>
              
              {initialSyncRequired[selectedProvider] ? (
                <div className="initial-sync-required">
                  <p><strong>Initial sync required!</strong> Please sync your emails to continue.</p>
                </div>
              ) : null}
              
              <div className="sync-options">
                <label>Sync Emails from Last: </label>
                <select 
                  value={syncDays} 
                  onChange={(e) => setSyncDays(parseInt(e.target.value))}
                >
                  <option value={1}>1 Day</option>
                  <option value={3}>3 Days</option>
                  <option value={7}>7 Days</option>
                  <option value={14}>14 Days</option>
                  <option value={30}>30 Days</option>
                </select>
                
                <button 
                  className="sync-btn" 
                  onClick={() => handleSync(selectedProvider)}
                  disabled={syncStatus[selectedProvider]?.syncing}
                >
                  {syncStatus[selectedProvider]?.syncing ? 'Syncing...' : 'Sync Emails'}
                </button>
              </div>
              
              {syncStatus[selectedProvider]?.synced && (
                <div className="sync-status success">
                  <p>✓ Emails successfully synchronized</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="connect-provider">
            <p>Connect your {selectedProvider} account to sync emails</p>
            <button 
              className="connect-btn"
              onClick={() => (window.location.href = authUrls[selectedProvider])}
              disabled={!authUrls[selectedProvider]}
            >
              Connect {selectedProvider.charAt(0).toUpperCase() + selectedProvider.slice(1)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;
