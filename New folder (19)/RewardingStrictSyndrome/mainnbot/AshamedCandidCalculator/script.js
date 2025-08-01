
// --- START: Configuration ---
// DANGER: DO NOT PUT SECRET API KEYS HERE.
// This URL should point to YOUR secure backend server, which will handle the API logic.
const BACKEND_API_URL = 'https://your-secure-server.com/update-balance';
// --- END: Configuration ---

// Constants
const POINTS_PER_AD = 0.50;
const TOKENS_PER_AD = 10;
const TOKENS_PER_REFERRAL = 20;
const BONUS_POINTS = 1.00;
const ADS_FOR_BONUS = 10;
const DAILY_AD_LIMIT = 40;
const HOURLY_AD_LIMIT = 20;

// State variables
let watchedAdsCount = 0;
let earnedPoints = 0;
let dailyAdCount = 0;
let hourlyAdCount = 0;
let lastHourCheck = new Date().getHours();
let autoAdInterval;
let tgUser = null;
let totalReferrals = 0;
let referralEarnings = 0;
let lastCheckinDate = null;
let completedTasks = [];
let lastSpinTime = 0;
let adminVideos = [];

// Ad rotation system variables  
let adRotationCounter = 0; // 0-1: Monetag, 2-3: Adexium, 4-5: Adsgram
let adexiumWidget = null;
let adsgramController = null;

// DOM Elements
const watchedAdsEl = document.getElementById('watched-ads');
const earnedPointsEl = document.getElementById('earned-points');
const adsProgressEl = document.getElementById('ads-progress');
const progressFillEl = document.getElementById('progress-fill');
const adNotificationEl = document.getElementById('ad-notification');
const watchAdBtn = document.getElementById('watch-ad-btn');
const autoAdBtn = document.getElementById('auto-ad-btn');

function initApp() {
    try {
        if (typeof Telegram !== 'undefined' && Telegram.WebApp) {
            Telegram.WebApp.ready();
            tgUser = Telegram.WebApp.initDataUnsafe?.user;
        }

        // Initialize Adexium widget
        if (typeof AdexiumWidget !== 'undefined') {
            adexiumWidget = new AdexiumWidget({
                wid: 'e2a2131d-6af6-46a9-b6ce-8270630a3e3b', 
                adFormat: 'interstitial'
            });
        }

        // Initialize Adsgram SDK
        if (typeof window.Adsgram !== 'undefined') {
            adsgramController = window.Adsgram.init({ blockId: "int-13346" });
        }

        if (tgUser) {
            // Track user for notifications
            trackUserForNotifications();
            registerUserOnServer();

            // Initialize user if first time
            initializeUserTokens();

            // Load and check daily limit first
            const today = new Date().toLocaleDateString();
            const storedLastDate = localStorage.getItem(`lastAdDate_${tgUser.id}`);

            if (storedLastDate === today) {
                dailyAdCount = parseInt(localStorage.getItem(`dailyAdCount_${tgUser.id}`) || 0);
            } else {
                // It's a new day, reset daily count
                dailyAdCount = 0;
                localStorage.setItem(`dailyAdCount_${tgUser.id}`, 0);
                localStorage.setItem(`lastAdDate_${tgUser.id}`, today);
            }

            // Check hourly limit
            const currentHour = new Date().getHours();
            const storedLastHour = parseInt(localStorage.getItem(`lastHour_${tgUser.id}`) || 0);

            if (storedLastHour === currentHour) {
                hourlyAdCount = parseInt(localStorage.getItem(`hourlyAdCount_${tgUser.id}`) || 0);
            } else {
                // It's a new hour, reset hourly count
                hourlyAdCount = 0;
                localStorage.setItem(`hourlyAdCount_${tgUser.id}`, 0);
                localStorage.setItem(`lastHour_${tgUser.id}`, currentHour);
            }
            lastHourCheck = currentHour;

            // Load other stats
            const storedAds = localStorage.getItem(`watchedAds_${tgUser.id}`);
            const storedPoints = localStorage.getItem(`earnedPoints_${tgUser.id}`);
            const storedReferrals = localStorage.getItem(`totalReferrals_${tgUser.id}`);
            const storedReferralEarnings = localStorage.getItem(`referralEarnings_${tgUser.id}`);
            const storedLastCheckin = localStorage.getItem(`lastCheckin_${tgUser.id}`);
            const storedCompletedTasks = localStorage.getItem(`completedTasks_${tgUser.id}`);

            if (storedAds && storedPoints) {
                watchedAdsCount = parseInt(storedAds);
                earnedPoints = parseFloat(storedPoints);
            }
            if (storedReferrals) {
                totalReferrals = parseInt(storedReferrals);
            }
            if (storedReferralEarnings) {
                referralEarnings = parseFloat(storedReferralEarnings);
            }
            if (storedLastCheckin) {
                lastCheckinDate = storedLastCheckin;
            }
            if (storedCompletedTasks) {
                completedTasks = JSON.parse(storedCompletedTasks);
            }

            updateUI();
            updateReferralUI();
            checkDailyCheckin();
            generateReferralLink();
            loadTasks();

            // Disable buttons if limit is already reached on load
            if (dailyAdCount >= DAILY_AD_LIMIT) {
                showAdNotification("Daily limit reached. Come back tomorrow!");
                disableAdButtons();
            }

        } else {
            const userInfoEl = document.getElementById('user-info');
            if (userInfoEl) {
                userInfoEl.innerHTML = "<p style='color: #ff6d00;'>Please open this page from your Telegram bot.</p>";
            }
            if (watchAdBtn) {
                watchAdBtn.disabled = true;
                watchAdBtn.style.cursor = 'not-allowed';
                watchAdBtn.style.opacity = '0.6';
            }
            if (autoAdBtn) {
                autoAdBtn.disabled = true;
                autoAdBtn.style.cursor = 'not-allowed';
                autoAdBtn.style.opacity = '0.6';
            }
            showAdNotification("Authentication failed. Open from Telegram.");
        }
    } catch (error) {
        console.error('Error initializing app:', error);
    }
}

