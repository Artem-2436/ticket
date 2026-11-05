// === НАСТРОЙКИ И ГЛОБАЛЬНОЕ СОСТОЯНИЕ ===
var KEY_NFC = 'xc_nfc_final';
var KEY_QR = 'xc_qr_final';

// Хранилище объектов оборудования. 
// Важно: они должны быть null, когда оборудование свободно.
var nfcReaderInstance = null; 
var qrScannerInstance = null; 

// Текущая активная вкладка ('', 'nfc', 'qr', 'check', 'db')
var currentActiveTab = ''; 

document.addEventListener('DOMContentLoaded', function() {
    console.log("Xcortex Engine v2.0 Loaded");
    
    // Проверка библиотек
    if(typeof QRCode === 'undefined') {
        alert("Критическая ошибка: Библиотека QRCode не найдена.");
        return;
    }
    if(typeof Html5Qrcode === 'undefined') {
        alert("Критическая ошибка: Библиотека Html5Qrcode не найдена.");
        return;
    }

    renderLists();
});

// --- ЯДРО НАВИГАЦИИ (БЕЗОПАСНОЕ ПЕРЕКЛЮЧЕНИЕ) ---

/**
 * Главная функция переключения.
 * Логика: СНАЧАЛА стоп железо -> ПОТОМ скрываем старые панели -> ПОТОМ показываем новые.
 */
function switchTab(targetTabName) {
    // 1. Защита: если та же вкладка открыта, ничего не делаем
    if (currentActiveTab === targetTabName) return;

    // 2. ЖЕСТКАЯ ОЧИСТКА РЕСУРСОВ (NFC & CAMERA)
    // Мы вызываем эту функцию синхронно, она пытается остановить всё максимально быстро
    hardStopHardware();

    // 3. ОБНОВЛЕНИЕ VISUAL STATE (DOM)
    var panelsMap = {
        'nfc': 'panel-nfc',
        'qr': 'panel-qr',
        'check': 'panel-check',
        'db': 'panel-db'
    };
    
    var buttonsMap = {
        'nfc': 'btn-tab-nfc',
        'qr': 'btn-tab-qr',
        'check': 'btn-tab-check',
        'db': 'btn-tab-db'
    };

    // Скрываем ВСЕ панели
    Object.values(panelsMap).forEach(function(panelId) {
        var el = document.getElementById(panelId);
        if(el) el.classList.add('hidden');
    });

    // Деактивируем ВСЕ кнопки
    Object.values(buttonsMap).forEach(function(btnId) {
        var btn = document.getElementById(btnId);
        if(btn) btn.classList.remove('active');
    });

    // Показываем ЦЕЛЕВУЮ панель
    var targetPanelId = panelsMap[targetTabName];
    if(targetPanelId) {
        var targetEl = document.getElementById(targetPanelId);
        if(targetEl) targetEl.classList.remove('hidden');
    }

    // Активируем ЦЕЛЕВУЮ кнопку
    var targetBtnId = buttonsMap[targetTabName];
    if(targetBtnId) {
        var targetBtn = document.getElementById(targetBtnId);
        if(targetBtn) targetBtn.classList.add('active');
    }

    // Обновляем состояние
    currentActiveTab = targetTabName;

    // Специфичные действия
    if(targetTabName === 'db') {
        renderLists();
    }
}

// Обертки для HTML onclick
function openTabNFC() { switchTab('nfc'); }
function openTabQR() { switchTab('qr'); }
function openTabCheck() { switchTab('check'); }
function openTabDB() { switchTab('db'); }

function showAdminPanel() {
    document.getElementById('view-login').style.display = 'none';
    document.getElementById('view-admin').style.display = 'block';
    switchTab('nfc'); 
}

function hideAdminPanel() {
    hardStopHardware(); // Стоп железа перед выходом
    document.getElementById('view-admin').style.display = 'none';
    document.getElementById('view-login').style.display = 'block';
    currentActiveTab = ''; 
}

/**
 * Функция принудительной остановки всех аппаратных модулей.
 * Вызывается при любом переключении вкладок или выходе.
 * Не использует await/Promise chains для изменения DOM, чтобы избежать зависаний UI.
 */
function hardStopHardware() {
    // 1. STOP NFC
    if (nfcReaderInstance) {
        try {
            // Пытаемся остановить скан. Если ошибка (уже остановлен/нет доступа) - игнорируем.
            nfcReaderInstance.stopScan().catch(function(err) {
                console.warn("NFC stop warning:", err);
            });
        } catch (e) {
            console.error("NFC exception during stop:", e);
        } finally {
            // ГАРАНТИРОВАННО обнуляем ссылку, чтобы GC освободил память
            nfcReaderInstance = null; 
        }
    }

    // 2. STOP CAMERA
    if (qrScannerInstance) {
        try {
            // Метод stop() возвращает Promise. 
            // Мы НЕ ждем его завершения для смены вкладки, иначе UI зависнет.
            // Вместо этого мы немедленно убираем видео из DOM ниже.
            qrScannerInstance.stop().catch(function(err) {
                console.warn("Camera stop warning:", err);
            });
        } catch (e) {
            console.error("Camera exception during stop:", e);
        } finally {
            // ГАРАНТИРОВАННО обнуляем ссылку
            qrScannerInstance = null;
            
            // Немедленно чистим DOM камеры, чтобы браузер отпустил поток
            var camView = document.getElementById('cam-view');
            var readerDiv = document.getElementById('reader-element');
            
            if(camView) camView.classList.add('hidden');
            if(readerDiv) readerDiv.innerHTML = ''; 
        }
    }
}

