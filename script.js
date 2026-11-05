// === НАСТРОЙКИ ===
var KEY_NFC = 'xc_nfc_final';
var KEY_QR = 'xc_qr_final';

// Объекты сканеров. Мы будем присваивать им null при остановке.
var nfcReader = null;
var qrScanner = null;

// Текущая активная вкладка ('nfc', 'qr', 'check', 'db')
var currentTab = ''; 

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    console.log("Xcortex Hard-Clean Loaded");
    
    if(typeof QRCode === 'undefined') alert("Ошибка загрузки QR библиотеки.");
    if(typeof Html5Qrcode === 'undefined') alert("Ошибка загрузки сканера камеры.");

    renderLists();
});

// --- НАВИГАЦИЯ (ЖЕСТКАЯ ОЧИСТКА) ---

function showAdminPanel() {
    document.getElementById('view-login').style.display = 'none';
    document.getElementById('view-admin').style.display = 'block';
    openTabNFC(); 
}

function hideAdminPanel() {
    hardStopEverything(); // Жесткая остановка всего
    document.getElementById('view-admin').style.display = 'none';
    document.getElementById('view-login').style.display = 'block';
    currentTab = ''; 
}

/**
 * ГЛАВНАЯ ФУНКЦИЯ ПЕРЕКЛЮЧЕНИЯ ВКЛАДОК
 */
function safeSwitchTo(newTabName) {
    // 1. Если кликнули по уже активной вкладке — ничего не делаем
    if (currentTab === newTabName) return;

    // 2. ЖЕСТКАЯ ОЧИСТКА ПРЕДЫДУЩИХ ПРОЦЕССОВ
    // Это критически важно! Удаляем объекты и чистим HTML перед сменой таба.
    hardStopEverything();

    // 3. Скрываем ВСЕ панели
    var panels = ['panel-nfc', 'panel-qr', 'panel-check', 'panel-db'];
    for(var i=0; i<panels.length; i++) {
        var el = document.getElementById(panels[i]);
        if(el) el.classList.add('hidden');
    }

    // 4. Убираем подсветку у всех кнопок
    var buttons = ['btn-tab-nfc', 'btn-tab-qr', 'btn-tab-check', 'btn-tab-db'];
    for(var j=0; j<buttons.length; j++) {
        var btn = document.getElementById(buttons[j]);
        if(btn) btn.classList.remove('active');
    }

    // 5. Показываем НОВУЮ панель и подсвечиваем её кнопку
    var targetId = 'panel-' + newTabName;
    var targetBtnId = 'btn-tab-' + newTabName;

    var targetEl = document.getElementById(targetId);
    if (targetEl) targetEl.classList.remove('hidden');

    var targetBtn = document.getElementById(targetBtnId);
    if (targetBtn) targetBtn.classList.add('active');

    // 6. Обновляем трекер
    currentTab = newTabName;

    // 7. Специфичные действия
    if(newTabName === 'db') {
        renderLists();
    }
}

// Обертки для onclick
function openTabNFC() { safeSwitchTo('nfc'); }
function openTabQR() { safeSwitchTo('qr'); }
function openTabCheck() { safeSwitchTo('check'); }
function openTabDB() { safeSwitchTo('db'); }


// --- ФУНКЦИЯ ЖЕСТКОЙ ОСТАНОВКИ (CORE FIX) ---
function hardStopEverything() {
    // 1. Останавливаем NFC Reader
    if (nfcReader) {
        try {
            nfcReader.stopScan();
        } catch(e) {}
        nfcReader = null; // Уничтожаем ссылку на объект
    }

    // 2. Останавливаем Камеру
    if (qrScanner) {
        try {
            qrScanner.stop().catch(function(){});
        } catch(e) {}
        qrScanner = null; // Уничтожаем ссылку на объект
    }

    // 3. Очищаем DOM контейнеров сканеров
    // Это удаляет видео-элемент и любые артефакты из памяти браузера
    var camView = document.getElementById('cam-view');
    if(camView) {
        camView.classList.add('hidden');
        // Находим внутренний div reader-element и очищаем его содержимое
        var innerDiv = document.getElementById('reader-element');
        if(innerDiv) innerDiv.innerHTML = ''; 
    }

    // 4. Сбрасываем сообщения статусов, чтобы не мигали старые
    var msgCheck = document.getElementById('msg-check');
    if(msgCheck) msgCheck.className = 'message-box hidden';
    
    var msgNfc = document.getElementById('msg-nfc');
    if(msgNfc) msgNfc.className = 'message-box hidden';
}