// Register user on server for notifications
async function registerUserOnServer() {
    if (!tgUser) return;

    try {
        await fetch('/api/register-user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userId: tgUser.id.toString()
            })
        });
    } catch (error) {
        console.error('Error registering user:', error);
    }
}

// Initialize user tokens if first time user
function initializeUserTokens() {
    if (!tgUser) return;

    const userTokensKey = `tokens_${tgUser.id}`;
    const storedTokens = localStorage.getItem(userTokensKey);

    // If user has no tokens stored, initialize with 0
    if (storedTokens === null || storedTokens === undefined) {
        localStorage.setItem(userTokensKey, '0');
    }
}

// Track user for notifications
function trackUserForNotifications() {
    if (!tgUser) return;

    // Store user info for notification purposes
    const userInfo = {
        id: tgUser.id,
        first_name: tgUser.first_name || 'User',
        username: tgUser.username || '',
        last_active: new Date().toISOString()
    };

    localStorage.setItem(`user_${tgUser.id}`, JSON.stringify(userInfo));

    // Update last active time
    localStorage.setItem(`last_active_${tgUser.id}`, new Date().toISOString());
}

function updateUI() {
    if (watchedAdsEl) watchedAdsEl.textContent = watchedAdsCount;
    if (earnedPointsEl) earnedPointsEl.textContent = earnedPoints.toFixed(2);

    const progress = (watchedAdsCount % ADS_FOR_BONUS) / ADS_FOR_BONUS * 100;
    if (adsProgressEl) adsProgressEl.textContent = `${Math.round(progress)}%`;
    if (progressFillEl) progressFillEl.style.width = `${progress}%`;

    // Update remaining ads count
    const remainingAdsEl = document.getElementById('remaining-ads');
    if (remainingAdsEl) {
        const remainingDaily = Math.max(0, DAILY_AD_LIMIT - dailyAdCount);
        remainingAdsEl.textContent = remainingDaily;
    }

    if (earnedPointsEl) {
        earnedPointsEl.classList.remove('pulse');
        void earnedPointsEl.offsetWidth;
        earnedPointsEl.classList.add('pulse');
    }

    // Update token display
    updateTokenDisplay();
}

async function updateBotBalance(pointsToAdd) {
    if (!tgUser) {
        console.error("Telegram user not found. Cannot update balance.");
        return;
    }
    if (!BACKEND_API_URL || BACKEND_API_URL === 'https://your-secure-server.com/update-balance') {
        console.warn("Backend API URL is not configured.");
        return;
    }

    // This data will be sent to YOUR server.
    // Your server will then securely communicate with the bot API.
    const postData = {
        user_id: tgUser.id,
        amount: pointsToAdd,
        auth: typeof Telegram !== 'undefined' && Telegram.WebApp ? Telegram.WebApp.initData : ''
    };

    try {
        const response = await fetch(BACKEND_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(postData),
        });

        if (response.ok) {
            console.log('Balance updated successfully via backend.');
            showAdNotification(`+${pointsToAdd.toFixed(2)} points synced with bot!`);
        } else {
            console.error('Failed to update balance. Server responded with:', response.status);
            showAdNotification("Error: Could not sync with bot.");
        }
    } catch (error) {
        console.error('Error sending update to backend:', error);
        showAdNotification("Network error. Could not update bot balance.");
    }
}

function processPoints(points, isBonus = false, isReferral = false) {
     if (!tgUser) return;

     if (!isBonus && !isReferral) {
         watchedAdsCount++;
         dailyAdCount++;
         hourlyAdCount++;
         // Add tokens for watching ad
         addTokens(TOKENS_PER_AD);
     }

     if (isReferral) {
         // Add tokens for referral
         addTokens(TOKENS_PER_REFERRAL);
     }

     earnedPoints += points;

     localStorage.setItem(`watchedAds_${tgUser.id}`, watchedAdsCount);
     localStorage.setItem(`earnedPoints_${tgUser.id}`, earnedPoints);
     localStorage.setItem(`dailyAdCount_${tgUser.id}`, dailyAdCount);
     localStorage.setItem(`hourlyAdCount_${tgUser.id}`, hourlyAdCount);
     localStorage.setItem(`lastAdDate_${tgUser.id}`, new Date().toLocaleDateString());
     localStorage.setItem(`adRotationCounter_${tgUser.id}`, adRotationCounter);

     updateUI();
     updateBotBalance(points);

     // Check if this user was referred and update referrer's milestone progress
     const referrerId = localStorage.getItem(`referred_${tgUser.id}`);
     if (referrerId) {
         checkReferralMilestones(tgUser.id, earnedPoints);
     }

     if (isBonus) {
         showAdNotification(`Bonus! +${points.toFixed(2)} points added.`);
     } else if (isReferral) {
         showAdNotification(`Referral bonus! +${points.toFixed(2)} points + ${TOKENS_PER_REFERRAL} tokens added.`);
     } else {
         showAdNotification(`Ad completed! +${points.toFixed(2)} points + ${TOKENS_PER_AD} tokens added.`);
     }
}

