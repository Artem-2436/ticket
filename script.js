const BASE_URL = window.location.origin + "/";
const KEY_USERS = 'xc_users';
const KEY_CODES = 'xc_codes';
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
function delUser(uid){ let l=getUsers().filter(u=>u.uid!==uid); localStorage.setItem(KEY_USERS,JSON.stringify(l)); renderList(); }
function findUser(uid){ return getUsers().find(u=>u.uid===uid); }

function getCodes(){ try{return JSON.parse(localStorage.getItem(KEY_CODES))||[]}catch(e){return[]} }
function addCode(c){ let l=getCodes(); if(!l.includes(c)){ l.push(c); localStorage.setItem(KEY_CODES,JSON.stringify(l)); } }
function isCodeValid(c){ return getCodes().includes(c); }

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
            if(findUser(uid)) { statusEl.className='status-box st-warn'; statusEl.textContent="Карта уже есть"; stopScan(); return; }
            
            saveUser({uid,name,time:Date.now()});
            statusEl.className='status-box st-ok'; statusEl.innerHTML=`✅ ${name}<br>${uid}`;
            vib(true); nameEl.value=''; stopScan();
        };
    } catch(err) { statusEl.className='status-box st-err'; statusEl.textContent="Ошибка: "+err.message; }
}

// --- Admin: QR Reg ---
function startRegistrationQR() {
    const code = Math.floor(100000+Math.random()*900000).toString();
    addCode(code); // Сохраняем сразу
    
    document.getElementById('qr-reg-idle').classList.add('hidden');
    document.getElementById('qr-reg-active').classList.remove('hidden');
    
    const msg = document.getElementById('qr-reg-status-msg');
    msg.innerHTML = `Код ${code} сохранен.`;

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
        if(t<=0){ clearInterval(regTimer); document.getElementById('qr-reg-status-msg').innerHTML="⏳ Время вышло."; }
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
            if(u){ res.className='status-box st-ok'; res.innerHTML=`✅ Здравствуйте,<br><strong>${u.name}</strong>`; vib(true); }
            else { res.className='status-box st-err'; res.textContent=`❌ Нет в базе (${uid})`; vib(false); }
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
        if(isCodeValid(code)) { res.className='status-box st-ok'; res.innerHTML=`✅ ДОСТУП<br>Код: ${code}`; vib(true); }
        else { res.className='status-box st-err'; res.textContent=`❌ Код ${code} не найден`; vib(false); }
    } else { res.className='status-box st-err'; res.textContent="Неверный формат"; }
}

function onQrFail(){}

function stopScan(){ if(nfcReader)nfcReader.stopScan().catch(()=>{}); }
function stopAll(){ closeScanner(); stopScan(); clearInterval(regTimer); }
function vib(ok){ if(navigator.vibrate) navigator.vibrate(ok?[100]:[200,100,200]); }

// --- Render List ---
function loadUsers(){ renderList(); }
function renderList() {
    const c=document.getElementById('users-container');
    const cnt=document.getElementById('count-users');
    const list=getUsers();
    c.innerHTML=''; cnt.textContent=list.length;
    if(!list.length){ c.innerHTML='<p style="color:#aaa;text-align:center">Пусто</p>'; return; }
    [...list].sort((a,b)=>b.time-a.time).forEach(u=>{
        const d=document.createElement('div'); d.className='user-item';
        d.innerHTML=`<div><strong>${esc(u.name)}</strong><br><small style="color:#888">${u.uid}</small></div><button class="btn-danger btn-small" onclick="delUser('${u.uid}')">✖</button>`;
        c.appendChild(d);
    });
}
function esc(s){ return s.replace(/"/g,'&quot;'); }

// Export to Window for HTML onclick
window.showView=showView; window.switchTab=switchTab; window.startRegisterNFC=startRegisterNFC;
window.startRegistrationQR=startRegistrationQR; window.startCheckNFC=startCheckNFC;
window.openScanner=openScanner; window.closeScanner=closeScanner; window.delUser=delUser;
