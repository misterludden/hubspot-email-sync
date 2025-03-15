const axios = require("axios");

const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY;
const HUBSPOT_URL = "https://api.hubapi.com/crm/v3/objects/emails";

async function logEmailToHubspot(emailData) {
    const headers = {
        Authorization: `Bearer ${HUBSPOT_API_KEY}`,
        "Content-Type": "application/json",
    };

    const payload = {
        associations: ["CONTACT_ID"],
        properties: {
            hs_email_direction: emailData.isInbound ? "INBOUND" : "OUTBOUND",
            hs_email_subject: emailData.subject,
            hs_email_text: emailData.snippet,
            hs_timestamp: emailData.timestamp,
        },
    };

    const response = await axios.post(HUBSPOT_URL, payload, { headers });
    return response.data;
}

module.exports = { logEmailToHubspot };
