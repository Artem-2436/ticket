// === НАСТРОЙКИ ===
const KEY_NFC = 'xc_nfc_db'; // [{uid, name}]
const KEY_QR = 'xc_qr_db';   // [{code, name, used}]

let nfcReader = null;
let qrScanner = null;

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    if(typeof QRCode === 'undefined') console.warn("Библиотека QR не загружена");
    renderLists(); // Сразу рисуем списки, если данные есть
});

// --- НАВИГАЦИЯ ---

function enterAdmin() {
    document.getElementById('screen-login').style.display = 'none';
    document.getElementById('screen-admin').style.display = 'block';
    switchTab('nfc'); // По умолчанию открываем первую вкладку
}

function logout() {
    stopAllScans();
    document.getElementById('screen-admin').style.display = 'none';
    document.getElementById('screen-login').style.display = 'block';
}

function switchTab(tabName) {
    // Скрыть все контенты
    document.querySelectorAll('.content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.content').forEach(el => el.classList.remove('visible'));
    
    // Показать нужный
    const target = document.getElementById(`tab-${tabName}`);
    if(target) {
        target.classList.remove('hidden');
        target.classList.add('visible');
    }

    // Обновить стиль табов
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.tab[onclick="switchTab('${tabName}')"]`);
    if(btn) btn.classList.add('active');

    stopAllScans(); // Останавливаем сканеры при переключении
    
    // Если перешли на список, обновляем его
    if(tabName === 'list') renderLists();
}

// --- БАЗА ДАННЫХ (LocalStorage) ---

function getNFC() { try { return JSON.parse(localStorage.getItem(KEY_NFC)) || []; } catch(e) { return []; } }
function saveNFC(u) { 
    let l = getNFC(); 
    if(!l.find(x=>x.uid===u.uid)) { l.push(u); localStorage.setItem(KEY_NFC, JSON.stringify(l)); } 
}
function findNFC(uid) { return getNFC().find(u=>u.uid===uid); }
function delNFC(uid) { 
    if(confirm("Удалить карту?")) {
        let l = getNFC().filter(u=>u.uid!==uid); 
        localStorage.setItem(KEY_NFC, JSON.stringify(l)); 
        renderLists(); 
    }
}

function getQR() { try { return JSON.parse(localStorage.getItem(KEY_QR)) || []; } catch(e) { return []; } }
function saveQR(t) { 
    let l = getQR(); 
    if(!l.find(x=>x.code===t.code)) { l.push(t); localStorage.setItem(KEY_QR, JSON.stringify(l)); } 
}
function findQR(code) { return getQR().find(t=>t.code===code); }
function markUsed(code) {
    let l = getQR();
    let idx = l.findIndex(t=>t.code===code);
    if(idx!==-1) { l[idx].used=true; localStorage.setItem(KEY_QR, JSON.stringify(l)); }
}

// --- ЛОГИКА NFC ---

async function regNFC() {
    const nameInput = document.getElementById('in-nfc-name');
    const msgEl = document.getElementById('msg-nfc');
    const name = nameInput.value.trim();
    
    if(!name) return alert("Введите имя!");
    if(!('NDEFReader' in window)) return alert("NFC не поддерживается этим браузером.");

    showMsg(msgEl, "Приложите карту...", "info");

    try {
        nfcReader = new NDEFReader();
        await nfcReader.scan();
        
        nfcReader.onreading = e => {
            let uid = e.serialNumber?.toLowerCase();
            if(!uid) { showMsg(msgEl, "UID пустой (скрыт системой)", "err"); stopScan(); return; }
            
            if(findNFC(uid)) { showMsg(msgEl, "Карта уже зарегистрирована!", "err"); stopScan(); return; }
            
            saveNFC({uid, name, time: Date.now()});
            showMsg(msgEl, `✅ Успешно: ${name}`, "ok");
            nameInput.value = '';
            renderLists();
            stopScan();
        };
    } catch(err) {
        showMsg(msgEl, "Ошибка: " + err.message, "err");
    }
}

async function searchNFC() {
    const msgEl = document.getElementById('msg-nfc');
    if(!('NDEFReader' in window)) return alert("NFC нет");
    
    showMsg(msgEl, "Ищу... Приложите карту.", "info");
    try {
        nfcReader = new NDEFReader();
        await nfcReader.scan();
        nfcReader.onreading = e => {
            let uid = e.serialNumber?.toLowerCase();
            const user = findNFC(uid);
            if(user) {
                showMsg(msgEl, `Найден: ${user.name}`, "ok");
                highlightItem(uid); // Прокрутка к элементу
            } else {
                showMsg(msgEl, "Не найден в базе", "err");
            }
            stopScan();
        };
    } catch(err) { showMsg(msgEl, "Ошибка поиска", "err"); }
}

function highlightItem(uid) {
    const list = document.getElementById('list-nfc');
    const items = list.children;
    for(let i=0; i<items.length; i++) {
        if(items[i].getAttribute('data-id') === uid) {
            items[i].scrollIntoView({behavior:'smooth', block:'center'});
            items[i].style.backgroundColor = '#fffbe6';
            setTimeout(() => items[i].style.backgroundColor = '', 2000);
            break;
        }
    }
}

// --- ЛОГИКА QR ---

function genQR() {
    const nameInput = document.getElementById('in-qr-name');
    const name = nameInput.value.trim();
    if(!name) return alert("Введите имя!");

    // Генерируем уникальный код
    let code;
    do {
        code = Math.floor(100000 + Math.random() * 900000).toString();
    } while(findQR(code));

    saveQR({code, name, used:false, time:Date.now()});

    // UI
    document.getElementById('area-qr-result').classList.remove('hidden');
    document.getElementById('txt-qr-name').textContent = name;
    document.getElementById('txt-qr-code').textContent = code;

    const qrBox = document.getElementById('box-qr-img');
    qrBox.innerHTML = '';
    new QRCode(qrBox, {
        text: `XC:${code}`,
        width: 200,
        height: 200
    });
    
    renderLists(); // Обновляем общий список
}

function resetQR() {
    document.getElementById('in-qr-name').value = '';
    document.getElementById('area-qr-result').classList.add('hidden');
}

// --- ЛОГИКА ПРОВЕРКИ ВХОДА ---

async function scanNFCCheck() {
    const msgEl = document.getElementById('msg-check');
    if(!('NDEFReader' in window)) return alert("NFC нет");
    
    showMsg(msgEl, "Жду карту...", "info");
    try {
        nfcReader = new NDEFReader();
        await nfcReader.scan();
        nfcReader.onreading = e => {
            let uid = e.serialNumber?.toLowerCase();
            const user = findNFC(uid);
            if(user) {
                showMsg(msgEl, `✅ Добро пожаловать, ${user.name}!`, "ok");
                vib(true);
            } else {
                showMsg(msgEl, "❌ Карта не найдена", "err");
                vib(false);
            }
            stopScan();
        };
    } catch(err) { showMsg(msgEl, "Ошибка NFC", "err"); }
}

function startCamScan() {
    document.getElementById('cam-container').classList.remove('hidden');
    document.getElementById('msg-check').classList.add('hidden');
    
    qrScanner = new Html5Qrcode("reader-video");
    qrScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 200 }, onQrSuccess, onQrFail)
        .catch(e => { alert("Камера ошибка"); stopCamScan(); });
}

function stopCamScan() {
    if(qrScanner) qrScanner.stop().then(() => document.getElementById('cam-container').classList.add('hidden')).catch(()=>{});
}

function onQrSuccess(txt) {
    stopCamScan();
    const msgEl = document.getElementById('msg-check');
    msgEl.classList.remove('hidden');
    
    if(txt.startsWith('XC:')) {
        const code = txt.split(':')[1];
        const ticket = findQR(code);
        
        if(!ticket) {
            showMsg(msgEl, "❌ Неверный код", "err"); vib(false);
        } else if(ticket.used) {
            showMsg(msgEl, `⛔ Уже использован (${ticket.name})`, "err"); vib(false);
        } else {
            markUsed(ticket.code);
            showMsg(msgEl, `✅ Разрешено: ${ticket.name}`, "ok"); vib(true);
            renderLists();
        }
    } else {
        showMsg(msgEl, "❌ Не наш формат", "err");
    }
}

function onQrFail() {}

// --- ВСПОМОГАТЕЛЬНЫЕ ---

function showMsg(el, text, type) {
    el.textContent = text;
    el.className = 'message';
    if(type==='ok') el.classList.add('msg-ok');
    if(type==='err') el.classList.add('msg-err');
    if(type==='info') el.classList.add('msg-info');
    el.classList.remove('hidden');
}

function stopScan() { if(nfcReader) nfcReader.stopScan().catch(()=>{}); }
function stopAllScans() { stopScan(); stopCamScan(); }
function vib(ok) { if(navigator.vibrate) navigator.vibrate(ok?[100]:[200,100,200]); }
function esc(s) { return s.replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

function renderLists() {
    // Список NFC
    const nfcList = document.getElementById('list-nfc');
    const nfcCnt = document.getElementById('cnt-nfc');
    const users = getNFC();
    nfcList.innerHTML = '';
    nfcCnt.textContent = users.length;
    
    [...users].sort((a,b)=>b.time-a.time).forEach(u => {
        const div = document.createElement('div');
        div.className = 'item-row';
        div.setAttribute('data-id', u.uid);
        div.innerHTML = `
            <div class="info-text"><strong>${esc(u.name)}</strong><span class="meta-text">${u.uid}</span></div>
            <button class="btn-danger" style="width:auto;padding:5px 10px;font-size:0.7rem;" onclick="delNFC('${u.uid}')">✖</button>
        `;
        nfcList.appendChild(div);
    });

    // Общий список (для вкладки List)
    const allList = document.getElementById('list-all');
    const qrTickets = getQR();
    allList.innerHTML = '';
    
    if(qrTickets.length === 0 && users.length === 0) {
        allList.innerHTML = '<p style="color:#aaa;text-align:center">База пуста</p>';
        return;
    }

    // Объединяем для вывода (упрощенно показываем только QR здесь, так как NFC есть во вкладке NFC)
    // Или можно показать оба типа. Давайте покажем QR билеты.
    [...qrTickets].sort((a,b)=>b.time-a.time).forEach(t => {
        const div = document.createElement('div');
        div.className = 'item-row';
        const status = t.used ? '<span style="color:red">USED</span>' : '<span style="color:green">ACTIVE</span>';
        div.innerHTML = `
            <div class="info-text"><strong>${esc(t.name)}</strong><span class="meta-text">${t.code}</span></div>
            <div>${status}</div>
        `;
        allList.appendChild(div);
    });
}

function wipeDB() {
    if(confirm("Удалить ВСЮ базу данных?")) {
        localStorage.removeItem(KEY_NFC);
        localStorage.removeItem(KEY_QR);
        renderLists();
    }
}