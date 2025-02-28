/**
 * server.js
 * Updated Credit-Based Document Scanning System
 *
 * Changes:
 *  1. Saves uploaded .txt files in an "uploads/" directory.
 *  2. When scanning, checks all files in "uploads/" for matches with the new file.
 *  3. In the admin dashboard, if a credit request is approved, the response shows how many credits were approved.
 *
 * To run:
 *    npm install express sqlite3 express-session body-parser
 *    node server.js
 */

const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// --- Set up middleware ---
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// Serve static files (frontend) from "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// Setup session management
app.use(
  session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: false,
  })
);

// --- Set up SQLite database ---
const dbFile = './database.db';
const db = new sqlite3.Database(dbFile);

db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'user',
    credits INTEGER DEFAULT 20,
    last_reset TEXT
  )`);

  // Documents table: each uploaded document is stored here.
  db.run(`CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    filename TEXT,
    content TEXT,
    upload_date TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // Credit Requests table (added approved_credits column)
  db.run(`CREATE TABLE IF NOT EXISTS credit_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    requested_credits INTEGER,
    status TEXT DEFAULT 'pending',
    approved_credits INTEGER DEFAULT 0,
    request_date TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // Scans table: logs each scan (for analytics)
  db.run(`CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    document_id INTEGER,
    scan_date TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(document_id) REFERENCES documents(id)
  )`);

  // Create default admin if not exists (username: admin, password: admin)
  db.get(`SELECT * FROM users WHERE username = ?`, ['admin'], (err, row) => {
    if (err) console.error(err);
    if (!row) {
      const hashedPass = crypto.createHash('sha256').update('admin').digest('hex');
      db.run(
        `INSERT INTO users (username, password, role, credits, last_reset) VALUES (?, ?, 'admin', 9999, date('now'))`,
        ['admin', hashedPass]
      );
      console.log('Default admin account created (username: admin, password: admin)');
    }
  });
});

// --- Helper Functions ---
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function isAuthenticated(req, res, next) {
  if (req.session.userId) {
    resetCreditsIfNeeded(req.session.userId, next);
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
}

function isAdmin(req, res, next) {
  if (req.session.userRole === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Access denied' });
  }
}

// Reset credits if last reset was before today (using server local date)
function resetCreditsIfNeeded(userId, next) {
  const today = new Date().toISOString().split('T')[0];
  db.get(`SELECT last_reset FROM users WHERE id = ?`, [userId], (err, row) => {
    if (err || !row) return next();
    if (row.last_reset !== today) {
      db.run(`UPDATE users SET credits = 20, last_reset = ? WHERE id = ?`, [today, userId], (err) => {
        if (err) console.error(err);
        next();
      });
    } else {
      next();
    }
  });
}

// Simple Jaccard similarity function between two strings
function jaccardSimilarity(text1, text2) {
  const set1 = new Set(text1.split(/\s+/));
  const set2 = new Set(text2.split(/\s+/));
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return union.size ? intersection.size / union.size : 0;
}

// --- API Endpoints ---

// Registration
app.post('/auth/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });
  const hashedPass = hashPassword(password);
  db.run(
    `INSERT INTO users (username, password, last_reset) VALUES (?, ?, date('now'))`,
    [username, hashedPass],
    function (err) {
      if (err) return res.status(500).json({ error: 'Username already exists' });
      res.json({ message: 'Registration Successful' });
    }
  );
});

// Login (session-based)
app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  const hashedPass = hashPassword(password);
  db.get(
    `SELECT * FROM users WHERE username = ? AND password = ?`,
    [username, hashedPass],
    (err, row) => {
      if (err || !row) return res.status(401).json({ error: 'Invalid credentials' });
      req.session.userId = row.id;
      req.session.userRole = row.role;
      res.json({ message: 'Login Successful', role: row.role });
    }
  );
});

// Get user profile & credits
app.get('/user/profile', isAuthenticated, (req, res) => {
  const userId = req.session.userId;
  db.get(`SELECT username, credits, role FROM users WHERE id = ?`, [userId], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'User not found' });
    db.all(`SELECT * FROM scans WHERE user_id = ? ORDER BY scan_date DESC`, [userId], (err, scans) => {
      res.json({ user: row, scans });
    });
  });
});

// Document Upload & Scanning (deduct 1 credit)
// Now saves the .txt file in "uploads/" and scans existing files in that folder for matches.
app.post('/scanUpload', isAuthenticated, (req, res) => {
  const userId = req.session.userId;
  db.get(`SELECT credits FROM users WHERE id = ?`, [userId], (err, row) => {
    if (err || !row) return res.status(500).json({ error: 'User not found' });
    if (row.credits < 1) {
      return res.status(403).json({ error: 'Insufficient credits' });
    }
    const { filename, documentContent } = req.body;
    if (!documentContent || !filename)
      return res.status(400).json({ error: 'Filename and document content required' });
    const uploadDate = new Date().toISOString();

    // Ensure the uploads directory exists
    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir);
    }
    const filePath = path.join(uploadsDir, filename);

    // Save file to disk
    fs.writeFile(filePath, documentContent, (err) => {
      if (err) return res.status(500).json({ error: 'Failed to save file' });

      // Insert document record in the database
      db.run(
        `INSERT INTO documents (user_id, filename, content, upload_date) VALUES (?, ?, ?, ?)`,
        [userId, filename, documentContent, uploadDate],
        function (err) {
          if (err) return res.status(500).json({ error: 'Failed to store document in DB' });
          const docId = this.lastID;
          // Log scan event
          db.run(
            `INSERT INTO scans (user_id, document_id, scan_date) VALUES (?, ?, ?)`,
            [userId, docId, uploadDate]
          );
          // Deduct 1 credit from user
          db.run(`UPDATE users SET credits = credits - 1 WHERE id = ?`, [userId]);

          // Now scan the uploads/ directory for matching documents
          fs.readdir(uploadsDir, (err, files) => {
            if (err) return res.status(500).json({ error: 'Error reading uploads folder' });
            let matches = [];
            let filesProcessed = 0;
            if (files.length === 0) {
              // Should not happen, but return if no files found.
              res.json({ message: 'Document scanned successfully', documentId: docId, matches: [] });
            }
            files.forEach((file) => {
              // Skip the file just uploaded (assuming unique filenames)
              if (file === filename) {
                filesProcessed++;
                if (filesProcessed === files.length) {
                  res.json({ message: 'Document scanned successfully', documentId: docId, matches });
                }
                return;
              }
              const fileToRead = path.join(uploadsDir, file);
              fs.readFile(fileToRead, 'utf8', (err, content) => {
                filesProcessed++;
                if (!err && content) {
                  const similarity = jaccardSimilarity(documentContent, content);
                  if (similarity >= 0.2) {
                    matches.push({ filename: file, similarity: similarity.toFixed(2) });
                  }
                }
                if (filesProcessed === files.length) {
                  res.json({ message: 'Document scanned successfully', documentId: docId, matches });
                }
              });
            });
          });
        }
      );
    });
  });
});

// Get matching documents for a given document (using DB content if needed)
app.get('/matches/:docId', isAuthenticated, (req, res) => {
  const docId = req.params.docId;
  db.get(`SELECT content FROM documents WHERE id = ?`, [docId], (err, doc) => {
    if (err || !doc) return res.status(404).json({ error: 'Document not found' });
    db.all(`SELECT id, filename, content FROM documents WHERE id != ?`, [docId], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error retrieving documents' });
      let matches = [];
      rows.forEach((d) => {
        const similarity = jaccardSimilarity(doc.content, d.content);
        if (similarity >= 0.2) {
          matches.push({ id: d.id, filename: d.filename, similarity: similarity.toFixed(2) });
        }
      });
      res.json({ matches });
    });
  });
});

// Request additional credits
app.post('/credits/request', isAuthenticated, (req, res) => {
  const userId = req.session.userId;
  const { requestedCredits } = req.body;
  if (!requestedCredits || requestedCredits <= 0)
    return res.status(400).json({ error: 'Requested credits must be greater than 0' });
  const requestDate = new Date().toISOString();
  db.run(
    `INSERT INTO credit_requests (user_id, requested_credits, request_date) VALUES (?, ?, ?)`,
    [userId, requestedCredits, requestDate],
    function (err) {
      if (err) return res.status(500).json({ error: 'Failed to create credit request' });
      res.json({ message: 'Credit request submitted', requestId: this.lastID });
    }
  );
});

// Admin endpoint to view analytics and credit requests (including approved credits)
app.get('/admin/analytics', isAuthenticated, isAdmin, (req, res) => {
  db.all(`SELECT u.username, u.credits, COUNT(s.id) AS total_scans
          FROM users u
          LEFT JOIN scans s ON u.id = s.user_id
          GROUP BY u.id`, [], (err, users) => {
    if (err) return res.status(500).json({ error: 'Error fetching analytics' });
    db.all(`SELECT cr.id as request_id, u.username, cr.requested_credits, cr.status, cr.approved_credits, cr.request_date
            FROM credit_requests cr
            JOIN users u ON cr.user_id = u.id
            ORDER BY cr.id ASC`, [], (err, requests) => {
      if (err) return res.status(500).json({ error: 'Error fetching credit requests' });
      res.json({ analytics: { users, credit_requests: requests } });
    });
  });
});

// Admin endpoint to approve a credit request.
// Now updates the approved_credits column and returns the approved credit amount.
app.post('/admin/credits/approve', isAuthenticated, isAdmin, (req, res) => {
  const { requestId, additionalCredits } = req.body;
  if (!requestId || !additionalCredits) {
    return res.status(400).json({ error: 'Request ID and additional credits are required' });
  }
  db.get(`SELECT * FROM credit_requests WHERE id = ?`, [requestId], (err, requestRow) => {
    if (err || !requestRow)
      return res.status(404).json({ error: 'Credit request not found' });
    db.run(
      `UPDATE users SET credits = credits + ? WHERE id = ?`,
      [additionalCredits, requestRow.user_id],
      (err) => {
        if (err) return res.status(500).json({ error: 'Failed to update user credits' });
        db.run(
          `UPDATE credit_requests SET status = 'approved', approved_credits = ? WHERE id = ?`,
          [additionalCredits, requestId],
          (err) => {
            if (err) return res.status(500).json({ error: 'Failed to update credit request' });
            res.json({ message: `Credit request approved. ${additionalCredits} credits added.` });
          }
        );
      }
    );
  });
});

// Admin endpoint to deny a credit request
app.post('/admin/credits/deny', isAuthenticated, isAdmin, (req, res) => {
  const { requestId } = req.body;
  if (!requestId) return res.status(400).json({ error: 'Request ID required' });
  db.run(
    `UPDATE credit_requests SET status = 'denied' WHERE id = ?`,
    [requestId],
    (err) => {
      if (err) return res.status(500).json({ error: 'Failed to update credit request' });
      res.json({ message: 'Credit request denied' });
    }
  );
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
