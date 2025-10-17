/*
  script.js
  Handles authentication, points tracking and redemption logic using
  localStorage. This approach is purely client‑side and intended for
  demonstration purposes. A real deployment should connect to a backend.
*/

// Utility to retrieve user data from localStorage
function getUsers() {
  const usersJson = localStorage.getItem('recircle_users');
  return usersJson ? JSON.parse(usersJson) : {};
}

// Save users back to localStorage
function saveUsers(users) {
  localStorage.setItem('recircle_users', JSON.stringify(users));
}

// Handle authentication form submission
const authForm = document.getElementById('auth-form');
if (authForm) {
  authForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    if (!username || !password) {
      showAuthMessage('Please enter both username and password.');
      return;
    }
    const users = getUsers();
    // If user exists, validate password; otherwise create new account
    if (users[username]) {
      if (users[username].password === password) {
        // login success
        localStorage.setItem('recircle_current_user', username);
        window.location.href = 'dashboard.html';
      } else {
        showAuthMessage('Incorrect password.');
      }
    } else {
      // create account with zero points
      users[username] = { password: password, points: 0 };
      saveUsers(users);
      localStorage.setItem('recircle_current_user', username);
      showAuthMessage('Account created! Redirecting...', true);
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 1000);
    }
  });
}

function showAuthMessage(message, success = false) {
  const msgEl = document.getElementById('auth-message');
  if (msgEl) {
    msgEl.textContent = message;
    msgEl.style.color = success ? 'var(--primary-color)' : '#c00';
  }
}

// Dashboard logic
function loadDashboard() {
  const username = localStorage.getItem('recircle_current_user');
  if (!username) {
    // Not logged in
    window.location.href = 'login.html';
    return;
  }
  const users = getUsers();
  const user = users[username];
  if (!user) {
    // User data missing
    window.location.href = 'login.html';
    return;
  }
  // Populate the dashboard
  document.getElementById('user-name').textContent = username;
  const pointsEl = document.getElementById('points-count');
  if (pointsEl) {
    pointsEl.textContent = user.points;
  }
  // Add points button
  const addBtn = document.getElementById('add-points-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      user.points += 10;
      pointsEl.textContent = user.points;
      users[username] = user;
      saveUsers(users);
    });
  }
  // Redeem button toggles voucher section
  const redeemBtn = document.getElementById('redeem-btn');
  const voucherSection = document.getElementById('voucher-section');
  if (redeemBtn && voucherSection) {
    redeemBtn.addEventListener('click', () => {
      voucherSection.hidden = !voucherSection.hidden;
    });
  }
  // Redeem options
  const redeemButtons = document.querySelectorAll('.redeem-option');
  redeemButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const cost = parseInt(btn.getAttribute('data-cost'), 10);
      const messageEl = document.getElementById('redeem-message');
      if (user.points >= cost) {
        user.points -= cost;
        pointsEl.textContent = user.points;
        users[username] = user;
        saveUsers(users);
        messageEl.textContent = 'Reward redeemed! Thank you for recycling.';
        messageEl.style.color = 'var(--primary-color)';
      } else {
        messageEl.textContent = 'Not enough points to redeem this reward.';
        messageEl.style.color = '#c00';
      }
    });
  });
  // Logout link
  const logoutLink = document.getElementById('logout-link');
  if (logoutLink) {
    logoutLink.addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('recircle_current_user');
      window.location.href = 'index.html';
    });
  }
}

// If on dashboard page, load dashboard
if (document.body.classList.contains('dashboard')) {
  loadDashboard();
}

// Alternatively, detect by presence of user-name element
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('user-name')) {
    loadDashboard();
  }
});