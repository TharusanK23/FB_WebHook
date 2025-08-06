const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const path = require('path');
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 8080;

// Configuration
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'your_verify_token_here';
const APP_SECRET = process.env.FB_APP_SECRET || 'your_app_secret_here';
const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN || 'your_page_access_token_here';
const PAGE_ID = process.env.FB_PAGE_ID || 'your_page_id_here';

app.use(express.static(path.join(__dirname, 'public')));

// Middleware to parse JSON and verify Facebook signature
app.use('/webhook', express.raw({ type: 'application/json' }));

// Verify webhook signature
function verifySignature(payload, signature) {
  const expectedSignature = crypto
    .createHmac('sha256', APP_SECRET)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(`sha256=${expectedSignature}`, 'utf8'),
    Buffer.from(signature, 'utf8')
  );
}

// Webhook verification endpoint (GET request from Facebook)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Check if a token and mode were sent
  if (mode && token) {
    // Check the mode and token sent are correct
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      // Respond with 200 OK and challenge token from the request
      console.log('Webhook verified successfully! by Vercel');
      res.status(200).send(challenge);
    } else {
      // Respond with '403 Forbidden' if verify tokens do not match
      res.sendStatus(403);
    }
  }
});

// Webhook endpoint to receive lead data (POST request from Facebook)
app.post('/webhook', (req, res) => {
  const signature = req.get('X-Hub-Signature-256');

  // Verify the signature
  if (!signature || !verifySignature(req.body, signature)) {
    console.error('Invalid signature');
    return res.sendStatus(403);
  }

  const body = JSON.parse(req.body);

  // Check if this is a page subscription
  if (body.object === 'page') {
    // Iterate through each entry
    body.entry.forEach(entry => {
      // Get the webhook event
      entry.changes.forEach(change => {
        if (change.field === 'leadgen') {
          console.log('New lead received:', change.value);
          handleLead(change.value);
        }
      });
    });

    // Return a '200 OK' response to all events
    res.status(200).send('EVENT_RECEIVED');
  } else {
    // Return a '404 Not Found' if event is not from a page subscription
    res.sendStatus(404);
  }
});

// Function to subscribe Page to the app (call this once during setup)
async function subscribePageToApp() {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/${PAGE_ID}/subscribed_apps`,
      null,
      {
        params: {
          subscribed_fields: 'leadgen',
          access_token: PAGE_ACCESS_TOKEN
        }
      }
    );

    console.log('Page subscription successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error subscribing page to app:', error.response?.data || error.message);
    throw error;
  }
}

// Function to check which apps the page has installed
async function getPageSubscribedApps() {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${PAGE_ID}/subscribed_apps`,
      {
        params: {
          access_token: PAGE_ACCESS_TOKEN
        }
      }
    );

    console.log('Page subscribed apps:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error getting page subscribed apps:', error.response?.data || error.message);
    throw error;
  }
}
async function handleLead(leadData) {
  const leadgenId = leadData.leadgen_id;
  const pageId = leadData.page_id;
  const formId = leadData.form_id;
  const adgroupId = leadData.adgroup_id; // Note: Facebook docs show adgroup_id
  const adId = leadData.ad_id;
  const createdTime = leadData.created_time;

  console.log(`Processing lead: ${leadgenId} from page: ${pageId}`);
  console.log('Lead data from webhook:', leadData);

  try {
    // Fetch detailed lead information from Facebook Graph API
    const leadDetails = await fetchLeadDetails(leadgenId);

    // Process the lead (save to database, send email, etc.)
    await processLead(leadDetails);

  } catch (error) {
    console.error('Error handling lead:', error);
  }
}

// Fetch lead details from Facebook Graph API
async function fetchLeadDetails(leadgenId) {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/v18.0/${leadgenId}`,
      {
        params: {
          access_token: PAGE_ACCESS_TOKEN,
          fields: 'id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,is_organic'
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error fetching lead details:', error);
    throw error;
  }
}

// Process the lead data
async function processLead(leadDetails) {
  console.log('Lead Details:', JSON.stringify(leadDetails, null, 2));

  // Extract field data
  const fieldData = {};
  if (leadDetails.field_data) {
    leadDetails.field_data.forEach(field => {
      fieldData[field.name] = field.values[0];
    });
  }

  console.log('Extracted field data:', fieldData);

  // Example: Save to database
  const leadRecord = {
    facebook_lead_id: leadDetails.id,
    created_time: leadDetails.created_time,
    ad_id: leadDetails.ad_id,
    ad_name: leadDetails.ad_name,
    campaign_id: leadDetails.campaign_id,
    campaign_name: leadDetails.campaign_name,
    form_id: leadDetails.form_id,
    is_organic: leadDetails.is_organic,
    ...fieldData
  };

  // TODO: Save leadRecord to your database
  console.log('Lead record to save:', leadRecord);

  // Example: Send notification email
  await sendLeadNotification(leadRecord);

  // Example: Add to CRM
  await addToCRM(leadRecord);
}

// Send lead notification
async function sendLeadNotification(leadRecord) {
  console.log('Sending lead notification for:', leadRecord.facebook_lead_id);

  // TODO: Implement email notification
  // You can use services like SendGrid, Nodemailer, etc.

  const emailData = {
    to: 'sales@yourcompany.com',
    subject: 'New Facebook Lead Received',
    body: `
      New lead received from Facebook:

      Lead ID: ${leadRecord.facebook_lead_id}
      Name: ${leadRecord.full_name || 'N/A'}
      Email: ${leadRecord.email || 'N/A'}
      Phone: ${leadRecord.phone_number || 'N/A'}
      Campaign: ${leadRecord.campaign_name || 'N/A'}
      Created: ${leadRecord.created_time}
    `
  };

  console.log('Email notification prepared:', emailData);
}

// Add lead to CRM
async function addToCRM(leadRecord) {
  console.log('Adding lead to CRM:', leadRecord.facebook_lead_id);

  // TODO: Implement CRM integration
  // Examples: Salesforce, HubSpot, Pipedrive, etc.

  const crmData = {
    source: 'Facebook Lead Ad',
    firstName: leadRecord.first_name,
    lastName: leadRecord.last_name,
    email: leadRecord.email,
    phone: leadRecord.phone_number,
    company: leadRecord.company_name,
    notes: `Facebook Lead - Campaign: ${leadRecord.campaign_name}, Ad: ${leadRecord.ad_name}`
  };

  console.log('CRM data prepared:', crmData);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Facebook Leads Webhook'
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Facebook Leads Webhook server running on port ${PORT}`);
  console.log(`Webhook URL: http://localhost:${PORT}/webhook`);
  console.log('Make sure to set the following environment variables:');
  console.log('- WEBHOOK_VERIFY_TOKEN ' + VERIFY_TOKEN);
  console.log('- FB_APP_SECRET ' + APP_SECRET);
  console.log('- FB_PAGE_ACCESS_TOKEN (with leads_retrieval permission) ' + PAGE_ACCESS_TOKEN);
  console.log('- FB_PAGE_ID ' + PAGE_ID);
  console.log('');
  console.log('Setup endpoints:');
  console.log(`- POST http://localhost:${PORT}/setup-page-subscription (run once to subscribe page to app)`);
  console.log(`- GET http://localhost:${PORT}/check-page-subscriptions (check current subscriptions)`);
  console.log('');
  console.log('Required Facebook App permissions:');
  console.log('- leads_retrieval');
  console.log('- pages_manage_metadata');
  console.log('- pages_show_list');
  console.log('- pages_read_engagement');
  console.log('- ads_management');
});

module.exports = app;