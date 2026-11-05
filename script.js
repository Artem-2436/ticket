// === НАСТРОЙКИ И СОСТОЯНИЕ ===
var KEY_NFC = 'xc_nfc_final';
var KEY_QR = 'xc_qr_final';

var nfcReader = null;      // Объект считывателя NFC
var qrScanner = null;      // Объект сканера камеры
var currentTab = '';       // Текущая активная вкладка ('nfc', 'qr', 'check', 'db')
var isProcessing = false;  // Флаг защиты от двойных кликов во время операций

document.addEventListener('DOMContentLoaded', function() {
    console.log("Xcortex System Initialized");
    
    // Проверка загрузки библиотек
    if(typeof QRCode === 'undefined') {
        alert("Ошибка: Библиотека QRCode не загружена.");
        return;
    }
    if(typeof Html5Qrcode === 'undefined') {
        alert("Ошибка: Библиотека Html5Qrcode не загружена.");
        return;
    }

    renderLists();
});

// --- НАВИГАЦИЯ И ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК ---

function showAdminPanel() {
    document.getElementById('view-login').style.display = 'none';
    document.getElementById('view-admin').style.display = 'block';
    // По умолчанию открываем первую вкладку NFC
    safeSwitchTo('nfc'); 
}

function hideAdminPanel() {
    stopAllScans(true); // Полная очистка при выходе
    document.getElementById('view-admin').style.display = 'none';
    document.getElementById('view-login').style.display = 'block';
    currentTab = ''; 
}

/**
 * Универсальная функция безопасного переключения вкладок.
 * Критически важно: сначала останавливаем все процессы, потом меняем UI.
 */
function safeSwitchTo(newTabName) {
    // Защита от повторного входа в ту же вкладку
    if (currentTab === newTabName && !isProcessing) return;

    // 1. ЖЕСТКАЯ ОСТАНОВКА ВСЕХ АППАРАТНЫХ ПРОЦЕССОВ (NFC/Camera)
    stopAllScans(false); 

    // 2. Определение ID целевой панели
    var targetPanelId = '';
    switch(newTabName) {
        case 'nfc':   targetPanelId = 'panel-nfc'; break;
        case 'qr':    targetPanelId = 'panel-qr'; break;
        case 'check': targetPanelId = 'panel-check'; break;
        case 'db':    targetPanelId = 'panel-db'; break;
        default: return;
    }

    // 3. Список всех возможных панелей и кнопок для очистки состояния
    var allPanels = ['panel-nfc', 'panel-qr', 'panel-check', 'panel-db'];
    var allButtons = ['btn-tab-nfc', 'btn-tab-qr', 'btn-tab-check', 'btn-tab-db'];

    // 4. Скрываем ВСЕ панели
    allPanels.forEach(function(pid) {
        var el = document.getElementById(pid);
        if(el) el.classList.add('hidden');
    });

    // 5. Убираем статус 'active' со всех кнопок
    allButtons.forEach(function(bid) {
        var btn = document.getElementById(bid);
        if(btn) btn.classList.remove('active');
    });

    // 6. Показываем ЦЕЛЕВУЮ панель
    var targetEl = document.getElementById(targetPanelId);
    if (targetEl) {
        targetEl.classList.remove('hidden');
    }

    // 7. Активируем соответствующую кнопку
    var targetBtnId = 'btn-tab-' + newTabName;
    var targetBtn = document.getElementById(targetBtnId);
    if (targetBtn) {
        targetBtn.classList.add('active');
    }

    // 8. Обновляем трекер текущей вкладки
    currentTab = newTabName;

    // 9. Специфичные действия после переключения
    if(newTabName === 'db') {
        renderLists();
    }
}

// Обертки для HTML onclick
function openTabNFC() { safeSwitchTo('nfc'); }
function openTabQR() { safeSwitchTo('qr'); }
function openTabCheck() { safeSwitchTo('check'); }
function openTabDB() { safeSwitchTo('db'); }


// --- БАЗА ДАННЫХ (LocalStorage Helpers) ---

function getNFCUsers() { 
    try { return JSON.parse(localStorage.getItem(KEY_NFC)) || []; } 
    catch(e) { return []; } 
}

function saveNFCUser(user) { 
    var list = getNFCUsers(); 
    var exists = list.some(u => u.uid === user.uid);
    if(!exists) { 
        list.push(user); 
        localStorage.setItem(KEY_NFC, JSON.stringify(list)); 
    } 
}

function findNFCUser(uid) { 
    var list = getNFCUsers();
    return list.find(u => u.uid === uid) || null;
}

function deleteNFCUser(uid) { 
    if(confirm("Удалить этого пользователя?")) {
        var list = getNFCUsers().filter(u => u.uid !== uid);
        localStorage.setItem(KEY_NFC, JSON.stringify(list)); 
        renderLists(); 
    }
}

function getQRTickets() { 
    try { return JSON.parse(localStorage.getItem(KEY_QR)) || []; } 
    catch(e) { return []; } 
}

function saveQRTicket(ticket) { 
    var list = getQRTickets(); 
    var exists = list.some(t => t.code === ticket.code);
    if(!exists) { 
        list.push(ticket); 
        localStorage.setItem(KEY_QR, JSON.stringify(list)); 
    } 
}

