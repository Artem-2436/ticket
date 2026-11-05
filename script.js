// === НАСТРОЙКИ ===
const KEY_NFC = 'xc_nfc_final';
const KEY_QR = 'xc_qr_final';

let nfcReader = null;
let qrScanner = null;

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    console.log("Xcortex Final Loaded");
    
    // Проверка библиотек
    if(typeof QRCode === 'undefined') {
        alert("Ошибка загрузки QR библиотеки. Обновите страницу.");
        return;
    }
    if(typeof Html5Qrcode === 'undefined') {
        alert("Ошибка загрузки сканера камеры. Обновите страницу.");
        return;
    }

    renderLists();
});

// --- НАВИГАЦИЯ (ИСПРАВЛЕНО) ---

function enterApp() {
    document.getElementById('view-login').style.display = 'none';
    document.getElementById('view-admin').style.display = 'block';
    // Принудительно переключаем на первую вкладку после входа
    switchTab('nfc'); 
}

function logoutApp() {
    stopAllScans();
    document.getElementById('view-admin').style.display = 'none';
    document.getElementById('view-login').style.display = 'block';
}

/**
 * Главная функция переключения вкладок.
 * Работает через ID элементов, а не через event.target.
 * Это исключает ошибки при тапах на телефоне.
 */
function switchTab(tabName) {
    // 1. Скрываем ВСЕ панели контента
    const panels = document.querySelectorAll('.tab-panel');
    panels.forEach(panel => {
        panel.classList.add('hidden');
        panel.classList.remove('active'); // Убираем активный класс, если он был
    });

    // 2. Находим нужную панель и показываем её
    const targetPanel = document.getElementById(`tab-${tabName}`);
    if (targetPanel) {
        targetPanel.classList.remove('hidden');
        targetPanel.classList.add('active');
    } else {
        console.error(`Панель tab-${tabName} не найдена!`);
        return; // Прерываем выполнение, если элемент не найден
    }

    // 3. Обновляем стиль кнопок табов
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(btn => {
        btn.classList.remove('active');
        // Проверяем атрибут data-tab кнопки
        if (btn.getAttribute('data-tab') === tabName) {
            btn.classList.add('active');
        }
    });

    // 4. Останавливаем любые активные сканеры при переключении
    stopAllScans();

    // 5. Если перешли на базу данных, обновляем список
    if (tabName === 'db') {
        renderLists();
    }
}

// --- БАЗА ДАННЫХ (LocalStorage Helpers) ---

function getNFCUsers() { 
    try { return JSON.parse(localStorage.getItem(KEY_NFC)) || []; } 
    catch(e) { return []; } 
}

function saveNFCUser(user) { 
    let list = getNFCUsers(); 
    if(!list.find(u => u.uid === user.uid)) { 
        list.push(user); 
        localStorage.setItem(KEY_NFC, JSON.stringify(list)); 
    } 
}

function findNFCUser(uid) { 
    return getNFCUsers().find(u => u.uid === uid); 
}

function deleteNFCUser(uid) { 
    if(confirm("Удалить этого пользователя?")) {
        let list = getNFCUsers().filter(u => u.uid !== uid); 
        localStorage.setItem(KEY_NFC, JSON.stringify(list)); 
        renderLists(); 
    }
}

function getQRTickets() { 
    try { return JSON.parse(localStorage.getItem(KEY_QR)) || []; } 
    catch(e) { return []; } 
}

function saveQRTicket(ticket) { 
    let list = getQRTickets(); 
    if(!list.find(t => t.code === ticket.code)) { 
        list.push(ticket); 
        localStorage.setItem(KEY_QR, JSON.stringify(list)); 
    } 
}

function findQRTicket(code) { 
    return getQRTickets().find(t => t.code === code); 
}

function markTicketUsed(code) {
    let list = getQRTickets();
    let idx = list.findIndex(t => t.code === code);
    if(idx !== -1) { 
        list[idx].used = true; 
        localStorage.setItem(KEY_QR, JSON.stringify(list)); 
    }
}

// --- ЛОГИКА NFC РЕГИСТРАЦИИ ---