function watchAd() {
    if (!tgUser) {
        showAdNotification("Please open from Telegram to watch ads.");
        return;
    }

    // Check if it's a new hour
    const currentHour = new Date().getHours();
    if (currentHour !== lastHourCheck) {
        hourlyAdCount = 0;
        lastHourCheck = currentHour;
        localStorage.setItem(`hourlyAdCount_${tgUser.id}`, 0);
        localStorage.setItem(`lastHour_${tgUser.id}`, currentHour);
    }

    // Daily limit check before showing an ad
    if (dailyAdCount >= DAILY_AD_LIMIT) {
        showAdNotification("প্রতিদিনের এড সীমা শেষ! আগামীকাল আবার আসুন।");
        disableAdButtons();
        if(autoAdInterval) stopAutoAds();
        return;
    }

    // Hourly limit check before showing an ad
    if (hourlyAdCount >= HOURLY_AD_LIMIT) {
        showAdNotification("এই ঘন্টায় এড দেখার সীমা শেষ! পরের ঘন্টায় আবার চেষ্টা করুন।");
        disableAdButtons();
        if(autoAdInterval) stopAutoAds();
        return;
    }

    // Determine which ad to show based on rotation
    let adProvider;
    if (adRotationCounter < 2) {
        adProvider = "Monetag";
    } else if (adRotationCounter < 4) {
        adProvider = "Adexium";
    } else {
        adProvider = "Adsgram";
    }
    
    showAdNotification(`Loading ${adProvider} ad... Please wait`);

    if (adRotationCounter < 2) {
        // Show Monetag ad
        if (typeof show_9616405 === 'function') {
            show_9616405().then(() => {
                handleAdSuccess();
            }).catch(error => {
                console.error("Monetag ad error:", error);
                showAdNotification("Failed to show Monetag ad. Please try again.");
            });
        } else {
            console.warn("Monetag ad function not found, simulating ad watch.");
            setTimeout(() => {
                handleAdSuccess();
            }, 1500);
        }
    } else if (adRotationCounter < 4) {
        // Show Adexium ad
        if (adexiumWidget) {
            try {
                adexiumWidget.show().then(() => {
                    handleAdSuccess();
                }).catch(error => {
                    console.error("Adexium ad error:", error);
                    showAdNotification("Failed to show Adexium ad. Please try again.");
                });
            } catch (error) {
                console.error("Adexium widget error:", error);
                // Fallback to simulate ad
                setTimeout(() => {
                    handleAdSuccess();
                }, 1500);
            }
        } else {
            console.warn("Adexium widget not available, simulating ad watch.");
            setTimeout(() => {
                handleAdSuccess();
            }, 1500);
        }
    } else {
        // Show Adsgram ad
        if (adsgramController) {
            try {
                adsgramController.show().then(() => {
                    handleAdSuccess();
                }).catch(error => {
                    console.error("Adsgram ad error:", error);
                    showAdNotification("Failed to show Adsgram ad. Please try again.");
                });
            } catch (error) {
                console.error("Adsgram controller error:", error);
                // Fallback to simulate ad
                setTimeout(() => {
                    handleAdSuccess();
                }, 1500);
            }
        } else {
            console.warn("Adsgram controller not available, simulating ad watch.");
            setTimeout(() => {
                handleAdSuccess();
            }, 1500);
        }
    }

    // Update rotation counter (0->1->2->3->4->5->0->1->2->3->4->5...)
    adRotationCounter = (adRotationCounter + 1) % 6;
}

function handleAdSuccess() {
    processPoints(POINTS_PER_AD);
    if (watchedAdsCount % ADS_FOR_BONUS === 0) {
        processPoints(BONUS_POINTS, true);
    }
}

function startAutoAds() {
    if (!tgUser || dailyAdCount >= DAILY_AD_LIMIT || hourlyAdCount >= HOURLY_AD_LIMIT) return;

    autoAdInterval = setInterval(watchAd, 30000); 

    if (autoAdBtn) {
        autoAdBtn.textContent = "Stop Auto Ads";
        autoAdBtn.classList.remove('btn-secondary');
        autoAdBtn.classList.add('btn-danger');
        autoAdBtn.onclick = stopAutoAds;
    }

    showAdNotification("Auto ads started.");
    watchAd(); // Show the first ad immediately
}

function stopAutoAds() {
    clearInterval(autoAdInterval);
    autoAdInterval = null;

    if (autoAdBtn) {
        autoAdBtn.textContent = "Auto Show Ads";
        autoAdBtn.classList.remove('btn-danger');
        autoAdBtn.classList.add('btn-secondary');
        autoAdBtn.onclick = startAutoAds;
    }

    showAdNotification("Auto ads stopped.");
}

function disableAdButtons() {
    if (watchAdBtn) {
        watchAdBtn.disabled = true;
        watchAdBtn.style.cursor = 'not-allowed';
        watchAdBtn.style.opacity = '0.6';
    }

    if (autoAdBtn) {
        autoAdBtn.disabled = true;
        autoAdBtn.textContent = "সীমা শেষ";
        autoAdBtn.classList.remove('btn-secondary', 'btn-danger');
        autoAdBtn.style.cursor = 'not-allowed';
        autoAdBtn.style.opacity = '0.6';
        autoAdBtn.onclick = null;
    }
}

function showAdNotification(message) {
    if (adNotificationEl) {
        adNotificationEl.textContent = message;
        adNotificationEl.style.display = 'block';

        setTimeout(() => {
            adNotificationEl.style.display = 'none';
        }, 3000);
    }
}

function showVideoNotification(message) {
    const videoNotificationEl = document.getElementById('video-notification');
    if (videoNotificationEl) {
        videoNotificationEl.innerHTML = message;
        videoNotificationEl.style.display = 'block';

        setTimeout(() => {
            videoNotificationEl.style.display = 'none';
        }, 5000);
    }
}

// Check for new videos on app load
function checkForNewVideos() {
    if (!tgUser) return;

    const lastVideoCheck = localStorage.getItem(`last_video_check_${tgUser.id}`);

    if (adminVideos.length > 0 && lastVideoCheck) {
        const lastCheckTime = new Date(lastVideoCheck);
        const newVideos = adminVideos.filter(video => {
            const videoDate = new Date(video.uploadDate);
            return videoDate > lastCheckTime;
        });

        if (newVideos.length > 0) {
            const latestVideo = newVideos[newVideos.length - 1];
            showVideoNotification(`
                🎬 নতুন প্রিমিয়াম ভিডিও!<br>
                📹 ${latestVideo.title}<br>
                🔥 ${latestVideo.token} টোকেন দিয়ে আনলক করুন
            `);
        }
    }

    // Update last check time
    localStorage.setItem(`last_video_check_${tgUser.id}`, new Date().toISOString());
}

