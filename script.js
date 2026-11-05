// Ключи LocalStorage
const KEY_NFC = 'xc_nfc_users'; // [{uid, name, status}]
const KEY_QR = 'xc_qr_tickets'; // [{code, name, used}]

let nfcReader = null;
let qrScanner = null;
let isScanningActive = false;

document.addEventListener('DOMContentLoaded', () => {
    if(typeof QRCode === 'undefined') alert("Нет интернета для библиотек");
    // Инициализация при загрузке
    renderNFCList(); 
    renderAllTickets();
});

function showView(v) {
    ['home','admin'].forEach(x=>{
        const el = document.getElementById(`view-${x}`);
        if(el) el.classList.add('hidden');
    });
    
    const target = document.getElementById(`view-${v}`);
    if(target) target.classList.remove('hidden');
    
    if(v!=='admin') stopAll();
}

function switchTab(t) {
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.add('hidden'));
    const panel = document.getElementById(`panel-${t}`);
    if(panel) panel.classList.remove('hidden');
    
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    const btn = document.getElementById(`tab-${t}`);
    if(btn) btn.classList.add('active');
    
    stopAll();
    
    // Обновляем списки при переключении
    if(t==='nfc') renderNFCList();
    if(t==='list') renderAllTickets();
}

// --- DB HELPERS ---

// NFC Users
function getNFCUsers() { try{return JSON.parse(localStorage.getItem(KEY_NFC))||[]}catch(e){return[]} }
function saveNFCUser(u) { 
    let l=getNFCUsers(); 
    if(!l.find(x=>x.uid===u.uid)){ l.push(u); localStorage.setItem(KEY_NFC,JSON.stringify(l)); renderNFCList(); } 
}
function findNFCUser(uid) { return getNFCUsers().find(u=>u.uid===uid); }
function updateNFCStatus(uid, newStatus) {
    let l = getNFCUsers();
    let idx = l.findIndex(u=>u.uid===uid);
    if(idx!==-1) { l[idx].status=newStatus; localStorage.setItem(KEY_NFC,JSON.stringify(l)); renderNFCList(); }
}
function deleteNFCUser(uid) {
    if(confirm("Удалить пользователя?")) {
        let l=getNFCUsers().filter(u=>u.uid!==uid); 
        localStorage.setItem(KEY_NFC,JSON.stringify(l)); 
        renderNFCList(); 
    }
}

// QR Tickets
function getQRTickets() { try{return JSON.parse(localStorage.getItem(KEY_QR))||[]}catch(e){return[]} }
function saveQRTicket(t) { 
    let l=getQRTickets(); 
    if(!l.find(x=>x.code===t.code)){ l.push(t); localStorage.setItem(KEY_QR,JSON.stringify(l)); } 
}
function findQRTicket(code) { return getQRTickets().find(t=>t.code===code); }
function markQRTicketUsed(code) {
    let l = getQRTickets();
    let idx = l.findIndex(t=>t.code===code);
    if(idx!==-1) { l[idx].used=true; localStorage.setItem(KEY_QR,JSON.stringify(l)); }
}

// --- ADMIN: NFC LOGIC ---

async function registerNFC() {
    const nameEl = document.getElementById('input-name-nfc');
    const statusEl = document.getElementById('status-nfc');
    const name = nameEl.value.trim();
    
    if(!name) return alert("Введите имя");
    if(!('NDEFReader' in window)) return alert("NFC не поддерживается");

    statusEl.className='status-box st-info'; statusEl.textContent="Приложите карту..."; statusEl.classList.remove('hidden');

    try {
        nfcReader = new NDEFReader();
        await nfcReader.scan();
        isScanningActive = true;
        
        nfcReader.onreading = e => {
            let uid = e.serialNumber?.toLowerCase();
            if(!uid) { statusEl.className='status-box st-err'; statusEl.textContent="UID скрыт браузером"; stopScan(); return; }
            
            if(findNFCUser(uid)) { 
                statusEl.className='status-box st-warn'; 
                statusEl.textContent=`Карта уже есть`; 
                stopScan(); 
                return; 
            }
            
            saveNFCUser({uid,name,status:'active',time:Date.now()});
            statusEl.className='status-box st-ok'; statusEl.innerHTML=`✅ ${name}<br>${uid}`;
            vib(true); nameEl.value=''; stopScan();
        };
    } catch(err) { statusEl.className='status-box st-err'; statusEl.textContent="Ошибка: "+err.message; }
}

