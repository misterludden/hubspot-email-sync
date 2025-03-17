const Sentiment = require("sentiment");

/**
 * Classifies an email based on its content, providing sentiment analysis and topic classification
 * @param {string} emailText - The text content of the email to classify
 * @param {string} subject - The subject line of the email (optional)
 * @returns {Object} Classification results including sentiment and topic
 */
function classifyEmail(emailText, subject = '') {
    // Combine subject and body for better classification
    const fullText = subject + ' ' + emailText;
    
    // Sentiment Analysis
    const sentimentAnalyzer = new Sentiment();
    const result = sentimentAnalyzer.analyze(fullText);
    const sentimentScore = result.score;

    let sentiment = "Neutral";
    if (sentimentScore > 2) sentiment = "Positive";
    else if (sentimentScore < -2) sentiment = "Negative";

    // Topic Classification
    const topic = classifyTopic(fullText);
    
    // Priority Classification (High, Medium, Low)
    const priority = determinePriority(sentiment, topic, fullText);

    return { 
        sentiment, 
        sentimentScore,
        topic,
        priority,
        keywords: extractKeywords(fullText)
    };
}

/**
 * Classifies the topic of an email based on keyword matching
 * @param {string} text - The email text to classify
 * @returns {string} The classified topic
 */
function classifyTopic(text) {
    const lowerText = text.toLowerCase();
    
    // Define topic categories with associated keywords
    const topicKeywords = {
        'Sales': ['purchase', 'buy', 'price', 'discount', 'offer', 'deal', 'quote', 'order', 'subscription'],
        'Support': ['help', 'issue', 'problem', 'trouble', 'broken', 'fix', 'error', 'bug', 'ticket', 'support'],
        'Inquiry': ['question', 'information', 'interested', 'learn more', 'details', 'inquiry'],
        'Meeting': ['meeting', 'call', 'schedule', 'appointment', 'calendar', 'discuss', 'zoom', 'teams', 'meet'],
        'Feedback': ['feedback', 'review', 'suggestion', 'improve', 'opinion', 'survey', 'rating'],
        'Billing': ['invoice', 'payment', 'bill', 'charge', 'subscription', 'plan', 'credit card', 'receipt', 'refund'],
        'Partnership': ['partner', 'collaboration', 'together', 'joint', 'alliance', 'opportunity'],
        'Marketing': ['campaign', 'promotion', 'marketing', 'advertisement', 'launch', 'webinar', 'event']
    };
    
    // Count keyword matches for each topic
    const topicScores = {};
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
        topicScores[topic] = 0;
        for (const keyword of keywords) {
            if (lowerText.includes(keyword)) {
                topicScores[topic]++;
            }
        }
    }
    
    // Find the topic with the highest score
    let maxScore = 0;
    let classifiedTopic = 'General';
    
    for (const [topic, score] of Object.entries(topicScores)) {
        if (score > maxScore) {
            maxScore = score;
            classifiedTopic = topic;
        }
    }
    
    return classifiedTopic;
}

/**
 * Determines the priority of an email based on sentiment, topic, and content
 * @param {string} sentiment - The sentiment classification
 * @param {string} topic - The topic classification
 * @param {string} text - The email text
 * @returns {string} Priority level (High, Medium, Low)
 */
function determinePriority(sentiment, topic, text) {
    const lowerText = text.toLowerCase();
    
    // High priority indicators
    const highPriorityKeywords = ['urgent', 'asap', 'immediately', 'emergency', 'critical', 'important', 'deadline'];
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
    
    // Sentiment-based priority
    if (sentiment === 'Negative') {
        return 'Medium';
    }
    
    // Default priority
    return 'Low';
}

/**
 * Extracts important keywords from the email text
 * @param {string} text - The email text
 * @returns {string[]} Array of extracted keywords
 */
function extractKeywords(text) {
    const lowerText = text.toLowerCase();
    const words = lowerText.split(/\W+/);
    
    // Filter out common stop words
    const stopWords = ['the', 'and', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'about', 'like', 'from'];
    const filteredWords = words.filter(word => word.length > 3 && !stopWords.includes(word));
    
    // Count word frequencies
    const wordCounts = {};
    for (const word of filteredWords) {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
    }
    
    // Sort by frequency and take top keywords
    const sortedWords = Object.entries(wordCounts)
        .sort((a, b) => b[1] - a[1])
        .map(entry => entry[0]);
    
    return sortedWords.slice(0, 5); // Return top 5 keywords
}

module.exports = { classifyEmail };
