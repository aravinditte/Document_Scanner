# Document Scanning and Credit Management System

## Overview

This project implements a self-contained document scanning and matching system with a built-in credit system. Users receive 20 free scans per day (automatically reset at midnight) and can request additional credits when needed. The system includes user authentication, role management (regular users and admins), document scanning with text matching, and an admin dashboard for analytics and credit management.

> **Note:** This implementation uses a basic Jaccard similarity algorithm for document matching. For enhanced matching accuracy, you can integrate AI-powered matching using frameworks such as OpenAI, Gemini, or DeepSeek.

## Features

### User Management & Authentication
- User registration and login with basic username/password authentication (passwords are hashed).
- User roles: Regular Users and Admins.
- Profile section displaying user credits, past scans, and credit requests.

### Credit System
- Each user starts with 20 free scans per day (auto-reset at midnight).
- Each document scan deducts 1 credit.
- Users can request additional credits when their free scans are exhausted.
- Admins can approve or deny credit requests and adjust user credit balances.

### Document Scanning & Matching
- Users upload plain text files for scanning.
- Uploaded files are saved in the `uploads/` directory.
- The system compares new uploads against existing files using a basic Jaccard similarity algorithm and returns matching documents.

### Admin Dashboard & Analytics
- Admin Username : admin , Admin Password: admin
- View user analytics: username, remaining credits, and total scans.
- Manage all credit requests (view request details, approved credits, and status).
- Approve or deny credit requests directly from the dashboard.

### Upcoming
- Future integration of AI-powered document matching.
- Optionally, track user activity logs and export scan history as a text file.

## Tech Stack

- **Frontend:** HTML, CSS, and vanilla JavaScript
- **Backend:** Node.js with Express
- **Database:** SQLite
- **File Storage:** Local storage (uploaded text files are stored in the `uploads/` directory)


## Installation

### 1. Clone the Repository

```bash
git clone <https://github.com/aravinditte/Document_Scanner>

cd <Document_Scanner>

npm install express sqlite3 express-session body-parser

node server.js
