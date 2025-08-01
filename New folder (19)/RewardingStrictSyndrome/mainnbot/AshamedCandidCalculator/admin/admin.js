// --- Admin Login Logic ---
const ADMIN_USER = 'alamin13913';
const ADMIN_PASS = 'alamin+112113914';

const loginSection = document.getElementById('login-section');
const dashboardSection = document.getElementById('dashboard-section');
const loginForm = document.getElementById('admin-login-form');
const loginError = document.getElementById('login-error');

function showDashboard() {
  loginSection.style.display = 'none';
  dashboardSection.style.display = '';
  // Now run dashboard logic
  initDashboard();
}

if (loginForm) {
  loginForm.onsubmit = function(e) {
    e.preventDefault();
    const user = document.getElementById('admin-username').value.trim();
    const pass = document.getElementById('admin-password').value;
    if (user === ADMIN_USER && pass === ADMIN_PASS) {
      showDashboard();
    } else {
      loginError.textContent = 'Invalid username or password!';
      loginError.style.display = 'block';
    }
  };
}

// --- Dashboard Logic (moved into function) ---
function initDashboard() {
  // --- Video Upload & List ---
  const videoForm = document.getElementById('video-upload-form');
  const videoListDiv = document.getElementById('video-list');

  async function getVideos() {
    try {
      const response = await fetch('/api/videos');
      return await response.json();
    } catch (error) {
      console.error('Error fetching videos:', error);
      return [];
    }
  }

  async function saveVideo(video) {
    try {
      const response = await fetch('/api/videos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(video)
      });
      return await response.json();
    } catch (error) {
      console.error('Error saving video:', error);
      return { success: false };
    }
  }

  async function renderVideos() {
    const videos = await getVideos();
    videoListDiv.innerHTML = '';
    document.getElementById('video-count').textContent = `Total Videos: ${videos.length}`;
    videos.forEach((v, idx) => {
      const div = document.createElement('div');
      div.className = 'video-item';
      div.innerHTML = `
        <img src="${v.image}" alt="thumb">
        <div>
          <div><b>Title:</b> <span class="video-title">${v.title || ''}</span></div>
          <div><b>Time:</b> <span class="video-time">${v.time || ''}</span></div>
          <div><b>Tokens:</b> <span class="video-token">${v.token}</span></div>
          <div><b>Views:</b> <span class="video-views">${v.views || 0}</span>
            <button onclick="changeViews(${v.id}, 1)">+</button>
            <button onclick="changeViews(${v.id}, -1)">-</button>
          </div>
          <a href="${v.link}" class="video-link" target="_blank">${v.link}</a>
        </div>
        <button onclick="unlockVideo(${idx})">Unlock/Watch</button>
        <button onclick="editVideo(${v.id})">Edit</button>
        <button onclick="deleteVideo(${v.id})">Delete</button>
      `;
      videoListDiv.appendChild(div);
    });
  }

  videoForm.onsubmit = async function(e) {
    e.preventDefault();
    const file = document.getElementById('video-image').files[0];
    const title = document.getElementById('video-title').value;
    const link = document.getElementById('video-link').value;
    const time = document.getElementById('video-time').value;
    const token = parseInt(document.getElementById('video-token').value);
    const views = parseInt(document.getElementById('video-views').value) || 0;
    if (!file || !title || !link || !time || !token) return alert('All fields required!');

    const reader = new FileReader();
    reader.onload = async function(evt) {
        const videoData = {
            image: evt.target.result,
            title: title,
            link: link,
            time: time,
            token: token,
            views: views
        };

        // Save video to server
        const result = await saveVideo(videoData);

        if (result.success) {
            // Send notification to all users
            await sendNotificationToAllUsers(result.video);

            // Reset form
            document.getElementById('video-upload-form').reset();

            // Update video list display
            renderVideos();

            alert('Video added successfully and notification sent to all users!');
        } else {
            alert('Error adding video. Please try again.');
        }
    };
    reader.readAsDataURL(file);
  };

  window.unlockVideo = function(idx) {
    // For demo: just open the link. In real app, check user tokens, deduct, etc.
    const videos = getVideos();
    window.open(videos[idx].link, '_blank');
  };

  window.deleteVideo = function(idx) {
    if (!confirm('Are you sure you want to delete this video?')) return;
    const videos = getVideos();
    videos.splice(idx, 1);
    setVideos(videos);
    renderVideos();
  };

  window.changeViews = function(idx, delta) {
    const videos = getVideos();
    videos[idx].views = Math.max(0, (videos[idx].views || 0) + delta);
    setVideos(videos);
    renderVideos();
  };

  window.editVideo = function(idx) {
    const videos = getVideos();
    const v = videos[idx];
    const newTitle = prompt('Edit video title:', v.title || "");
    if (newTitle === null) return;
    const newLink = prompt('Edit video link:', v.link);
    if (newLink === null) return;
    const newTime = prompt('Edit video time (MM:SS):', v.time || "");
    if (newTime === null) return;
    const newToken = prompt('Edit unlock token amount:', v.token);
    if (newToken === null) return;
    const newViews = prompt('Edit views:', v.views || 0);
    if (newViews === null) return;
    v.title = newTitle;
    v.link = newLink;
    v.time = newTime;
    v.token = parseInt(newToken);
    v.views = parseInt(newViews) || 0;
    setVideos(videos);
    renderVideos();
  };

  renderVideos();

  // --- User List & Edit ---
  const usersTableBody = document.querySelector('#users-table tbody');

  function getUsers() {
    return JSON.parse(localStorage.getItem('admin-users') || '[]');
  }
  function setUsers(users) {
    localStorage.setItem('admin-users', JSON.stringify(users));
  }

  function getRealUsers() {
    const userIds = getAllUserIds();
    const realUsers = [];

    userIds.forEach(userId => {
      const userInfo = JSON.parse(localStorage.getItem(`user_${userId}`) || '{}');
      const tokens = parseInt(localStorage.getItem(`tokens_${userId}`) || '0');
      const points = parseFloat(localStorage.getItem(`earnedPoints_${userId}`) || '0');
      const referrals = parseInt(localStorage.getItem(`totalReferrals_${userId}`) || '0');
      const checkinStreak = parseInt(localStorage.getItem(`checkinStreak_${userId}`) || '0');

      realUsers.push({
        userId: userId,
        username: userInfo.first_name || `User_${userId}`,
        tokens: tokens,
        points: points.toFixed(2),
        referrals: referrals,
        checkinStreak: checkinStreak
      });
    });

    return realUsers;
  }

  function renderUsers() {
    const realUsers = getRealUsers();
    usersTableBody.innerHTML = '';

    if (realUsers.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="6" style="text-align: center; color: #aaa;">কোনো ইউজার পাওয়া যায়নি</td>`;
      usersTableBody.appendChild(tr);
      return;
    }

    realUsers.forEach((u, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${u.username}</td>
        <td>${u.tokens}</td>
        <td>${u.points}</td>
        <td>${u.referrals}</td>
        <td>${u.checkinStreak}</td>
        <td>
          <button class="token-btn minus" onclick="changeUserTokens('${u.userId}', -10)">-10</button>
          <button class="token-btn plus" onclick="changeUserTokens('${u.userId}', 10)">+10</button>
          <button class="edit-btn" onclick="editUserTokens('${u.userId}', ${u.tokens})">Edit</button>
        </td>
      `;
      usersTableBody.appendChild(tr);
    });
  }

  window.saveToken = function(idx) {
    const users = getUsers();
    const input = document.getElementById('token-input-' + idx);
    users[idx].tokens = parseInt(input.value);
    setUsers(users);
    renderUsers();
  };

  window.editUserTokens = function(userId, currentTokens) {
    const newTokens = prompt(`ইউজার ${userId} এর টোকেন এডিট করুন:`, currentTokens);
    if (newTokens !== null && !isNaN(newTokens)) {
      localStorage.setItem(`tokens_${userId}`, parseInt(newTokens).toString());
      renderUsers();
      alert('টোকেন সফলভাবে আপডেট হয়েছে!');
    }
  };

  window.changeUserTokens = function(userId, amount) {
    const currentTokens = parseInt(localStorage.getItem(`tokens_${userId}`) || '0');
    const newTokens = Math.max(0, currentTokens + amount); // Ensure tokens don't go below 0
    localStorage.setItem(`tokens_${userId}`, newTokens.toString());
    renderUsers();

    const action = amount > 0 ? 'যোগ করা হয়েছে' : 'কেটে নেওয়া হয়েছে';
    alert(`ইউজার ${userId} এর ${Math.abs(amount)} টোকেন ${action}!`);
  };

  // Load real users from localStorage

  renderUsers();
}