// --- БАЗА ДАННЫХ (LocalStorage Helpers) ---
// (Код без изменений, он рабочий)

function getNFCUsers() { 
    try { return JSON.parse(localStorage.getItem(KEY_NFC)) || []; } 
    catch(e) { return []; } 
}

function saveNFCUser(user) { 
    var list = getNFCUsers(); 
    var exists = false;
    for(var i=0; i<list.length; i++) {
        if(list[i].uid === user.uid) { exists = true; break; }
    }
    if(!exists) { 
        list.push(user); 
        localStorage.setItem(KEY_NFC, JSON.stringify(list)); 
    } 
}

function findNFCUser(uid) { 
    var list = getNFCUsers();
    for(var i=0; i<list.length; i++) {
        if(list[i].uid === uid) return list[i];
    }
    return null;
}

function deleteNFCUser(uid) { 
    if(confirm("Удалить этого пользователя?")) {
        var list = getNFCUsers();
        var newList = [];
        for(var i=0; i<list.length; i++) {
            if(list[i].uid !== uid) newList.push(list[i]);
        }
        localStorage.setItem(KEY_NFC, JSON.stringify(newList)); 
        renderLists(); 
    }
}

function getQRTickets() { 
    try { return JSON.parse(localStorage.getItem(KEY_QR)) || []; } 
    catch(e) { return []; } 
}

function saveQRTicket(ticket) { 
    var list = getQRTickets(); 
    var exists = false;
    for(var i=0; i<list.length; i++) {
        if(list[i].code === ticket.code) { exists = true; break; }
    }
    if(!exists) { 
        list.push(ticket); 
        localStorage.setItem(KEY_QR, JSON.stringify(list)); 
    } 
}

function findQRTicket(code) { 
    var list = getQRTickets();
    for(var i=0; i<list.length; i++) {
        if(list[i].code === code) return list[i];
    }
    return null;
}

function markTicketUsed(code) {
    var list = getQRTickets();
    for(var i=0; i<list.length; i++) {
        if(list[i].code === code) {
            list[i].used = true;
            break;
        }
    }
    localStorage.setItem(KEY_QR, JSON.stringify(list));
}

// --- ЛОГИКА NFC РЕГИСТРАЦИИ ---

function doRegisterNFC() {
    var nameInput = document.getElementById('in-nfc-name');
    var msgEl = document.getElementById('msg-nfc');
    var name = nameInput.value.trim();
    
    if(!name) { alert("Введите ФИО!"); return; }
    if(!('NDEFReader' in window)) { alert("Web NFC не поддерживается этим браузером."); return; }

    showMsg(msgEl, "Приложите карту к телефону...", "info");

    try {
        // Создаем новый экземпляр каждый раз, чтобы избежать утечек памяти
        nfcReader = new NDEFReader();
        
        nfcReader.scan().then(function() {
            nfcReader.onreading = function(event) {
                var uid = event.serialNumber ? event.serialNumber.toLowerCase() : "";
                
                if(!uid) { 
                    showMsg(msgEl, "❌ Ошибка: Браузер скрыл UID карты.", "err"); 
                    stopScanSoft(); 
                    return; 
                }
                
                if(findNFCUser(uid)) { 
                    showMsg(msgEl, "⚠️ Карта уже зарегистрирована!", "err"); 
                    stopScanSoft(); 
                    return; 
                }
                
                saveNFCUser({uid: uid, name: name, time: Date.now()});
                showMsg(msgEl, "✅ Успешно! Имя: " + name, "ok");
                nameInput.value = '';
                renderLists();
                stopScanSoft();
            };
        }).catch(function(err) {
            showMsg(msgEl, "Ошибка запуска NFC: " + err.message, "err");
        });
    } catch(err) {
        showMsg(msgEl, "Ошибка: " + err.message, "err");
    }
}

