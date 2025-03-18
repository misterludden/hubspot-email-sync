/**
 * Classification Service
 * Handles email classification using AI and updates the database with classification results
 */
const { classifyEmail } = require('../aiclassifier');
const Email = require('../models/Email');

class ClassificationService {
  /**
   * Classifies a single message and returns the classification results
   * @param {string} body - The message body text
   * @param {string} subject - The message subject
   * @returns {Object} Classification results
   */
  classifyMessage(body, subject = '') {
    // Strip HTML tags if present
    const plainText = body.replace(/<[^>]*>?/gm, '');
    
    // Perform classification
    return classifyEmail(plainText, subject);
  }

  /**
   * Classifies a new message and updates it in the database
   * @param {Object} email - The email thread document
   * @param {Object} message - The message to classify
   * @returns {Object} The updated message with classification
   */
  async classifyAndUpdateMessage(email, message) {
    // Skip classification for outbound messages if desired
    if (!message.isInbound && process.env.CLASSIFY_OUTBOUND !== 'true') {
      return message;
    }
    
    // Classify the message
    const classification = this.classifyMessage(message.body, message.subject);
    
    // Update the message with classification data
    message.classification = classification;
    
    // Update the thread-level classification based on this message
    await this.updateThreadClassification(email);
    
    return message;
  }

  /**
   * Updates the thread-level classification based on all messages
   * @param {Object} email - The email thread document
   */
  async updateThreadClassification(email) {
    if (!email || !email.messages || email.messages.length === 0) {
      return;
    }
    
    // Get all message classifications
    const classifications = email.messages
      .filter(msg => msg.classification)
      .map(msg => msg.classification);
    
    if (classifications.length === 0) {
      return;
    }
    
    // Calculate dominant sentiment
    const sentimentCounts = { 'Positive': 0, 'Neutral': 0, 'Negative': 0 };
    classifications.forEach(c => {
      if (c.sentiment) {
        sentimentCounts[c.sentiment]++;
      }
    });
    
    const dominantSentiment = Object.entries(sentimentCounts)
      .sort((a, b) => b[1] - a[1])[0][0];
    
    // Calculate dominant topic
    const topicCounts = {};
    classifications.forEach(c => {
      if (c.topic) {
        topicCounts[c.topic] = (topicCounts[c.topic] || 0) + 1;
      }
    });
    
    const dominantTopic = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])[0][0];
    
    // Find highest priority
    const priorityRanking = { 'High': 3, 'Medium': 2, 'Low': 1 };
    let highestPriority = 'Low';
    
    classifications.forEach(c => {
      if (c.priority && priorityRanking[c.priority] > priorityRanking[highestPriority]) {
        highestPriority = c.priority;
      }
    });
    
    // Collect key topics (keywords from all messages)
    const allKeywords = classifications
      .flatMap(c => c.keywords || [])
      .filter(Boolean);
    
    // Count keyword frequencies
    const keywordCounts = {};
    allKeywords.forEach(keyword => {
      keywordCounts[keyword] = (keywordCounts[keyword] || 0) + 1;
    });
    
    // Get top keywords
    const keyTopics = Object.entries(keywordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(entry => entry[0]);
    
    // Update thread classification
    email.classification = {
      dominantSentiment,
      dominantTopic,
      highestPriority,
      keyTopics
    };
    
    // Save the updated email thread
    await email.save();
  }

  /**
   * Classifies all messages in an email thread
   * @param {string} threadId - The ID of the thread to classify
   * @param {string} provider - The email provider
   * @param {string} userEmail - The user's email address
   * @returns {Promise<Object>} The updated email thread with classifications
   */
  async classifyThread(threadId, provider, userEmail) {
    try {
      // Find the email thread
      const email = await Email.findOne({
        threadId,
        provider,
        userEmail: userEmail.toLowerCase()
      });
      
      if (!email) {
        throw new Error(`Thread ${threadId} not found`);
      }
      
      // Classify each message
      for (const message of email.messages) {
        if (!message.classification) {
          const classification = this.classifyMessage(message.body, message.subject);
          message.classification = classification;
        }
      }
      
      // Update thread-level classification
      await this.updateThreadClassification(email);
      
      // Save the updated email
      await email.save();
      
      return email;
    } catch (error) {
      console.error('Error classifying thread:', error);
      throw error;
    }
  }

  /**
   * Classifies all threads for a user
   * @param {string} userEmail - The user's email address
   * @param {string} provider - The email provider
   * @returns {Promise<number>} The number of threads classified
   */
  async classifyAllThreads(userEmail, provider) {
    try {
      // Find all email threads for this user and provider
      const emails = await Email.find({
        userEmail: userEmail.toLowerCase(),
        provider
      });
      
      let classifiedCount = 0;
      
      // Process each thread
      for (const email of emails) {
        await this.classifyThread(email.threadId, provider, userEmail);
        classifiedCount++;
      }
      
      return classifiedCount;
    } catch (error) {
      console.error('Error classifying all threads:', error);
      throw error;
    }
  }
}

module.exports = new ClassificationService();
