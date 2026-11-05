const BASE_URL = window.location.origin + "/";
// Ключи для LocalStorage
const KEY_USERS = 'xc_users';   // [{uid, name, status}]
const KEY_CODES = 'xc_codes';   // [{code, name, status}] -> code - строка, name - ФИО, status - 'active'|'used'

let regTimer = null;
let nfcReader = null;
let qrScanner = null;

document.addEventListener('DOMContentLoaded', () => {
    if(typeof QRCode === 'undefined') alert("Нет интернета для библиотек");
    checkHash();
});

function checkHash() {
    const hash = location.hash;
    if(hash.startsWith('#login_')) renderClient(hash.replace('#login_',''));
    else { showView('home'); loadUsers(); }
}

function showView(v) {
    ['home','admin','client-login'].forEach(x=>document.getElementById(`view-${x}`).classList.add('hidden'));
    document.getElementById(`view-${v}`).classList.remove('hidden');
    if(v!=='admin') stopAll();
}

function switchTab(t) {
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.add('hidden'));
    document.getElementById(`panel-${t}`).classList.remove('hidden');
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.getElementById(`tab-${t}`).classList.add('active');
    stopAll();
}

// --- DB Helpers ---
function getUsers(){ try{return JSON.parse(localStorage.getItem(KEY_USERS))||[]}catch(e){return[]} }
function saveUser(u){ 
    let l=getUsers(); 
    if(!l.find(x=>x.uid===u.uid)){ 
        l.push(u); 
        localStorage.setItem(KEY_USERS,JSON.stringify(l)); 
        renderList(); 
    } 
}
function updateUser(uid, changes) {
    let l = getUsers();
    let idx = l.findIndex(u => u.uid === uid);
    if(idx !== -1) { Object.assign(l[idx], changes); localStorage.setItem(KEY_USERS, JSON.stringify(l)); renderList(); }
}
function delUser(uid){ 
    if(confirm("Удалить пользователя навсегда?")) {
        let l=getUsers().filter(u=>u.uid!==uid); 
        localStorage.setItem(KEY_USERS,JSON.stringify(l)); 
        renderList(); 
    }
}
function findUser(uid){ return getUsers().find(u=>u.uid===uid); }

// Codes Logic (QR Registration) - Теперь хранит ИМЯ
function getCodes(){ try{return JSON.parse(localStorage.getItem(KEY_CODES))||[]}catch(e){return[]} }
function addCode(c, name){ 
    let l=getCodes(); 
    if(!l.find(x=>x.code===c)){ 
        l.push({code:c, name:name, status:'active'}); 
        localStorage.setItem(KEY_CODES,JSON.stringify(l)); 
    } 
}
function markCodeUsed(c){
    let l = getCodes();
    let idx = l.findIndex(x => x.code === c);
    if(idx !== -1) { l[idx].status = 'used'; localStorage.setItem(KEY_CODES, JSON.stringify(l)); }
}
function isCodeActive(c){ 
    let l = getCodes();
    let item = l.find(x => x.code === c);
    return item && item.status === 'active';
}
function getCodeInfo(c) {
    return getCodes().find(x => x.code === c);
}

// --- Admin: NFC Reg ---
async function startRegisterNFC() {
    const nameEl = document.getElementById('input-name-nfc');
    const statusEl = document.getElementById('status-nfc-reg');
    const name = nameEl.value.trim();
    
    if(!name) return alert("Введите имя");
    if(!('NDEFReader' in window)) return alert("NFC не поддерживается");

    statusEl.className='status-box st-info'; statusEl.textContent="Приложите карту..."; statusEl.classList.remove('hidden');

    try {
        nfcReader = new NDEFReader();
        await nfcReader.scan();
        nfcReader.onreading = e => {
            let uid = e.serialNumber?.toLowerCase();
            if(!uid) { statusEl.className='status-box st-err'; statusEl.textContent="UID скрыт браузером"; stopScan(); return; }
            
            let existing = findUser(uid);
            if(existing) { 
                statusEl.className='status-box st-warn'; 
                statusEl.textContent=`Карта уже есть (${existing.name})`; 
                stopScan(); 
                return; 
            }
            
            saveUser({uid,name,status:'active',time:Date.now()});
            statusEl.className='status-box st-ok'; statusEl.innerHTML=`✅ ${name}<br>${uid}`;
            vib(true); nameEl.value=''; stopScan();
        };
    } catch(err) { statusEl.className='status-box st-err'; statusEl.textContent="Ошибка: "+err.message; }
}