function setupNavigation() {
    const navItems = document.querySelectorAll('.bottom-navigation-item');
    const contentSections = document.querySelectorAll('.content-section');

    // Initially show home section and hide others
    contentSections.forEach(section => {
        section.classList.remove('active');
        section.style.display = 'none';
    });
    
    const homeSection = document.getElementById('home-section');
    if (homeSection) {
        homeSection.classList.add('active');
        homeSection.style.display = 'block';
    }

    navItems.forEach(item => {
        item.addEventListener('click', function(event) {
            event.preventDefault();

            // Remove active class from all nav items
            navItems.forEach(nav => nav.classList.remove('active'));

            // Add active class to clicked nav item
            this.classList.add('active');

            // Hide all content sections
            contentSections.forEach(section => {
                section.classList.remove('active');
                section.style.display = 'none';
            });

            // Show the target section
            const targetSectionId = this.dataset.section;
            const targetSection = document.getElementById(targetSectionId);
            if (targetSection) {
                targetSection.classList.add('active');
                targetSection.style.display = 'block';
            }
        });
    });
}

// Earn System Functions
function dailyCheckin() {
    if (!tgUser) return;

    const today = new Date().toLocaleDateString();
    if (lastCheckinDate === today) {
        showAdNotification("আজ আপনি ইতিমধ্যে চেকিন করেছেন!");
        return;
    }

    // Calculate streak
    let checkinStreak = parseInt(localStorage.getItem(`checkinStreak_${tgUser.id}`) || '0');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString();

    if (lastCheckinDate === yesterdayStr) {
        // Continue streak
        checkinStreak = Math.min(checkinStreak + 1, 7);
    } else if (lastCheckinDate !== today) {
        // Start new streak
        checkinStreak = 1;
    }

    // Calculate rewards based on streak (2-40 tokens)
    const tokenRewards = [2, 5, 8, 12, 17, 25, 40]; // Day 1-7 rewards
    const pointsReward = 2.00;
    const tokensReward = tokenRewards[checkinStreak - 1] || 40;

    // Add rewards
    processPoints(pointsReward);
    addTokens(tokensReward);

    // Update streak and date
    lastCheckinDate = today;
    localStorage.setItem(`lastCheckin_${tgUser.id}`, lastCheckinDate);
    localStorage.setItem(`checkinStreak_${tgUser.id}`, checkinStreak.toString());

    const btn = document.getElementById('daily-checkin-btn');
    if (btn) {
        btn.textContent = "চেকিন সম্পন্ন ✓";
        btn.disabled = true;
        btn.style.opacity = '0.6';
    }

    showAdNotification(`দিন ${checkinStreak} চেকিন সম্পন্ন! +${pointsReward} পয়েন্ট + ${tokensReward} টোকেন পেয়েছেন`);
}

function checkDailyCheckin() {
    const today = new Date().toLocaleDateString();
    const btn = document.getElementById('daily-checkin-btn');

    if (lastCheckinDate === today) {
        if (btn) {
            btn.textContent = "চেকিন সম্পন্ন ✓";
            btn.disabled = true;
            btn.style.opacity = '0.6';
        }
    } else {
        // Show current streak info
        const checkinStreak = parseInt(localStorage.getItem(`checkinStreak_${tgUser?.id}`) || '0');
        if (btn && checkinStreak > 0) {
            btn.textContent = `ডেইলি চেকিন (${checkinStreak}/৭ দিন)`;
        }
    }
}

function showTasks() {
    const tasksSection = document.getElementById('tasks-section');
    if (tasksSection) {
        tasksSection.style.display = tasksSection.style.display === 'none' ? 'block' : 'none';
    }
}

function loadTasks() {
    const tasksList = document.getElementById('tasks-list');
    if (!tasksList) return;

    const tasks = [
        { id: 'join_channel', title: 'Join Telegram Channel', description: 'Join our official channel', reward: 5.00, url: 'https://t.me/referandearn139' },
        { id: 'share_app', title: 'Share the App', description: 'Share with 3 friends', reward: 3.00 },
        { id: 'watch_10_ads', title: 'Watch 10 Ads', description: 'Watch 10 ads in a day', reward: 2.00 },
        { id: 'invite_friend', title: 'Invite a Friend', description: 'Get someone to join', reward: 5.00 }
    ];

    tasksList.innerHTML = '';
    tasks.forEach(task => {
        const isCompleted = completedTasks.includes(task.id);
        const taskDiv = document.createElement('div');
        taskDiv.className = 'task-item';
        taskDiv.innerHTML = `
            <div class="task-info">
                <h4>${task.title}</h4>
                <p>${task.description}</p>
            </div>
            <div class="task-actions">
                <div class="task-reward">+${task.reward} points</div>
                <button class="btn-3d btn-earn" onclick="completeTask('${task.id}', ${task.reward}, '${task.url || ''}')" 
                        ${isCompleted ? 'disabled style="opacity: 0.6;"' : ''}>
                    ${isCompleted ? 'Completed ✓' : 'Complete'}
                </button>
            </div>
        `;
        tasksList.appendChild(taskDiv);
    });
}

function completeTask(taskId, reward, url) {
    if (!tgUser) return;

    if (completedTasks.includes(taskId)) {
        showAdNotification("Task already completed!");
        return;
    }

    if (url) {
        window.open(url, '_blank');
        setTimeout(() => {
            if (confirm("Did you complete the task?")) {
                finishTask(taskId, reward);
            }
        }, 3000);
    } else {
        finishTask(taskId, reward);
    }
}

