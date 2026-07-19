const ITEMS_KEY = 'memorymap_items';
const API_KEY_STORAGE = 'memorymap_groq_key';
let items = [];
let pendingPhoto = null;

const $ = id => document.getElementById(id);

/* ---------- API key handling ---------- */
function getApiKey(){ return ''; }

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
  const clearBtn = $('clearBtn');
  const exportBtn = $('exportBtn');
  if (clearBtn) {
    if (items.length === 0) {
      clearBtn.classList.add('disabled');
      clearBtn.setAttribute('disabled', 'true');
      clearBtn.textContent = 'No saved items';
    } else {
      clearBtn.classList.remove('disabled');
      clearBtn.removeAttribute('disabled');
      clearBtn.textContent = 'Delete all items';
    }
  }
  if (exportBtn) {
    if (items.length === 0) {
      exportBtn.classList.add('disabled');
      exportBtn.setAttribute('disabled', 'true');
    } else {
      exportBtn.classList.remove('disabled');
      exportBtn.removeAttribute('disabled');
    }
  }
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

/* ---------- Groq API calls ---------- */
async function callGroq(messages, model = 'llama-3.2-11b-vision-preview', responseFormat = null){
  const apiKey = getApiKey();
  let url = '';
  let headers = {
    'Content-Type': 'application/json'
  };

  if (apiKey) {
    url = 'https://api.groq.com/openai/v1/chat/completions';
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else {
    url = '/api/groq';
  }

  const bodyObj = {
    model,
    messages
  };
  if (responseFormat) {
    bodyObj.response_format = responseFormat;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(bodyObj)
  });

  if(!response.ok){
    const errBody = await response.text();
    throw new Error('api_error: ' + errBody);
  }
  const data = await response.json();
  try {
    const text = data.choices[0].message.content;
    return text || '';
  } catch (e) {
    throw new Error('invalid_response: Failed to parse Groq response payload.');
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
    
    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Look at this photo of an item being stored in a ${room}. In one short sentence (under 20 words), describe the item and exactly where it sits relative to nearby objects (e.g. "on the second shelf next to a blue folder"). Only output that one sentence, nothing else.`
          },
          {
            type: 'image_url',
            image_url: {
              url: pendingPhoto
            }
          }
        ]
      }
    ];

    const captionText = await callGroq(messages, 'llama-3.2-11b-vision-preview');
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
    
    const messages = [
      { role: 'user', content: prompt }
    ];

    const raw = await callGroq(messages, 'llama-3.3-70b-versatile', { type: 'json_object' });
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
  if(!confirm('Delete everything saved on this device? This cannot be undone.')) return;
  items = [];
  persistItems();
  renderBoard();
});

/* ---------- Export & Import backup ---------- */
$('exportBtn').addEventListener('click', () => {
  if (items.length === 0) return;
  try {
    // Create a hidden form to post the JSON content.
    // This triggers a real browser attachment download, which is required
    // for mobile devices (especially iOS Safari/Chrome) where client-side data URIs fail.
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/api/download';

    const dataInput = document.createElement('input');
    dataInput.type = 'hidden';
    dataInput.name = 'data';
    dataInput.value = JSON.stringify(items, null, 2);
    form.appendChild(dataInput);

    const filenameInput = document.createElement('input');
    filenameInput.type = 'hidden';
    filenameInput.name = 'filename';
    filenameInput.value = `memorymap_backup_${new Date().toISOString().slice(0, 10)}.json`;
    form.appendChild(filenameInput);

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  } catch (err) {
    alert("Export failed: " + err.message);
  }
});

$('importFile').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = event => {
    try {
      const importedItems = JSON.parse(event.target.result);
      if (!Array.isArray(importedItems)) {
        throw new Error('Backup file must contain an array of items.');
      }
      
      const isValid = importedItems.every(item => item.id && item.image && item.room && item.timestamp);
      if (!isValid) {
        throw new Error('Invalid backup file structure.');
      }
      
      if (confirm(`Restore ${importedItems.length} items from your backup file?`)) {
        const existingIds = new Set(items.map(it => it.id));
        importedItems.forEach(item => {
          if (!existingIds.has(item.id)) {
            items.push(item);
          }
        });
        persistItems();
        renderBoard();
        alert('Items restored successfully!');
      }
    } catch (err) {
      alert('Error importing backup: ' + err.message);
    }
    e.target.value = ''; // reset file input
  };
  reader.readAsText(file);
});

/* ---------- Request Storage Persistence ---------- */
async function initStoragePersistence() {
  if (navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persisted();
      if (!isPersisted) {
        const granted = await navigator.storage.persist();
        console.log(`Persistent storage granted: ${granted}`);
      }
    } catch (err) {
      console.warn("Storage persistence request failed:", err);
    }
  }
}

initStoragePersistence();
loadItems();
