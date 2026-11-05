// === CONFIGURATION ===
// ВАЖНО: Измени этот ключ на свой уникальный секрет перед публикацией!
const SECRET_KEY = "XcortexSecureKey_2026_Artem_ChangeMe"; 

// STATE MANAGEMENT
let DB = []; // Array of users: [{ uid: string, name: string, status: 'active'|'blocked', addedAt: number }]
let nfcReader = null;
let html5QrCode = null;
let isScanningActive = false;

// INITIALIZATION
window.onload = function() {
    loadDB();
    renderUsers();
};

// --- DATA PERSISTENCE (LocalStorage) ---

function loadDB() {
    try {
        const saved = localStorage.getItem('xcortex_db_v3');
        if (saved) {
            DB = JSON.parse(saved);
        }
    } catch(e) { 
        console.error("Error loading DB:", e);
        DB = []; 
    }
}

function saveDB() {
    localStorage.setItem('xcortex_db_v3', JSON.stringify(DB));
    renderUsers();
}

// --- NAVIGATION & UI CONTROL ---

function showView(viewName) {
    ['home', 'admin'].forEach(v => {
        document.getElementById(`view-${v}`).classList.add('hidden');
    });
    document.getElementById(`view-${viewName}`).classList.remove('hidden');
    
    if (viewName !== 'admin') {
        stopAllScans();
    } else {
        loadDB(); // Refresh data when entering admin panel
    }
}

function switchTab(tab) {
    // Hide panels
    document.getElementById('panel-reg').classList.toggle('hidden', tab !== 'reg');
    document.getElementById('panel-check').classList.toggle('hidden', tab !== 'check');
    
    // Update buttons styling
    document.getElementById('tab-reg').className = tab === 'reg' ? 'btn-pri' : 'btn-sec';
    document.getElementById('tab-check').className = tab === 'check' ? 'btn-pri' : 'btn-sec';
    
    // Stop any active scanners when switching tabs
    stopAllScans();
}

function vibrate(success) {
    if(navigator.vibrate) {
        if(success) navigator.vibrate([100, 50, 100]);
        else navigator.vibrate([200, 100, 200]);
    }
}