// --- NEW: Search User by NFC ---
async function searchUserByNFC() {
    if(!('NDEFReader' in window)) return alert("NFC не поддерживается");
    const statusEl = document.getElementById('status-nfc-reg');
    statusEl.className='status-box st-info'; statusEl.textContent="Ищу клиента... Приложите карту."; statusEl.classList.remove('hidden');

    try {
        nfcReader = new NDEFReader();
        await nfcReader.scan();
        nfcReader.onreading = e => {
            let uid = e.serialNumber?.toLowerCase();
            if(!uid) { statusEl.textContent="UID пуст"; stopScan(); return; }
            
            const user = findUser(uid);
            if(user) {
                statusEl.className='status-box st-ok'; 
                statusEl.innerHTML=`✅ Найден: <strong>${user.name}</strong>`;
                highlightUserInList(uid);
            } else {
                statusEl.className='status-box st-err'; 
                statusEl.textContent=`❌ Клиент с UID ${uid} не найден.`;
            }
            stopScan();
        };
    } catch(err) { statusEl.textContent="Ошибка поиска"; }
}

// Helper to scroll and highlight
function highlightUserInList(uid) {
    const list = document.getElementById('users-container');
    const items = list.children;
    for(let i=0; i<items.length; i++) {
        // Предполагаем, что data-uid добавлен в HTML элемента списка (см. renderList ниже)
        if(items[i].getAttribute('data-uid') === uid) {
            items[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
            items[i].style.backgroundColor = '#fffbe6'; // Желтая подсветка
            setTimeout(() => { items[i].style.backgroundColor = ''; }, 2000);
            break;
        }
    }
}

// --- Admin: QR Reg (Now with Name) ---
function startRegistrationQR() {
    const nameEl = document.getElementById('input-name-qr');
    const name = nameEl.value.trim();
    
    if(!name) return alert("Введите ФИО клиента!");

    const code = Math.floor(100000+Math.random()*900000).toString();
    addCode(code, name); // Сохраняем код и имя
    
    document.getElementById('qr-reg-idle').classList.add('hidden');
    document.getElementById('qr-reg-active').classList.remove('hidden');
    
    // Display name in UI
    document.getElementById('qr-client-name-display').textContent = name;
    
    const msg = document.getElementById('qr-reg-status-msg');
    msg.innerHTML = `Код <strong>${code}</strong> активен.<br>Привязан к: ${name}`;

    const link = `${BASE_URL}#login_${code}`;
    const qrBox = document.getElementById('invite-qr-container');
    qrBox.innerHTML='';
    new QRCode(qrBox,{text:link,width:180,height:180});

    startTimer(60);
}

function startTimer(sec) {
    clearInterval(regTimer);
    let t=sec;
    const disp=document.getElementById('reg-timer');
    regTimer=setInterval(()=>{
        t--; disp.textContent=t;
        if(t<=0){ 
            clearInterval(regTimer); 
            document.getElementById('qr-reg-status-msg').innerHTML+=" <br><small>⏳ Время истекло.</small>"; 
        }
    },1000);
}

// --- Client View ---
function renderClient(code) {
    ['home','admin'].forEach(v=>document.getElementById(`view-${v}`).classList.add('hidden'));
    document.getElementById('view-client-login').classList.remove('hidden');
    document.getElementById('client-code-display').textContent=code;
    
    const box=document.getElementById('client-ticket-qr');
    box.innerHTML='';
    new QRCode(box,{text:`XC_TICKET:${code}`,width:220,height:220});
}

// --- Admin: Check Entry ---
async function startCheckNFC() {
    if(!('NDEFReader' in window)) return alert("NFC нет");
    const res=document.getElementById('check-result');
    res.className='status-box st-info'; res.textContent="Жду карту..."; res.classList.remove('hidden');

    try {
        nfcReader=new NDEFReader();
        await nfcReader.scan();
        nfcReader.onreading=e=>{
            let uid=e.serialNumber?.toLowerCase();
            if(!uid){ res.className='status-box st-err'; res.textContent="UID пуст"; stopScan(); return; }
            
            const u=findUser(uid);
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

function openScanner() {
    document.getElementById('scanner-view').classList.remove('hidden');
    document.getElementById('check-result').classList.add('hidden');
    qrScanner=new Html5Qrcode("reader");
    qrScanner.start({facingMode:"environment"},{fps:10,qrbox:{width:200,height:200}},onQrSuccess,onQrFail)
        .catch(e=>alert("Камера: "+e));
}

function closeScanner() {
    if(qrScanner) qrScanner.stop().then(()=>document.getElementById('scanner-view').classList.add('hidden')).catch(()=>{});
}

function onQrSuccess(txt) {
    closeScanner();
    const res=document.getElementById('check-result');
    res.classList.remove('hidden');
    
    if(txt.startsWith('XC_TICKET:')) {
        const code=txt.split(':')[1];
        const info = getCodeInfo(code); // Получаем информацию о коде (включая имя)

        if(info && info.status === 'active') {
            res.className='status-box st-ok'; 
            res.innerHTML=`✅ ДОСТУП РАЗРЕШЕН<br>Клиент: <strong>${info.name}</strong><br>Код: ${code}`; 
            vib(true);
            
            markCodeUsed(code);
        } else if (info && info.status === 'used') {
             res.className='status-box st-err'; 
             res.textContent=`⛔ УЖЕ ИСПОЛЬЗОВАН<br>(${info.name})`;
             vib(false);
        } else {
            res.className='status-box st-err'; 
            res.textContent=`❌ НЕВЕРНЫЙ КОД<br>${code}`;
            vib(false);
        }
    } else { res.className='status-box st-err'; res.textContent="Неверный формат"; }
}

function onQrFail(){}

function stopScan(){ if(nfcReader)nfcReader.stopScan().catch(()=>{}); }
function stopAll(){ closeScanner(); stopScan(); clearInterval(regTimer); }
function vib(ok){ if(navigator.vibrate) navigator.vibrate(ok?[100]:[200,100,200]); }

// --- Render List & Actions ---
function loadUsers(){ renderList(); }

function toggleBlock(uid) {
    let u = findUser(uid);
    if(u) {
        let newStatus = u.status === 'blocked' ? 'active' : 'blocked';
        updateUser(uid, {status: newStatus});
    }
}

function renderList() {
    const c=document.getElementById('users-container');
    const cnt=document.getElementById('count-users');
    const list=getUsers();
    c.innerHTML=''; cnt.textContent=list.length;
    
    if(!list.length){ c.innerHTML='<p style="color:#aaa;text-align:center">Пусто</p>'; return; }
    
    [...list].sort((a,b)=>b.time-a.time).forEach(u=>{
        const d=document.createElement('div'); d.className='user-item';
        d.setAttribute('data-uid', u.uid); // Важно для поиска!
        
        let sColor = u.status==='blocked' ? '#d63031' : '#00b894';
        let sText = u.status==='blocked' ? 'BAN' : 'OK';
        
        d.innerHTML=`
            <div class="user-info">
                <strong>${esc(u.name)}</strong> <span style="font-size:0.7rem; color:${sColor}; border:1px solid ${sColor}; padding:1px 4px; border-radius:4px;">${sText}</span>
                <br><small style="color:#888">${u.uid}</small>
            </div>
            <div class="actions">
                <button class="btn-small ${u.status==='blocked'?'btn-success':'btn-danger'}" onclick="toggleBlock('${u.uid}')">
                    ${u.status==='blocked'?'Unban':'Ban'}
                </button>
                <button class="btn-danger btn-small" onclick="delUser('${u.uid}')">✖</button>
            </div>
        `;
        c.appendChild(d);
    });
}
function esc(s){ return s.replace(/"/g,'&quot;'); }

// Export to Window
window.showView=showView; window.switchTab=switchTab; window.startRegisterNFC=startRegisterNFC;
window.searchUserByNFC=searchUserByNFC; // Добавили экспорт новой функции
window.startRegistrationQR=startRegistrationQR; window.startCheckNFC=startCheckNFC;
window.openScanner=openScanner; window.closeScanner=closeScanner; window.delUser=delUser;
window.toggleBlock=toggleBlock;
