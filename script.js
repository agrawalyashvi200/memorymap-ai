const ITEMS_KEY = 'memorymap_items';
const API_KEY_STORAGE = 'memorymap_gemini_key';
let items = [];
let pendingPhoto = null;

const $ = id => document.getElementById(id);

/* ---------- API key handling ---------- */
function getApiKey(){ return localStorage.getItem(API_KEY_STORAGE) || ''; }

function refreshKeyNotice(){
  const notice = $('keyNotice');
  if(getApiKey()){
    notice.innerHTML = 'Running on Personal Gemini Key. <a href="#" id="openSettingsFromNotice2">Change or remove key</a>';
    document.getElementById('openSettingsFromNotice2').addEventListener('click', e => { e.preventDefault(); openModal(); });
  } else {
    notice.innerHTML = 'Running on Server Gemini Key. <a href="#" id="openSettingsFromNotice2">Use your own key instead</a>';
    document.getElementById('openSettingsFromNotice2').addEventListener('click', e => { e.preventDefault(); openModal(); });
  }
}

function openModal(){
  $('apiKeyInput').value = getApiKey();
  $('modalOverlay').classList.add('open');
}
function closeModal(){ $('modalOverlay').classList.remove('open'); }

$('settingsLink').addEventListener('click', e => { e.preventDefault(); openModal(); });
$('openSettingsFromNotice').addEventListener('click', e => { e.preventDefault(); openModal(); });
$('closeModal').addEventListener('click', closeModal);
$('modalOverlay').addEventListener('click', e => { if(e.target.id === 'modalOverlay') closeModal(); });
$('saveKey').addEventListener('click', () => {
  const val = $('apiKeyInput').value.trim();
  if(val) localStorage.setItem(API_KEY_STORAGE, val);
  else localStorage.removeItem(API_KEY_STORAGE);
  refreshKeyNotice();
  closeModal();
});

/* ---------- image handling ---------- */
function compressImage(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const maxW = 480;
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function setStatus(el, text, cls){
  el.textContent = text;
  el.className = 'status' + (cls ? ' ' + cls : '');
}

/* ---------- storage (per-device, via localStorage) ---------- */
function loadItems(){
  try{ items = JSON.parse(localStorage.getItem(ITEMS_KEY) || '[]'); }
  catch(e){ items = []; }
  renderBoard();
}
function persistItems(){ localStorage.setItem(ITEMS_KEY, JSON.stringify(items)); }

function renderBoard(){
  const grid = $('itemsGrid');
  const empty = $('emptyNote');
  grid.innerHTML = '';
  if(items.length === 0){ empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  items.slice().reverse().forEach(it => {
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `
      <img src="${it.image}" alt="${(it.caption || 'stored item').slice(0,40)}">
      <div class="room">${it.room}${it.note ? ' · ' + it.note : ''}</div>
      <div class="cap">${it.caption || ''}</div>`;
    grid.appendChild(div);
  });
}

/* ---------- file input ---------- */
$('dropZone').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', async e => {
  const file = e.target.files[0];
  if(!file) return;
  const dataUrl = await compressImage(file);
  pendingPhoto = dataUrl;
  $('previewImg').src = dataUrl;
  $('previewName').textContent = file.name;
  $('previewRow').style.display = 'flex';
  $('dropLabel').textContent = 'Photo selected — tap to replace it';
});

/* ---------- Gemini API calls ---------- */
async function callGemini(contents, generationConfig = null){
  const apiKey = getApiKey();
  let url = '';
  let response;

  if (apiKey) {
    url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ contents, generationConfig })
    });
  } else {
    url = '/api/gemini';
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ contents, generationConfig })
    });
  }

  if(!response.ok){
    const errBody = await response.text();
    throw new Error('api_error: ' + errBody);
  }
  const data = await response.json();
  try {
    const text = data.candidates[0].content.parts[0].text;
    return text || '';
  } catch (e) {
    throw new Error('invalid_response: Failed to parse Gemini response payload.');
  }
}

