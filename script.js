// === CONFIGURATION ===
const BASE_URL = "https://artem-2436.github.io/ticket/"; // ЗАМЕНИ НА СВОЙ URL!
const STORAGE_KEY_USERS = 'xcortex_users_db';      // База людей (NFC + Имена)
const STORAGE_KEY_CODES = 'xcortex_active_codes';  // База временных QR кодов

// STATE
let regTimerInterval = null;
let currentRegCode = null;
let html5QrCode = null;
let nfcReader = null;
let isScanningActive = false;

// INITIALIZATION
window.onload = function() {
    checkHashAndRoute();
};

// --- ROUTING LOGIC ---

function checkHashAndRoute() {
    const hash = window.location.hash;
    
    // Проверка: Мы находимся в режиме клиента? (#login_123456)
    if (hash.startsWith('#login_')) {
        const code = hash.replace('#login_', '');
        renderClientLogin(code);
    } else {
        // Обычный режим (Главная или Админ)
        showView('home');
        loadDB(); // Загружаем базу при старте админа
    }
}

function showView(viewName) {
    ['home', 'admin', 'client-login'].forEach(v => {
        document.getElementById(`view-${v}`).classList.add('hidden');
    });
    document.getElementById(`view-${viewName}`).classList.remove('hidden');
    
    if (viewName !== 'admin') stopAllScans();
}

function switchTab(tab) {
    // Hide all panels
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    // Show selected panel
    document.getElementById(`panel-${tab}`).classList.remove('hidden');
    
    // Update buttons styling
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    
    stopAllScans();
}

// --- DATABASE HELPERS (LocalStorage) ---

function getUsers() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY_USERS);
        return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
}

function saveUser(userObj) {
    let users = getUsers();
    // Check duplicate by UID
    if (!users.some(u => u.uid === userObj.uid)) {
        users.push(userObj);
        localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
        renderUsersList();
    }
}

function deleteUser(uid) {
    let users = getUsers().filter(u => u.uid !== uid);
    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
    renderUsersList();
}

function findUserByUid(uid) {
    return getUsers().find(u => u.uid === uid);
}

// Helper for Active Codes (QR Registration)
function getActiveCodes() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY_CODES);
        return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
}

function addActiveCode(code) {
    let codes = getActiveCodes();
    if (!codes.includes(code)) {
        codes.push(code);
        localStorage.setItem(STORAGE_KEY_CODES, JSON.stringify(codes));
    }
}

function removeActiveCode(code) {
    let codes = getActiveCodes().filter(c => c !== code);
    localStorage.setItem(STORAGE_KEY_CODES, JSON.stringify(codes));
}

function isActiveCodeValid(code) {
    return getActiveCodes().includes(code);
}

// --- ADMIN LOGIC: REGISTER BY NFC ---

async function startRegisterNFC() {
    const nameInput = document.getElementById('input-name-nfc').value.trim();
    if (!nameInput) {
        alert("Введите ФИО участника!");
        return;
    }

    if (!('NDEFReader' in window)) {
        alert("Web NFC не поддерживается этим браузером.");
        return;
    }

    const statusEl = document.getElementById('status-nfc-reg');
    statusEl.classList.remove('hidden');
    statusEl.className = 'status-box st-info';
    statusEl.textContent = "Приложите карту к телефону...";

    try {
        nfcReader = new NDEFReader();
        await nfcReader.scan();
        isScanningActive = true;
        
        nfcReader.onreading = event => {
            let uid = event.serialNumber;
            
            if (!uid || uid === "") {
                statusEl.className = 'status-box st-err';
                statusEl.textContent = "❌ Ошибка: Браузер скрыл UID.";
                stopScan();
                return;
            }

            uid = uid.toLowerCase();

            if (findUserByUid(uid)) {
                statusEl.className = 'status-box st-warn';
                statusEl.textContent = `⚠️ Карта уже зарегистрирована!\nUID: ${uid}`;
                stopScan();
                return;
            }

            const newUser = {
                uid: uid,
                name: nameInput,
                addedAt: Date.now()
            };
            
            saveUser(newUser);
            
            statusEl.className = 'status-box st-ok';
            statusEl.innerHTML = `✅ Успешно!<br>Имя: ${nameInput}<br>UID: ${uid}`;
            vibrate(true);
            
            document.getElementById('input-name-nfc').value = '';
            stopScan();
        };

        nfcReader.onerror = err => {
            statusEl.className = 'status-box st-err';
            statusEl.textContent = "Ошибка NFC: " + err.name;
            stopScan();
        };

    } catch (err) {
        statusEl.className = 'status-box st-err';
        statusEl.textContent = "Не удалось запустить сканер: " + err.message;
        isScanningActive = false;
    }
}

