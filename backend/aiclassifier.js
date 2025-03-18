const { containerBootstrap } = require('@nlpjs/core');
const { SentimentAnalyzer } = require('@nlpjs/sentiment');
const { LangEn } = require('@nlpjs/lang-en');
const { Nlp } = require('@nlpjs/nlp');

// Initialize NLP container
const container = containerBootstrap();
container.use(LangEn);

// Register the sentiment analyzer
container.register('sentiment-en', new SentimentAnalyzer({ language: 'en' }));

// Create NLP instance
const manager = new Nlp({ container });
manager.settings.autoSave = false;
manager.addLanguage('en');

// Set threshold for intent classification
manager.settings.threshold = 0.8;

// Add regex rules for entity recognition
manager.addNerRuleOptionTexts('en', 'email', 'email', ['email', 'e-mail', 'mail', 'email address']);
manager.addNerRuleOptionTexts('en', 'phone', 'phone', ['phone', 'telephone', 'mobile', 'cell', 'number']);
manager.addNerRuleOptionTexts('en', 'date', 'date', ['date', 'day', 'month', 'year', 'time', 'schedule']);
manager.addNerRuleOptionTexts('en', 'money', 'money', ['dollars', 'usd', '$', 'euros', '€', 'pounds', '£', 'price', 'cost', 'payment']);

// Add regex patterns for entity extraction
manager.addNerRegexRule('en', 'email', /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
manager.addNerRegexRule('en', 'phone', /\b(\+\d{1,2}\s)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/);
manager.addNerRegexRule('en', 'date', /\b(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])[\/\-](\d{2}|\d{4})\b/);
manager.addNerRegexRule('en', 'money', /\$\d+(\.\d{2})?|\d+\s?(dollars|USD|€|euros|£|pounds)\b/);

// Add intents and training data
const setupNLP = async () => {
  // Sales intent
  manager.addDocument('en', 'I want to purchase your product', 'sales');
  manager.addDocument('en', 'How much does it cost', 'sales');
  manager.addDocument('en', 'Can I get a discount', 'sales');
  manager.addDocument('en', 'I would like to buy', 'sales');
  manager.addDocument('en', 'Do you offer any deals', 'sales');
  manager.addDocument('en', 'What is the price of', 'sales');
  manager.addDocument('en', 'Can you send me a quote', 'sales');
  manager.addDocument('en', 'I am interested in purchasing', 'sales');
  manager.addDocument('en', 'I want to subscribe to your service', 'sales');
  
  // Support intent
  manager.addDocument('en', 'I need help with', 'support');
  manager.addDocument('en', 'I am having an issue with', 'support');
  manager.addDocument('en', 'Something is not working', 'support');
  manager.addDocument('en', 'I found a bug', 'support');
  manager.addDocument('en', 'How do I fix', 'support');
  manager.addDocument('en', 'Can you help me with', 'support');
  manager.addDocument('en', 'I am experiencing a problem', 'support');
  manager.addDocument('en', 'The system is down', 'support');
  manager.addDocument('en', 'I cannot access my account', 'support');
  
  // Inquiry intent
  manager.addDocument('en', 'I have a question about', 'inquiry');
  manager.addDocument('en', 'Could you tell me more about', 'inquiry');
  manager.addDocument('en', 'I am interested in learning more', 'inquiry');
  manager.addDocument('en', 'Can you provide information on', 'inquiry');
  manager.addDocument('en', 'What is', 'inquiry');
  manager.addDocument('en', 'How does it work', 'inquiry');
  manager.addDocument('en', 'I want to know more about', 'inquiry');
  manager.addDocument('en', 'Can you explain', 'inquiry');
  
  // Meeting intent
  manager.addDocument('en', 'Can we schedule a meeting', 'meeting');
  manager.addDocument('en', 'I would like to set up a call', 'meeting');
  manager.addDocument('en', 'Are you available for a discussion', 'meeting');
  manager.addDocument('en', 'Let us have a zoom call', 'meeting');
  manager.addDocument('en', 'Can we meet to discuss', 'meeting');
  manager.addDocument('en', 'I want to book an appointment', 'meeting');
  manager.addDocument('en', 'When are you free for a call', 'meeting');
  
  // Feedback intent
  manager.addDocument('en', 'I want to give you feedback', 'feedback');
  manager.addDocument('en', 'Here are my thoughts on', 'feedback');
  manager.addDocument('en', 'I really liked your product', 'feedback');
  manager.addDocument('en', 'I did not like the service', 'feedback');
  manager.addDocument('en', 'Your product could be improved by', 'feedback');
  manager.addDocument('en', 'I have some suggestions', 'feedback');
  manager.addDocument('en', 'Can I share my experience', 'feedback');
  
  // Billing intent
  manager.addDocument('en', 'I have a question about my invoice', 'billing');
  manager.addDocument('en', 'When will I be charged', 'billing');
  manager.addDocument('en', 'I need to update my payment method', 'billing');
  manager.addDocument('en', 'Can I get a refund', 'billing');
  manager.addDocument('en', 'I was overcharged', 'billing');
  manager.addDocument('en', 'I did not receive my receipt', 'billing');
  manager.addDocument('en', 'How do I cancel my subscription', 'billing');
  
  // Partnership intent
  manager.addDocument('en', 'I am interested in partnering with you', 'partnership');
  manager.addDocument('en', 'Can we collaborate on', 'partnership');
  manager.addDocument('en', 'I want to discuss a potential partnership', 'partnership');
  manager.addDocument('en', 'Let us work together on', 'partnership');
  manager.addDocument('en', 'Are you open to joint ventures', 'partnership');
  manager.addDocument('en', 'I represent a company that wants to partner with you', 'partnership');
  
  // Marketing intent
  manager.addDocument('en', 'I want to discuss marketing opportunities', 'marketing');
  manager.addDocument('en', 'Can we promote your product', 'marketing');
  manager.addDocument('en', 'I am planning a campaign', 'marketing');
  manager.addDocument('en', 'We are launching a new product', 'marketing');
  manager.addDocument('en', 'Would you be interested in sponsoring', 'marketing');
  manager.addDocument('en', 'I want to invite you to our webinar', 'marketing');
  
  // Train the model
  await manager.train();
  console.log('NLP model trained successfully');
};