// Function to send notification to all users via Telegram Bot
async function sendNotificationToAllUsers(videoData) {
    try {
        // Get all user IDs from localStorage
        const allUserIds = getAllUserIds();

        if (allUserIds.length === 0) {
            alert('কোনো ইউজার পাওয়া যায়নি নটিফিকেশন পাঠানোর জন্য।');
            return;
        }

        // Send notification via server API
        const response = await fetch('/api/send-notification', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                videoData: videoData,
                userIds: allUserIds
            })
        });

        const result = await response.json();

        if (result.success) {
            showNotificationStatus(result.sent, result.failed, result.total);
        } else {
            alert('নটিফিকেশন পাঠাতে সমস্যা হয়েছে।');
        }

    } catch (error) {
        console.error('Error sending notifications:', error);
        alert('নটিফিকেশন পাঠাতে নেটওয়ার্ক সমস্যা হয়েছে।');
    }
}

// Function to get all user IDs from localStorage
function getAllUserIds() {
    const userIds = [];

    // Scan localStorage for user-specific keys
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);

        // Look for keys that contain user IDs (tokens_, watchedAds_, etc.)
        if (key && key.startsWith('tokens_')) {
            const userId = key.replace('tokens_', '');
            if (userId && !userIds.includes(userId)) {
                userIds.push(userId);
            }
        } else if (key && key.startsWith('earnedPoints_')) {
            const userId = key.replace('earnedPoints_', '');
            if (userId && !userIds.includes(userId)) {
                userIds.push(userId);
            }
        }
    }

    return userIds;
}

