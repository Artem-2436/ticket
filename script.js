// === НАСТРОЙКИ И ГЛОБАЛЬНОЕ СОСТОЯНИЕ ===
var KEY_NFC = 'xc_nfc_final';
var KEY_QR = 'xc_qr_final';

// Объекты оборудования
var activeNfcReader = null; 
var activeQrScanner = null; 

// Флаги занятости
var isNfcBusy = false;
var isCameraBusy = false;

// Текущая вкладка
var currentTab = '';

document.addEventListener('DOMContentLoaded', function() {
    console.log("Xcortex Ultra-Stable v4.0 Loaded");
    
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

// --- КРИТИЧЕСКАЯ ЛОГИКА ОСТАНОВКИ HARDWARE ---

/**
 * ПОЛНЫЙ СБРОС NFC.
 * Вызывается после КАЖДОГО действия (успех/ошибка/таймаут).
 * Гарантирует, что телефон забудет о работе с NFC чипом.
 */
function resetNfcSession() {
    // 1. Если есть активный ридер
    if (activeNfcReader) {
        try {
            // Отключаем обработчик событий, чтобы он не сработал повторно
            activeNfcReader.onreading = null; 
            
            // Пытаемся остановить сканирование
            // .catch игнорируем ошибки, так как ридер мог уже умереть сам
            activeNfcReader.stopScan().catch(function(err) {
                console.warn("NFC stop ignored:", err);
            });
        } catch (e) {
            console.error("NFC exception during reset:", e);
        } finally {
            // 2. ЖЕСТКОЕ ОБНУЛЕНИЕ ССЫЛКИ
            // Это самый важный шаг. Без него GC может не собрать объект вовремя.
            activeNfcReader = null;
            
            // 3. Сбрасываем флаг занятости
            isNfcBusy = false;
            
            // 4. Микро-пауза для ОС (опционально, но помогает на слабых девайсах)
            // Даем браузеру один тик цикла событий, чтобы закрыть порт
            setTimeout(function() {
                console.log("NFC Session Fully Cleared");
            }, 10);
        }
    } else {
        // Если ридера не было, просто сбрасываем флаг
        isNfcBusy = false;
    }
}

/**
 * ПОЛНЫЙ СБРОС КАМЕРЫ.
 */
function resetCameraSession() {
    if (activeQrScanner) {
        try {
            activeQrScanner.stop().catch(function(err) {
                console.warn("Camera stop ignored:", err);
            });
        } catch (e) {
            console.error("Camera exception during reset:", e);
        } finally {
            activeQrScanner = null;
            isCameraBusy = false;
            
            // Очищаем DOM камеры немедленно
            var camView = document.getElementById('cam-view');
            var readerDiv = document.getElementById('reader-element');
            if(camView) camView.classList.add('hidden');
            if(readerDiv) readerDiv.innerHTML = ''; 
        }
    } else {
        isCameraBusy = false;
        var camView = document.getElementById('cam-view');
        var readerDiv = document.getElementById('reader-element');
        if(camView) camView.classList.add('hidden');
        if(readerDiv) readerDiv.innerHTML = ''; 
    }
}

/**
 * Универсальная остановка всего железа при смене вкладки.
 */
function stopAllHardware() {
    resetNfcSession();
    resetCameraSession();
}

// --- НАВИГАЦИЯ (БЕЗОПАСНАЯ) ---

function switchTab(newTabName) {
    if (currentTab === newTabName) return;

    // 1. СНАЧАЛА жестко убиваем всё железо
    stopAllHardware();

    // 2. Меняем визуальные элементы
    var panels = ['panel-nfc', 'panel-qr', 'panel-check', 'panel-db'];
    var buttons = ['btn-tab-nfc', 'btn-tab-qr', 'btn-tab-check', 'btn-tab-db'];

    panels.forEach(p => {
        var el = document.getElementById(p);
        if(el) el.classList.add('hidden');
    });

    buttons.forEach(b => {
        var el = document.getElementById(b);
        if(el) el.classList.remove('active');
    });

    // Показываем нужную панель
    var targetPanelId = 'panel-' + newTabName;
    var targetBtnId = 'btn-tab-' + newTabName;
    
    var tp = document.getElementById(targetPanelId);
    if(tp) tp.classList.remove('hidden');
    
    var tb = document.getElementById(targetBtnId);
    if(tb) tb.classList.add('active');

    currentTab = newTabName;

    if(newTabName === 'db') renderLists();
}

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
    stopAllHardware();
    document.getElementById('view-admin').style.display = 'none';
    document.getElementById('view-login').style.display = 'block';
    currentTab = ''; 
}

// --- БАЗА ДАННЫХ (LocalStorage Helpers) ---

function getNFCUsers() { 
    try { return JSON.parse(localStorage.getItem(KEY_NFC)) || []; } 
    catch(e) { return []; } 
}

function saveNFCUser(user) { 
    var list = getNFCUsers(); 
    if(!list.some(u => u.uid === user.uid)) { 
        list.push(user); 
        localStorage.setItem(KEY_NFC, JSON.stringify(list)); 
    } 
}

function findNFCUser(uid) { 
    return getNFCUsers().find(u => u.uid === uid) || null;
}

function deleteNFCUser(uid) { 
    if(confirm("Удалить пользователя?")) {
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
    if(!list.some(t => t.code === ticket.code)) { 
        list.push(ticket); 
        localStorage.setItem(KEY_QR, JSON.stringify(list)); 
    } 
}

function findQRTicket(code) { 
    return getQRTickets().find(t => t.code === code) || null;
}

function markTicketUsed(code) {
    var list = getQRTickets();
    var idx = list.findIndex(t => t.code === code);
    if(idx > -1) {
        list[idx].used = true;
        localStorage.setItem(KEY_QR, JSON.stringify(list));
    }
}
// --- ЛОГИКА NFC (STRICT RESET MODE) ---

/**
 * Единая точка входа для любого NFC действия.
 * После выполнения колбэка ВСЕГДА вызывает resetNfcSession().
 */
function performNfcAction(callbackLogic) {
    if (isNfcBusy) {
        console.warn("NFC busy, ignoring click");
        return;
    }
    
    if (!('NDEFReader' in window)) {
        alert("Web NFC не поддерживается этим браузером.");
        return;
    }

    isNfcBusy = true;
    
    try {
        // Создаем новый экземпляр каждый раз
        activeNfcReader = new NDEFReader();
        
        // Назначаем обработчик чтения
        activeNfcReader.onreading = function(event) {
            var uid = event.serialNumber ? event.serialNumber.toLowerCase() : "";
            
            // Передаем управление логике приложения
            callbackLogic(uid);
            
            // !!! САМОЕ ВАЖНОЕ !!!
            // Сразу же после обработки результата сбрасываем всю сессию NFC.
            // Телефон больше ничего не знает о NFC.
            resetNfcSession();
        };

        // Запускаем скан
        activeNfcReader.scan().then(function() {
            // Успешный старт ожидания
        }).catch(function(err) {
            // Ошибка запуска скана (например, нет доступа)
            console.error("NFC Scan Start Error:", err);
            // Все равно сбрасываем сессию, чтобы разблокировать флаги
            resetNfcSession();
            alert("Не удалось запустить NFC. Проверьте разрешения.");
        });

    } catch (err) {
        console.error("NFC Init Error:", err);
        resetNfcSession();
        alert("Критическая ошибка NFC модуля.");
    }
}

function doRegisterNFC() {
    var nameInput = document.getElementById('in-nfc-name');
    var msgEl = document.getElementById('msg-nfc');
    var name = nameInput.value.trim();
    
    if(!name) { 
        alert("Введите ФИО!"); 
        return; 
    }

    showMsg(msgEl, "Приложите карту...", "info");

    performNfcAction(function(uid) {
        // Логика регистрации
        if (!uid) {
            showMsg(msgEl, "❌ UID не получен", "err");
            return;
        }

        if(findNFCUser(uid)) { 
            showMsg(msgEl, "⚠️ Карта уже зарегистрирована!", "err"); 
            return; 
        }
        
        saveNFCUser({uid: uid, name: name, time: Date.now()});
        showMsg(msgEl, "✅ Успех! Имя: " + name, "ok");
        nameInput.value = '';
        renderLists();
    });
}

function doSearchNFC() {
    var msgEl = document.getElementById('msg-nfc');
    
    showMsg(msgEl, "Поиск клиента...", "info");

    performNfcAction(function(uid) {
        // Логика поиска
        if (!uid) {
            showMsg(msgEl, "❌ UID не получен", "err");
            return;
        }

        var user = findNFCUser(uid);
        if(user) {
            showMsg(msgEl, "✅ Найден: " + user.name, "ok");
            highlightListItem(uid);
        } else {
            showMsg(msgEl, "❌ Клиент не найден.", "err");
        }
    });
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
    
    showMsg(msgEl, "Жду карту посетителя...", "info");

    performNfcAction(function(uid) {
        // Логика проверки доступа
        if (!uid) {
            showMsg(msgEl, "❌ UID не получен", "err");
            return;
        }

        var user = findNFCUser(uid);
        if(user) {
            showMsg(msgEl, "✅ ДОСТУП РАЗРЕШЕН<br>" + user.name, "ok");
            vib(true);
        } else {
            showMsg(msgEl, "❌ ОТКАЗАНО<br>Нет в базе.", "err");
            vib(false);
        }
    });
}

function doStartCamera() {
    if (isCameraBusy) return;
    
    isCameraBusy = true;
    var camView = document.getElementById('cam-view');
    var msgEl = document.getElementById('msg-check');
    
    camView.classList.remove('hidden');
    msgEl.classList.add('hidden');
    
    try {
        activeQrScanner = new Html5Qrcode("reader-element");
        
        activeQrScanner.start(
            { facingMode: "environment" }, 
            { fps: 10, qrbox: 150 }, 
            onQrSuccess, 
            onQrFail
        ).catch(function(e) { 
            alert("Ошибка камеры: " + e); 
            resetCameraSession(); 
        });
    } catch(e) {
        alert("Критическая ошибка инициализации камеры");
        resetCameraSession();
    }
}

function doStopCamera() {
    resetCameraSession();
}

function onQrSuccess(decodedText) {
    // Немедленно убиваем камеру
    resetCameraSession(); 
    
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