// Initialize the NLP model
setupNLP().catch(err => console.error('Error training NLP model:', err));

/**
 * Classifies an email based on its content, providing sentiment analysis and topic classification
 * @param {string} emailText - The text content of the email to classify
 * @param {string} subject - The subject line of the email (optional)
 * @returns {Object} Classification results including sentiment, topic, priority, and more
 */
async function classifyEmail(emailText, subject = '') {
    // Combine subject and body for better classification
    const fullText = subject + ' ' + emailText;
    
    // Sentiment Analysis using NLP.js
    const sentiment = container.get('sentiment-en');
    const sentimentResult = await sentiment.process({ locale: 'en', text: fullText });
    
    // Map the sentiment score to a category with more granular classification
    let sentimentCategory = "Neutral";
    let sentimentIntensity = "Medium";
    
    if (sentimentResult.score > 0.6) {
        sentimentCategory = "Positive";
        sentimentIntensity = "High";
    } else if (sentimentResult.score > 0.3) {
        sentimentCategory = "Positive";
        sentimentIntensity = "Medium";
    } else if (sentimentResult.score > 0.1) {
        sentimentCategory = "Positive";
        sentimentIntensity = "Low";
    } else if (sentimentResult.score < -0.6) {
        sentimentCategory = "Negative";
        sentimentIntensity = "High";
    } else if (sentimentResult.score < -0.3) {
        sentimentCategory = "Negative";
        sentimentIntensity = "Medium";
    } else if (sentimentResult.score < -0.1) {
        sentimentCategory = "Negative";
        sentimentIntensity = "Low";
    }
    
    // Topic/Intent Classification using NLP.js
    const response = await manager.process({ locale: 'en', text: fullText });
    const intent = response.intent;
    const intentConfidence = response.score;
    
    // Map the intent to a topic
    const topic = intent.charAt(0).toUpperCase() + intent.slice(1);
    
    // Enhanced entity extraction
    const entities = extractEntities(fullText, response.entities || []);
    
    // Priority Classification (High, Medium, Low)
    const priority = determinePriority(sentimentCategory, sentimentIntensity, topic, fullText);
    
    // Extract keywords
    const keywords = extractKeywords(fullText);
    
    // Detect urgency
    const urgency = detectUrgency(fullText);
    
    // Detect action items
    const actionItems = detectActionItems(fullText);
    
    // Detect follow-up required
    const followUpRequired = detectFollowUp(fullText);
    
    return { 
        sentiment: sentimentCategory, 
        sentimentScore: sentimentResult.score,
        sentimentIntensity,
        topic,
        intentConfidence,
        priority,
        keywords,
        entities,
        urgency,
        actionItems,
        followUpRequired
    };
}

/**
 * Extracts and enhances entity recognition from text
 * @param {string} text - The email text
 * @param {Array} nlpEntities - Entities detected by NLP.js
 * @returns {Array} Enhanced entities with type and value
 */
