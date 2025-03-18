import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import './HubspotEmailSync.css';

const HubspotEmailSync = ({ userEmail }) => {
  const [emails, setEmails] = useState([]);
  const [selectedEmails, setSelectedEmails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncingEmails, setSyncingEmails] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState('');

  // Fetch emails from your app
  const fetchEmails = async (reset = false) => {
    if (loading) return;
    
    const newPage = reset ? 1 : page;
    setLoading(true);
    
    try {
      const response = await axios.get(`/api/emails`, {
        params: {
          page: newPage,
          limit: 20,
          filter: filter
        }
      });
      
      const newEmails = response.data.emails || [];
      
      if (reset) {
        setEmails(newEmails);
        setPage(1);
      } else {
        setEmails([...emails, ...newEmails]);
        setPage(newPage + 1);
      }
      
      setHasMore(newEmails.length === 20);
    } catch (error) {
      console.error('Error fetching emails:', error);
      toast.error('Failed to fetch emails');
    } finally {
      setLoading(false);
    }
  };

  // Load emails on component mount
  useEffect(() => {
    fetchEmails(true);
  }, []);

  // Apply filter when it changes
  useEffect(() => {
    fetchEmails(true);
  }, [filter]);

  // Toggle email selection
  const toggleEmailSelection = (emailId) => {
    if (selectedEmails.includes(emailId)) {
      setSelectedEmails(selectedEmails.filter(id => id !== emailId));
    } else {
      setSelectedEmails([...selectedEmails, emailId]);
    }
  };

  // Select/deselect all emails
  const toggleSelectAll = () => {
    if (selectedEmails.length === emails.length) {
      setSelectedEmails([]);
    } else {
      setSelectedEmails(emails.map(email => email._id));
    }
  };

  // Sync selected emails to HubSpot
  const syncSelectedEmails = async () => {
    if (selectedEmails.length === 0) {
      toast.warn('Please select at least one email to sync');
      return;
    }
    
    setSyncingEmails(true);
    
    try {
      const response = await axios.post('/api/hubspot/sync/emails', {
        emailIds: selectedEmails
      });
      
      if (response.data.success) {
        const result = response.data.result;
        toast.success(`Successfully synced ${result.success} emails to HubSpot`);
        
        if (result.failed > 0) {
          toast.warn(`Failed to sync ${result.failed} emails`);
        }
        
        // Clear selection after sync
        setSelectedEmails([]);
      } else {
        toast.error('Failed to sync emails to HubSpot');
      }
    } catch (error) {
      console.error('Error syncing emails to HubSpot:', error);
      toast.error(error.response?.data?.error || 'Failed to sync emails to HubSpot');
    } finally {
      setSyncingEmails(false);
    }
  };

  // Sync a single email to HubSpot
  const syncSingleEmail = async (emailId) => {
    setSyncingEmails(true);
    
    try {
      const response = await axios.post(`/api/hubspot/sync/email/${emailId}`);
      
      if (response.data.success) {
        toast.success('Email successfully synced to HubSpot');
      } else {
        toast.error('Failed to sync email to HubSpot');
      }
    } catch (error) {
      console.error('Error syncing email to HubSpot:', error);
      toast.error(error.response?.data?.error || 'Failed to sync email to HubSpot');
    } finally {
      setSyncingEmails(false);
    }
  };

  // Format date
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="hubspot-email-sync-container">
      <h2>Sync Emails to HubSpot</h2>
      
      <div className="sync-controls">
        <div className="filter-container">
          <input
            type="text"
            placeholder="Filter emails..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        
        <div className="action-buttons">
          <button 
            className="select-all-btn"
            onClick={toggleSelectAll}
          >
            {selectedEmails.length === emails.length ? 'Deselect All' : 'Select All'}
          </button>
          
          <button
            className="sync-btn"
            onClick={syncSelectedEmails}
            disabled={syncingEmails || selectedEmails.length === 0}
          >
            {syncingEmails ? 'Syncing...' : `Sync Selected (${selectedEmails.length})`}
          </button>
        </div>
      </div>
      
      <div className="emails-table-container">
        <table className="emails-table">
          <thead>
            <tr>
              <th className="select-column"></th>
              <th>Subject</th>
              <th>From</th>
              <th>To</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {emails.length === 0 ? (
              <tr>
                <td colSpan="6" className="no-emails">
                  {loading ? 'Loading emails...' : 'No emails found'}
                </td>
              </tr>
            ) : (
              emails.map((email) => (
                <tr key={email._id} className={selectedEmails.includes(email._id) ? 'selected' : ''}>
                  <td className="select-column">
                    <input
                      type="checkbox"
                      checked={selectedEmails.includes(email._id)}
                      onChange={() => toggleEmailSelection(email._id)}
                    />
                  </td>
                  <td className="subject-column">{email.subject || '(No Subject)'}</td>
                  <td>{email.from}</td>
                  <td>{email.to}</td>
                  <td>{formatDate(email.date)}</td>
                  <td>
                    <button
                      className="sync-single-btn"
                      onClick={() => syncSingleEmail(email._id)}
                      disabled={syncingEmails}
                    >
                      Sync
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {hasMore && (
        <div className="load-more">
          <button 
            onClick={() => fetchEmails(false)} 
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
};

export default HubspotEmailSync;
