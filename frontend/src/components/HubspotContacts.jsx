import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import './HubspotContacts.css';

const HubspotContacts = ({ userEmail }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [contactEmails, setContactEmails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [newContact, setNewContact] = useState({
    email: '',
    firstName: '',
    lastName: '',
    phone: '',
    company: ''
  });
  const [showNewContactForm, setShowNewContactForm] = useState(false);

  // Search for contacts in HubSpot
  const searchContacts = async () => {
    if (!searchQuery.trim()) return;
    
    setLoading(true);
    try {
      const response = await axios.get(`/api/hubspot/contacts/search?query=${encodeURIComponent(searchQuery)}`);
      if (response.data.success) {
        setContacts(response.data.contacts);
      } else {
        toast.error('Failed to search contacts');
      }
    } catch (error) {
      console.error('Error searching contacts:', error);
      toast.error(error.response?.data?.error || 'Failed to search contacts');
    } finally {
      setLoading(false);
    }
  };

  // Get emails associated with a contact
  const getContactEmails = async (contactId) => {
    setEmailsLoading(true);
    try {
      const response = await axios.get(`/api/hubspot/contacts/${contactId}/emails`);
      if (response.data.success) {
        setContactEmails(response.data.emails);
      } else {
        toast.error('Failed to get contact emails');
      }
    } catch (error) {
      console.error('Error getting contact emails:', error);
      toast.error(error.response?.data?.error || 'Failed to get contact emails');
    } finally {
      setEmailsLoading(false);
    }
  };

  // Select a contact and fetch their emails
  const selectContact = (contact) => {
    setSelectedContact(contact);
    getContactEmails(contact.id);
  };

  // Create a new contact in HubSpot
  const createContact = async (e) => {
    e.preventDefault();
    
    if (!newContact.email) {
      toast.error('Email is required');
      return;
    }
    
    setLoading(true);
    try {
      const response = await axios.post('/api/hubspot/contacts', newContact);
      if (response.data.success) {
        toast.success('Contact created successfully');
        setNewContact({
          email: '',
          firstName: '',
          lastName: '',
          phone: '',
          company: ''
        });
        setShowNewContactForm(false);
        
        // Add the new contact to the contacts list
        setContacts([response.data.contact, ...contacts]);
      } else {
        toast.error('Failed to create contact');
      }
    } catch (error) {
      console.error('Error creating contact:', error);
      toast.error(error.response?.data?.error || 'Failed to create contact');
    } finally {
      setLoading(false);
    }
  };

  // Handle input changes for the new contact form
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewContact({
      ...newContact,
      [name]: value
    });
  };

  // Format date from timestamp
  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(parseInt(timestamp)).toLocaleString();
  };

  return (
    <div className="hubspot-contacts-container">
      <h2>HubSpot Contacts</h2>
      
      <div className="search-container">
        <input
          type="text"
          placeholder="Search contacts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && searchContacts()}
        />
        <button onClick={searchContacts} disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
        <button 
          className="new-contact-btn"
          onClick={() => setShowNewContactForm(!showNewContactForm)}
        >
          {showNewContactForm ? 'Cancel' : 'New Contact'}
        </button>
      </div>
      
      {showNewContactForm && (
        <div className="new-contact-form">
          <h3>Create New Contact</h3>
          <form onSubmit={createContact}>
            <div className="form-group">
              <label>Email*</label>
              <input
                type="email"
                name="email"
                value={newContact.email}
                onChange={handleInputChange}
                required
              />
            </div>
            <div className="form-group">
              <label>First Name</label>
              <input
                type="text"
                name="firstName"
                value={newContact.firstName}
                onChange={handleInputChange}
              />
            </div>
            <div className="form-group">
              <label>Last Name</label>
              <input
                type="text"
                name="lastName"
                value={newContact.lastName}
                onChange={handleInputChange}
              />
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input
                type="text"
                name="phone"
                value={newContact.phone}
                onChange={handleInputChange}
              />
            </div>
            <div className="form-group">
              <label>Company</label>
              <input
                type="text"
                name="company"
                value={newContact.company}
                onChange={handleInputChange}
              />
            </div>
            <button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Contact'}
            </button>
          </form>
        </div>
      )}
      
      <div className="contacts-emails-container">
        <div className="contacts-list">
          <h3>Contacts ({contacts.length})</h3>
          {contacts.length === 0 ? (
            <p>No contacts found. Try searching for contacts.</p>
          ) : (
            <ul>
              {contacts.map((contact) => (
                <li 
                  key={contact.id} 
                  className={selectedContact?.id === contact.id ? 'selected' : ''}
                  onClick={() => selectContact(contact)}
                >
                  <div className="contact-name">
                    {contact.properties.firstname || ''} {contact.properties.lastname || ''}
                  </div>
                  <div className="contact-email">{contact.properties.email}</div>
                  {contact.properties.company && (
                    <div className="contact-company">{contact.properties.company}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        
        <div className="contact-emails">
          <h3>
            {selectedContact ? (
              <>
                Emails for {selectedContact.properties.firstname || ''} {selectedContact.properties.lastname || ''}
              </>
            ) : (
              'Select a contact to view emails'
            )}
          </h3>
          
          {emailsLoading ? (
            <p>Loading emails...</p>
          ) : selectedContact ? (
            contactEmails.length === 0 ? (
              <p>No emails found for this contact.</p>
            ) : (
              <ul className="emails-list">
                {contactEmails.map((email) => (
                  <li key={email.id} className="email-item">
                    <div className="email-header">
                      <span className="email-subject">{email.properties.hs_email_subject}</span>
                      <span className="email-date">{formatDate(email.properties.hs_timestamp)}</span>
                    </div>
                    <div className="email-participants">
                      <div>From: {email.properties.hs_email_from_email}</div>
                      <div>To: {email.properties.hs_email_to_email}</div>
                    </div>
                    <div className="email-body">
                      {email.properties.hs_email_text}
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <p>Select a contact to view their emails.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default HubspotContacts;