async function registerNFC() {
    const nameInput = document.getElementById('in-nfc-name');
    const msgEl = document.getElementById('msg-nfc');
    const name = nameInput.value.trim();
    
    if(!name) return alert("Введите ФИО!");
    if(!('NDEFReader' in window)) return alert("Web NFC не поддерживается этим браузером.");

    showMsg(msgEl, "Приложите карту к телефону...", "info");

    try {
        nfcReader = new NDEFReader();
        await nfcReader.scan();
        
        nfcReader.onreading = event => {
            let uid = event.serialNumber?.toLowerCase();
            
            if(!uid) { 
                showMsg(msgEl, "❌ Ошибка: Браузер скрыл UID карты.", "err"); 
                stopScan(); 
                return; 
            }
            
            if(findNFCUser(uid)) { 
                showMsg(msgEl, "⚠️ Карта уже зарегистрирована!", "err"); 
                stopScan(); 
                return; 
            }
            
            saveNFCUser({uid, name, time: Date.now()});
            showMsg(msgEl, `✅ Успешно! Имя: ${name}`, "ok");
            nameInput.value = '';
            renderLists();
            stopScan();
        };
    } catch(err) {
        showMsg(msgEl, "Ошибка запуска NFC: " + err.message, "err");
    }
}

async function searchNFC() {
    const msgEl = document.getElementById('msg-nfc');
    if(!('NDEFReader' in window)) return alert("Web NFC не поддерживается.");
    
    showMsg(msgEl, "Ищем клиента... Приложите карту.", "info");
    try {
        nfcReader = new NDEFReader();
        await nfcReader.scan();
        nfcReader.onreading = event => {
            let uid = event.serialNumber?.toLowerCase();
            const user = findNFCUser(uid);
            if(user) {
                showMsg(msgEl, `✅ Найден: ${user.name}`, "ok");
                highlightListItem(uid);
            } else {
                showMsg(msgEl, "❌ Клиент не найден в базе.", "err");
            }
            stopScan();
        };
    } catch(err) { 
        showMsg(msgEl, "Ошибка поиска", "err"); 
    }
}

function highlightListItem(uid) {
    const listContainer = document.getElementById('list-nfc');
    const items = listContainer.children;
    for(let i = 0; i < items.length; i++) {
        if(items[i].getAttribute('data-id') === uid) {
            items[i].scrollIntoView({behavior:'smooth', block:'center'});
            items[i].style.backgroundColor = '#fffbe6'; 
            setTimeout(() => { items[i].style.backgroundColor = ''; }, 2000);
            break;
        }
    }
}

// --- ЛОГИКА QR ГЕНЕРАЦИИ ---

function generateQR() {
    const nameInput = document.getElementById('in-qr-name');
    const name = nameInput.value.trim();
    if(!name) return alert("Введите ФИО клиента!");

    let code;
    do {
        code = Math.floor(100000 + Math.random() * 900000).toString();
    } while(findQRTicket(code)); 

    saveQRTicket({code, name, used:false, time:Date.now()});

    document.getElementById('area-qr-result').classList.remove('hidden');
    document.getElementById('txt-qr-name').textContent = name;
    document.getElementById('txt-qr-code').textContent = code;

    const qrBox = document.getElementById('box-qr-img');
    qrBox.innerHTML = ''; 
    new QRCode(qrBox, {
        text: `XC:${code}`,
        width: 150,
        height: 150,
        correctLevel : QRCode.CorrectLevel.H
    });
    
    renderLists(); 
}

function resetQRForm() {
    document.getElementById('in-qr-name').value = '';
    document.getElementById('area-qr-result').classList.add('hidden');
}

// --- ЛОГИКА ПРОВЕРКИ ВХОДА ---

async function checkNFCAccess() {
    const msgEl = document.getElementById('msg-check');
    if(!('NDEFReader' in window)) return alert("Web NFC не поддерживается.");
    
    showMsg(msgEl, "Жду карту посетителя...", "info");
    try {
        nfcReader = new NDEFReader();
        await nfcReader.scan();
        nfcReader.onreading = event => {
            let uid = event.serialNumber?.toLowerCase();
            const user = findNFCUser(uid);
            
            if(user) {
                showMsg(msgEl, `✅ ДОСТУП РАЗРЕШЕН<br>Здравствуйте, ${user.name}!`, "ok");
                vib(true);
            } else {
                showMsg(msgEl, "❌ ОТКАЗАНО<br>Карта не найдена в базе.", "err");
                vib(false);
            }
            stopScan();
        };
    } catch(err) { 
        showMsg(msgEl, "Ошибка NFC: " + err.message, "err"); 
    }
}

function startCameraScan() {
    document.getElementById('cam-view').classList.remove('hidden');
    document.getElementById('msg-check').classList.add('hidden');
    
    qrScanner = new Html5Qrcode("reader-element");
    qrScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 150 }, onQrSuccess, onQrFail)
        .catch(e => { 
            alert("Ошибка доступа к камере: " + e); 
            stopCameraScan(); 
        });
}

