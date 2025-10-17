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

// Update navigation based on whether a user is logged in. This shows or
// hides the account, login and logout links accordingly.
function updateNav() {
  const currentUser = localStorage.getItem('recircle_current_user');
  // Update legacy nav if it exists (before the dropdown refactor)
  const navLogin = document.getElementById('nav-login');
  const navDashboard = document.getElementById('nav-dashboard');
  const navLogout = document.getElementById('nav-logout');
  if (navLogin || navDashboard || navLogout) {
    if (currentUser) {
      if (navDashboard) navDashboard.style.display = '';
      if (navLogout) navLogout.style.display = '';
      if (navLogin) navLogin.style.display = 'none';
    } else {
      if (navDashboard) navDashboard.style.display = 'none';
      if (navLogout) navLogout.style.display = 'none';
      if (navLogin) navLogin.style.display = '';
    }
  }

  // Update new user-menu dropdown items
  updateUserMenu();
}

// Show/hide user menu items depending on login state
function updateUserMenu() {
  const currentUser = localStorage.getItem('recircle_current_user');
  const accountItem = document.getElementById('menu-account');
  const loginItem = document.getElementById('menu-login');
  const logoutItem = document.getElementById('menu-logout');
  if (currentUser) {
    if (accountItem) accountItem.style.display = 'block';
    if (logoutItem) logoutItem.style.display = 'block';
    if (loginItem) loginItem.style.display = 'none';
  } else {
    if (accountItem) accountItem.style.display = 'none';
    if (logoutItem) logoutItem.style.display = 'none';
    if (loginItem) loginItem.style.display = 'block';
  }
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

// Toggle user dropdown menu when user icon is clicked
function initUserMenu() {
  const toggleButton = document.getElementById('user-menu-toggle');
  const dropdown = document.getElementById('user-menu');
  if (!toggleButton || !dropdown) return;
  // Show/hide on click
  toggleButton.addEventListener('click', (e) => {
    e.stopPropagation();
    if (dropdown.style.display === 'block') {
      dropdown.style.display = 'none';
    } else {
      dropdown.style.display = 'block';
    }
  });
  // Hide dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (dropdown.style.display === 'block') {
      dropdown.style.display = 'none';
    }
  });
  // Prevent closing when clicking inside dropdown
  dropdown.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  // Hook logout in dropdown
  const logoutItem = document.getElementById('menu-logout');
  if (logoutItem) {
    logoutItem.addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('recircle_current_user');
      updateNav();
      // Close menu and redirect home
      dropdown.style.display = 'none';
      window.location.href = 'index.html';
    });
  }
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
      // Identify which reward is being redeemed
      const rewardType = btn.getAttribute('data-reward');
      const messageEl = document.getElementById('redeem-message');
      if (user.points >= cost) {
        // Deduct points and persist
        user.points -= cost;
        pointsEl.textContent = user.points;
        users[username] = user;
        saveUsers(users);
        // Generate a unique code for this reward (prefix RC + 8 random characters)
        const code =
          'RC' + Math.random().toString(36).substr(2, 8).toUpperCase();
        // Store the last redeemed reward details so reward.html can access them
        localStorage.setItem(
          'recircle_last_reward',
          JSON.stringify({ reward: rewardType || '', code: code })
        );
        // Redirect user to the reward page to view their code and QR
        window.location.href = 'reward.html';
      } else {
        // Not enough points, show error message
        messageEl.textContent = 'Not enough points to redeem this reward.';
        messageEl.style.color = '#c00';
      }
    });
  });
  // Legacy logout link (if present) is handled by initUserMenu; no action here
}

// If on dashboard page, load dashboard
if (document.body.classList.contains('dashboard')) {
  loadDashboard();
}

// Alternatively, detect by presence of user-name element
document.addEventListener('DOMContentLoaded', () => {
  // Update navigation on every page load
  updateNav();
  // If on dashboard page or there is a user-name element, initialise dashboard
  if (document.getElementById('user-name')) {
    loadDashboard();
  }
  // Initialise dropdown menu toggle handlers
  initUserMenu();
});