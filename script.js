// === НАСТРОЙКИ ===
var KEY_NFC = 'xc_nfc_final';
var KEY_QR = 'xc_qr_final';

var nfcReader = null;
var qrScanner = null;

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
    console.log("Xcortex OldSchool Loaded");
    
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

// --- НАВИГАЦИЯ (РУЧНАЯ ДЛЯ КАЖДОЙ ВКЛАДКИ) ---

function showAdminPanel() {
    document.getElementById('view-login').style.display = 'none';
    document.getElementById('view-admin').style.display = 'block';
    // По умолчанию открываем NFC
    openTabNFC(); 
}

function hideAdminPanel() {
    stopAllScans();
    document.getElementById('view-admin').style.display = 'none';
    document.getElementById('view-login').style.display = 'block';
}

// Функция очистки всех панелей перед открытием новой
function clearPanels() {
    // Скрываем все секции
    document.getElementById('panel-nfc').classList.add('hidden');
    document.getElementById('panel-qr').classList.add('hidden');
    document.getElementById('panel-check').classList.add('hidden');
    document.getElementById('panel-db').classList.add('hidden');
    
    // Убираем активный класс у всех кнопок меню
    document.getElementById('btn-tab-nfc').classList.remove('active');
    document.getElementById('btn-tab-qr').classList.remove('active');
    document.getElementById('btn-tab-check').classList.remove('active');
    document.getElementById('btn-tab-db').classList.remove('active');
    
    // Останавливаем сканеры
    stopAllScans();
}

// Открытие вкладки NFC
function openTabNFC() {
    clearPanels();
    document.getElementById('panel-nfc').classList.remove('hidden');
    document.getElementById('btn-tab-nfc').classList.add('active');
}

// Открытие вкладки QR
function openTabQR() {
    clearPanels();
    document.getElementById('panel-qr').classList.remove('hidden');
    document.getElementById('btn-tab-qr').classList.add('active');
}

// Открытие вкладки Проверка
function openTabCheck() {
    clearPanels();
    document.getElementById('panel-check').classList.remove('hidden');
    document.getElementById('btn-tab-check').classList.add('active');
}

// Открытие вкладки База
function openTabDB() {
    clearPanels();
    document.getElementById('panel-db').classList.remove('hidden');
    document.getElementById('btn-tab-db').classList.add('active');
    renderLists(); // Обновляем список при открытии базы
}

// --- БАЗА ДАННЫХ (LocalStorage Helpers) ---

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
        nfcReader = new NDEFReader();
        nfcReader.scan().then(function() {
            nfcReader.onreading = function(event) {
                var uid = event.serialNumber ? event.serialNumber.toLowerCase() : "";
                
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
                
                saveNFCUser({uid: uid, name: name, time: Date.now()});
                showMsg(msgEl, "✅ Успешно! Имя: " + name, "ok");
                nameInput.value = '';
                renderLists();
                stopScan();
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
                stopScan();
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
                stopScan();
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
    
    qrScanner = new Html5Qrcode("reader-element");
    qrScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 150 }, onQrSuccess, onQrFail)
        .catch(function(e) { 
            alert("Ошибка доступа к камере: " + e); 
            doStopCamera(); 
        });
}

function doStopCamera() {
    if(qrScanner) {
        qrScanner.stop().then(function() {
            document.getElementById('cam-view').classList.add('hidden');
        }).catch(function(){
             document.getElementById('cam-view').classList.add('hidden');
        });
    }
}

function onQrSuccess(decodedText) {
    doStopCamera();
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

function stopScan() { 
    if(nfcReader) nfcReader.stopScan().catch(function(){}); 
}

function stopAllScans() { 
    stopScan(); 
    doStopCamera(); 
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
    
    // Сортировка простая (разворот массива)
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