async function searchNFC() {
    if(!('NDEFReader' in window)) return alert("NFC не поддерживается");
    const statusEl = document.getElementById('status-nfc');
    statusEl.className='status-box st-info'; statusEl.textContent="Ищу... Приложите карту."; statusEl.classList.remove('hidden');

    try {
        nfcReader = new NDEFReader();
        await nfcReader.scan();
        isScanningActive = true;
        nfcReader.onreading = e => {
            let uid = e.serialNumber?.toLowerCase();
            if(!uid) { statusEl.textContent="UID пуст"; stopScan(); return; }
            
            const user = findNFCUser(uid);
            if(user) {
                statusEl.className='status-box st-ok'; 
                statusEl.innerHTML=`✅ Найден: <strong>${user.name}</strong>`;
                highlightInList(uid);
            } else {
                statusEl.className='status-box st-err'; 
                statusEl.textContent=`❌ Не найден.`;
            }
            stopScan();
        };
    } catch(err) { statusEl.textContent="Ошибка поиска"; }
}

function highlightInList(uid) {
    const list = document.getElementById('nfc-list');
    const items = list.children;
    for(let i=0; i<items.length; i++) {
        if(items[i].getAttribute('data-uid') === uid) {
            items[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
            items[i].classList.add('highlight');
            setTimeout(() => items[i].classList.remove('highlight'), 2000);
            break;
        }
    }
}

// --- ADMIN: QR LOGIC ---

function generateQRTicket() {
    const nameEl = document.getElementById('input-name-qr');
    const name = nameEl.value.trim();
    if(!name) return alert("Введите ФИО!");

    let code;
    do {
        code = Math.floor(100000 + Math.random() * 900000).toString();
    } while(findQRTicket(code));

    saveQRTicket({ code, name, used: false, time: Date.now() });

    document.getElementById('qr-result-area').classList.remove('hidden');
    document.getElementById('qr-res-name').textContent = name;
    document.getElementById('qr-res-code').textContent = code;

    const qrBox = document.getElementById('qr-box');
    qrBox.innerHTML = '';
    new QRCode(qrBox, {
        text: `XC:${code}`,
        width: 220,
        height: 220,
        correctLevel : QRCode.CorrectLevel.H
    });
    
    vib(true);
}

function resetQRForm() {
    document.getElementById('input-name-qr').value = '';
    document.getElementById('qr-result-area').classList.add('hidden');
}

// --- ADMIN: CHECK ENTRY ---

async function startCheckNFC() {
    if(!('NDEFReader' in window)) return alert("NFC нет");
    const res=document.getElementById('check-result');
    res.className='status-box st-info'; res.textContent="Жду карту..."; res.classList.remove('hidden');

    try {
        nfcReader=new NDEFReader();
        await nfcReader.scan();
        isScanningActive = true;
        nfcReader.onreading=e=>{
            let uid=e.serialNumber?.toLowerCase();
            if(!uid){ res.className='status-box st-err'; res.textContent="UID пуст"; stopScan(); return; }
            
            const u=findNFCUser(uid);
            if(!u) { res.className='status-box st-err'; res.textContent=`❌ Нет в базе`; vib(false); }
            else if(u.status === 'blocked') { res.className='status-box st-err'; res.textContent=`🚫 ЗАБЛОКИРОВАН<br>${u.name}`; vib(false); }
            else {
                res.className='status-box st-ok'; res.innerHTML=`✅ Здравствуйте,<br><strong>${u.name}</strong>`; 
                vib(true);
            }
            stopScan();
        };
    } catch(err){ res.className='status-box st-err'; res.textContent="Ошибка NFC"; }
}

function startScanQR() {
    document.getElementById('scanner-view').classList.remove('hidden');
    document.getElementById('check-result').classList.add('hidden');
    
    qrScanner = new Html5Qrcode("reader");
    qrScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 200 }, onQrSuccess, onQrFail)
        .catch(e => { alert("Камера: "+e); stopScanner(); });
}

function stopScanner() {
    if(qrScanner) qrScanner.stop().then(()=>document.getElementById('scanner-view').classList.add('hidden')).catch(()=>{});
}