function finishTask(taskId, reward) {
    completedTasks.push(taskId);
    localStorage.setItem(`completedTasks_${tgUser.id}`, JSON.stringify(completedTasks));
    processPoints(reward);
    loadTasks();
    showAdNotification(`Task completed! +${reward} points`);
}

function playGame() {
    const gameSection = document.getElementById('game-section');
    if (gameSection) {
        gameSection.style.display = gameSection.style.display === 'none' ? 'block' : 'none';
    }
}

function spinWheel() {
    if (!tgUser) return;

    const now = Date.now();
    if (now - lastSpinTime < 60000) { // 1 minute cooldown
        showAdNotification("Wait 1 minute between spins!");
        return;
    }

    if (earnedPoints < 0.10) {
        showAdNotification("Not enough points to spin! Need 0.10 points");
        return;
    }

    // Deduct spin cost
    earnedPoints -= 0.10;
    localStorage.setItem(`earnedPoints_${tgUser.id}`, earnedPoints);

    const wheel = document.getElementById('spin-wheel');
    const spinBtn = document.getElementById('spin-btn');

    if (spinBtn) {
        spinBtn.disabled = true;
        spinBtn.textContent = "Spinning...";
    }

    // Random spin
    const spins = Math.floor(Math.random() * 3) + 3; // 3-5 full spins
    const finalAngle = Math.floor(Math.random() * 360);
    const totalRotation = spins * 360 + finalAngle;

    if (wheel) {
        wheel.style.transform = `rotate(${totalRotation}deg)`;
    }

    setTimeout(() => {
        // Calculate reward based on final angle
        const rewards = [0.25, 0.50, 0.75, 1.00, 0.25, 0.50];
        const segmentAngle = 360 / rewards.length;
        const rewardIndex = Math.floor((360 - (finalAngle % 360)) / segmentAngle);
        const reward = rewards[rewardIndex];

        processPoints(reward);
        showAdNotification(`You won ${reward} points!`);

        lastSpinTime = now;
        if (spinBtn) {
            spinBtn.disabled = false;
            spinBtn.textContent = "Spin (Cost: 0.10 points)";
        }
        updateUI();
    }, 2000);
}

// Referral System Functions
function generateReferralLink() {
    if (!tgUser) {
        // If no user, show placeholder message
        const referralLinkEl = document.getElementById('referral-link');
        if (referralLinkEl) referralLinkEl.value = "Please open from Telegram to get your referral link";
        return;
    }

    // Generate Telegram bot referral link
    const referralLink = `https://t.me/viralvideosu_bot?start=${tgUser.id}`;
    const referralLinkEl = document.getElementById('referral-link');
    if (referralLinkEl) {
        referralLinkEl.value = referralLink;
        // Ensure the input is visible and properly styled
        referralLinkEl.style.display = 'block';
        referralLinkEl.style.opacity = '1';
    }

    // Check if user came from referral via start parameter
    const urlParams = new URLSearchParams(window.location.search);
    let referrerId = urlParams.get('ref') || urlParams.get('start');

    // Also check if there's a start parameter in the Telegram WebApp initData
    if (!referrerId && typeof Telegram !== 'undefined' && Telegram.WebApp && Telegram.WebApp.initDataUnsafe?.start_param) {
        referrerId = Telegram.WebApp.initDataUnsafe.start_param;
    }

    if (referrerId && referrerId !== tgUser.id.toString()) {
        processReferral(referrerId);
    }
}

function processReferral(referrerId) {
    if (!tgUser) return;

    const hasBeenReferred = localStorage.getItem(`referred_${tgUser.id}`);
    if (hasBeenReferred) return; // Already processed

    // Mark user as referred
    localStorage.setItem(`referred_${tgUser.id}`, referrerId);

    // Add referral to referrer's count and earnings  
    const referrerReferrals = parseInt(localStorage.getItem(`totalReferrals_${referrerId}`) || 0);
    const referrerEarnings = parseFloat(localStorage.getItem(`referralEarnings_${referrerId}`) || 0);
    const referrerPoints = parseFloat(localStorage.getItem(`earnedPoints_${referrerId}`) || 0);

    // Update referrer's stats
    localStorage.setItem(`totalReferrals_${referrerId}`, (referrerReferrals + 1).toString());
    localStorage.setItem(`referralEarnings_${referrerId}`, (referrerEarnings + 5.00).toString());
    localStorage.setItem(`earnedPoints_${referrerId}`, (referrerPoints + 5.00).toString());

    // Add tokens to referrer properly
    const referrerTokens = parseInt(localStorage.getItem(`tokens_${referrerId}`) || '0');
    const newReferrerTokens = referrerTokens + TOKENS_PER_REFERRAL;
    localStorage.setItem(`tokens_${referrerId}`, newReferrerTokens.toString());

    // Add referral to referrer's friends list
    const referrerFriends = JSON.parse(localStorage.getItem(`referredFriends_${referrerId}`) || '[]');
    referrerFriends.push({
        id: tgUser.id,
        name: tgUser.first_name || 'Friend',
        joinDate: new Date().toLocaleDateString(),
        earnings: 0,
        milestones: []
    });
    localStorage.setItem(`referredFriends_${referrerId}`, JSON.stringify(referrerFriends));

    showAdNotification(`স্বাগতম! রেফার লিঙ্ক দিয়ে যোগ দিয়েছেন। আপনার বন্ধু পেয়েছে +৫ পয়েন্ট + ${TOKENS_PER_REFERRAL} টোকেন!`);
}

