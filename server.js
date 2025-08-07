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
// app.use(express.static(path.join(__dirname, 'public')));

// Middleware to parse JSON and verify Facebook signature
// app.use('/webhook', express.raw({ type: 'application/json' }));

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
      console.log('Webhook verified successfully! by Vercel for Message :', challenge);
      res.status(200).send(challenge);
    } else {
      // Respond with '403 Forbidden' if verify tokens do not match
      res.sendStatus(403);
    }
  }
});

// Webhook endpoint to receive lead data (POST request from Facebook)
app.post('/webhook', (req, res) => {
  console.log('Received webhook event:', req.body);

  const body = req.body;

  // Check if this is a page subscription
  if (body.object === 'page') {
    // Iterate through each entry
    body.entry.forEach(function(entry) {

      // Gets the body of the webhook event
      let webhookEvent = entry.messaging[0];
      console.log(webhookEvent);

      // Get the sender PSID
      let senderPsid = webhookEvent.sender.id;
      console.log('Sender PSID: ' + senderPsid);

      // Check if the event is a message or postback and
      // pass the event to the appropriate handler function
      if (webhookEvent.message) {
        handleMessage(senderPsid, webhookEvent.message);
      } else if (webhookEvent.postback) {
        handlePostback(senderPsid, webhookEvent.postback);
      }
    });

    // Return a '200 OK' response to all events
    res.status(200).send('EVENT_RECEIVED');
  } else {
    // Return a '404 Not Found' if event is not from a page subscription
    res.sendStatus(404);
  }
});


// Handles messages events
function handleMessage(senderPsid, receivedMessage) {
  let response;

  // Checks if the message contains text
  if (receivedMessage.text) {
    // Create the payload for a basic text message, which
    // will be added to the body of your request to the Send API
    response = {
      'text': `You sent the message: '${receivedMessage.text}'. Now send me an attachment!`
    };
  } else if (receivedMessage.attachments) {

    // Get the URL of the message attachment
    let attachmentUrl = receivedMessage.attachments[0].payload.url;
    response = {
      'attachment': {
        'type': 'template',
        'payload': {
          'template_type': 'generic',
          'elements': [{
            'title': 'Is this the right picture?',
            'subtitle': 'Tap a button to answer.',
            'image_url': attachmentUrl,
            'buttons': [
              {
                'type': 'postback',
                'title': 'Yes!',
                'payload': 'yes',
              },
              {
                'type': 'postback',
                'title': 'No!',
                'payload': 'no',
              }
            ],
          }]
        }
      }
    };
  }

  // Send the response message
  callSendAPI(senderPsid, response);
}

// Handles messaging_postbacks events
function handlePostback(senderPsid, receivedPostback) {
  let response;

  // Get the payload for the postback
  let payload = receivedPostback.payload;

  // Set the response based on the postback payload
  if (payload === 'yes') {
    response = { 'text': 'Thanks!' };
  } else if (payload === 'no') {
    response = { 'text': 'Oops, try sending another image.' };
  }
  // Send the message to acknowledge the postback
  callSendAPI(senderPsid, response);
}

// Sends response messages via the Send API
function callSendAPI(senderPsid, response) {
  // Construct the message body
  let requestBody = {
    'recipient': {
      'id': senderPsid
    },
    'message': response
  };

  // Send the HTTP request to the Messenger Platform
  request({
    'uri': 'https://graph.facebook.com/v2.6/me/messages',
    'qs': { 'access_token': PAGE_ACCESS_TOKEN },
    'method': 'POST',
    'json': requestBody
  }, (err, _res, _body) => {
    if (!err) {
      console.log('Message sent!');
    } else {
      console.error('Unable to send message:' + err);
    }
  });
}

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