function doSearchNFC() {
    var msgEl = document.getElementById('msg-nfc');
    if(!('NDEFReader' in window)) { alert("Web NFC не поддерживается."); return; }
    
    showMsg(msgEl, "Ищем клиента... Приложите карту.", "info");
    try {
        nfcReader = new NDEFReader();
        nfcReader.scan().then(function() {
            nfcReader.onreading = function(event) {
                var uid = event.serialNumber ? event.serialNumber.toLowerCase() : "";
                var user = findNFCUser(uid);
                if(user) {
                    showMsg(msgEl, "✅ Найден: " + user.name, "ok");
                    highlightListItem(uid);
                } else {
                    showMsg(msgEl, "❌ Клиент не найден в базе.", "err");
                }
                stopScanSoft();
            };
        }).catch(function(err) { 
            showMsg(msgEl, "Ошибка поиска", "err"); 
        });
    } catch(err) { 
        showMsg(msgEl, "Ошибка", "err"); 
    }
}

function highlightListItem(uid) {
    var listContainer = document.getElementById('list-nfc');
    var items = listContainer.children;
    for(var i = 0; i < items.length; i++) {
        if(items[i].getAttribute('data-id') === uid) {
            items[i].scrollIntoView({behavior:'smooth', block:'center'});
            items[i].style.backgroundColor = '#fffbe6'; 
            setTimeout(function() { items[i].style.backgroundColor = ''; }, 2000);
            break;
        }
    }
}

// --- ЛОГИКА QR ГЕНЕРАЦИИ ---

function doGenerateQR() {
    var nameInput = document.getElementById('in-qr-name');
    var name = nameInput.value.trim();
    if(!name) { alert("Введите ФИО клиента!"); return; }

    var code;
    var isUnique = false;
    while(!isUnique) {
        code = Math.floor(100000 + Math.random() * 900000).toString();
        if(!findQRTicket(code)) isUnique = true;
    } 

    saveQRTicket({code: code, name: name, used:false, time:Date.now()});

    document.getElementById('area-qr-result').classList.remove('hidden');
    document.getElementById('txt-qr-name').textContent = name;
    document.getElementById('txt-qr-code').textContent = code;

    var qrBox = document.getElementById('box-qr-img');
    qrBox.innerHTML = ''; 
    new QRCode(qrBox, {
        text: "XC:" + code,
        width: 150,
        height: 150,
        correctLevel : QRCode.CorrectLevel.H
    });
    
    renderLists(); 
}

function doResetQR() {
    document.getElementById('in-qr-name').value = '';
    document.getElementById('area-qr-result').classList.add('hidden');
}

// --- ЛОГИКА ПРОВЕРКИ ВХОДА ---

function doCheckNFC() {
    var msgEl = document.getElementById('msg-check');
    if(!('NDEFReader' in window)) { alert("Web NFC не поддерживается."); return; }
    
    showMsg(msgEl, "Жду карту посетителя...", "info");
    try {
        nfcReader = new NDEFReader();
        nfcReader.scan().then(function() {
            nfcReader.onreading = function(event) {
                var uid = event.serialNumber ? event.serialNumber.toLowerCase() : "";
                var user = findNFCUser(uid);
                
                if(user) {
                    showMsg(msgEl, "✅ ДОСТУП РАЗРЕШЕН<br>Здравствуйте, " + user.name + "!", "ok");
                    vib(true);
                } else {
                    showMsg(msgEl, "❌ ОТКАЗАНО<br>Карта не найдена в базе.", "err");
                    vib(false);
                }
                stopScanSoft();
            };
        }).catch(function(err) { 
            showMsg(msgEl, "Ошибка NFC: " + err.message, "err"); 
        });
    } catch(err) { 
        showMsg(msgEl, "Ошибка", "err"); 
    }
}

function doStartCamera() {
    document.getElementById('cam-view').classList.remove('hidden');
    document.getElementById('msg-check').classList.add('hidden');
    
    // Создаем новый экземпляр сканера
    qrScanner = new Html5Qrcode("reader-element");
    
    qrScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 150 }, onQrSuccess, onQrFail)
        .catch(function(e) { 
            alert("Ошибка доступа к камере: " + e); 
            doStopCameraHard(); 
        });
}