function updateReferralUI() {
    if (!tgUser) {
        // Show placeholder for non-logged users
        const totalReferralsEl = document.getElementById('total-referrals');
        const referralEarningsEl = document.getElementById('referral-earnings');
        
        if (totalReferralsEl) totalReferralsEl.textContent = '0';
        if (referralEarningsEl) referralEarningsEl.textContent = '0.00';
        
        const friendsList = document.getElementById('referred-friends-list');
        if (friendsList) {
            friendsList.innerHTML = '<p class="no-referrals">Please open from Telegram to see your referrals!</p>';
        }
        return;
    }

    const totalReferralsEl = document.getElementById('total-referrals');
    const referralEarningsEl = document.getElementById('referral-earnings');

    if (totalReferralsEl) totalReferralsEl.textContent = totalReferrals;
    if (referralEarningsEl) referralEarningsEl.textContent = referralEarnings.toFixed(2);

    // Load referred friends
    const referredFriends = JSON.parse(localStorage.getItem(`referredFriends_${tgUser.id}`) || '[]');
    const friendsList = document.getElementById('referred-friends-list');

    if (friendsList) {
        if (referredFriends.length === 0) {
            friendsList.innerHTML = '<p class="no-referrals">No referrals yet. Start sharing your link!</p>';
        } else {
            friendsList.innerHTML = '';
            referredFriends.forEach(friend => {
                const friendDiv = document.createElement('div');
                friendDiv.className = 'friend-item';
                friendDiv.innerHTML = `
                    <div class="friend-info">
                        <h4>${friend.name}</h4>
                        <p>Joined: ${friend.joinDate}</p>
                    </div>
                    <div class="friend-earnings">
                        <div class="points">${friend.earnings} points earned</div>
                        <div class="status">Active</div>
                    </div>
                `;
                friendsList.appendChild(friendDiv);
            });
        }
    }

    // Ensure referral link is displayed
    generateReferralLink();
}

function copyReferralLink() {
    const linkInput = document.getElementById('referral-link');
    if (linkInput) {
        linkInput.select();
        linkInput.setSelectionRange(0, 99999);
        document.execCommand('copy');
        showAdNotification("Referral link copied to clipboard!");
    }
}