function findQRTicket(code) { 
    var list = getQRTickets();
    return list.find(t => t.code === code) || null;
}

function markTicketUsed(code) {
    var list = getQRTickets();
    var idx = list.findIndex(t => t.code === code);
    if(idx > -1) {
        list[idx].used = true;
        localStorage.setItem(KEY_QR, JSON.stringify(list));
    }
}

// --- ЛОГИКА NFC РЕГИСТРАЦИИ И ПОИСКА ---

function doRegisterNFC() {
    if(isProcessing) return; // Защита от многократных запусков
    
    var nameInput = document.getElementById('in-nfc-name');
    var msgEl = document.getElementById('msg-nfc');
    var name = nameInput.value.trim();
    
    if(!name) { alert("Введите ФИО!"); return; }
    if(!('NDEFReader' in window)) { alert("Web NFC не поддерживается этим браузером."); return; }

    isProcessing = true;
    showMsg(msgEl, "Приложите карту к телефону...", "info");

    try {
        nfcReader = new NDEFReader();
        nfcReader.scan().then(function() {
            nfcReader.onreading = function(event) {
                // Получаем UID (если доступен)
                var uid = event.serialNumber ? event.serialNumber.toLowerCase() : "";
                
                if(!uid) { 
                    showMsg(msgEl, "❌ Ошибка: Браузер скрыл UID карты.", "err"); 
                    cleanupNFC(); 
                    return; 
                }
                
                if(findNFCUser(uid)) { 
                    showMsg(msgEl, "⚠️ Карта уже зарегистрирована!", "err"); 
                    cleanupNFC(); 
                    return; 
                }
                
                saveNFCUser({uid: uid, name: name, time: Date.now()});
                showMsg(msgEl, "✅ Успешно! Имя: " + name, "ok");
                nameInput.value = '';
                renderLists();
                cleanupNFC();
            };
            
            // Таймаут ожидания сканирования (опционально, можно убрать если мешает)
            // setTimeout(() => { if(isProcessing) { showMsg(msgEl, "Тайм-аут. Попробуйте снова.", "err"); cleanupNFC(); } }, 15000);

        }).catch(function(err) {
            showMsg(msgEl, "Ошибка запуска NFC: " + err.message, "err");
            isProcessing = false;
        });
    } catch(err) {
        showMsg(msgEl, "Ошибка: " + err.message, "err");
        isProcessing = false;
    }
}

function doSearchNFC() {
    if(isProcessing) return;
    var msgEl = document.getElementById('msg-nfc');
    if(!('NDEFReader' in window)) { alert("Web NFC не поддерживается."); return; }
    
    isProcessing = true;
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
                cleanupNFC();
            };
        }).catch(function(err) { 
            showMsg(msgEl, "Ошибка поиска: " + err.message, "err"); 
            isProcessing = false;
        });
    } catch(err) { 
        showMsg(msgEl, "Ошибка системы", "err"); 
        isProcessing = false;
    }
}

function highlightListItem(uid) {
    var listContainer = document.getElementById('list-nfc');
    if(!listContainer) return;
    var items = listContainer.children;
    for(var i = 0; i < items.length; i++) {
        if(items[i].getAttribute('data-id') === uid) {
            items[i].scrollIntoView({behavior:'smooth', block:'center'});
            items[i].style.backgroundColor = '#fffbe6'; 
            setTimeout(function() { 
                if(items[i]) items[i].style.backgroundColor = ''; 
            }, 2000);
            break;
        }
    }
}

// Внутренняя очистка NFC ресурсов
function cleanupNFC() {
    if(nfcReader) {
        nfcReader.stopScan().catch(function(){});
        nfcReader = null;
    }
    isProcessing = false;
}

// --- ЛОГИКА QR ГЕНЕРАЦИИ ---

function doGenerateQR() {
    var nameInput = document.getElementById('in-qr-name');
    var name = nameInput.value.trim();
    if(!name) { alert("Введите ФИО клиента!"); return; }

    var code;
    var isUnique = false;
    // Генерация уникального кода
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

// --- ЛОГИКА ПРОВЕРКИ ВХОДА (CHECK TAB) ---

function doCheckNFC() {
    if(isProcessing) return;
    var msgEl = document.getElementById('msg-check');
    if(!('NDEFReader' in window)) { alert("Web NFC не поддерживается."); return; }
    
    isProcessing = true;
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
                cleanupNFC();
            };
        }).catch(function(err) { 
            showMsg(msgEl, "Ошибка NFC: " + err.message, "err"); 
            isProcessing = false;
        });
    } catch(err) { 
        showMsg(msgEl, "Ошибка системы", "err"); 
        isProcessing = false;
    }
}

function doStartCamera() {
    if(isProcessing) return;
    
    var camView = document.getElementById('cam-view');
    var msgEl = document.getElementById('msg-check');
    
    camView.classList.remove('hidden');
    msgEl.classList.add('hidden');
    
    isProcessing = true;
    
    // Создаем экземпляр сканера
    qrScanner = new Html5Qrcode("reader-element");
    
    qrScanner.start(
        { facingMode: "environment" }, 
        { fps: 10, qrbox: 150 }, 
        onQrSuccess, 
        onQrFail
    ).catch(function(e) { 
        alert("Ошибка доступа к камере: " + e); 
        doStopCamera(); 
    });
}