// --- ADMIN LOGIC: REGISTER BY QR (TEMP CODE) ---

function startRegistrationQR() {
    // 1. Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    currentRegCode = code;

    // 2. SAVE TO ADMIN'S LOCALSTORAGE IMMEDIATELY
    addActiveCode(code);
    console.log("Saved temp code to DB:", code);

    // 3. Prepare UI
    document.getElementById('qr-reg-idle').classList.add('hidden');
    document.getElementById('qr-reg-active').classList.remove('hidden');
    
    const statusEl = document.getElementById('qr-reg-status-msg');
    statusEl.className = 'status-box st-info';
    statusEl.innerHTML = `Ожидание сканирования...<br><small>Код ${code} сохранен в базе.</small>`;

    // 4. Create Invite Link
    const inviteLink = `${BASE_URL}#login_${code}`;

    // 5. Render Big QR
    const qrContainer = document.getElementById('invite-qr-container');
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
        text: inviteLink,
        width: 200,
        height: 200,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.M
    });

    // 6. Start Timer
    startRegTimer(60);
}

function startRegTimer(seconds) {
    clearInterval(regTimerInterval);
    let timeLeft = seconds;
    const timerDisplay = document.getElementById('reg-timer');
    
    regTimerInterval = setInterval(() => {
        timeLeft--;
        timerDisplay.textContent = timeLeft;
        
        if (timeLeft <= 0) {
            clearInterval(regTimerInterval);
            expireRegistration();
        }
    }, 1000);
}

function expireRegistration() {
    const statusEl = document.getElementById('qr-reg-status-msg');
    statusEl.className = 'status-box st-warn';
    statusEl.innerHTML = "⏳ Время истекло.<br>Если клиент еще здесь, нажмите 'Новая регистрация'.<br><small>Код все еще активен в базе до использования.</small>";
}

// --- CLIENT LOGIC (Hidden Block) ---

function renderClientLogin(code) {
    // This runs on the CLIENT'S PHONE
    
    // Show Client View
    document.getElementById('view-home').classList.add('hidden');
    document.getElementById('view-client-login').classList.remove('hidden');
    
    // Display Code Text
    document.getElementById('client-code-display').textContent = code;

    // Generate Small QR containing just the code string
    const ticketData = `XC_TICKET:${code}`;
    
    const qrContainer = document.getElementById('client-ticket-qr');
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
        text: ticketData,
        width: 250,
        height: 250,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });
}

// --- ADMIN LOGIC: CHECK ENTRY ---

async function startCheckNFC() {
    if (!('NDEFReader' in window)) {
        alert("Web NFC не поддерживается.");
        return;
    }

    const resultEl = document.getElementById('check-result');
    resultEl.classList.remove('hidden');
    resultEl.className = 'status-box st-info';
    resultEl.textContent = "Приложите карту посетителя...";

    try {
        nfcReader = new NDEFReader();
        await nfcReader.scan();
        isScanningActive = true;
        
        nfcReader.onreading = event => {
            let uid = event.serialNumber?.toLowerCase();
            
            if (!uid) {
                resultEl.className = 'status-box st-err';
                resultEl.textContent = "❌ Не удалось прочитать UID.";
                stopScan();
                return;
            }

            const user = findUserByUid(uid);

            if (!user) {
                resultEl.className = 'status-box st-err';
                resultEl.textContent = `❌ ОТКАЗАНО\nКарта не найдена.\nUID: ${uid}`;
                vibrate(false);
            } else {
                resultEl.className = 'status-box st-ok';
                resultEl.innerHTML = `✅ ДОСТУП РАЗРЕШЕН<br>Здравствуйте, <strong>${user.name}</strong>!`;
                vibrate(true);
            }
            stopScan();
        };
    } catch (err) {
        resultEl.className = 'status-box st-err';
        resultEl.textContent = "Ошибка: " + err.message;
        isScanningActive = false;
    }
}