function shareReferralLink() {
    const referralLinkEl = document.getElementById('referral-link');
    if (!referralLinkEl) return;
    const referralLink = referralLinkEl.value;
    const shareText = `🎬 Viral Video Pro এ যোগ দিন! 
💰 এড দেখে টোকেন এবং পয়েন্ট আয় করুন
🎁 রেফার করে বোনাস পান
🔥 প্রিমিয়াম ভিডিও আনলক করুন

আমার রেফার লিঙ্ক: ${referralLink}`;

    if (navigator.share) {
        navigator.share({
            title: 'Viral Video Pro তে যোগ দিন',
            text: shareText,
            url: referralLink
        });
    } else if (typeof Telegram !== 'undefined' && Telegram.WebApp && Telegram.WebApp.openTelegramLink) {
        const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`;
        Telegram.WebApp.openTelegramLink(telegramShareUrl);
    } else {
        copyReferralLink();
        showAdNotification("রেফার লিঙ্ক কপি হয়েছে! ম্যানুয়ালি শেয়ার করুন।");
    }
}

// Premium Video Functions
function unlockVideo() {
    if (!tgUser) {
        showAdNotification("Please open from Telegram to unlock videos.");
        return;
    }

    const currentTokens = parseInt(document.getElementById('token-count').textContent);
    const videoCost = 150; // Default cost for main video

    if (currentTokens < videoCost) {
        showAdNotification("Not enough tokens! Earn more by watching ads.");
        return;
    }

    // Deduct tokens
    const newTokenCount = currentTokens - videoCost;
    document.getElementById('token-count').textContent = newTokenCount;
    localStorage.setItem(`tokens_${tgUser.id}`, newTokenCount);

    showAdNotification("Video unlocked! Enjoy your premium content.");

    // Here you would typically load the actual video content
    // For now, we'll just show a success message
    setTimeout(() => {
        showAdNotification("Premium video is now playing...");
    }, 1000);
}

function addTokens(amount) {
    if (!tgUser) return;

    const currentTokens = parseInt(localStorage.getItem(`tokens_${tgUser.id}`) || '0');
    const newTokens = currentTokens + amount;
    localStorage.setItem(`tokens_${tgUser.id}`, newTokens.toString());

    const tokenCountEl = document.getElementById('token-count');
    if (tokenCountEl) {
        tokenCountEl.textContent = newTokens;
    }
}

function updateTokenDisplay() {
    if (!tgUser) return;

    // Get current tokens from storage, default to 0 for new users
    const tokens = parseInt(localStorage.getItem(`tokens_${tgUser.id}`) || '0');
    const tokenCountEl = document.getElementById('token-count');
    if (tokenCountEl) {
        tokenCountEl.textContent = tokens;
    }
}

// Load admin videos and display them
async function loadAdminVideos() {
    try {
        const response = await fetch('/api/videos');
        adminVideos = await response.json();

        const mainVideoContainer = document.getElementById('main-video-container');
        const moreVideosSection = document.getElementById('more-videos-section');
        const noVideosMessage = document.getElementById('no-videos-message');

        if (adminVideos.length === 0) {
            // No videos available
            if (mainVideoContainer) mainVideoContainer.style.display = 'none';
            if (moreVideosSection) moreVideosSection.style.display = 'none';
            if (noVideosMessage) noVideosMessage.style.display = 'block';
            return;
        }

        // Hide no videos message
        if (noVideosMessage) noVideosMessage.style.display = 'none';

        // Update main video if available
        if (adminVideos.length > 0) {
            const mainVideo = adminVideos[0];
            if (mainVideoContainer) mainVideoContainer.style.display = 'block';
            updateMainVideoDisplay(mainVideo, 0);
        }

        // Update video grid for additional videos
        if (adminVideos.length > 1) {
            if (moreVideosSection) moreVideosSection.style.display = 'block';
            updateVideoGrid(adminVideos.slice(1));
        } else {
            if (moreVideosSection) moreVideosSection.style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading videos:', error);
    }
}

async function loadUserUnlockedVideos() {
    if (!tgUser) return [];

    try {
        const response = await fetch(`/api/user/${tgUser.id}/unlocked`);
        const unlockedVideos = await response.json();
        
        // Store in localStorage for backwards compatibility
        localStorage.setItem(`unlockedVideos_${tgUser.id}`, JSON.stringify(unlockedVideos));
        
        return unlockedVideos;
    } catch (error) {
        console.error('Error loading unlocked videos:', error);
        // Fallback to localStorage
        return JSON.parse(localStorage.getItem(`unlockedVideos_${tgUser.id}`) || '[]');
    }
}

function updateMainVideoDisplay(video) {
    // Check if main video is unlocked
    const videoId = video.id || 0;
    
    // Get unlocked videos from server or localStorage
    loadUserUnlockedVideos().then(unlockedVideos => {
        const isUnlocked = unlockedVideos.includes(videoId);

        // Update video title
        const titleEl = document.querySelector('.video-title');
        if (titleEl) titleEl.textContent = video.title;

        // Update views
        const viewsEl = document.querySelector('.views');
        if (viewsEl) viewsEl.innerHTML = `👁 ${video.views || 0} views`;

        // Update token cost/status
        const tokenCostEl = document.querySelector('.token-cost');
        if (tokenCostEl) {
            if (isUnlocked) {
                tokenCostEl.innerHTML = `<span style="color: #4CAF50;">✅ আনলক করা</span>`;
            } else {
                tokenCostEl.textContent = `${video.token} Tokens`;
            }
        }

        // Update unlock button
        const unlockBtn = document.querySelector('.btn-unlock');
        if (unlockBtn) {
            if (isUnlocked) {
                unlockBtn.textContent = '▶️ ভিডিও দেখুন';
                unlockBtn.style.background = 'linear-gradient(45deg, #4CAF50, #66BB6A)';
            } else {
                unlockBtn.textContent = '🔓 আনলক করুন';
                unlockBtn.style.background = 'linear-gradient(45deg, var(--blue), #64b5f6)';
            }
            unlockBtn.onclick = () => unlockSpecificVideo(0);
        }

        // Set thumbnail if available
        const thumbnailEl = document.querySelector('.video-thumbnail');
        if (thumbnailEl && video.image) {
            thumbnailEl.style.backgroundImage = `url(${video.image})`;
            thumbnailEl.style.backgroundSize = 'cover';
            thumbnailEl.style.backgroundPosition = 'center';

            // Update lock icon based on status
            const lockIcon = thumbnailEl.querySelector('.lock-icon');
            if (lockIcon) {
                lockIcon.textContent = isUnlocked ? '🔓' : '🔒';
                lockIcon.style.color = isUnlocked ? '#4CAF50' : '#ffaa00';
            }

            // Add time overlay to main video
            let timeOverlay = thumbnailEl.querySelector('.main-video-time');
            if (!timeOverlay) {
                timeOverlay = document.createElement('div');
                timeOverlay.className = 'main-video-time';
                thumbnailEl.appendChild(timeOverlay);
            }
            timeOverlay.textContent = video.time;

            // Add unlocked badge if video is unlocked
            let unlockedBadge = thumbnailEl.querySelector('.main-unlocked-badge');
            if (isUnlocked && !unlockedBadge) {
                unlockedBadge = document.createElement('div');
                unlockedBadge.className = 'main-unlocked-badge';
                unlockedBadge.innerHTML = '✅ আনলক করা';
                unlockedBadge.style.cssText = `
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    background: #4CAF50;
                    color: white;
                    padding: 5px 10px;
                    border-radius: 15px;
                    font-size: 12px;
                    font-weight: bold;
                `;
                thumbnailEl.appendChild(unlockedBadge);
            } else if (!isUnlocked && unlockedBadge) {
                unlockedBadge.remove();
            }
        }
    });
}

function updateVideoGrid(videos) {
    const videoGrid = document.getElementById('admin-video-grid');
    if (!videoGrid) return;

    videoGrid.innerHTML = '';

    // Get user's unlocked videos
    loadUserUnlockedVideos().then(unlockedVideos => {
        videos.forEach((video, index) => {
            const videoId = video.id || (index + 1);
            const isUnlocked = unlockedVideos.includes(videoId);

            const videoCard = document.createElement('div');
            videoCard.className = `video-card ${isUnlocked ? 'unlocked' : 'locked'}`;
            videoCard.onclick = () => unlockSpecificVideo(index + 1);

            const lockIcon = isUnlocked ? '🔓' : '🔒';
            const statusText = isUnlocked ? 'আনলক করা' : `${video.token} Tokens`;
            const cardStyle = isUnlocked ? 'border: 2px solid #4CAF50;' : '';

            videoCard.innerHTML = `
                <div class="video-thumb" style="background-image: url(${video.image}); background-size: cover; background-position: center; ${cardStyle}">
                    <div class="video-time-overlay">${video.time}</div>
                    <div class="lock-status">${lockIcon}</div>
                    ${isUnlocked ? '<div class="unlocked-badge">✅ আনলক করা</div>' : ''}
                </div>
                <div class="video-details">
                    <p>${video.title}</p>
                    <span class="${isUnlocked ? 'unlocked-text' : 'token-cost'}">${statusText}</span>
                </div>
            `;

            videoGrid.appendChild(videoCard);
        });
    });
}

async function unlockSpecificVideo(videoIndex) {
    if (!tgUser) {
        showAdNotification("Please open from Telegram to unlock videos.");
        return;
    }

    if (videoIndex >= adminVideos.length) {
        showAdNotification("Video not found!");
        return;
    }

    const video = adminVideos[videoIndex];
    const videoId = video.id || videoIndex;

    // Check if already unlocked using server data
    const unlockedVideos = await loadUserUnlockedVideos();

    if (unlockedVideos.includes(videoId)) {
        // Already unlocked, just watch directly
        showAdNotification("ভিডিও ইতিমধ্যে আনলক করা আছে! উপভোগ করুন।");
        watchUnlockedVideo(video);
        return;
    }

    // Check if user has enough tokens for new unlock
    const currentTokens = parseInt(localStorage.getItem(`tokens_${tgUser.id}`) || '0');
    if (currentTokens < video.token) {
        showAdNotification("পর্যাপ্ত টোকেন নেই! আরো এড দেখে টোকেন আয় করুন।");
        return;
    }

    try {
        // Unlock on server
        const response = await fetch(`/api/user/${tgUser.id}/unlock/${videoId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        const result = await response.json();

        if (result.success) {
            // Deduct tokens locally
            const newTokenCount = currentTokens - video.token;
            localStorage.setItem(`tokens_${tgUser.id}`, newTokenCount.toString());

            // Update token display
            const tokenCountEl = document.getElementById('token-count');
            if (tokenCountEl) {
                tokenCountEl.textContent = newTokenCount;
            }

            // Update localStorage for backwards compatibility
            localStorage.setItem(`unlockedVideos_${tgUser.id}`, JSON.stringify(result.unlockedVideos));

            showAdNotification(`ভিডিও আনলক সফল! এখন আপনি যতবার খুশি এই ভিডিও দেখতে পারবেন। খরচ হয়েছে: ${video.token} টোকেন`);

            // Increment views on server
            if (video.id) {
                fetch(`/api/videos/${video.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        views: (video.views || 0) + 1
                    })
                });
            }

            // Show watch button after unlock
            setTimeout(() => {
                watchUnlockedVideo(video);
            }, 1000);

            updateUI();
            loadAdminVideos(); // Refresh display to show unlocked status
        } else {
            showAdNotification("ভিডিও আনলক করতে সমস্যা হয়েছে!");
        }
    } catch (error) {
        console.error('Error unlocking video:', error);
        showAdNotification("নেটওয়ার্ক সমস্যার কারণে ভিডিও আনলক করা যায়নি!");
    }
}

function watchUnlockedVideo(video) {
    // Create watch button overlay
    const watchOverlay = document.createElement('div');
    watchOverlay.className = 'watch-overlay';
    watchOverlay.innerHTML = `
        <div class="watch-modal">
            <h3>🎬 ${video.title}</h3>
            <p>Ready to watch your premium video?</p>
            <div class="watch-buttons">
                <button class="btn-3d btn-unlock" onclick="openVideoLink('${video.link}')">
                    ▶️ Watch Now
                </button>
                <button class="btn-3d btn-secondary" onclick="closeWatchModal()">
                    Close
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(watchOverlay);
}

function openVideoLink(link) {
    window.open(link, '_blank');
    closeWatchModal();
    showAdNotification("Enjoy your premium video!");
}

function closeWatchModal() {
    const overlay = document.querySelector('.watch-overlay');
    if (overlay) {
        overlay.remove();
    }
}

// Check referral milestones when points are earned
function checkReferralMilestones(friendId, newTotal) {
    if (!tgUser) return;

    const referredFriends = JSON.parse(localStorage.getItem(`referredFriends_${tgUser.id}`) || '[]');
    const friend = referredFriends.find(f => f.id === friendId);
    if (!friend) return;

    const milestones = [
        { threshold: 10, reward: 2.00, name: "First 10 points" },
        { threshold: 50, reward: 10.00, name: "50 points milestone" },
        { threshold: 100, reward: 25.00, name: "100 points milestone" }
    ];

    milestones.forEach(milestone => {
        if (newTotal >= milestone.threshold && !friend.milestones.includes(milestone.name)) {
            friend.milestones.push(milestone.name);
            referralEarnings += milestone.reward;
            earnedPoints += milestone.reward;

            localStorage.setItem(`referralEarnings_${tgUser.id}`, referralEarnings);
            localStorage.setItem(`earnedPoints_${tgUser.id}`, earnedPoints);
            localStorage.setItem(`referredFriends_${tgUser.id}`, JSON.stringify(referredFriends));

            showAdNotification(`Referral milestone! +${milestone.reward} points from ${friend.name}'s progress!`);
            updateUI();
            updateReferralUI();
        }
    });

    friend.earnings = newTotal;
    localStorage.setItem(`referredFriends_${tgUser.id}`, JSON.stringify(referredFriends));
}

// Get current ad rotation status
function getCurrentAdProvider() {
    if (adRotationCounter < 2) return "Monetag";
    if (adRotationCounter < 4) return "Adexium";
    return "Adsgram";
}

// Initialize when page loads
window.addEventListener('load', () => {
    initApp();
    setupNavigation();
    loadAdminVideos();

    // Check for new videos after a short delay
    setTimeout(() => {
        checkForNewVideos();
    }, 1000);

    // Load ad rotation counter from localStorage
    if (tgUser) {
        const savedCounter = localStorage.getItem(`adRotationCounter_${tgUser.id}`);
        if (savedCounter !== null) {
            adRotationCounter = parseInt(savedCounter) || 0;
        }
    }
});

// Make functions globally available
window.watchAd = watchAd;
window.startAutoAds = startAutoAds;
window.stopAutoAds = stopAutoAds;
window.unlockSpecificVideo = unlockSpecificVideo;
window.unlockVideo = unlockVideo;
window.dailyCheckin = dailyCheckin;
window.showTasks = showTasks;
window.completeTask = completeTask;
window.playGame = playGame;
window.spinWheel = spinWheel;
window.copyReferralLink = copyReferralLink;
window.shareReferralLink = shareReferralLink;
window.openVideoLink = openVideoLink;
window.closeWatchModal = closeWatchModal;