// Function to show notification status
function showNotificationStatus(sent, failed, total) {
    const statusDiv = document.createElement('div');
    const bgColor = failed > 0 ? '#FF9800' : '#4CAF50';

    statusDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${bgColor};
        color: white;
        padding: 15px;
        border-radius: 8px;
        z-index: 1000;
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        max-width: 300px;
    `;

    statusDiv.innerHTML = `
        <div><strong>নটিফিকেশন স্ট্যাটাস:</strong></div>
        <div>✅ সফল: ${sent} জন</div>
        ${failed > 0 ? `<div>❌ ব্যর্থ: ${failed} জন</div>` : ''}
        <div>📊 মোট: ${total} জন ইউজার</div>
    `;

    document.body.appendChild(statusDiv);

    setTimeout(() => {
        if (document.body.contains(statusDiv)) {
            document.body.removeChild(statusDiv);
        }
    }, 6000);
}

// Test notification function
async function testNotification() {
    const testVideoData = {
        title: "টেস্ট ভিডিও",
        time: "02:30",
        token: 50
    };

    const allUserIds = getAllUserIds();

    if (allUserIds.length === 0) {
        alert('কোনো ইউজার পাওয়া যায়নি। প্রথমে কিছু ইউজার অ্যাপ ব্যবহার করতে দিন।');
        return;
    }

    if (confirm(`${allUserIds.length} জন ইউজারের কাছে টেস্ট নটিফিকেশন পাঠাবেন?`)) {
        await sendNotificationToAllUsers(testVideoData);
    }
}

async function uploadVideo() {
    const title = document.getElementById('video-title').value;
    const time = document.getElementById('video-time').value;
    const token = parseInt(document.getElementById('video-token').value);
    const thumbnail = document.getElementById('video-thumbnail').value || '🎬';

    if (!title || !time || !token) {
      alert('Please fill all required fields');
      return;
    }

    try {
      // Upload video first
      const response = await fetch('/api/videos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          time,
          token,
          thumbnail,
          views: 0
        })
      });

      const result = await response.json();
      if (result.success) {
        // Send notifications to all users
        const userIds = getAllUserIds();
        if (userIds.length > 0) {
          try {
            const notificationResponse = await fetch('/api/send-notification', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                videoData: result.video,
                userIds: userIds
              })
            });

            const notificationResult = await notificationResponse.json();
            alert(`Video uploaded successfully! Notifications sent to ${notificationResult.sent} users.`);
          } catch (notifError) {
            console.error('Error sending notifications:', notifError);
            alert('Video uploaded but failed to send notifications');
          }
        } else {
          alert('Video uploaded successfully! No users found for notifications.');
        }

        loadVideos();
        // Clear form
        document.getElementById('video-title').value = '';
        document.getElementById('video-time').value = '';
        document.getElementById('video-token').value = '';
        document.getElementById('video-thumbnail').value = '';
      }
    } catch (error) {
      console.error('Error uploading video:', error);
      alert('Error uploading video');
    }
  }