function stopCameraScan() {
    if(qrScanner) {
        qrScanner.stop().then(() => {
            document.getElementById('cam-view').classList.add('hidden');
        }).catch(()=>{
             document.getElementById('cam-view').classList.add('hidden');
        });
    }
}

function onQrSuccess(decodedText) {
    stopCameraScan();
    const msgEl = document.getElementById('msg-check');
    msgEl.classList.remove('hidden');
    
    if(decodedText.startsWith('XC:')) {
        const code = decodedText.split(':')[1];
        const ticket = findQRTicket(code);
        
        if(!ticket) {
            showMsg(msgEl, "❌ НЕВЕРНЫЙ КОД<br>Такого билета нет в базе.", "err"); 
            vib(false);
        } else if(ticket.used) {
            showMsg(msgEl, `⛔ УЖЕ ИСПОЛЬЗОВАН<br>(${ticket.name})`, "err"); 
            vib(false);
        } else {
            markTicketUsed(ticket.code);
            showMsg(msgEl, `✅ ДОСТУП РАЗРЕШЕН<br>Клиент: ${ticket.name}`, "ok"); 
            vib(true);
            renderLists(); 
        }
    } else {
        showMsg(msgEl, "❌ НЕ НАШ ФОРМАТ<br>Это не Xcortex билет.", "err");
    }
}

function onQrFail(error) {}

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

function showMsg(element, text, type) {
    element.textContent = text;
    element.className = 'message-box'; 
    if(type === 'ok') element.classList.add('msg-ok');
    if(type === 'err') element.classList.add('msg-err');
    if(type === 'info') element.classList.add('msg-info');
    element.classList.remove('hidden');
}

function stopScan() { 
    if(nfcReader) nfcReader.stopScan().catch(()=>{}); 
}

function stopAllScans() { 
    stopScan(); 
    stopCameraScan(); 
}

function vib(success) { 
    if(navigator.vibrate) navigator.vibrate(success ? [100] : [200, 100, 200]); 
}

function escapeHtml(text) {
    return text.replace(/&/g, "&amp;")
               .replace(/</g, "&lt;")
               .replace(/>/g, "&gt;")
               .replace(/"/g, "&quot;")
               .replace(/'/g, "&#039;");
}

// --- ОТРИСОВКА СПИСКОВ ---

function renderLists() {
    // 1. Список NFC пользователей
    const nfcListEl = document.getElementById('list-nfc');
    const nfcCountEl = document.getElementById('cnt-nfc');
    const users = getNFCUsers();
    
    nfcListEl.innerHTML = '';
    nfcCountEl.textContent = users.length;
    
    [...users].sort((a,b) => b.time - a.time).forEach(user => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.setAttribute('data-id', user.uid);
        
        div.innerHTML = `
            <div class="item-info">
                <strong>${escapeHtml(user.name)}</strong>
                <span class="item-meta">${user.uid}</span>
            </div>
            <button class="btn-danger btn-small" onclick="deleteNFCUser('${user.uid}')">✖</button>
        `;
        nfcListEl.appendChild(div);
    });

    // 2. Общий список QR билетов
    const dbListEl = document.getElementById('list-db');
    const dbCountEl = document.getElementById('cnt-all');
    const tickets = getQRTickets();
    
    dbListEl.innerHTML = '';
    dbCountEl.textContent = tickets.length;
    
    if(tickets.length === 0 && users.length === 0) {
        dbListEl.innerHTML = '<p style="color:#aaa;text-align:center;padding:20px;">База данных пуста.</p>';
        return;
    }

    [...tickets].sort((a,b) => b.time - a.time).forEach(ticket => {
        const div = document.createElement('div');
        div.className = 'list-item';
        const statusColor = ticket.used ? '#e53e3e' : '#38a169';
        const statusText = ticket.used ? 'USED' : 'ACTIVE';
        
        div.innerHTML = `
            <div class="item-info">
                <strong>${escapeHtml(ticket.name)}</strong>
                <span class="item-meta">Code: ${ticket.code}</span>
            </div>
            <span style="font-weight:bold; color:${statusColor}; font-size:0.8rem;">${statusText}</span>
        `;
        dbListEl.appendChild(div);
    });
}

function wipeDatabase() {
    if(confirm("ВНИМАНИЕ: Вы уверены, что хотите удалить ВСЮ базу данных (NFC и QR)?\nЭто действие необратимо.")) {
        localStorage.removeItem(KEY_NFC);
        localStorage.removeItem(KEY_QR);
        renderLists();
        alert("База очищена.");
    }
}
