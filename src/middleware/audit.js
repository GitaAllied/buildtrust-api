import pool from '../config/database.js';

// Background queue for audit logs to avoid blocking requests
const auditQueue = [];
let isProcessing = false;
const QUEUE_PROCESS_DELAY = 1000; // Wait 1 second before processing queue

async function processAuditQueue() {
  if (isProcessing || auditQueue.length === 0) return;
  isProcessing = true;

  while (auditQueue.length > 0) {
    const auditData = auditQueue.shift();
    try {
      // Use delay to avoid blocking and let connection pool release
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await pool.query(
        'INSERT INTO form_submissions (user_id, route, method, status, request_body, request_query, response_body, user_agent, ip_address, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          auditData.userId,
          auditData.route,
          auditData.method,
          auditData.statusCode,
          auditData.requestBody,
          auditData.requestQuery,
          auditData.responseBody,
          auditData.userAgent,
          auditData.ipAddress,
          auditData.email
        ]
      );
    } catch (err) {
      // Silently log audit failures - they're not critical
      if (err.code !== 'ER_USER_LIMIT_REACHED') {
        console.error('Failed to write audit log:', err.message);
      }
    }
  }

  isProcessing = false;
}

export const auditSubmission = (req, res, next) => {
  // Skip audit for certain routes that are called too frequently
  const skipAuditRoutes = ['/api/health', '/api/status'];
  if (skipAuditRoutes.some(route => req.originalUrl.includes(route))) {
    return next();
  }

  // Capture request data
  const userId = req.user ? (req.user.userId || req.user.id || null) : null;
  const route = req.originalUrl;
  const method = req.method;
  const userAgent = req.get('user-agent') || null;
  const ipAddress = req.ip || req.connection.remoteAddress || null;
  
  // Get email from user or from request body if available
  let email = null;
  if (req.user && req.user.email) {
    email = req.user.email;
  } else if (req.body && req.body.email) {
    email = req.body.email;
  }

  // Capture request body (for POST, PUT, PATCH requests)
  let requestBody = null;
  if (['POST', 'PUT', 'PATCH'].includes(method) && req.body) {
    try {
      // Exclude sensitive fields from logging
      const sensitiveFields = ['password', 'token', 'access_token', 'refresh_token', 'credit_card', 'ssn', 'cvv'];
      const safeBody = { ...req.body };
      sensitiveFields.forEach(field => {
        if (safeBody[field]) {
          safeBody[field] = '[REDACTED]';
        }
      });
      requestBody = JSON.stringify(safeBody);
    } catch (e) {
      requestBody = null;
    }
  }

  // Capture query parameters
  let requestQuery = null;
  if (Object.keys(req.query).length > 0) {
    try {
      requestQuery = JSON.stringify(req.query);
    } catch (e) {
      requestQuery = null;
    }
  }

  // Intercept response to capture response body
  let responseBody = null;
  const originalJson = res.json;
  res.json = function(data) {
    try {
      // Capture response as JSON string. If the serialized response is large,
      // store a valid JSON object indicating truncation so MySQL JSON column
      // accepts the value (avoid inserting invalid JSON like a truncated string).
      const dataStr = JSON.stringify(data);
      if (dataStr.length > 1000) {
        responseBody = JSON.stringify({ truncated: true, snippet: dataStr.substring(0, 1000) });
      } else {
        responseBody = dataStr;
      }
    } catch (e) {
      responseBody = null;
    }
    return originalJson.call(this, data);
  };

  res.on('finish', () => {
    // Queue audit log for all status codes to track all requests
    if (res.statusCode) {
      auditQueue.push({
        userId,
        route,
        method,
        statusCode: res.statusCode,
        requestBody,
        requestQuery,
        responseBody,
        userAgent,
        ipAddress,
        email
      });

      // Process queue after delay
      setTimeout(processAuditQueue, QUEUE_PROCESS_DELAY);
    }
  });

  next();
};
