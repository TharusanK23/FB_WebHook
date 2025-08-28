const express = require('express');
const request = require('request');

require("dotenv").config();
const { urlencoded, json } = require('body-parser');

const app = express();
const PORT = process.env.PORT || 8080;

// Configuration
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'your_verify_token_here';
const APP_SECRET = process.env.FB_APP_SECRET || 'your_app_secret_here';
const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN || 'your_page_access_token_here';
const PAGE_ID = process.env.FB_PAGE_ID || 'your_page_id_here';

// Parse application/x-www-form-urlencoded
app.use(urlencoded({ extended: true }));

// Parse application/json
app.use(json());

app.get('/', function (_req, res) {
  res.send('Hello World');
});

app.get('/track-cta', function (_req, res) {
    res.redirect('www.google.com');
});

// ✅ Step 1: Verify webhook (Facebook does this once)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Check if a token and mode were sent
  if (mode && token) {
    // Check the mode and token sent are correct
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      // Respond with 200 OK and challenge token from the request
      console.log('WEBHOOK VERIFIED SUCCESSFULLY!, hub.challenge :', challenge);
      res.status(200).send(challenge);
    } else {
      // Respond with '403 Forbidden' if verify tokens do not match
      res.sendStatus(403);
    }
  }
});

// ✅ Step 2: Handle webhook events (new lead submitted)
app.post("/webhook", async (req, res) => {
  const body = req.body;
  console.log("Webhook event received:", JSON.stringify(body));
  

  if (body.object === "page") {
    body.entry.forEach(entry => {
      const changes = entry.changes || [];
      changes.forEach(change => {
        if (change.field === "leadgen") {
          const leadgenId = change.value.leadgen_id;
          const formId = change.value.form_id;
          const pageId = change.value.page_id;

          console.log("New Lead ID:", leadgenId);
          // res.redirect(301, '/new-url');
          // fetch lead details
          fetchLeadData(leadgenId);
        }
      });
    });
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});


// ✅ Helper to fetch lead details
async function fetchLeadData(leadId) {
  try {
    const url = `https://graph.facebook.com/v19.0/${leadId}?access_token=${PAGE_ACCESS_TOKEN}`;
    const response = await axios.get(url);
    const lead = response.data;

    console.log("Lead Data:", lead);

    // Store in DB or cache so redirect page can use it
    // For demo, store in memory
    leadCache[leadId] = lead;
  } catch (err) {
    console.error("Error fetching lead:", err.response?.data || err.message);
  }
}

// Simple in-memory cache (use Redis/DB in production)
const leadCache = {};

app.get("/redirect", (req, res) => {
  // In real-world, match lead_id from query/session/cookie
  const lastLeadId = Object.keys(leadCache).pop();
  const lead = leadCache[lastLeadId];

  if (!lead) {
    return res.redirect("https://yourdomain.com/thankyou?error=no-lead");
  }

  // Extract fields (adjust according to your form fields)
  const email = lead.field_data.find(f => f.name === "email")?.values[0];
  const fullName = lead.field_data.find(f => f.name === "full_name")?.values[0];

  const targetUrl = `https://yourdomain.com/offer?email=${encodeURIComponent(
    email
  )}&name=${encodeURIComponent(fullName)}&lead_id=${lastLeadId}`;

  res.redirect(targetUrl);
});


// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Facebook Leads Webhook server running on port ${PORT}`);
  // console.log(`Webhook URL: http://localhost:${PORT}/webhook`);
  // console.log('Make sure to set the following environment variables:');
  // console.log('- WEBHOOK_VERIFY_TOKEN ' + VERIFY_TOKEN);
  // console.log('- FB_APP_SECRET ' + APP_SECRET);
  // console.log('- FB_PAGE_ACCESS_TOKEN (with leads_retrieval permission) ' + PAGE_ACCESS_TOKEN);
  // console.log('- FB_PAGE_ID ' + PAGE_ID);
  // console.log('');
  // console.log('Setup endpoints:');
  // console.log(`- POST http://localhost:${PORT}/setup-page-subscription (run once to subscribe page to app)`);
  // console.log(`- GET http://localhost:${PORT}/check-page-subscriptions (check current subscriptions)`);
  // console.log('');
  // console.log('Required Facebook App permissions:');
  // console.log('- leads_retrieval');
  // console.log('- pages_manage_metadata');
  // console.log('- pages_show_list');
  // console.log('- pages_read_engagement');
  // console.log('- ads_management');
});

module.exports = app;