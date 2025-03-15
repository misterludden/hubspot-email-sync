const Sentiment = require("sentiment");

function classifyEmail(emailText) {
    const sentimentAnalyzer = new Sentiment();
    const result = sentimentAnalyzer.analyze(emailText);
    const sentimentScore = result.score;

    let category = "Neutral";
    if (sentimentScore > 2) category = "Positive";
    else if (sentimentScore < -2) category = "Negative";

    return { category, sentimentScore };
}

module.exports = { classifyEmail };