// --- БАЗА ДАННЫХ (LocalStorage Helpers) ---

function getNFCUsers() { 
    try { return JSON.parse(localStorage.getItem(KEY_NFC)) || []; } 
    catch(e) { return []; } 
}

function saveNFCUser(user) { 
    var list = getNFCUsers(); 
    // Оптимизированная проверка существования
    var exists = list.some(item => item.uid === user.uid);
    if(!exists) { 
        list.push(user); 
        localStorage.setItem(KEY_NFC, JSON.stringify(list)); 
    } 
}

function findNFCUser(uid) { 
    var list = getNFCUsers();
    return list.find(item => item.uid === uid) || null;
}

function deleteNFCUser(uid) { 
    if(confirm("Удалить пользователя?")) {
        var list = getNFCUsers().filter(item => item.uid !== uid);
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
    var exists = list.some(item => item.code === ticket.code);
    if(!exists) { 
        list.push(ticket); 
        localStorage.setItem(KEY_QR, JSON.stringify(list)); 
    } 
}

function findQRTicket(code) { 
    var list = getQRTickets();
    return list.find(item => item.code === code) || null;
}

function markTicketUsed(code) {
    var list = getQRTickets();
    var index = list.findIndex(item => item.code === code);
    if(index > -1) {
        list[index].used = true;
        localStorage.setItem(KEY_QR, JSON.stringify(list));
    }
}
// --- ЛОГИКА NFC РЕГИСТРАЦИИ И ПОИСКА ---

function doRegisterNFC() {
    var nameInput = document.getElementById('in-nfc-name');
    var msgEl = document.getElementById('msg-nfc');
    var name = nameInput.value.trim();
    
    if(!name) { alert("Введите ФИО!"); return; }
    if(!('NDEFReader' in window)) { alert("Web NFC не поддерживается этим устройством."); return; }

    // Проверяем, не занят ли уже ридер (на всякий случай)
    if(nfcReaderInstance) {
        hardStopHardware();
    }

    showMsg(msgEl, "Приложите карту...", "info");

    try {
        // Создаем новый экземпляр каждый раз, чтобы избежать залипания состояния
        nfcReaderInstance = new NDEFReader();
        
        nfcReaderInstance.scan().then(function() {
            nfcReaderInstance.onreading = function(event) {
                var uid = event.serialNumber ? event.serialNumber.toLowerCase() : "";
                
                if(!uid) { 
                    showMsg(msgEl, "❌ UID недоступен", "err"); 
                    cleanupNFCOperation(); 
                    return; 
                }
                
                if(findNFCUser(uid)) { 
                    showMsg(msgEl, "⚠️ Карта уже есть!", "err"); 
                    cleanupNFCOperation(); 
                    return; 
                }
                
                saveNFCUser({uid: uid, name: name, time: Date.now()});
                showMsg(msgEl, "✅ Успех: " + name, "ok");
                nameInput.value = '';
                renderLists();
                cleanupNFCOperation();
            };
        }).catch(function(err) {
            showMsg(msgEl, "Ошибка NFC: " + err.message, "err");
            cleanupNFCOperation();
        });
    } catch(err) {
        showMsg(msgEl, "Системная ошибка: " + err.message, "err");
        cleanupNFCOperation();
    }
}

function doSearchNFC() {
    var msgEl = document.getElementById('msg-nfc');
    if(!('NDEFReader' in window)) { alert("NFC не поддерживается."); return; }
    
    if(nfcReaderInstance) hardStopHardware();

    showMsg(msgEl, "Поиск клиента...", "info");
    
    try {
        nfcReaderInstance = new NDEFReader();
        nfcReaderInstance.scan().then(function() {
            nfcReaderInstance.onreading = function(event) {
                var uid = event.serialNumber ? event.serialNumber.toLowerCase() : "";
                var user = findNFCUser(uid);
                
                if(user) {
                    showMsg(msgEl, "✅ Найден: " + user.name, "ok");
                    highlightListItem(uid);
                } else {
                    showMsg(msgEl, "❌ Не найден.", "err");
                }
                cleanupNFCOperation();
            };
        }).catch(function(err) { 
            showMsg(msgEl, "Ошибка поиска", "err"); 
            cleanupNFCOperation();
        });
    } catch(err) { 
        showMsg(msgEl, "Ошибка", "err"); 
        cleanupNFCOperation();
    }
}

// Внутренняя очистка после успешного или неудачного чтения NFC
function cleanupNFCOperation() {
    if(nfcReaderInstance) {
        try {
            nfcReaderInstance.stopScan().catch(function(){});
        } catch(e){}
        nfcReaderInstance = null;
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

// --- ЛОГИКА QR ГЕНЕРАЦИИ ---

function doGenerateQR() {
    var nameInput = document.getElementById('in-qr-name');
    var name = nameInput.value.trim();
    if(!name) { alert("Введите имя!"); return; }

    var code;
    var unique = false;
    while(!unique) {
        code = Math.floor(100000 + Math.random() * 900000).toString();
        if(!findQRTicket(code)) unique = true;
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
    var msgEl = document.getElementById('msg-check');
    if(!('NDEFReader' in window)) { alert("NFC не поддерживается."); return; }
    
    if(nfcReaderInstance) hardStopHardware();

    showMsg(msgEl, "Жду карту посетителя...", "info");
    
    try {
        nfcReaderInstance = new NDEFReader();
        nfcReaderInstance.scan().then(function() {
            nfcReaderInstance.onreading = function(event) {
                var uid = event.serialNumber ? event.serialNumber.toLowerCase() : "";
                var user = findNFCUser(uid);
                
                if(user) {
                    showMsg(msgEl, "✅ ДОСТУП РАЗРЕШЕН<br>" + user.name, "ok");
                    vib(true);
                } else {
                    showMsg(msgEl, "❌ ОТКАЗАНО<br>Нет в базе.", "err");
                    vib(false);
                }
                cleanupNFCOperation();
            };
        }).catch(function(err) { 
            showMsg(msgEl, "Ошибка NFC", "err"); 
            cleanupNFCOperation();
        });
    } catch(err) { 
        showMsg(msgEl, "Ошибка системы", "err"); 
        cleanupNFCOperation();
    }
}

function doStartCamera() {
    // Если камера уже запущена (редкость, но защита), сначала стоп
    if(qrScannerInstance) {
        hardStopHardware();
    }

    var camView = document.getElementById('cam-view');
    var msgEl = document.getElementById('msg-check');
    
    camView.classList.remove('hidden');
    msgEl.classList.add('hidden');
    
    try {
        qrScannerInstance = new Html5Qrcode("reader-element");
        
        qrScannerInstance.start(
            { facingMode: "environment" }, 
            { fps: 10, qrbox: 150 }, 
            onQrSuccess, 
            onQrFail
        ).catch(function(e) { 
            alert("Ошибка камеры: " + e); 
            // При ошибке запуска тоже нужно почиститься
            if(qrScannerInstance) {
                 try{ qrScannerInstance.stop(); }catch(ex){}
                 qrScannerInstance = null;
            }
            camView.classList.add('hidden');
        });
    } catch(e) {
        alert("Критическая ошибка инициализации камеры");
        if(qrScannerInstance) qrScannerInstance = null;
        camView.classList.add('hidden');
    }
}

function doStopCamera() {
    // Эта кнопка вызывает ручную остановку, но логику очистки выносим в hardStopHardware
    // чтобы код был единым источником правды
    hardStopHardware();
}

function onQrSuccess(decodedText) {
    // 1. Немедленно останавливаем камеру, чтобы прекратить цикл обработки кадров
    // Используем прямую остановку экземпляра, так как мы знаем, что он существует
    if(qrScannerInstance) {
        qrScannerInstance.stop().catch(function(){});
        qrScannerInstance = null; // Обнуляем сразу
        
        // Чистим DOM вручную здесь же, не дожидаясь next tick
        var camView = document.getElementById('cam-view');
        var readerDiv = document.getElementById('reader-element');
        if(camView) camView.classList.add('hidden');
        if(readerDiv) readerDiv.innerHTML = '';
    }
    
    var msgEl = document.getElementById('msg-check');
    msgEl.classList.remove('hidden');
    
    if(decodedText.indexOf("XC:") === 0) {
        var parts = decodedText.split(":");
        var code = parts[1];
        var ticket = findQRTicket(code);
        
        if(!ticket) {
            showMsg(msgEl, "❌ НЕВЕРНЫЙ КОД", "err"); 
            vib(false);
        } else if(ticket.used) {
            showMsg(msgEl, "⛔ УЖЕ ИСПОЛЬЗОВАН (" + ticket.name + ")", "err"); 
            vib(false);
        } else {
            markTicketUsed(ticket.code);
            showMsg(msgEl, "✅ ДОСТУП РАЗРЕШЕН<br>Клиент: " + ticket.name, "ok"); 
            vib(true);
            renderLists(); 
        }
    } else {
        showMsg(msgEl, "❌ НЕ НАШ ФОРМАТ", "err");
    }
}

function onQrFail(error) {
    // Игнорируем ошибки распознавания отдельных кадров
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
    if(confirm("Удалить ВСЮ базу? Это необратимо.")) {
        localStorage.removeItem(KEY_NFC);
        localStorage.removeItem(KEY_QR);
        renderLists();
        alert("База очищена.");
    }
}