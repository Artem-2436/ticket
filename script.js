const BASE_URL = window.location.origin + "/";
// Ключи для LocalStorage
const KEY_USERS = 'xc_users';   // [{uid, name, status}]
const KEY_CODES = 'xc_codes';   // [{code, status}] -> code - строка, status - 'active'|'used'

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
function saveUser(u){ let l=getUsers(); if(!l.find(x=>x.uid===u.uid)){ l.push(u); localStorage.setItem(KEY_USERS,JSON.stringify(l)); renderList(); } }
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

// Codes Logic (QR Registration)
function getCodes(){ try{return JSON.parse(localStorage.getItem(KEY_CODES))||[]}catch(e){return[]} }
function addCode(c){ 
    let l=getCodes(); 
    // Проверяем дубликат кода (маловероятно, но безопасно)
    if(!l.find(x=>x.code===c)){ 
        l.push({code:c, status:'active'}); 
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
            
            // Проверка существующего
            let existing = findUser(uid);
            if(existing) { 
                statusEl.className='status-box st-warn'; 
                statusEl.textContent=`Карта уже есть (${existing.name})`; 
                stopScan(); 
                return; 
            }
            
            // Сохраняем с новым полем status: 'active'
            saveUser({uid,name,status:'active',time:Date.now()});
            statusEl.className='status-box st-ok'; statusEl.innerHTML=`✅ ${name}<br>${uid}`;
            vib(true); nameEl.value=''; stopScan();
        };
    } catch(err) { statusEl.className='status-box st-err'; statusEl.textContent="Ошибка: "+err.message; }
}

// --- Admin: QR Reg ---
function startRegistrationQR() {
    const code = Math.floor(100000+Math.random()*900000).toString();
    addCode(code); // Статус по умолчанию 'active'
    
    document.getElementById('qr-reg-idle').classList.add('hidden');
    document.getElementById('qr-reg-active').classList.remove('hidden');
    
    const msg = document.getElementById('qr-reg-status-msg');
    msg.innerHTML = `Код <strong>${code}</strong> активен.`;

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
            document.getElementById('qr-reg-status-msg').innerHTML="⏳ Время вышло.<br><small>Но код все еще можно использовать, если он не был отмечен как used.</small>"; 
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
                // Успешный вход
                res.className='status-box st-ok'; res.innerHTML=`✅ Здравствуйте,<br><strong>${u.name}</strong>`; 
                vib(true);
                
                // Опционально: Пометить как "visited recently" или ограничить частоту
                // Для NFC карт обычно разрешаем многократный вход, если не нужен контроль лимита
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
        
        // ПРОВЕРКА ОДНОРАЗОВОСТИ
        if(isCodeActive(code)) {
            res.className='status-box st-ok'; 
            res.innerHTML=`✅ ДОСТУП РАЗРЕШЕН<br>Код: ${code}`; 
            vib(true);
            
            // МАРКИРУЕМ КАК ИСПОЛЬЗОВАННЫЙ (One-Time Use)
            markCodeUsed(code);
        } else {
            // Код либо не найден, либо уже использован
            const allCodes = getCodes();
            const exists = allCodes.find(x => x.code === code);
            
            if(exists && exists.status === 'used') {
                res.className='status-box st-err'; 
                res.textContent=`⛔ УЖЕ ИСПОЛЬЗОВАН<br>Этот билет недействителен.`;
            } else {
                res.className='status-box st-err'; 
                res.textContent=`❌ НЕВЕРНЫЙ КОД<br>${code}`;
            }
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
        
        // Цвет статуса
        let sColor = u.status==='blocked' ? '#d63031' : '#00b894';
        let sText = u.status==='blocked' ? 'BAN' : 'OK';
        
        d.innerHTML=`
            <div style="flex-grow:1; text-align:left;">
                <strong>${esc(u.name)}</strong> <span style="font-size:0.7rem; color:${sColor}; border:1px solid ${sColor}; padding:1px 4px; border-radius:4px;">${sText}</span>
                <br><small style="color:#888">${u.uid}</small>
            </div>
            <div class="actions" style="display:flex; gap:2px;">
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

// Export to Window for HTML onclick
window.showView=showView; window.switchTab=switchTab; window.startRegisterNFC=startRegisterNFC;
window.startRegistrationQR=startRegistrationQR; window.startCheckNFC=startCheckNFC;
window.openScanner=openScanner; window.closeScanner=closeScanner; window.delUser=delUser;
window.toggleBlock=toggleBlock;
