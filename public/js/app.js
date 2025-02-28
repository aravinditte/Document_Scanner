let currentUser = null;

// Show login form
function showLogin() {
  document.getElementById('loginForm').classList.remove('hidden');
  document.getElementById('registerForm').classList.add('hidden');
  clearErrors();
}

// Show register form
function showRegister() {
  document.getElementById('registerForm').classList.remove('hidden');
  document.getElementById('loginForm').classList.add('hidden');
  clearErrors();
}

// Clear error messages
function clearErrors() {
  document.getElementById('authError').textContent = '';
  document.getElementById('registerError').textContent = '';
}

// Handle login
async function handleLogin() {
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const response = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      credentials: 'include'
    });

    if (response.ok) {
      const user = await response.json();
      currentUser = user;
      showDashboard(user);
    } else {
      document.getElementById('authError').textContent = 'Invalid credentials';
    }
  } catch (error) {
    document.getElementById('authError').textContent = 'Login failed. Please try again.';
  }
}

// Handle registration
async function handleRegister() {
  const username = document.getElementById('registerUsername').value;
  const password = document.getElementById('registerPassword').value;

  try {
    const response = await fetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      credentials: 'include'
    });

    if (response.ok) {
      showLogin();
      document.getElementById('authError').textContent = 'Registration successful! Please login.';
    } else {
      const error = await response.text();
      document.getElementById('registerError').textContent = error;
    }
  } catch (error) {
    document.getElementById('registerError').textContent = 'Registration failed. Please try again.';
  }
}

// Show dashboard
function showDashboard(user) {
  document.getElementById('authSection').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
  document.getElementById('username').textContent = user.username;
  document.getElementById('credits').textContent = user.credits;
}

// Handle document scanning
async function scanDocument() {
  const content = document.getElementById('documentContent').value;

  try {
    const response = await fetch('/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
      credentials: 'include'
    });

    if (response.ok) {
      const result = await response.json();
      document.getElementById('credits').textContent = result.remaining;
      showResults(result.matches);
    } else {
      alert('Scan failed: ' + (await response.text()));
    }
  } catch (error) {
    console.error('Scan error:', error);
  }
}

// Show scan results
function showResults(matches) {
  const resultsDiv = document.getElementById('results');
  resultsDiv.innerHTML = matches.length > 0 
    ? `<h3>Matching Documents:</h3>
       ${matches.map(m => `
         <div class="match">
           Document #${m.docId} (${Math.round(m.similarity * 100)}% similar)
         </div>
       `).join('')}`
    : `<div class="no-match">No similar documents found</div>`;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  showLogin();
});