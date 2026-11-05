// === CONFIGURATION ===
const BASE_URL = "https://artem-2436.github.io/ticket/"; // Замени на свой реальный URL
const STORAGE_KEY = 'xcortex_valid_codes'; // Ключ для хранения активных кодов в базе админа

// STATE
let regTimerInterval = null;
let currentRegCode = null;
let html5QrCode = null;

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
    document.getElementById('panel-reg').classList.toggle('hidden', tab !== 'reg');
    document.getElementById('panel-check').classList.toggle('hidden', tab !== 'check');
    document.getElementById('tab-reg').className = tab === 'reg' ? 'btn-pri' : 'btn-sec';
    document.getElementById('tab-check').className = tab === 'check' ? 'btn-pri' : 'btn-sec';
    stopAllScans();
}

// --- DATABASE HELPERS (LocalStorage for Admin) ---

function getValidCodes() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch(e) {
        return [];
    }
}

function saveValidCode(code) {
    let codes = getValidCodes();
    if (!codes.includes(code)) {
        codes.push(code);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
    }
}

function removeValidCode(code) {
    let codes = getValidCodes();
    codes = codes.filter(c => c !== code);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
}

function isCodeValid(code) {
    const codes = getValidCodes();
    return codes.includes(code);
}

// --- ADMIN LOGIC: REGISTRATION ---

function startRegistration() {
    // 1. Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    currentRegCode = code;

    // 2. SAVE TO ADMIN'S LOCALSTORAGE IMMEDIATELY
    saveValidCode(code);
    console.log("Saved code to DB:", code);

    // 3. Prepare UI
    document.getElementById('reg-idle').classList.add('hidden');
    document.getElementById('reg-active').classList.remove('hidden');
    
    const statusEl = document.getElementById('reg-status-msg');
    statusEl.className = 'status-box st-info';
    statusEl.innerHTML = `Ожидание сканирования...<br><small>Код ${code} сохранен в базе.</small>`;

    // 4. Create Invite Link
    // Формат: https://site/#login_CODE
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

    // 6. Start Timer (Visual only, code stays in DB until used or manually cleared)
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
    // Опционально: удалить код из базы, если время вышло и никто не просканировал
    // Но лучше оставить, пока админ не нажмет "Новая регистрация", чтобы дать шанс опоздавшим
    const statusEl = document.getElementById('reg-status-msg');
    statusEl.className = 'status-box st-warn';
    statusEl.innerHTML = "⏳ Время истекло.<br>Если клиент еще здесь, нажмите 'Новая регистрация'.<br><small>Код все еще активен в базе.</small>";
}

// --- CLIENT LOGIC (Hidden Block) ---

function renderClientLogin(code) {
    // This runs on the CLIENT'S PHONE
    
    // Show Client View
    document.getElementById('view-home').classList.add('hidden');
    document.getElementById('view-client-login').classList.remove('hidden');
    
    // Display Code Text
    document.getElementById('client-code-display').textContent = code;

    // Generate Small QR containing just the code string for easy scanning by admin
    // We use a prefix so admin knows what it is: "XC_TICKET:CODE"
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
        
        // CHECK AGAINST ADMIN'S LOCALSTORAGE
        if (isCodeValid(code)) {
            resultEl.className = 'status-box st-ok';
            resultEl.innerHTML = `✅ ДОСТУП РАЗРЕШЕН<br>Код: <strong>${code}</strong>`;
            vibrate(true);
            
            // Optional: Remove code after successful entry (One-time use)
            // removeValidCode(code); 
            
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

function stopAllScans() {
    closeScanner();
    clearInterval(regTimerInterval);
}

function vibrate(success) {
    if(navigator.vibrate) {
        if(success) navigator.vibrate([100, 50, 100]);
        else navigator.vibrate([200, 100, 200]);
    }
}