function escapeHtml(text) {
    return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// --- NFC LOGIC ---

async function startRegisterScan() {
    const nameInput = document.getElementById('input-name').value.trim();
    if (!nameInput) {
        alert("Введите ФИО участника!");
        return;
    }

    if (!('NDEFReader' in window)) {
        alert("Web NFC не поддерживается этим браузером.\nИспользуйте Chrome на Android.");
        return;
    }

    const statusEl = document.getElementById('reg-status');
    statusEl.classList.remove('hidden');
    statusEl.className = 'status-box st-info';
    statusEl.textContent = "Приложите карту к телефону...";

    try {
        // Create new reader instance to avoid state issues
        nfcReader = new NDEFReader();
        await nfcReader.scan();
        isScanningActive = true;
        
        nfcReader.onreading = event => {
            let uid = event.serialNumber;
            
            if (!uid || uid === "") {
                statusEl.className = 'status-box st-err';
                statusEl.textContent = "❌ Ошибка: Браузер скрыл UID. Попробуйте другой телефон или перезагрузите страницу.";
                stopScan();
                return;
            }

            uid = uid.toLowerCase();

            // Check duplicate
            if (DB.some(u => u.uid === uid)) {
                statusEl.className = 'status-box st-warn';
                statusEl.textContent = `⚠️ Карта уже зарегистрирована!\nUID: ${uid}`;
                stopScan();
                return;
            }

            // Save User
            const newUser = {
                uid: uid,
                name: nameInput,
                status: 'active',
                addedAt: Date.now()
            };
            
            DB.push(newUser);
            saveDB();
            
            statusEl.className = 'status-box st-ok';
            statusEl.innerHTML = `✅ Успешно!<br>Имя: ${nameInput}<br>UID: ${uid}`;
            vibrate(true);
            
            // Clear input
            document.getElementById('input-name').value = '';
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

            const user = DB.find(u => u.uid === uid);

            if (!user) {
                resultEl.className = 'status-box st-err';
                resultEl.textContent = `❌ ОТКАЗАНО\nКарта не найдена в базе.\nUID: ${uid}`;
                vibrate(false);
            } else if (user.status === 'blocked') {
                resultEl.className = 'status-box st-err';
                resultEl.textContent = `🚫 ДОСТУП ЗАКРЫТ\nПользователь заблокирован.\n${user.name}`;
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

function stopScan() {
    if (nfcReader && isScanningActive) {
        nfcReader.stopScan().catch(()=>{});
        isScanningActive = false;
    }
}

function stopAllScans() {
    stopScan();
    closeQrScanner();
}

// --- QR CODE LOGIC (GENERATION & VERIFICATION) ---

function openQrScanner() {
    document.getElementById('camera-view').classList.remove('hidden');
    const resultEl = document.getElementById('check-result');
    resultEl.classList.add('hidden');

    html5QrCode = new Html5Qrcode("reader");
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5QrCode.start({ facingMode: "environment" }, config, onQrSuccess, onQrFailure)
        .catch(err => {
            alert("Ошибка камеры: " + err);
            closeQrScanner();
        });
}

function closeQrScanner() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            document.getElementById('camera-view').classList.add('hidden');
        }).catch(()=>{
             document.getElementById('camera-view').classList.add('hidden');
        });
    }
}

function onQrSuccess(decodedText, decodedResult) {
    closeQrScanner();
    const resultEl = document.getElementById('check-result');
    resultEl.classList.remove('hidden');
    resultEl.className = 'status-box st-info';
    resultEl.textContent = "Анализ QR...";

    try {
        // Format expected: PAYLOAD.SIGNATURE
        // PAYLOAD = UID|TIMESTAMP
        const parts = decodedText.split('.');
        if (parts.length !== 2) throw new Error("Invalid format");
        
        const payload = parts[0];
        const sig = parts[1];
        
        // Verify Signature using HMAC-SHA256
        const calcSig = CryptoJS.HmacSHA256(payload, SECRET_KEY).toString(CryptoJS.enc.Hex);
        if (sig !== calcSig) {
            resultEl.className = 'status-box st-err';
            resultEl.textContent = "❌ ПОДДЕЛЬНЫЙ QR КОД (Неверная подпись)";
            vibrate(false);
            return;
        }

        const dataParts = payload.split('|');
        const uidFromQr = dataParts[0];
        const timestamp = parseInt(dataParts[1]);

        // Optional: Expiry check (e.g., 24 hours)
        const validityHours = 24;
        if ((Date.now() - timestamp) > validityHours * 60 * 60 * 1000) {
            resultEl.className = 'status-box st-err';
            resultEl.textContent = "⏳ QR ПРОСРОЧЕН";
            vibrate(false);
            return;
        }

        // Find user in local DB by UID embedded in QR
        const user = DB.find(u => u.uid === uidFromQr);

        if (!user) {
            resultEl.className = 'status-box st-err';
            resultEl.textContent = `❌ НЕ НАЙДЕНО\nUID из QR отсутствует в базе.\nUID: ${uidFromQr}`;
            vibrate(false);
        } else if (user.status === 'blocked') {
            resultEl.className = 'status-box st-err';
            resultEl.textContent = `🚫 ЗАБЛОКИРОВАН\n${user.name}`;
            vibrate(false);
        } else {
            resultEl.className = 'status-box st-ok';
            resultEl.innerHTML = `✅ ДОСТУП РАЗРЕШЕН<br>Здравствуйте, <strong>${user.name}</strong>!`;
            vibrate(true);
        }

    } catch (e) {
        resultEl.className = 'status-box st-err';
        resultEl.textContent = "❌ ОШИБКА ЧТЕНИЯ ДАННЫХ";
    }
}

function onQrFailure(error) {
    // Ignore scanning errors during process
}

// Generate QR for a specific user (called from list)
window.generateUserQr = function(uid, name) {
    const timestamp = Date.now();
    const payload = `${uid}|${timestamp}`;
    const signature = CryptoJS.HmacSHA256(payload, SECRET_KEY).toString(CryptoJS.enc.Hex);
    const qrData = `${payload}.${signature}`;

    const modal = document.getElementById('qr-modal');
    const qrContainer = document.getElementById('qr-display-modal');
    const nameLabel = document.getElementById('modal-name');

    nameLabel.textContent = name;
    qrContainer.innerHTML = ''; // Clear previous
    
    new QRCode(qrContainer, {
        text: qrData,
        width: 200,
        height: 200,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.M
    });

    modal.classList.remove('hidden');
};

// --- USER LIST RENDERING ---

function renderUsers() {
    const container = document.getElementById('users-container');
    const countLabel = document.getElementById('count-users');
    container.innerHTML = '';
    countLabel.textContent = DB.length;

    if (DB.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#aaa; font-size:0.9rem; padding:20px;">Нет зарегистрированных участников.<br>Начните с регистрации.</p>';
        return;
    }

    // Sort: Newest first
    const sorted = [...DB].sort((a,b) => b.addedAt - a.addedAt);

    sorted.forEach(user => {
        const div = document.createElement('div');
        div.className = 'user-item';
        
        const statusClass = user.status === 'active' ? 'status-active' : 'status-blocked';
        const statusText = user.status === 'active' ? 'Активен' : 'Бан';
        
        div.innerHTML = `
            <div class="user-info">
                <div class="user-name">${escapeHtml(user.name)} <span class="user-status ${statusClass}">${statusText}</span></div>
                <div class="user-uid">${user.uid}</div>
            </div>
            <div class="actions">
                <button class="btn-small btn-sec" onclick="generateUserQr('${user.uid}', '${escapeHtml(user.name)}')" title="Show QR">🎫</button>
                <button class="btn-small ${user.status==='active'?'btn-danger':'btn-success'}" onclick="toggleBlock('${user.uid}')" title="${user.status === 'active' ? 'Block' : 'Unblock'}">
                    ${user.status === 'active' ? 'Ban' : 'Ok'}
                </button>
                <button class="btn-small btn-danger" style="background:#ccc;color:#333;" onclick="deleteUser('${user.uid}')" title="Delete">✖</button>
            </div>
        `;
        container.appendChild(div);
    });
}

// Actions on list items
window.toggleBlock = function(uid) {
    const idx = DB.findIndex(u => u.uid === uid);
    if (idx !== -1) {
        DB[idx].status = DB[idx].status === 'active' ? 'blocked' : 'active';
        saveDB();
    }
};

window.deleteUser = function(uid) {
    if(confirm("Удалить этого участника навсегда?")) {
        DB = DB.filter(u => u.uid !== uid);
        saveDB();
    }
};
