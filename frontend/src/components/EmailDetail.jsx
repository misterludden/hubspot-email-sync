import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { FileTypeChecker } from "file-type-checker";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";

const EmailDetail = ({ selectedEmail, onReply, onArchive }) => {
  // Function to get classification badge color and icon
  const getClassificationInfo = (sentiment) => {
    if (!sentiment) return { color: '#888', icon: 'fa-meh' };
    switch (sentiment) {
      case 'Positive': return { color: '#28a745', icon: 'fa-smile' };
      case 'Negative': return { color: '#dc3545', icon: 'fa-frown' };
      case 'Neutral': default: return { color: '#6c757d', icon: 'fa-meh' };
    }
  };

  // Function to get priority badge color and icon
  const getPriorityInfo = (priority) => {
    if (!priority) return { color: '#888', icon: 'fa-flag' };
    switch (priority) {
      case 'High': return { color: '#dc3545', icon: 'fa-exclamation-circle' };
      case 'Medium': return { color: '#ffc107', icon: 'fa-exclamation' };
      case 'Low': default: return { color: '#28a745', icon: 'fa-check-circle' };
    }
  };
  
  // Function to get topic badge color and icon
  const getTopicInfo = (topic) => {
    if (!topic) return { color: '#888', icon: 'fa-tag' };
    switch (topic) {
      case 'Support': return { color: '#007bff', icon: 'fa-life-ring' };
      case 'Sales': return { color: '#17a2b8', icon: 'fa-dollar-sign' };
      case 'Billing': return { color: '#6f42c1', icon: 'fa-file-invoice-dollar' };
      case 'Inquiry': return { color: '#20c997', icon: 'fa-question-circle' };
      case 'Meeting': return { color: '#fd7e14', icon: 'fa-calendar-alt' };
      case 'Feedback': return { color: '#e83e8c', icon: 'fa-comment-dots' };
      case 'Partnership': return { color: '#6610f2', icon: 'fa-handshake' };
      case 'Marketing': return { color: '#17a2b8', icon: 'fa-bullhorn' };
      default: return { color: '#6c757d', icon: 'fa-tag' };
    }
  };
  
  // Function to get urgency badge color and icon
  const getUrgencyInfo = (urgency) => {
    if (!urgency) return { color: '#888', icon: 'fa-clock' };
    switch (urgency) {
      case 'High': return { color: '#dc3545', icon: 'fa-bolt' };
      case 'Medium': return { color: '#ffc107', icon: 'fa-clock' };
      case 'Low': default: return { color: '#28a745', icon: 'fa-hourglass-half' };
    }
  };
  
  // Function to get follow-up badge color and icon
  const getFollowUpInfo = (followUpRequired) => {
    return followUpRequired 
      ? { color: '#007bff', icon: 'fa-reply-all', text: 'Follow-up Required' }
      : { color: '#6c757d', icon: 'fa-check-circle', text: 'No Follow-up Needed' };
  };
  if (!selectedEmail) {
    const userEmail = localStorage.getItem("userEmail");
    const provider = localStorage.getItem("emailProvider");
    
    if (!userEmail || !provider) {
      return (
        <div className="email-detail empty-state">
          <div className="empty-state-content">
            <h3>No Email Account Connected</h3>
            <p>Connect your Gmail or Outlook account in the Settings page to start syncing your emails.</p>
            <button onClick={() => window.location.href = '/settings'} className="primary-button">
              Connect Email Account
            </button>
          </div>
        </div>
      );
    }
    
    return (
      <div className="email-detail empty-state">
        <div className="empty-state-content">
          <h3>No Email Selected</h3>
          <p>Select an email from the list to view its details.</p>
          <p>If you don't see any emails, you may need to sync your account first.</p>
          <button onClick={() => window.location.href = '/settings'} className="primary-button">
            Go to Settings
          </button>
        </div>
      </div>
    );
  }

  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [archiving, setArchiving] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const fileInputRef = useRef(null);
  
  const modules = {
    toolbar: {
      container: '#toolbar',
      handlers: {
        'list': function(value) {
          const { quill } = this;
          if (value === 'bullet' || value === 'ordered') {
            quill.format('list', value);
          }
        }
      }
    }
  };
  
  const formats = [
    'header',
    'bold', 'italic', 'underline',
    'list',
    'link'
  ];
  
  // Store previous email ID to track changes
  const [previousEmailId, setPreviousEmailId] = useState(null);
  
  // Reset state when selected email changes
  useEffect(() => {
    setShowReplyBox(false);
    setReplyText("");
    setAttachments([]);
    setSending(false);
    
    // Only mark the previous email as read when a new email is selected
    if (previousEmailId && previousEmailId !== selectedEmail?.threadId && provider && userEmail) {
      markEmailAsRead(previousEmailId);
    }
    
    // Update the previous email ID
    setPreviousEmailId(selectedEmail?.threadId);
  }, [selectedEmail?.threadId]);
  
  // Function to mark an email as read
  const markEmailAsRead = async (threadId) => {
    try {
      const provider = localStorage.getItem("emailProvider");
      const userEmail = localStorage.getItem("userEmail");
      
      if (!provider || !userEmail || !threadId) {
        console.error("Missing required data for marking email as read");
        return;
      }
      
      console.log(`Marking thread ${threadId} as read`);
      await axios.post(`/api/emails/${provider}/mark-read/${threadId}`, {}, {
        params: { email: userEmail }
      });
    } catch (error) {
      console.error("Error marking email as read:", error);
      // Don't show a toast for this error as it's not critical to the user experience
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return "";

    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const isThisYear = date.getFullYear() === now.getFullYear();
    
    if (isToday) {
      return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } else if (isThisYear) {
      return date.toLocaleString([], { 
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    } else {
      return date.toLocaleString([], { 
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    }
  };

  const handleArchive = async () => {
    if (archiving) return;
    
    setArchiving(true);
    try {
      const userEmail = localStorage.getItem("userEmail");
      const provider = localStorage.getItem("emailProvider");
      
      if (!userEmail || !provider) {
        throw new Error("User email or provider not found");
      }
      
      await axios.post(`/api/emails/${provider}/archive/${selectedEmail.threadId}`, {}, {
        params: { email: userEmail }
      });
      
      toast.success("Email archived successfully");
      
      if (onArchive) {
        onArchive(selectedEmail.threadId);
      }
    } catch (error) {
      console.error("Error archiving email:", error);
      toast.error("Failed to archive email");
    } finally {
      setArchiving(false);
    }
  };

  const handleAttachmentUpload = (e) => {
    const files = Array.from(e.target.files);
    // Reduce max size to prevent payload too large errors
    const maxSize = 3 * 1024 * 1024; // 3MB max size per file
    const totalMaxSize = 10 * 1024 * 1024; // 10MB total size
    const maxAttachments = 5;
    
    if (attachments.length + files.length > maxAttachments) {
      toast.error(`Maximum ${maxAttachments} attachments allowed`);
      return;
    }
    
    // Calculate current total size
    const currentTotalSize = attachments.reduce((total, att) => total + att.size, 0);
    
    // Check if adding these files would exceed the total limit
    const newFilesSize = files.reduce((total, file) => total + file.size, 0);
    if (currentTotalSize + newFilesSize > totalMaxSize) {
      toast.error(`Total attachments would exceed the 10MB limit`);
      return;
    }
    
    const newAttachments = [];
    const oversizedFiles = [];
    
    files.forEach(file => {
      if (file.size > maxSize) {
        oversizedFiles.push(file.name);
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        // Remove the data:*/*;base64, prefix to get just the base64 content
        const content = event.target.result.split(',')[1];
        newAttachments.push({
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          content: content,
          size: file.size
        });
        
        if (newAttachments.length + oversizedFiles.length === files.length) {
          setAttachments([...attachments, ...newAttachments]);
          
          if (oversizedFiles.length > 0) {
            toast.warning(`Some files were too large and were not attached: ${oversizedFiles.join(', ')}`);
          }
        }
      };
      reader.readAsDataURL(file);
    });
  };
  
  const removeAttachment = (index) => {
    const newAttachments = [...attachments];
    newAttachments.splice(index, 1);
    setAttachments(newAttachments);
  };
  
  const validProviders = ['gmail', 'outlook'];
  const [userEmail, setUserEmail] = useState(() => {
    const email = localStorage.getItem("userEmail");
    return email?.toLowerCase() || null;
  });
  
  const [provider, setProvider] = useState(() => {
    const storedProvider = localStorage.getItem("emailProvider");
    return validProviders.includes(storedProvider?.toLowerCase()) ? storedProvider.toLowerCase() : null;
  });
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Load and validate email provider info on component mount
  useEffect(() => {
    const validateAuth = async () => {
      try {
        const storedEmail = localStorage.getItem("userEmail")?.toLowerCase();
        const storedProvider = localStorage.getItem("emailProvider")?.toLowerCase();
        
        if (!storedEmail || !storedProvider || !validProviders.includes(storedProvider)) {
          setIsAuthenticated(false);
          localStorage.removeItem("userEmail");
          localStorage.removeItem("emailProvider");
          toast.error("Please log in with a valid email provider (Gmail or Outlook)");
          return;
        }

        // Verify auth status with the backend using the correct endpoint
        const response = await axios.get(`/api/auth/${storedProvider}/status?email=${encodeURIComponent(storedEmail)}`);
        setIsAuthenticated(response.data.authenticated);
        
        if (response.data.authenticated) {
          setUserEmail(storedEmail);
          setProvider(storedProvider);
        } else {
          // Clear invalid credentials
          localStorage.removeItem("userEmail");
          localStorage.removeItem("emailProvider");
          setUserEmail(null);
          setProvider(null);
          toast.error("Your email session has expired. Please log in again.");
        }
      } catch (error) {
        console.error('Auth verification failed:', error);
        setIsAuthenticated(false);
        toast.error("Failed to verify email authentication. Please try logging in again.");
      }
    };

    validateAuth();
  }, []);

  // Refresh auth status periodically
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      if (userEmail && provider) {
        validateAuth();
      }
    }, 5 * 60 * 1000); // Check every 5 minutes

    return () => clearInterval(refreshInterval);
  }, [userEmail, provider]);

  const handleSendReply = async () => {
    if (!replyText || !replyText.trim()) return;
    
    const replyToastId = toast.loading("Sending reply...");
    setSending(true);
    
    try {
      // First check if we're still authenticated
      const authResponse = await axios.get(`/api/auth/${provider}/status?email=${encodeURIComponent(userEmail)}`);
      
      if (!authResponse.data.authenticated) {
        toast.error("Your email session has expired. Please log in again.");
        setSending(false);
        setIsAuthenticated(false);
        return;
      }

      if (!userEmail || !provider || !validProviders.includes(provider)) {
        toast.error("Please log in again with a valid email provider (Gmail or Outlook)");
        setSending(false);
        return;
      }

      // ReactQuill already provides HTML content
      const formattedBody = replyText;
      
      // Send reply through the provider-specific endpoint
      const response = await axios.post(`/api/emails/${provider}/reply`, {
        threadId: selectedEmail.threadId,
        replyText: formattedBody,
        attachments: attachments
      }, {
        params: { email: userEmail }
      });
      
      // Check if the response indicates success
      if (!response.data.success) {
        throw new Error(response.data.error || "Failed to send reply");
      }

      // After successful reply, fetch the updated thread to get the latest state
      const updatedThread = await axios.get(`/api/emails/${provider}/thread/${selectedEmail.threadId}`, {
        params: { email: userEmail }
      });
      
      toast.update(replyToastId, { 
        render: "Reply sent successfully", 
        type: "success", 
        isLoading: false, 
        autoClose: 3000 
      });
      
      setReplyText("");
      setAttachments([]);
      setShowReplyBox(false);
      setSending(false);
      if (onReply) onReply(updatedThread.data);
    } catch (error) {
      console.error("Error sending reply:", error);
      toast.update(replyToastId, { 
        render: error.message || "Failed to send reply", 
        type: "error", 
        isLoading: false, 
        autoClose: 3000 
      });
    }
  };

  return (
    <div className="email-detail">
      <div className="email-header">
        <h2>{selectedEmail.subject}</h2>
        <div className="email-metadata">
          <div className="metadata-row">
            <span className="metadata-label">From:</span>
            <span className="metadata-value">
              {selectedEmail.messages && selectedEmail.messages.length > 0 
                ? selectedEmail.messages[0].sender 
                : selectedEmail.participants?.[0] || 'Unknown'}
            </span>
          </div>
          <div className="metadata-row">
            <span className="metadata-label">To:</span>
            <span className="metadata-value">
              {selectedEmail.messages && selectedEmail.messages.length > 0 
                ? selectedEmail.messages[0].recipient 
                : selectedEmail.participants?.[1] || 'Unknown'}
            </span>
          </div>
          <div className="metadata-row">
            <span className="metadata-label">Date:</span>
            <span className="metadata-value">{formatDate(selectedEmail.latestTimestamp)}</span>
          </div>
        </div>
        
        {selectedEmail.classification && (
          <div className="thread-classification">
            <h3>Thread Classification</h3>
            <div className="classification-badges">
              {selectedEmail.classification.dominantSentiment && (
                <span 
                  className="classification-badge sentiment-badge"
                  style={{ backgroundColor: getClassificationInfo(selectedEmail.classification.dominantSentiment).color }}
                  title={`Average Sentiment Score: ${(selectedEmail.classification.averageSentimentScore || 0).toFixed(2)}`}
                >
                  <i className={`fas ${getClassificationInfo(selectedEmail.classification.dominantSentiment).icon}`}></i> {selectedEmail.classification.dominantSentiment}
                </span>
              )}
              {selectedEmail.classification.dominantTopic && (
                <span 
                  className="classification-badge topic-badge"
                  style={{ backgroundColor: getTopicInfo(selectedEmail.classification.dominantTopic).color }}
                  title={`Topic Confidence: ${(selectedEmail.classification.topicConfidence || 0).toFixed(2)}`}
                >
                  <i className={`fas ${getTopicInfo(selectedEmail.classification.dominantTopic).icon}`}></i> {selectedEmail.classification.dominantTopic}
                </span>
              )}
              {selectedEmail.classification.highestPriority && (
                <span 
                  className="classification-badge priority-badge"
                  style={{ backgroundColor: getPriorityInfo(selectedEmail.classification.highestPriority).color }}
                  title={`Priority Level: ${selectedEmail.classification.highestPriority}`}
                >
                  <i className={`fas ${getPriorityInfo(selectedEmail.classification.highestPriority).icon}`}></i> {selectedEmail.classification.highestPriority} Priority
                </span>
              )}
              {selectedEmail.classification.highestUrgency && (
                <span 
                  className="classification-badge urgency-badge"
                  style={{ backgroundColor: getUrgencyInfo(selectedEmail.classification.highestUrgency).color }}
                  title={`Urgency Level: ${selectedEmail.classification.highestUrgency}`}
                >
                  <i className={`fas ${getUrgencyInfo(selectedEmail.classification.highestUrgency).icon}`}></i> {selectedEmail.classification.highestUrgency} Urgency
                </span>
              )}
              {selectedEmail.classification.followUpRequired !== undefined && (
                <span 
                  className="classification-badge followup-badge"
                  style={{ backgroundColor: getFollowUpInfo(selectedEmail.classification.followUpRequired).color }}
                  title={selectedEmail.classification.followUpRequired ? 'This thread requires follow-up' : 'No follow-up needed'}
                >
                  <i className={`fas ${getFollowUpInfo(selectedEmail.classification.followUpRequired).icon}`}></i> {getFollowUpInfo(selectedEmail.classification.followUpRequired).text}
                </span>
              )}
            </div>
            
            {selectedEmail.classification.keyTopics && selectedEmail.classification.keyTopics.length > 0 && (
              <div className="key-topics">
                <span className="key-topics-label"><i className="fas fa-key"></i> Key Topics:</span>
                <div className="key-topics-container">
                  {selectedEmail.classification.keyTopics.map((topic, i) => (
                    <span key={i} className="key-topic">{topic}</span>
                  ))}
                </div>
              </div>
            )}
            
            {selectedEmail.classification.actionItems && selectedEmail.classification.actionItems.length > 0 && (
              <div className="action-items">
                <span className="action-items-label"><i className="fas fa-tasks"></i> Action Items:</span>
                <div className="action-items-container">
                  {selectedEmail.classification.actionItems.map((item, i) => (
                    <div key={i} className="action-item">
                      <i className="fas fa-check-circle"></i> {item}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {selectedEmail.classification.entities && selectedEmail.classification.entities.length > 0 && (
              <div className="entities">
                <span className="entities-label"><i className="fas fa-lightbulb"></i> Entities:</span>
                <div className="entities-container">
                  {selectedEmail.classification.entities.map((entity, i) => (
                    <span key={i} className="entity-item" title={`Type: ${entity.entity || 'Unknown'}`}>
                      <i className={`fas ${entity.entity === 'date' ? 'fa-calendar-alt' : 
                                    entity.entity === 'email' ? 'fa-envelope' : 
                                    entity.entity === 'phone' ? 'fa-phone' : 
                                    entity.entity === 'money' ? 'fa-money-bill-alt' : 'fa-tag'}`}></i> {entity.value}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="email-actions">
        <button 
          className={`action-button reply-button ${showReplyBox ? 'active' : ''}`}
          onClick={() => setShowReplyBox(!showReplyBox)}
          disabled={archiving}
        >
          {showReplyBox ? 'Cancel Reply' : 'Reply'}
        </button>
        <button 
          className="action-button archive-button"
          onClick={handleArchive}
          disabled={archiving}
        >
          {archiving ? 'Archiving...' : 'Archive'}
        </button>
      </div>

      {showReplyBox && (
        <div className="reply-box">
          <div className="rich-editor-container">
            <div data-provider={provider || 'gmail'} className="editor-wrapper">
              <div id="toolbar" role="toolbar" aria-label="Text formatting">
                <select className="ql-header" defaultValue="" aria-label="Text style">
                  <option value="1">Heading</option>
                  <option value="2">Subheading</option>
                  <option value="">Normal</option>
                </select>
                <button type="button" className="ql-bold" aria-label="Bold"></button>
                <button type="button" className="ql-italic" aria-label="Italic"></button>
                <button type="button" className="ql-underline" aria-label="Underline"></button>
                <button type="button" className="ql-list" value="ordered" aria-label="Numbered list"></button>
                <button type="button" className="ql-list" value="bullet" aria-label="Bullet list"></button>
                <button type="button" className="ql-link" aria-label="Insert link"></button>
                <button type="button" className="ql-clean" aria-label="Clear formatting"></button>
              </div>
              <ReactQuill
                theme="snow"
                value={replyText}
                onChange={setReplyText}
                modules={modules}
                formats={formats}
                placeholder="Type your reply here..."
              />
            </div>
          </div>
          
          <div className="attachment-section">
            <input 
              type="file" 
              multiple 
              onChange={handleAttachmentUpload} 
              ref={fileInputRef}
              style={{ display: 'none' }}
            />
            <button 
              className="attachment-button" 
              onClick={() => fileInputRef.current.click()}
              disabled={sending}
            >
              <i className="fa fa-paperclip"></i> Add Attachment
            </button>
            
            {attachments.length > 0 && (
              <div className="attachments-list">
                <h4>Attachments:</h4>
                <ul>
                  {attachments.map((file, index) => (
                    <li key={index} className="attachment-item">
                      <span className="attachment-name">{file.filename}</span>
                      <span className="attachment-size">({(file.size / 1024).toFixed(1)} KB)</span>
                      <button 
                        className="remove-attachment" 
                        onClick={() => removeAttachment(index)}
                        disabled={sending}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          
          <button 
            className="send-button" 
            onClick={handleSendReply} 
            disabled={sending || !replyText.trim()}
          >
            {sending ? 'Sending...' : 'Send Reply'}
          </button>
        </div>
      )}

      <div className="email-thread">
        {/* Sort messages by timestamp in descending order (newest first) */}
        {[...selectedEmail.messages]
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .map((message, index) => (
          <div 
            key={index} 
            className={`message ${message.isInbound ? 'inbound' : 'outbound'}`}
          >
            <div className="message-header">
              <span className="message-sender">
                {message.isInbound ? selectedEmail.sender : 'You'}
              </span>
              <span className="message-time">{formatDate(message.timestamp)}</span>
              {message.classification && (
                <div className="message-classification">
                  {message.classification.sentiment && (
                    <span 
                      className="classification-badge small sentiment-badge"
                      style={{ backgroundColor: getClassificationInfo(message.classification.sentiment).color }}
                      title={`Sentiment Score: ${message.classification.sentimentScore || 0}`}
                    >
                      <i className={`fas ${getClassificationInfo(message.classification.sentiment).icon}`}></i> {message.classification.sentiment}
                    </span>
                  )}
                  {message.classification.topic && (
                    <span 
                      className="classification-badge small topic-badge"
                      style={{ backgroundColor: getTopicInfo(message.classification.topic).color }}
                      title={`Topic: ${message.classification.topic}`}
                    >
                      <i className={`fas ${getTopicInfo(message.classification.topic).icon}`}></i> {message.classification.topic}
                    </span>
                  )}
                  {message.classification.priority && (
                    <span 
                      className="classification-badge small priority-badge"
                      style={{ backgroundColor: getPriorityInfo(message.classification.priority).color }}
                      title={`Priority: ${message.classification.priority}`}
                    >
                      <i className={`fas ${getPriorityInfo(message.classification.priority).icon}`}></i> {message.classification.priority}
                    </span>
                  )}
                </div>
              )}
            </div>
            {/* Render based on the bodyType from the server or detect HTML content */}
            {(message.bodyType === 'html' || 
              (message.body && message.body.includes('<') && message.body.includes('>'))) ? (
              <div 
                className="message-content html-content" 
                dangerouslySetInnerHTML={{ 
                  __html: message.body
                }}
              />
            ) : (
              <div className="message-content">
                {message.body && message.body.split('\n').map((line, i) => (
                  <React.Fragment key={i}>
                    {line}
                    <br />
                  </React.Fragment>
                ))}
              </div>
            )}
            
            {message.attachments && message.attachments.length > 0 && (
              <div className="message-attachments">
                <div className="attachments-header">Attachments:</div>
                <div className="attachments-list">
                  {message.attachments.map((attachment, attIndex) => (
                    <div key={attIndex} className="attachment-item">
                      <i className="fa fa-file"></i>
                      <span className="attachment-name">{attachment.filename}</span>
                      <span className="attachment-size">
                        ({(attachment.size / 1024).toFixed(1)} KB)
                      </span>
                      <a 
                        href={`/api/emails/${provider}/attachments/${message.messageId}/${encodeURIComponent(attachment.filename)}?email=${encodeURIComponent(userEmail)}`} 
                        className="download-link" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        download={attachment.filename}
                      >
                        Download
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default EmailDetail;