function doStopCameraHard() {
    if(qrScanner) {
        qrScanner.stop().then(function() {
            document.getElementById('cam-view').classList.add('hidden');
            document.getElementById('reader-element').innerHTML = ''; 
            qrScanner = null; // Уничтожаем объект
        }).catch(function(){
             document.getElementById('cam-view').classList.add('hidden');
             document.getElementById('reader-element').innerHTML = '';
             qrScanner = null;
        });
    }
}

function onQrSuccess(decodedText) {
    doStopCameraHard(); // Сразу убиваем камеру после успеха
    
    var msgEl = document.getElementById('msg-check');
    msgEl.classList.remove('hidden');
    
    if(decodedText.indexOf("XC:") === 0) {
        var parts = decodedText.split(":");
        var code = parts[1];
        var ticket = findQRTicket(code);
        
        if(!ticket) {
            showMsg(msgEl, "❌ НЕВЕРНЫЙ КОД<br>Такого билета нет в базе.", "err"); 
            vib(false);
        } else if(ticket.used) {
            showMsg(msgEl, "⛔ УЖЕ ИСПОЛЬЗОВАН<br>(" + ticket.name + ")", "err"); 
            vib(false);
        } else {
            markTicketUsed(ticket.code);
            showMsg(msgEl, "✅ ДОСТУП РАЗРЕШЕН<br>Клиент: " + ticket.name, "ok"); 
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

// Мягкая остановка только NFC (для использования внутри функций регистрации)
function stopScanSoft() { 
    if(nfcReader) {
        try { nfcReader.stopScan(); } catch(e){}
        nfcReader = null;
    }
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
    var nfcListEl = document.getElementById('list-nfc');
    var nfcCountEl = document.getElementById('cnt-nfc');
    var users = getNFCUsers();
    
    nfcListEl.innerHTML = '';
    nfcCountEl.textContent = users.length;
    
    var sortedUsers = users.slice().reverse(); 
    
    for(var i=0; i<sortedUsers.length; i++) {
        var user = sortedUsers[i];
        var div = document.createElement('div');
        div.className = 'list-item';
        div.setAttribute('data-id', user.uid);
        
        div.innerHTML = '<div class="item-info"><strong>' + escapeHtml(user.name) + '</strong><span class="item-meta">' + user.uid + '</span></div>' +
                        '<button class="btn-danger btn-small" onclick="deleteNFCUser(\'' + user.uid + '\')">✖</button>';
        nfcListEl.appendChild(div);
    }

    // 2. Общий список QR билетов
    var dbListEl = document.getElementById('list-db');
    var dbCountEl = document.getElementById('cnt-all');
    var tickets = getQRTickets();
    
    dbListEl.innerHTML = '';
    dbCountEl.textContent = tickets.length;
    
    if(tickets.length === 0 && users.length === 0) {
        dbListEl.innerHTML = '<p style="color:#aaa;text-align:center;padding:20px;">База данных пуста.</p>';
        return;
    }

    var sortedTickets = tickets.slice().reverse();

    for(var j=0; j<sortedTickets.length; j++) {
        var ticket = sortedTickets[j];
        var div2 = document.createElement('div');
        div2.className = 'list-item';
        var statusColor = ticket.used ? '#e53e3e' : '#38a169';
        var statusText = ticket.used ? 'USED' : 'ACTIVE';
        
        div2.innerHTML = '<div class="item-info"><strong>' + escapeHtml(ticket.name) + '</strong><span class="item-meta">Code: ' + ticket.code + '</span></div>' +
                         '<span style="font-weight:bold; color:' + statusColor + '; font-size:0.8rem;">' + statusText + '</span>';
        dbListEl.appendChild(div2);
    }
}

function doWipeDB() {
    if(confirm("ВНИМАНИЕ: Вы уверены, что хотите удалить ВСЮ базу данных?\nЭто действие необратимо.")) {
        localStorage.removeItem(KEY_NFC);
        localStorage.removeItem(KEY_QR);
        renderLists();
        alert("База очищена.");
    }
}