/* ---------- save item ---------- */
$('saveBtn').addEventListener('click', async () => {
  const statusEl = $('saveStatus');
  if(!pendingPhoto){ setStatus(statusEl, 'Choose a photo first.', 'err'); return; }
  setStatus(statusEl, 'AI is looking at the photo…', 'busy');
  const room = $('roomSelect').value;
  const note = $('noteInput').value.trim();
  try{
    const mimeType = pendingPhoto.substring(pendingPhoto.indexOf(':')+1, pendingPhoto.indexOf(';'));
    const base64 = pendingPhoto.split(',')[1];
    
    const contents = [
      {
        parts: [
          { text: `Look at this photo of an item being stored in a ${room}. In one short sentence (under 20 words), describe the item and exactly where it sits relative to nearby objects (e.g. "on the second shelf next to a blue folder"). Only output that one sentence, nothing else.` },
          {
            inlineData: {
              mimeType: mimeType,
              data: base64
            }
          }
        ]
      }
    ];

    const captionText = await callGemini(contents);
    const newItem = {
      id: Date.now().toString(36),
      image: pendingPhoto,
      room, note,
      caption: captionText.trim(),
      timestamp: new Date().toISOString()
    };
    items.push(newItem);
    persistItems();
    renderBoard();
    setStatus(statusEl, 'Remembered ✓', 'ok');
    pendingPhoto = null;
    $('previewRow').style.display = 'none';
    $('dropLabel').textContent = 'Tap to take or choose a photo';
    $('noteInput').value = '';
    $('fileInput').value = '';
  }catch(err){
    console.error('Save error:', err);
    if(err.message === 'missing_key') {
      setStatus(statusEl, 'Add your API key first (top right).', 'err');
    } else if (err.message.startsWith('api_error:')) {
      let displayMsg = 'API Error: ';
      try {
        const rawJson = err.message.replace('api_error:', '').trim();
        const parsed = JSON.parse(rawJson);
        displayMsg += parsed.error?.message || rawJson;
      } catch(e) {
        displayMsg += err.message;
      }
      setStatus(statusEl, displayMsg, 'err');
    } else {
      setStatus(statusEl, 'Error: ' + err.message, 'err');
    }
  }
});

/* ---------- search ---------- */
$('searchBtn').addEventListener('click', runSearch);
$('searchInput').addEventListener('keydown', e => { if(e.key === 'Enter') runSearch(); });

async function runSearch(){
  const statusEl = $('searchStatus');
  const resultBox = $('resultBox');
  const query = $('searchInput').value.trim();
  resultBox.innerHTML = '';
  if(!query){ setStatus(statusEl, "Type what you're looking for.", 'err'); return; }
  if(items.length === 0){ setStatus(statusEl, 'Nothing stored yet — add an item first.', 'err'); return; }
  setStatus(statusEl, 'Searching memories…', 'busy');
  try{
    const catalogue = items.map(it => ({ id: it.id, room: it.room, note: it.note, caption: it.caption, timestamp: it.timestamp }));
    const prompt = `Here is a list of stored items as JSON: ${JSON.stringify(catalogue)}\n\nUser question: "${query}"\n\nFind the single best-matching item. Respond with ONLY a JSON object, no other text, in this exact shape: {"id": "<matching id or null>", "message": "<one natural, friendly sentence telling the user where it is, in the style of 'Last seen on the second shelf near the blue file.' If nothing matches well, explain nothing matching was found>"}`;
    
    const contents = [
      {
        parts: [
          { text: prompt }
        ]
      }
    ];

    const raw = await callGemini(contents, { responseMimeType: 'application/json' });
    const clean = raw.trim();
    const parsed = JSON.parse(clean);
    setStatus(statusEl, '', '');
    if(parsed.id){
      const match = items.find(it => it.id === parsed.id);
      if(match){
        resultBox.innerHTML = `
          <div class="result-card">
            <img src="${match.image}" alt="">
            <div>
              <p class="result-msg"><span class="hand">"${parsed.message}"</span><span class="badge">match</span></p>
              <div class="result-meta">${match.room} · stored ${new Date(match.timestamp).toLocaleDateString()}</div>
            </div>
          </div>`;
        return;
      }
    }
    resultBox.innerHTML = `<div class="result-card"><div><p class="result-msg">${parsed.message || "Couldn't find a confident match."}</p></div></div>`;
  }catch(err){
    console.error('Search error:', err);
    if(err.message === 'missing_key') {
      setStatus(statusEl, 'Add your API key first (top right).', 'err');
    } else if (err.message.startsWith('api_error:')) {
      let displayMsg = 'API Error: ';
      try {
        const rawJson = err.message.replace('api_error:', '').trim();
        const parsed = JSON.parse(rawJson);
        displayMsg += parsed.error?.message || rawJson;
      } catch(e) {
        displayMsg += err.message;
      }
      setStatus(statusEl, displayMsg, 'err');
    } else {
      setStatus(statusEl, 'Search failed: ' + err.message, 'err');
    }
  }
}

/* ---------- clear board ---------- */
$('clearBtn').addEventListener('click', () => {
  if(items.length === 0) return;
  if(!confirm('Clear everything stored on this device?')) return;
  items = [];
  persistItems();
  renderBoard();
});

loadItems();
refreshKeyNotice();