function doStopCamera() {
    if(qrScanner) {
        var scannerRef = qrScanner; // Сохраняем ссылку, чтобы избежать гонок данных
        
        // Пробуем остановить. Важно дождаться Promise, чтобы освободить камеру
        scannerRef.stop().then(function() {
            finishCameraCleanup(scannerRef);
        }).catch(function() {
            // Если ошибка при остановке, всё равно чистим DOM
            finishCameraCleanup(scannerRef);
        });
    } else {
        finishCameraCleanup(null);
    }
}

// Вспомогательная функция для гарантированной очистки камеры
function finishCameraCleanup(scannerObj) {
    var camView = document.getElementById('cam-view');
    var readerDiv = document.getElementById('reader-element');
    
    if(camView) camView.classList.add('hidden');
    if(readerDiv) readerDiv.innerHTML = ''; // Удаляем видео поток из DOM
    
    qrScanner = null;
    isProcessing = false;
}

function onQrSuccess(decodedText) {
    // Немедленно останавливаем камеру, чтобы не спамить событиями
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

function onQrFail(error) {
    // Игнорируем временные ошибки распознавания, пока не будет success или manual stop
}

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

function showMsg(element, text, type) {
    if(!element) return;
    element.textContent = text;
    element.className = 'message-box'; 
    if(type === 'ok') element.classList.add('msg-ok');
    if(type === 'err') element.classList.add('msg-err');
    if(type === 'info') element.classList.add('msg-info');
    element.classList.remove('hidden');
}

// Главная функция остановки всего. Вызывается при смене таба или выходе.
// forceClear: true - полная очистка (выход), false - мягкая (смена таба)
function stopAllScans(forceClear) {
    // 1. Останавливаем NFC
    if(nfcReader) {
        nfcReader.stopScan().catch(function(){});
        nfcReader = null;
    }
    
    // 2. Останавливаем Камеру
    if(qrScanner) {
        // Используем наш безопасный метод остановки
        doStopCamera();
    } else {
        // Если qrScanner был null, но DOM элементы остались (баг прошлого раза)
        var camView = document.getElementById('cam-view');
        var readerDiv = document.getElementById('reader-element');
        if(camView) camView.classList.add('hidden');
        if(readerDiv) readerDiv.innerHTML = '';
    }
    
    // 3. Сбрасываем флаг занятости
    isProcessing = false;
}

function vib(success) { 
    if(navigator.vibrate) navigator.vibrate(success ? [100] : [200, 100, 200]); 
}

function escapeHtml(text) {
    if (!text) return '';
    return text.toString()
               .replace(/&/g, "&amp;")
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
    
    if(nfcListEl) nfcListEl.innerHTML = '';
    if(nfcCountEl) nfcCountEl.textContent = users.length;
    
    var sortedUsers = users.slice().reverse(); 
    
    for(var i=0; i<sortedUsers.length; i++) {
        var user = sortedUsers[i];
        var div = document.createElement('div');
        div.className = 'list-item';
        div.setAttribute('data-id', user.uid);
        
        // Безопасное формирование HTML строки
        var infoHtml = '<div class="item-info"><strong>' + escapeHtml(user.name) + '</strong><span class="item-meta">' + escapeHtml(user.uid) + '</span></div>';
        var btnHtml = '<button class="btn-danger btn-small" onclick="deleteNFCUser(\'' + user.uid + '\')">✖</button>';
        
        div.innerHTML = infoHtml + btnHtml;
        nfcListEl.appendChild(div);
    }

    // 2. Общий список QR билетов
    var dbListEl = document.getElementById('list-db');
    var dbCountEl = document.getElementById('cnt-all');
    var tickets = getQRTickets();
    
    if(dbListEl) dbListEl.innerHTML = '';
    if(dbCountEl) dbCountEl.textContent = tickets.length;
    
    if(tickets.length === 0 && users.length === 0) {
        if(dbListEl) dbListEl.innerHTML = '<p style="color:#aaa;text-align:center;padding:20px;">База данных пуста.</p>';
        return;
    }

    var sortedTickets = tickets.slice().reverse();

    for(var j=0; j<sortedTickets.length; j++) {
        var ticket = sortedTickets[j];
        var div2 = document.createElement('div');
        div2.className = 'list-item';
        var statusColor = ticket.used ? '#e53e3e' : '#38a169';
        var statusText = ticket.used ? 'USED' : 'ACTIVE';
        
        var infoHtml2 = '<div class="item-info"><strong>' + escapeHtml(ticket.name) + '</strong><span class="item-meta">Code: ' + escapeHtml(ticket.code) + '</span></div>';
        var statusHtml = '<span style="font-weight:bold; color:' + statusColor + '; font-size:0.8rem;">' + statusText + '</span>';
        
        div2.innerHTML = infoHtml2 + statusHtml;
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