function openScanner() {
    document.getElementById('scanner-view').classList.remove('hidden');
    document.getElementById('check-result').classList.add('hidden');

    html5QrCode = new Html5Qrcode("reader");
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, onScanFailure)
        .catch(err => {
            alert("Ошибка камеры: " + err);
            closeScanner();
        });
}

function closeScanner() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            document.getElementById('scanner-view').classList.add('hidden');
        }).catch(()=>{
             document.getElementById('scanner-view').classList.add('hidden');
        });
    }
}

function onScanSuccess(decodedText, decodedResult) {
    closeScanner();
    const resultEl = document.getElementById('check-result');
    resultEl.classList.remove('hidden');
    resultEl.className = 'status-box st-info';
    resultEl.textContent = "Проверка...";

    try {
        // Expected format: XC_TICKET:123456
        if (!decodedText.startsWith('XC_TICKET:')) {
            throw new Error("Неизвестный формат билета");
        }

        const code = decodedText.split(':')[1];
        
        // CHECK AGAINST ADMIN'S LOCALSTORAGE (Active Codes)
        if (isActiveCodeValid(code)) {
            resultEl.className = 'status-box st-ok';
            resultEl.innerHTML = `✅ ДОСТУП РАЗРЕШЕН<br>Код: <strong>${code}</strong>`;
            vibrate(true);
            
            // Optional: Remove code after successful entry (One-time use)
            // removeActiveCode(code); 
            
        } else {
            resultEl.className = 'status-box st-err';
            resultEl.innerHTML = `❌ ОТКАЗАНО<br>Код ${code} не найден в базе.`;
            vibrate(false);
        }

    } catch (e) {
        resultEl.className = 'status-box st-err';
        resultEl.textContent = "❌ ОШИБКА ЧТЕНИЯ: " + e.message;
        vibrate(false);
    }
}

function onScanFailure(error) {}

function stopScan() {
    if (nfcReader && isScanningActive) {
        nfcReader.stopScan().catch(()=>{});
        isScanningActive = false;
    }
}

function stopAllScans() {
    closeScanner();
    stopScan();
    clearInterval(regTimerInterval);
}

function vibrate(success) {
    if(navigator.vibrate) {
        if(success) navigator.vibrate([100, 50, 100]);
        else navigator.vibrate([200, 100, 200]);
    }
}

// --- RENDER USERS LIST ---

function loadDB() {
    renderUsersList();
}

function renderUsersList() {
    const container = document.getElementById('users-container');
    const countLabel = document.getElementById('count-users');
    const users = getUsers();
    
    container.innerHTML = '';
    countLabel.textContent = users.length;

    if (users.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#aaa; font-size:0.9rem;">Нет зарегистрированных участников.</p>';
        return;
    }

    const sorted = [...users].sort((a,b) => b.addedAt - a.addedAt);

    sorted.forEach(user => {
        const div = document.createElement('div');
        div.className = 'user-item';
        
        div.innerHTML = `
            <div class="user-info">
                <div class="user-name">${escapeHtml(user.name)}</div>
                <div class="user-uid">${user.uid}</div>
            </div>
            <div class="actions">
                <button class="btn-danger" onclick="deleteUser('${user.uid}')">✖</button>
            </div>
        `;
        container.appendChild(div);
    });
}

function escapeHtml(text) {
    return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