function onQrSuccess(txt) {
    stopScanner();
    const res=document.getElementById('check-result');
    res.classList.remove('hidden');
    
    if(txt.startsWith('XC:')) {
        const code=txt.split(':')[1];
        const ticket = findQRTicket(code);

        if (!ticket) {
            res.className='status-box st-err'; res.innerHTML=`❌ НЕ НАЙДЕНО<br>Код: ${code}`; vib(false);
        } else if (ticket.used) {
            res.className='status-box st-err'; res.innerHTML=`⛔ УЖЕ ПРОШЕЛ<br>${ticket.name}`; vib(false);
        } else {
            markQRTicketUsed(ticket.code);
            res.className='status-box st-ok'; res.innerHTML=`✅ ДОСТУП РАЗРЕШЕН<br>Клиент: <strong>${ticket.name}</strong>`; vib(true);
        }
    } else { res.className='status-box st-err'; res.textContent="Неверный формат"; }
}

function onQrFail(){}

function stopScan(){ if(nfcReader&&isScanningActive)nfcReader.stopScan().catch(()=>{}); isScanningActive=false; }
function stopAll(){ stopScanner(); stopScan(); }
function vib(ok){ if(navigator.vibrate) navigator.vibrate(ok?[100]:[200,100,200]); }

// --- RENDER LISTS ---

function renderNFCList() {
    const cont = document.getElementById('nfc-list');
    const cnt = document.getElementById('count-nfc');
    if(!cont || !cnt) return;
    
    const users = getNFCUsers();
    cont.innerHTML = ''; cnt.textContent = users.length;
    
    if(!users.length) { cont.innerHTML='<p style="color:#aaa;text-align:center">Пусто</p>'; return; }
    
    [...users].sort((a,b)=>b.time-a.time).forEach(u => {
        const div = document.createElement('div'); div.className='item-row'; div.setAttribute('data-uid', u.uid);
        const sColor = u.status==='blocked' ? '#d63031' : '#00b894';
        const sText = u.status==='blocked' ? 'BAN' : 'OK';
        
        div.innerHTML = `
            <div class="item-info">
                <strong>${esc(u.name)}</strong> <span style="font-size:0.7rem;color:${sColor};">${sText}</span>
                <div class="item-meta">${u.uid}</div>
            </div>
            <div style="display:flex;gap:2px;">
                <button class="btn-small ${u.status==='blocked'?'btn-success':'btn-danger'}" onclick="toggleBlock('${u.uid}')">${u.status==='blocked'?'Unban':'Ban'}</button>
                <button class="btn-danger btn-small" onclick="deleteNFCUser('${u.uid}')">✖</button>
            </div>
        `;
        cont.appendChild(div);
    });
}

window.toggleBlock = function(uid) {
    let u = findNFCUser(uid);
    if(u) updateNFCStatus(uid, u.status==='blocked'?'active':'blocked');
};

function renderAllTickets() {
    const cont = document.getElementById('all-tickets-list');
    const cnt = document.getElementById('count-all');
    if(!cont || !cnt) return;

    const qr = getQRTickets();
    cont.innerHTML = ''; 
    cnt.textContent = qr.length;
    
    if(!qr.length) { cont.innerHTML='<p style="color:#aaa;text-align:center">Нет QR билетов</p>'; return; }
    
    [...qr].sort((a,b)=>b.time-a.time).forEach(t => {
        const div = document.createElement('div'); div.className='item-row';
        const status = t.used ? '<span style="color:red;font-size:0.7rem;">USED</span>' : '<span style="color:green;font-size:0.7rem;">ACTIVE</span>';
        div.innerHTML = `
            <div class="item-info">
                <strong>${esc(t.name)}</strong>
                <div class="item-meta">Code: ${t.code}</div>
            </div>
            <div>${status}</div>
        `;
        cont.appendChild(div);
    });
}

function clearAllDB() {
    if(confirm("Удалить ВСЮ базу (NFC и QR)?")) {
        localStorage.removeItem(KEY_NFC);
        localStorage.removeItem(KEY_QR);
        renderNFCList();
        renderAllTickets();
    }
}

function esc(s) { return s.replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

// ==========================================
// !!! ЭКСПОРТ ФУНКЦИЙ В WINDOW !!!
// Без этого блока кнопки onclick не будут работать
// ==========================================
window.showView = showView;
window.switchTab = switchTab;
window.registerNFC = registerNFC;
window.searchNFC = searchNFC;
window.generateQRTicket = generateQRTicket;
window.resetQRForm = resetQRForm;
window.startCheckNFC = startCheckNFC;
window.startScanQR = startScanQR;
window.stopScanner = stopScanner;
window.clearAllDB = clearAllDB;
window.deleteNFCUser = deleteNFCUser;
window.toggleBlock = toggleBlock;