function extractEntities(text, nlpEntities) {
    const entities = [...nlpEntities];
    
    // Extract email addresses
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = text.match(emailRegex) || [];
    emails.forEach(email => {
        entities.push({
            entity: 'email',
            value: email
        });
    });
    
    // Extract phone numbers
    const phoneRegex = /(?:\+\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}/g;
    const phones = text.match(phoneRegex) || [];
    phones.forEach(phone => {
        entities.push({
            entity: 'phone',
            value: phone
        });
    });
    
    // Extract dates
    const dateRegex = /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,?\s*\d{4})?\b|\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/gi;
    const dates = text.match(dateRegex) || [];
    dates.forEach(date => {
        entities.push({
            entity: 'date',
            value: date
        });
    });
    
    // Extract monetary values
    const moneyRegex = /\$\d+(?:\.\d{2})?|\d+(?:\.\d{2})? (?:dollars|USD|EUR|GBP)/gi;
    const moneyValues = text.match(moneyRegex) || [];
    moneyValues.forEach(money => {
        entities.push({
            entity: 'money',
            value: money
        });
    });
    
    // Remove duplicates
    const uniqueEntities = [];
    const seen = new Set();
    
    entities.forEach(entity => {
        const key = `${entity.entity}:${entity.value}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueEntities.push(entity);
        }
    });
    
    return uniqueEntities;
}

// This function is no longer needed as NLP.js handles topic classification
// Keeping this as a comment for reference
/*
function classifyTopic(text) {
    // This functionality is now handled by NLP.js
}
*/

/**
 * Determines the priority of an email based on sentiment, sentiment intensity, topic, and content
 * @param {string} sentiment - The sentiment classification
 * @param {string} sentimentIntensity - The intensity of the sentiment (High, Medium, Low)
 * @param {string} topic - The topic classification
 * @param {string} text - The email text
 * @returns {string} Priority level (High, Medium, Low)
 */
function determinePriority(sentiment, sentimentIntensity, topic, text) {
    const lowerText = text.toLowerCase();
    
    // High priority indicators
    const highPriorityKeywords = ['urgent', 'asap', 'immediately', 'emergency', 'critical', 'important', 'deadline', 'priority', 'escalate', 'escalation'];
    for (const keyword of highPriorityKeywords) {
        if (lowerText.includes(keyword)) {
            return 'High';
        }
    }
    
    // Topic-based priority
    const highPriorityTopics = ['Support', 'Billing'];
    if (highPriorityTopics.includes(topic)) {
        return 'High';
    }
    
    // Sentiment-based priority with intensity
    if (sentiment === 'Negative' && (sentimentIntensity === 'High' || sentimentIntensity === 'Medium')) {
        return 'High';
    }
    
    // Medium priority indicators
    const mediumPriorityKeywords = ['soon', 'follow up', 'update', 'question', 'need', 'request', 'waiting', 'response', 'pending', 'attention'];
    for (const keyword of mediumPriorityKeywords) {
        if (lowerText.includes(keyword)) {
            return 'Medium';
        }
    }
    
    // Medium priority topics
    const mediumPriorityTopics = ['Sales', 'Inquiry', 'Meeting', 'Partnership'];
    if (mediumPriorityTopics.includes(topic)) {
        return 'Medium';
    }
    
    // Sentiment-based medium priority
    if (sentiment === 'Negative' && sentimentIntensity === 'Low') {
        return 'Medium';
    }
    
    // Default to Low priority
    return 'Low';
}

/**
 * Detects the urgency level of an email
 * @param {string} text - The email text
 * @returns {string} Urgency level (High, Medium, Low)
 */
function detectUrgency(text) {
    const lowerText = text.toLowerCase();
    
    // High urgency indicators
    const highUrgencyKeywords = ['urgent', 'asap', 'immediately', 'emergency', 'critical', 'now', 'right away', 'as soon as possible', 'time sensitive', 'deadline', 'today', 'by tomorrow'];
    for (const keyword of highUrgencyKeywords) {
        if (lowerText.includes(keyword)) {
            return 'High';
        }
    }
    
    // Medium urgency indicators
    const mediumUrgencyKeywords = ['soon', 'this week', 'next few days', 'timely', 'promptly', 'waiting for', 'need by', 'follow up', 'pending'];
    for (const keyword of mediumUrgencyKeywords) {
        if (lowerText.includes(keyword)) {
            return 'Medium';
        }
    }
    
    // Check for date mentions in the near future
    const nextWeekRegex = /next (monday|tuesday|wednesday|thursday|friday|saturday|sunday|week)/i;
    if (nextWeekRegex.test(text)) {
        return 'Medium';
    }
    
    // Default to Low urgency
    return 'Low';
}

/**
 * Detects action items in an email
 * @param {string} text - The email text
 * @returns {Array} Array of detected action items
 */
function detectActionItems(text) {
    const sentences = text.split(/[.!?]\s+/);
    const actionItems = [];
    
    // Action item indicators
    const actionPhrases = [
        'please', 'kindly', 'could you', 'can you', 'would you', 'need you to',
        'should', 'must', 'have to', 'required', 'action required', 'action needed',
        'let me know', 'get back to me', 'respond', 'reply', 'confirm', 'review',
        'send me', 'provide', 'update', 'schedule', 'arrange', 'organize', 'book'
    ];
    
    sentences.forEach(sentence => {
        const lowerSentence = sentence.toLowerCase();
        for (const phrase of actionPhrases) {
            if (lowerSentence.includes(phrase)) {
                // Clean up the sentence
                const cleanSentence = sentence.trim();
                if (cleanSentence.length > 10) { // Avoid very short fragments
                    actionItems.push(cleanSentence);
                    break; // Only add the sentence once
                }
            }
        }
    });
    
    return [...new Set(actionItems)]; // Remove duplicates
}

/**
 * Detects if a follow-up is required based on email content
 * @param {string} text - The email text
 * @returns {boolean} Whether follow-up is required
 */
function detectFollowUp(text) {
    const lowerText = text.toLowerCase();
    
    // Follow-up indicators
    const followUpPhrases = [
        'follow up', 'get back to me', 'let me know', 'waiting for your response',
        'looking forward to hearing', 'please respond', 'please reply', 'awaiting your reply',
        'need your input', 'your thoughts', 'what do you think', 'when can you',
        'by when', 'deadline', 'due date', 'schedule a call', 'set up a meeting'
    ];
    
    for (const phrase of followUpPhrases) {
        if (lowerText.includes(phrase)) {
            return true;
        }
    }
    
    // Check for questions
    const questionMarks = (text.match(/\?/g) || []).length;
    if (questionMarks > 0) {
        return true;
    }
    
    return false;
}

/**
 * Extracts important keywords from the email text
 * @param {string} text - The email text
 * @returns {string[]} Array of extracted keywords
 */
function extractKeywords(text) {
    const lowerText = text.toLowerCase();
    const words = lowerText.split(/\W+/);
    
    // Expanded list of stop words for better keyword extraction
    const stopWords = [
        'the', 'and', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'about', 'like', 'from',
        'as', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'but', 'or', 'if', 'because', 'as', 'until', 'while',
        'this', 'that', 'these', 'those', 'then', 'than', 'when', 'where', 'why', 'how', 'all', 'any',
        'both', 'each', 'few', 'more', 'most', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
        'so', 'too', 'very', 'can', 'will', 'just', 'should', 'now', 'would', 'could', 'may', 'might',
        'must', 'need', 'shall', 'want', 'time', 'know', 'make', 'think', 'see', 'one', 'two', 'three',
        'first', 'last', 'email', 'message', 'send', 'sent', 'get', 'got', 'thanks', 'thank', 'please', 'hello', 'hi'
    ];
    
    const filteredWords = words.filter(word => word.length > 3 && !stopWords.includes(word));
    
    // Count word frequencies and track positions for distribution analysis
    const wordCounts = {};
    const wordPositions = {};
    
    filteredWords.forEach((word, index) => {
        // Track frequency
        wordCounts[word] = (wordCounts[word] || 0) + 1;
        
        // Track positions
        if (!wordPositions[word]) {
            wordPositions[word] = [];
        }
        wordPositions[word].push(index);
    });
    
    // Calculate a score based on frequency and distribution in text
    const wordScores = {};
    Object.keys(wordCounts).forEach(word => {
        const frequency = wordCounts[word];
        const positions = wordPositions[word];
        
        // Calculate distribution score (higher if word appears throughout the text)
        let distributionScore = 0;
        if (positions.length > 1) {
            const range = positions[positions.length - 1] - positions[0];
            const textCoverage = range / filteredWords.length;
            distributionScore = textCoverage * 2; // Weight for distribution
        }
        
        // Calculate final score
        wordScores[word] = frequency * (1 + distributionScore);
    });
    
    // Sort by score
    const sortedWords = Object.entries(wordScores)
        .sort((a, b) => b[1] - a[1])
        .map(entry => entry[0]);
    
    return sortedWords.slice(0, 7); // Return top 7 keywords
}

module.exports = { classifyEmail };
