const express = require("express");
const crypto = require("crypto");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "your-webhook-secret-here";

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.raw({ type: "application/json" }));

// Webhook signature verification
function verifyWebhookSignature(payload, signature, secret) {
  if (!signature || !secret) {
    return false;
  }

  try {
    // Handle different signature formats
    let providedSignature = signature;

    // Remove common prefixes
    if (signature.startsWith("sha256=")) {
      providedSignature = signature.replace("sha256=", "");
    } else if (signature.startsWith("sha1=")) {
      providedSignature = signature.replace("sha1=", "");
    }

    // Generate expected signature
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    // Ensure both signatures are the same length
    if (expectedSignature.length !== providedSignature.length) {
      console.log(
        `❌ Signature length mismatch: expected ${expectedSignature.length}, got ${providedSignature.length}`
      );
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "hex"),
      Buffer.from(providedSignature, "hex")
    );
  } catch (error) {
    console.error("❌ Signature verification error:", error.message);
    return false;
  }
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

// Main webhook endpoint
app.post("/webhook", (req, res) => {
  try {
    const signature =
      req.headers["x-signature"] ||
      req.headers["x-hub-signature-256"] ||
      req.headers["x-hub-signature"];
    const payload = req.body;

    console.log("📥 Webhook received:", {
      timestamp: new Date().toISOString(),
      signature: signature ? "present" : "missing",
      contentType: req.headers["content-type"],
      payloadSize: payload.length,
    });

    // Verify webhook signature if secret is configured
    if (WEBHOOK_SECRET && signature) {
      if (!verifyWebhookSignature(payload, signature, WEBHOOK_SECRET)) {
        console.log("❌ Invalid webhook signature");
        console.log("   Expected format: sha256=<hex_digest>");
        console.log("   Received signature:", signature);
        return res.status(401).json({ error: "Invalid signature" });
      }
      console.log("✅ Webhook signature verified");
    } else if (WEBHOOK_SECRET && !signature) {
      console.log("⚠️  No signature provided but WEBHOOK_SECRET is set");
    }

    // Parse the JSON payload
    const data = JSON.parse(payload.toString());

    console.log("📋 Webhook data:", JSON.stringify(data, null, 2));

    // Handle different types of webhook events
    handleWebhookEvent(data);

    // Respond with success
    res.status(200).json({
      received: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error processing webhook:", error);

    if (error instanceof SyntaxError) {
      return res.status(400).json({ error: "Invalid JSON payload" });
    }

    res.status(400).json({ error: "Bad request" });
  }
});

// Webhook event handler
function handleWebhookEvent(data) {
  const eventType = data.type || data.event || "unknown";

  console.log(`🔔 Processing event: ${eventType}`);

  switch (eventType) {
    case "user.created":
      handleUserCreated(data);
      break;
    case "user.updated":
      handleUserUpdated(data);
      break;
    case "message.received":
      handleMessageReceived(data);
      break;
    case "status.changed":
      handleStatusChanged(data);
      break;
    default:
      console.log("📋 Unhandled event type:", eventType);
      console.log("📋 Event data:", JSON.stringify(data, null, 2));
  }
}

// Event handlers
function handleUserCreated(data) {
  console.log("👤 New user created:", data.user?.id || data.id);
  // Add your custom logic here
  // e.g., send welcome email, update database, etc.
}

function handleUserUpdated(data) {
  console.log("👤 User updated:", data.user?.id || data.id);
  // Add your custom logic here
  // e.g., sync with CRM, update cache, etc.
}

function handleMessageReceived(data) {
  console.log("💬 Message received:", data.message?.id || data.id);
  // Add your custom logic here
  // e.g., process message, send notifications, etc.
}

function handleStatusChanged(data) {
  console.log("📊 Status changed:", data.status);
  // Add your custom logic here
  // e.g., update dashboards, trigger alerts, etc.
}

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Server error:", error);
  res.status(500).json({ error: "Internal server error" });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Webhook server running on port ${PORT}`);
  console.log(`📡 Webhook endpoint: http://localhost:${PORT}/webhook`);
  console.log(`🔍 Health check: http://localhost:${PORT}/health`);

  if (!process.env.WEBHOOK_SECRET) {
    console.log(
      "⚠️  Warning: WEBHOOK_SECRET not set. Consider setting it for production."
    );
  }
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("👋 Received SIGTERM, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("👋 Received SIGINT, shutting down gracefully");
  process.exit(0);
});
