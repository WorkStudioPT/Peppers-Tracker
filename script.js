/**
 * GARDEN TRACKER — SCRIPT COMPLETO
 * Pepper Tracker (Supabase) + Tabuleiros (Supabase) + Dark Mode
 */

// ════════════════════════════════════════════════════════
// SUPABASE
// ════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://bjvjojpjhyujhyatrxlz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_dvUvVnNBD2yKxKS_Y30b2w_KDozTYOE';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Catálogo partilhado entre o Pepper Tracker e os Tabuleiros
const CATALOGO = [
    { nome: "Tomate",                img: "imagens/tomate.webp" },
    { nome: "Tomate Cherry",         img: "imagens/tomate.webp" },
    { nome: "Tomate Coração de Boi", img: "imagens/tomate.webp" },
    { nome: "Pimento Vermelho",      img: "imagens/pimento_vermelho.webp" },
    { nome: "Pimento Laranja",       img: "imagens/pimento_laranja.webp" },
    { nome: "Pimento Amarelo",       img: "imagens/pimento_amarelo.webp" },
    { nome: "Pimento Verde",         img: "imagens/pimento_verde.webp" },
    { nome: "Jalapeño",              img: "imagens/jalapeno.webp" },
    { nome: "Habanero Vermelho",     img: "imagens/habanero_vermelho.webp" },
    { nome: "Carolina Reaper",       img: "imagens/carolina_reaper.webp" },
    { nome: "Ghost Pepper",          img: "imagens/default.webp" },
    { nome: "Serrano",               img: "imagens/default.webp" },
];

const IMG_DEFAULT = "imagens/default.webp";

// Devolve a imagem do catálogo para um nome de semente
function getImgForSeed(name) {
    if (!name) return IMG_DEFAULT;
    const match = CATALOGO.find(c => c.nome.toLowerCase() === name.toLowerCase());
    return match ? match.img : IMG_DEFAULT;
}

let plants = [];
let isSignUpMode = false;
let currentUserId = null;

// ════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════

_supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
        currentUserId = session.user.id;
        document.getElementById('authOverlay').classList.add('hidden');
        document.getElementById('appContent').style.display = '';
        document.getElementById('userEmailLabel').innerText = session.user.email;
        document.getElementById('startDate').valueAsDate = new Date();
        loadCatalog();

        // Run all 3 data sources in parallel instead of sequentially
        const urlParams = new URLSearchParams(window.location.search);
        const nfcId     = urlParams.get('nfc_id');
        if (nfcId) window.history.replaceState({}, '', window.location.pathname);

        Promise.all([
            loadFromSupabase(),
            tInit(),
            nfcLoadTags()   // prefetch NFC in background — ready instantly when tab is clicked
        ]).then(() => {
            if (nfcId) {
                switchTab('nfc');
                const tag = nfcTags.find(t => t.id == nfcId);
                nfcShowResultModal(tag, tag ? null : { raw: 'ID: ' + nfcId }, null);
            }
        });
    } else {
        currentUserId = null;
        document.getElementById('authOverlay').classList.remove('hidden');
        document.getElementById('appContent').style.display = 'none';
    }
});

async function handleAuth() {
    const email    = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    if (!email || !password) return alert("Preenche os dados!");
    const { error } = isSignUpMode
        ? await _supabase.auth.signUp({ email, password })
        : await _supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
}

function toggleAuthMode() {
    isSignUpMode = !isSignUpMode;
    document.getElementById('authSubtitle').innerText = isSignUpMode ? 'Criar uma conta nova' : 'Bem-vindo de volta';
    document.getElementById('authPrimaryBtn').innerText = isSignUpMode ? 'Registar' : 'Entrar';
    document.getElementById('authSecondaryBtn').innerHTML = isSignUpMode
        ? 'Já tens conta? <span style="color:var(--green)">Entrar</span>'
        : 'Não tens conta? <span style="color:var(--green)">Criar registo</span>';
}

async function handleLogout() { await _supabase.auth.signOut(); }

async function handleForgotPassword() {
    const email = document.getElementById('authEmail').value.trim();
    if (!email) return alert('Introduz o teu email primeiro.');
    const { error } = await _supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.href
    });
    if (error) alert('Erro: ' + error.message);
    else alert('Email de recuperação enviado para ' + email + '. Verifica a caixa de entrada.');
}

// ════════════════════════════════════════════════════════
// DARK MODE
// ════════════════════════════════════════════════════════

function toggleDark() {
    const html   = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    html.setAttribute('data-theme', isDark ? 'light' : 'dark');
    const icon = isDark ? '🌙' : '☀️';
    document.getElementById('darkToggleBtn').textContent = icon;
    const authBtn = document.getElementById('authDarkToggleBtn');
    if (authBtn) authBtn.textContent = icon;
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
}

(function initTheme() {
    const saved = localStorage.getItem('theme');
    if (saved) {
        document.documentElement.setAttribute('data-theme', saved);
        document.addEventListener('DOMContentLoaded', () => {
            const icon = saved === 'dark' ? '☀️' : '🌙';
            document.getElementById('darkToggleBtn').textContent = icon;
            const authBtn = document.getElementById('authDarkToggleBtn');
            if (authBtn) authBtn.textContent = icon;
        });
    }
})();

// ════════════════════════════════════════════════════════
// TABS
// ════════════════════════════════════════════════════════

async function switchTab(tab) {
    ['tracker', 'tray', 'nfc'].forEach(t => {
        document.getElementById(`panel-${t}`).style.display = t === tab ? '' : 'none';
        document.getElementById(`tab-${t}`).classList.toggle('active', t === tab);
    });
    if (tab === 'tray') { tRenderSeeds(); tRenderTrays(); }
    if (tab === 'nfc') {
        if (nfcTags.length === 0) { nfcRenderLoading(); await nfcLoadTags(); }
        nfcRender();
    }
}

// ════════════════════════════════════════════════════════
// PEPPER TRACKER — CORE
// ════════════════════════════════════════════════════════

async function loadFromSupabase() {
    const { data, error } = await _supabase.from('plants').select('*').order('id', { ascending: false });
    if (!error) { plants = data; render(); }
}

function loadCatalog() {
    const dl = document.getElementById('pepperCatalog');
    if (!dl) return;
    dl.innerHTML = CATALOGO.map(c => `<option value="${c.nome}">`).join('');
}

function updateQtyLabel() {
    const stage = document.getElementById('stage').value;
    const label = document.getElementById('labelQty');
    const hc    = document.getElementById('harvestInputContainer');
    if (stage === 'Germinação') {
        label.innerText = 'Sementes';
        hc.style.display = 'none';
    } else if (stage === 'Plantação') {
        label.innerText = 'Nº Plantas';
        hc.style.display = 'none';
    } else {
        label.innerText = 'Plantas Vivas';
        hc.style.display = '';
        renderHarvestInputs('quantity', 'individualPlantsContainer', 'harvest-plant-input');
    }
}

function renderHarvestInputs(qtyId, containerId, cls) {
    const num       = parseInt(document.getElementById(qtyId).value) || 0;
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    for (let i = 1; i <= num; i++) {
        container.innerHTML += `
            <div>
                <label style="font-size:9px;color:var(--text-faint);display:block;text-align:center;margin-bottom:2px">P${i}</label>
                <input type="number" class="${cls}" data-index="${i}" placeholder="0"
                    oninput="calculateTotalHarvest()"
                    style="font-size:12px;padding:6px;height:36px">
            </div>`;
    }
}

function calculateTotalHarvest() {
    const inputs = document.querySelectorAll('.harvest-plant-input, .incard-harvest-input');
    let total = 0;
    inputs.forEach(i => total += parseInt(i.value) || 0);
    document.querySelectorAll('[id^="total-harvest-display-"], #totalHarvestCalc')
            .forEach(d => d.innerText = total);
}

// ── IN-CARD FORMS (ADVANCE + EDIT) ────────────────────

function openInCardForm(id, type, historyId = null) {
    const p    = plants.find(x => x.id == id);
    const area = document.getElementById(`in-card-area-${id}`);
    area.classList.remove('hidden');

    let title = '', defaultQty = p.quantity;
    let defaultDate = new Date().toISOString().split('T')[0];
    let action = '', isHarvest = false, minDateStr = '';

    if (type === 'next') {
        const nextStage = p.stage === 'Germinação' ? 'Plantação' : 'Colheita';
        isHarvest   = nextStage === 'Colheita';
        title       = `Avançar → ${nextStage}`;
        action      = `submitNextStage(${id}, '${nextStage}')`;
        minDateStr  = p.lastUpdated;
    } else {
        const hItem  = p.history.find(h => h.id === historyId);
        const hIndex = p.history.findIndex(h => h.id === historyId);
        isHarvest    = hItem.text.includes('Colheita');
        title        = 'Corrigir Etapa';
        defaultQty   = parseInt(hItem.text.match(/\d+/) || p.quantity);
        defaultDate  = hItem.date;
        action       = `submitHistoryEdit(${id}, ${historyId})`;
        if (hIndex > 0) minDateStr = p.history[hIndex - 1].date;
    }

    area.innerHTML = `
        <div class="incard-form">
            <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px">${title}</div>
            <div class="form-grid-2" style="margin-bottom:10px">
                <div class="${isHarvest ? 'hidden' : ''}">
                    <label class="field-label">Quantidade</label>
                    <input type="number" id="incard-qty-${id}" value="${defaultQty}" style="height:40px;font-size:13px">
                </div>
                <div>
                    <label class="field-label">Data</label>
                    <input type="date" id="incard-date-${id}" value="${defaultDate}"
                        ${minDateStr ? `min="${minDateStr}"` : ''}
                        style="height:40px;font-size:13px">
                </div>
            </div>
            <div id="incard-harvest-area-${id}" class="${isHarvest ? '' : 'hidden'}" style="margin-bottom:10px">
                <label class="field-label" style="color:var(--orange)">Frutos por planta</label>
                <div id="incard-harvest-grid-${id}" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:8px 0"></div>
                <div style="font-size:10px;font-weight:700;background:var(--orange-bg);color:var(--orange);padding:8px 12px;border-radius:8px;display:flex;justify-content:space-between;border:1px solid #f0b070">
                    <span>TOTAL</span><span id="total-harvest-display-${id}">0</span>
                </div>
            </div>
            <div style="display:flex;gap:8px">
                <button onclick="${action}" class="btn-primary" style="padding:10px;font-size:12px">Confirmar</button>
                <button onclick="document.getElementById('in-card-area-${id}').classList.add('hidden')"
                    class="btn-ghost" style="font-size:12px;padding:10px">Cancelar</button>
            </div>
        </div>`;

    if (isHarvest) {
        const grid = document.getElementById(`incard-harvest-grid-${id}`);
        grid.innerHTML = '';
        let plantasVivas = p.quantity;
        if (type === 'edit') {
            const hIndex = p.history.findIndex(h => h.id === historyId);
            if (hIndex > 0) {
                const prevText = p.history[hIndex - 1].text;
                plantasVivas = parseInt(prevText.match(/(\d+)\//)?.[1] || prevText.match(/\d+/)?.[0] || plantasVivas);
            }
        }
        for (let i = 1; i <= plantasVivas; i++) {
            grid.innerHTML += `
                <input type="number" class="incard-harvest-input" placeholder="P${i}"
                    oninput="calculateTotalHarvest()"
                    style="background:var(--orange-bg);border:1px solid #f0b070;border-radius:8px;
                           padding:4px;height:34px;text-align:center;font-size:12px;width:100%">`;
        }
    }
}

async function submitNextStage(id, nextStage) {
    const p    = plants.find(x => x.id == id);
    const date = document.getElementById(`incard-date-${id}`).value;
    const qty  = nextStage === 'Colheita'
        ? p.quantity
        : (parseInt(document.getElementById(`incard-qty-${id}`).value) || 0);

    if (new Date(date) <= new Date(p.lastUpdated))
        return alert(`⚠️ A data (${date}) tem de ser posterior à etapa anterior (${p.lastUpdated})!`);
    if (nextStage === 'Plantação' && qty > p.quantity)
        return alert(`⚠️ Não podes plantar mais do que germinou!`);

    let history = [...p.history];
    const days  = calculateDays(p.startDate, date);
    let info    = '';

    if (nextStage === 'Plantação') {
        info = `🌿 Plantação: ${qty}/${p.quantity} plantas. Taxa: ${Math.round((qty / p.quantity) * 100)}% (Dia ${days}).`;
    } else {
        let total = 0, rows = '';
        document.querySelectorAll('.incard-harvest-input').forEach((input, i) => {
            const val = parseInt(input.value) || 0;
            total += val;
            rows  += `<tr><td class="border px-2 py-1">P${i + 1}</td><td class="border px-2 py-1 text-center font-bold" style="color:var(--orange)">${val}</td></tr>`;
        });
        info = `<div style="font-weight:700;color:var(--orange);margin-bottom:4px">🍎 Colheita: Total ${total} frutos (Dia ${days})</div><table class="harvest-table"><tbody>${rows}</tbody></table>`;
    }

    history.push({ id: Date.now(), text: info, date });
    await _supabase.from('plants').update({ stage: nextStage, quantity: qty, lastUpdated: date, history }).eq('id', id);
    loadFromSupabase();
}

async function submitHistoryEdit(pId, hId) {
    const p      = plants.find(x => x.id == pId);
    const newQty = parseInt(document.getElementById(`incard-qty-${pId}`).value) || 0;
    const newDate = document.getElementById(`incard-date-${pId}`).value;

    let history = [...p.history];
    const index = history.findIndex(h => h.id === hId);

    if (history[index].text.includes('Colheita')) {
        let total = 0, rows = '';
        const days = calculateDays(p.startDate, newDate);
        document.querySelectorAll('.incard-harvest-input').forEach((input, i) => {
            const val = parseInt(input.value) || 0;
            total += val;
            rows  += `<tr><td class="border px-2 py-1">P${i + 1}</td><td class="border px-2 py-1 text-center font-bold" style="color:var(--orange)">${val}</td></tr>`;
        });
        history[index].text = `<div style="font-weight:700;color:var(--orange);margin-bottom:4px">🍎 Colheita: Total ${total} frutos (Dia ${days})</div><table class="harvest-table"><tbody>${rows}</tbody></table>`;
    } else if (index === 0) {
        history[index].text = `🌱 Germinação: ${newQty} sementes iniciadas.`;
    } else {
        const germQty = parseInt(history[0].text.match(/\d+/) || 0);
        const taxa    = germQty > 0 ? Math.round((newQty / germQty) * 100) : 0;
        const days    = calculateDays(p.startDate, newDate);
        history[index].text = `🌿 Plantação: ${newQty}/${germQty} plantas. Taxa: ${taxa}% (Dia ${days}).`;
    }

    history[index].date = newDate;

    if (index === 0 && history.length > 1) {
        const plantacaoItem  = history[1];
        const match          = plantacaoItem.text.match(/Plantação: (\d+)\//);
        let   plantasVivas   = match ? parseInt(match[1]) : 0;
        if (plantasVivas > newQty) plantasVivas = newQty;
        const novaTaxa = newQty > 0 ? Math.round((plantasVivas / newQty) * 100) : 0;
        const dias     = calculateDays(p.startDate, plantacaoItem.date);
        history[1].text = `🌿 Plantação: ${plantasVivas}/${newQty} plantas. Taxa: ${novaTaxa}% (Dia ${dias}).`;
    }

    const isLatest   = index === history.length - 1;
    const updateData = { history };
    if (isLatest) { updateData.quantity = newQty; updateData.lastUpdated = newDate; }

    const { error } = await _supabase.from('plants').update(updateData).eq('id', pId);
    if (error) alert('Erro: ' + error.message);
    loadFromSupabase();
}

// ── CRUD ──────────────────────────────────────────────

async function handleAction() {
    const variety = document.getElementById('variety').value.trim();
    const qty     = parseInt(document.getElementById('quantity').value) || 0;
    const date    = document.getElementById('startDate').value;
    const stage   = document.getElementById('stage').value;
    if (!variety) return alert('Indica a variedade!');

    const match   = CATALOGO.find(p => p.nome.toLowerCase() === variety.toLowerCase());
    const payload = {
        variety, quantity: qty, stage,
        imgUrl:      match ? match.img : IMG_DEFAULT,
        startDate:   date,
        lastUpdated: date,
        archived:    false,
        history: [{ id: Date.now(), text: `🌱 Germinação: ${qty} sementes iniciadas.`, date }]
    };

    await _supabase.from('plants').insert([payload]);
    resetForm();
    loadFromSupabase();
}

function render() {
    const list    = document.getElementById('plantList');
    const archive = document.getElementById('archiveList');
    list.innerHTML = ''; archive.innerHTML = '';
    let activeIdx = 0, archiveIdx = 0;

    plants.forEach(p => {
        const days       = calculateDays(p.startDate, new Date());
        const stageColor = p.stage === 'Colheita' ? 'badge-orange' : 'badge-green';

        const historyHTML = p.history.map(h => `
            <div class="timeline-item">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;opacity:0.65">
                    <span style="font-family:'DM Mono',monospace;font-size:10px;font-weight:600">${h.date}</span>
                    <div style="display:flex;gap:10px">
                        <span onclick="openInCardForm(${p.id}, 'edit', ${h.id})"
                            style="cursor:pointer;font-size:10px;font-weight:700;color:#26c800">Editar</span>
                        <span onclick="deleteHistory(${p.id}, ${h.id})"
                            style="cursor:pointer;font-size:10px;font-weight:700;color:var(--red)">Apagar</span>
                    </div>
                </div>
                <div class="timeline-text">${h.text}</div>
            </div>`).join('');

        const cardInner = `
            <div class="plant-card ${p.archived ? 'archived' : ''} fade-in" style="border-top-left-radius:0;border-top-right-radius:0;border-top:none;margin-top:0">
                <div style="display:flex;gap:14px;align-items:center;margin-bottom:14px">
                    <div class="plant-img-wrap">
                        <img src="${p.imgUrl}" onerror="this.src='${IMG_DEFAULT}'">
                    </div>
                    <div style="flex:1">
                        <div style="font-family:'Lora',serif;font-size:16px;font-weight:700">${p.variety}</div>
                        <div style="font-size:11px;color:var(--text-muted);margin-top:3px;font-weight:600">${p.quantity} unid.</div>
                    </div>
                    ${p.stage !== 'Colheita' && !p.archived
                        ? `<button onclick="openInCardForm(${p.id}, 'next')" class="btn-primary"
                               style="flex:0;padding:9px 14px;font-size:11px;white-space:nowrap">Próxima →</button>`
                        : ''}
                </div>
                <div id="in-card-area-${p.id}" class="hidden"></div>
                <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:4px">${historyHTML}</div>
                <div style="display:flex;justify-content:space-between;margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
                    <button onclick="deletePlant(${p.id})"
                        style="background:none;border:none;cursor:pointer;font-size:11px;font-weight:600;color:var(--text-faint)"
                        onmouseover="this.style.color='var(--red)'"
                        onmouseout="this.style.color='var(--text-faint)'">Eliminar</button>
                    <button onclick="toggleArchive(${p.id})"
                        style="background:none;border:none;cursor:pointer;font-size:11px;font-weight:600;color:var(--text-muted)">
                        ${p.archived ? '📤 Restaurar' : '📥 Arquivar'}</button>
                </div>
            </div>`;

        const isFirst = p.archived ? archiveIdx === 0 : activeIdx === 0;
        const card = `
            <details class="collapsible-section" ${isFirst ? 'open' : ''}>
                <summary class="collapsible-header">
                    <div style="display:flex;align-items:center;gap:10px">
                        <span class="badge badge-muted">${p.startDate}</span>
                        <span style="font-family:'Lora',serif;font-size:14px;font-weight:700;color:var(--text);text-transform:none;letter-spacing:0">${p.variety}</span>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center">
                        <span class="badge ${stageColor}">${p.stage}</span>
                        <span class="badge badge-muted">${days}d</span>
                        <span class="collapsible-arrow">▾</span>
                    </div>
                </summary>
                ${cardInner}
            </details>`;

        if (p.archived) { archive.innerHTML += card; archiveIdx++; }
        else            { list.innerHTML    += card; activeIdx++; }
    });

    document.getElementById('archiveCount').innerText =
        `(${document.getElementById('archiveList').childElementCount})`;
}

function resetForm() {
    document.getElementById('variety').value  = '';
    document.getElementById('quantity').value = '1';
    document.getElementById('startDate').valueAsDate = new Date();
    document.getElementById('stage').value    = 'Germinação';
    document.getElementById('cancelBtn').style.display = 'none';
    document.getElementById('formTitle').innerText     = 'Novo Registo';
    updateQtyLabel();
}

function calculateDays(s, e) {
    const start = new Date(s), end = new Date(e);
    start.setHours(0, 0, 0, 0); end.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((end - start) / 86400000));
}

async function deleteHistory(pId, hId) {
    if (!confirm('Apagar registo?')) return;
    const p = plants.find(x => x.id == pId);
    await _supabase.from('plants').update({ history: p.history.filter(h => h.id !== hId) }).eq('id', pId);
    loadFromSupabase();
}

async function deletePlant(id) {
    if (confirm('Apagar permanentemente?')) {
        await _supabase.from('plants').delete().eq('id', id);
        loadFromSupabase();
    }
}

async function toggleArchive(id) {
    const p = plants.find(x => x.id == id);
    await _supabase.from('plants').update({ archived: !p.archived }).eq('id', id);
    loadFromSupabase();
}

// ════════════════════════════════════════════════════════
// TABULEIROS — sincronizado com Supabase
// Usa imagens do CATALOGO em vez de emojis
// ════════════════════════════════════════════════════════

let tState = { seeds: [], trays: [] };
let tDrag  = {};
let tCellModal = {};
let tSelectedCatalogIdx = 0; // índice seleccionado no picker do catálogo
const T_COLORS = ['#5d9b3c','#e8a020','#c0392b','#2980b9','#8e44ad','#e74c3c','#16a085','#d35400','#7f8c8d','#27ae60'];
let tSelectedColor = '#5d9b3c';

// ── SUPABASE: SEEDS ────────────────────────────────────

async function tLoadSeeds() {
    const { data, error } = await _supabase
        .from('tray_seeds')
        .select('*')
        .order('id', { ascending: true });
    if (!error && data) {
        tState.seeds = data;
        tRenderSeeds();
        tRenderTrays();
    }
}

async function tAddSeedDB() {
    const name = document.getElementById('tSeedName').value.trim();
    if (!name) return;
    const selectedCatalog = CATALOGO[tSelectedCatalogIdx] || CATALOGO[0];
    const payload = {
        user_id: currentUserId,
        name:    name,
        variety: '',
        img:     selectedCatalog.img,
        color:   tSelectedColor
    };
    const { data, error } = await _supabase.from('tray_seeds').insert([payload]).select().single();
    if (error) return alert('Erro ao guardar semente: ' + error.message);
    tState.seeds.push(data);
    tRenderSeeds();
    tRenderTrays();
    document.getElementById('tSeedName').value = '';
}

async function tDeleteSeed(id) {
    const { error } = await _supabase.from('tray_seeds').delete().eq('id', id);
    if (error) return alert('Erro ao apagar semente: ' + error.message);
    tState.seeds = tState.seeds.filter(s => s.id !== id);
    tRenderSeeds();
    tRenderTrays();
}

// ── SUPABASE: TRAYS ────────────────────────────────────

async function tLoadTrays() {
    const { data, error } = await _supabase
        .from('trays')
        .select('*')
        .order('id', { ascending: true });
    if (!error && data) {
        tState.trays = data;
        tRenderTrays();
    }
}

async function tCreateTrayDB() {
    const name = document.getElementById('newTrayName').value.trim() || `Tabuleiro`;
    const cols = Math.max(1, Math.min(20, parseInt(document.getElementById('newTrayCols').value) || 4));
    const rows = Math.max(1, Math.min(20, parseInt(document.getElementById('newTrayRows').value) || 4));
    const cells = Array.from({ length: rows }, () => Array(cols).fill(null));
    const payload = {
        user_id: currentUserId,
        name, cols, rows, cells,
        created: new Date().toISOString().split('T')[0]
    };
    const { data, error } = await _supabase.from('trays').insert([payload]).select().single();
    if (error) return alert('Erro ao criar tabuleiro: ' + error.message);
    tState.trays.push(data);
    closeNewTrayModal();
    tRenderTrays();
}

async function tDeleteTrayDB(id) {
    if (!confirm('Apagar este tabuleiro?')) return;
    const { error } = await _supabase.from('trays').delete().eq('id', id);
    if (error) return alert('Erro ao apagar: ' + error.message);
    tState.trays = tState.trays.filter(t => t.id !== id);
    tRenderTrays();
}

async function tRenameTrayDB(id, val) {
    const name = val || `Tabuleiro`;
    const { error } = await _supabase.from('trays').update({ name }).eq('id', id);
    if (!error) {
        const t = tState.trays.find(t => t.id === id);
        if (t) t.name = name;
    }
}

async function tSaveCells(trayId, cells) {
    const { error } = await _supabase.from('trays').update({ cells }).eq('id', trayId);
    if (error) alert('Erro ao guardar células: ' + error.message);
}

// ── INIT ───────────────────────────────────────────────

async function tInit() {
    tRenderCatalogPicker();
    tRenderColorRow();
    tRenderSeeds();
    tRenderTrays();
    // Load seeds and trays in parallel
    const [seedsResult] = await Promise.all([tLoadSeeds(), tLoadTrays()]);
    if (tState.seeds.length === 0) await tDefaultSeeds();
}

async function tDefaultSeeds() {
    // Sementes iniciais baseadas no catálogo com imagens
    const defaults = [
        { name: 'Tomate',   variety: 'Cherry',  img: 'imagens/tomate.webp',            color: '#c0392b' },
        { name: 'Jalapeño', variety: 'Jalapeño', img: 'imagens/jalapeno.webp',           color: '#5d9b3c' },
        { name: 'Pimento',  variety: 'Vermelho', img: 'imagens/pimento_vermelho.webp',   color: '#e8a020' },
    ];
    for (const s of defaults) {
        const { data } = await _supabase
            .from('tray_seeds')
            .insert([{ user_id: currentUserId, ...s }])
            .select().single();
        if (data) tState.seeds.push(data);
    }
    tRenderSeeds();
}

// ── CATALOG PICKER (substitui o emoji grid) ────────────

function tRenderCatalogPicker() {
    const grid = document.getElementById('tEmojiGrid');
    if (!grid) return;
    grid.innerHTML = CATALOGO.map((c, i) => `
        <div onclick="tSelectCatalog(${i})" title="${c.nome}"
            style="cursor:pointer;border-radius:8px;padding:4px;border:2px solid ${i === tSelectedCatalogIdx ? 'var(--green)' : 'transparent'};
                   background:${i === tSelectedCatalogIdx ? 'var(--green-bg)' : 'transparent'};transition:all 0.1s;text-align:center">
            <img src="${c.img}" alt="${c.nome}"
                style="width:32px;height:32px;object-fit:contain;border-radius:4px;display:block;margin:0 auto"
                onerror="this.src='${IMG_DEFAULT}'">
            <div style="font-size:8px;color:var(--text-faint);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:40px">${c.nome.split(' ')[0]}</div>
        </div>`).join('');

    // Atualiza o input de nome automaticamente ao selecionar
    const nameInput = document.getElementById('tSeedName');
    if (nameInput && !nameInput.value) nameInput.value = CATALOGO[tSelectedCatalogIdx].nome;
}

function tSelectCatalog(idx) {
    tSelectedCatalogIdx = idx;
    tRenderCatalogPicker();
    // Auto-preenche o nome
    const nameInput = document.getElementById('tSeedName');
    if (nameInput) nameInput.value = CATALOGO[idx].nome;
}

function tRenderColorRow() {
    document.getElementById('tColorRow').innerHTML = T_COLORS.map(c =>
        `<div class="color-swatch ${c === tSelectedColor ? 'selected' : ''}"
              style="background:${c}" onclick="tSelectColor('${c}')"></div>`
    ).join('');
}

function tSelectColor(c) { tSelectedColor = c; tRenderColorRow(); }

// ── PUBLIC ALIASES (chamados pelo HTML) ────────────────

function tAddSeed()           { tAddSeedDB(); }
function createTray()         { tCreateTrayDB(); }
function tDeleteTray(id)      { tDeleteTrayDB(id); }
function tRenameTray(id, val) { tRenameTrayDB(id, val); }

function openEditTrayModal(id) {
    const tray = tState.trays.find(t => t.id === id);
    if (!tray) return;
    document.getElementById('editTrayId').value   = id;
    document.getElementById('editTrayName').value = tray.name;
    document.getElementById('editTrayCols').value = tray.cols;
    document.getElementById('editTrayRows').value = tray.rows;
    document.getElementById('editTrayModal').classList.add('open');
    setTimeout(() => document.getElementById('editTrayName').focus(), 100);
}

function closeEditTrayModal() { document.getElementById('editTrayModal').classList.remove('open'); }

async function saveEditTray() {
    const id   = parseInt(document.getElementById('editTrayId').value);
    const name = document.getElementById('editTrayName').value.trim() || 'Tabuleiro';
    const cols = Math.max(1, Math.min(20, parseInt(document.getElementById('editTrayCols').value) || 4));
    const rows = Math.max(1, Math.min(20, parseInt(document.getElementById('editTrayRows').value) || 4));

    const tray = tState.trays.find(t => t.id === id);
    if (!tray) return;

    // Redimensionar células mantendo as existentes
    const newCells = Array.from({ length: rows }, (_, ri) =>
        Array.from({ length: cols }, (_, ci) =>
            (tray.cells[ri] && tray.cells[ri][ci]) ? tray.cells[ri][ci] : null
        )
    );

    const { error } = await _supabase.from('trays').update({ name, cols, rows, cells: newCells }).eq('id', id);
    if (error) return alert('Erro ao guardar: ' + error.message);

    tray.name  = name;
    tray.cols  = cols;
    tray.rows  = rows;
    tray.cells = newCells;

    closeEditTrayModal();
    tRenderTrays();
}

// ── HELPERS: imagem de uma seed ────────────────────────

function getSeedImg(s) {
    // Se a seed já tem campo img guardado usa-o, senão tenta encontrar pelo nome
    if (s.img) return s.img;
    return getImgForSeed(s.name);
}

// ── SEED RENDER ────────────────────────────────────────

function tRenderSeeds() {
    const lib = document.getElementById('tray-seed-library');
    if (!lib) return;
    if (tState.seeds.length === 0) {
        lib.innerHTML = '<div style="font-size:11px;color:var(--text-faint);text-align:center;padding:16px">Adiciona sementes</div>';
        return;
    }
    lib.innerHTML = tState.seeds.map(s => {
        const img = getSeedImg(s);
        return `
        <div class="seed-item" draggable="true"
            ondragstart="tOnSeedDragStart(event, ${s.id})"
            ondragend="tOnSeedDragEnd(event)">
            <div style="width:32px;height:32px;border-radius:6px;overflow:hidden;flex-shrink:0;background:var(--bg-subtle);border:1px solid var(--border)">
                <img src="${img}" alt="${s.name}"
                    style="width:100%;height:100%;object-fit:contain"
                    onerror="this.src='${IMG_DEFAULT}'">
            </div>
            <div style="flex:1;min-width:0">
                <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                    ${s.name}${s.variety ? ` <span style="color:var(--text-faint);font-size:10px">${s.variety}</span>` : ''}
                </div>
            </div>
            <div style="width:8px;height:8px;border-radius:50%;background:${s.color};flex-shrink:0"></div>
            <div onclick="tDeleteSeed(${s.id})"
                style="cursor:pointer;font-size:11px;color:var(--text-faint);padding:2px 4px" title="Remover">✕</div>
        </div>`;
    }).join('');
}

// ── TRAY MODAL ─────────────────────────────────────────

function openNewTrayModal() {
    document.getElementById('newTrayName').value = '';
    document.getElementById('newTrayCols').value = 4;
    document.getElementById('newTrayRows').value = 4;
    document.getElementById('newTrayModal').classList.add('open');
    setTimeout(() => document.getElementById('newTrayName').focus(), 100);
}

function closeNewTrayModal() { document.getElementById('newTrayModal').classList.remove('open'); }

// ── TRAY RENDER ────────────────────────────────────────

function tRenderTrays() {
    const c = document.getElementById('tTraysContainer');
    if (!c) return;
    if (tState.trays.length === 0) {
        c.innerHTML = `
            <div class="no-trays">
                <div style="font-size:48px;margin-bottom:12px">🌿</div>
                <div style="font-family:'Lora',serif;font-size:18px;font-weight:600;margin-bottom:8px">Sem tabuleiros</div>
                <div style="font-size:13px;color:var(--text-faint)">Cria um tabuleiro para começar</div>
            </div>`;
        return;
    }

    c.innerHTML = tState.trays.map((tray, trayIdx) => {
        const filled = tray.cells.flat().filter(Boolean).length;
        const total  = tray.rows * tray.cols;
        const colW   = Math.max(54, Math.min(86, Math.floor(380 / tray.cols) - 6));

        let legendSeeds = {};
        tray.cells.flat().forEach(cell => {
            if (cell) {
                const s = tState.seeds.find(s => s.id === cell.seedId);
                if (s) legendSeeds[s.id] = s;
            }
        });

        const cellsHTML = tray.cells.map((row, ri) => row.map((cell, ci) => {
            const pos = `${String.fromCharCode(65 + ci)}${ri + 1}`;
            if (cell) {
                const s = tState.seeds.find(s => s.id === cell.seedId);
                if (!s) return tEmptyCell(tray.id, ri, ci, colW, pos);
                const img = getSeedImg(s);
                return `
                    <div class="tray-cell filled"
                        style="width:${colW}px;border-color:${s.color}55;background:${s.color}14"
                        draggable="true"
                        ondragstart="tOnCellDragStart(event,${tray.id},${ri},${ci})"
                        ondragend="tOnCellDragEnd(event)"
                        ondragover="tOnDragOver(event)"
                        ondragleave="tOnDragLeave(event)"
                        ondrop="tOnDrop(event,${tray.id},${ri},${ci})"
                        onclick="tOpenCellModal(${tray.id},${ri},${ci})">
                        <span class="cell-pos">${pos}</span>
                        <div class="cell-remove" onclick="tRemoveCell(event,${tray.id},${ri},${ci})">✕</div>
                        <img src="${img}" alt="${s.name}"
                            style="width:32px;height:32px;object-fit:contain;transition:transform 0.15s"
                            onerror="this.src='${IMG_DEFAULT}'"
                            class="cell-img">
                        <span class="cell-label" style="color:${s.color}">${s.name}</span>
                        ${cell.date ? `<span style="font-size:8px;color:var(--text-faint);position:absolute;bottom:3px;left:0;right:0;text-align:center">${cell.date.slice(5)}</span>` : ''}
                    </div>`;
            }
            return tEmptyCell(tray.id, ri, ci, colW, pos);
        }).join('')).join('');

        const legend = Object.values(legendSeeds).map(s => {
            const img = getSeedImg(s);
            return `
            <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-muted)">
                <img src="${img}" alt="${s.name}"
                    style="width:16px;height:16px;object-fit:contain;border-radius:3px"
                    onerror="this.src='${IMG_DEFAULT}'">
                ${s.name}${s.variety ? ' · ' + s.variety : ''}
            </div>`;
        }).join('');

        return `
            <details class="collapsible-section" ${trayIdx === 0 ? 'open' : ''}>
                <summary class="collapsible-header">
                    <div style="display:flex;align-items:center;gap:10px">
                        <span class="badge badge-muted">${tray.cols}×${tray.rows}</span>
                        <input class="tray-name-input" value="${tray.name}"
                            onclick="event.stopPropagation()"
                            onblur="tRenameTray(${tray.id},this.value)"
                            onkeydown="if(event.key==='Enter')this.blur()">
                    </div>
                    <div style="display:flex;align-items:center;gap:12px">
                        <span style="font-family:'DM Mono',monospace;font-size:10px;color:var(--text-faint)">${filled}/${total}</span>
                        <button onclick="event.stopPropagation();openEditTrayModal(${tray.id})"
                            style="background:none;border:none;cursor:pointer;font-size:13px;color:var(--text-faint)"
                            onmouseover="this.style.color='var(--green)'"
                            onmouseout="this.style.color='var(--text-faint)'" title="Editar">✏️</button>
                        <button onclick="event.stopPropagation();tDeleteTray(${tray.id})"
                            style="background:none;border:none;cursor:pointer;font-size:13px;color:var(--text-faint)"
                            onmouseover="this.style.color='var(--red)'"
                            onmouseout="this.style.color='var(--text-faint)'">🗑</button>
                        <span class="collapsible-arrow">▾</span>
                    </div>
                </summary>
                <div class="tray-wrapper" style="border-top-left-radius:0;border-top-right-radius:0;border-top:none;margin-top:0">
                    <div style="padding:16px;overflow-x:auto">
                        <div style="display:grid;grid-template-columns:repeat(${tray.cols},${colW}px);gap:5px;width:fit-content">
                            ${cellsHTML}
                        </div>
                    </div>
                    ${legend ? `<div style="padding:10px 16px;border-top:1px solid var(--border);display:flex;flex-wrap:wrap;gap:12px">${legend}</div>` : ''}
                </div>
            </details>`;
    }).join('');
}

function tEmptyCell(trayId, ri, ci, colW, pos) {
    return `
        <div class="tray-cell" style="width:${colW}px"
            ondragover="tOnDragOver(event)"
            ondragleave="tOnDragLeave(event)"
            ondrop="tOnDrop(event,${trayId},${ri},${ci})"
            onclick="tOpenCellModal(${trayId},${ri},${ci})">
            <span class="cell-pos">${pos}</span>
            <span style="font-size:16px;color:var(--text-faint)">+</span>
        </div>`;
}

async function tRemoveCell(e, trayId, row, col) {
    e.stopPropagation();
    const tray = tState.trays.find(t => t.id === trayId);
    if (!tray) return;
    tray.cells[row][col] = null;
    await tSaveCells(trayId, tray.cells);
    tRenderTrays();
}

// ── CELL MODAL ─────────────────────────────────────────

function tOpenCellModal(trayId, row, col) {
    tCellModal = { trayId, row, col };
    const tray = tState.trays.find(t => t.id === trayId);
    const cell = tray?.cells[row][col];
    const pos  = `${String.fromCharCode(65 + col)}${row + 1}`;

    document.getElementById('cellModalTitle').textContent = `Vaso ${pos} · ${tray.name}`;
    const sel = document.getElementById('cellSeedSelect');
    sel.innerHTML = '<option value="">— Escolher —</option>' +
        tState.seeds.map(s =>
            `<option value="${s.id}" ${cell?.seedId === s.id ? 'selected' : ''}>
                ${s.name}${s.variety ? ' · ' + s.variety : ''}
            </option>`
        ).join('');

    document.getElementById('cellDate').value  = cell?.date  || new Date().toISOString().split('T')[0];
    document.getElementById('cellQty').value   = cell?.qty   || 1;
    document.getElementById('cellNotes').value = cell?.notes || '';
    document.getElementById('clearCellBtn').style.display = cell ? '' : 'none';
    document.getElementById('cellModal').classList.add('open');
}

function closeCellModal() { document.getElementById('cellModal').classList.remove('open'); }

async function saveCellModal() {
    const seedId = parseInt(document.getElementById('cellSeedSelect').value);
    if (!seedId) { closeCellModal(); return; }
    const { trayId, row, col } = tCellModal;
    const tray = tState.trays.find(t => t.id === trayId);
    tray.cells[row][col] = {
        seedId,
        date:  document.getElementById('cellDate').value,
        qty:   parseInt(document.getElementById('cellQty').value) || 1,
        notes: document.getElementById('cellNotes').value.trim()
    };
    await tSaveCells(trayId, tray.cells);
    closeCellModal();
    tRenderTrays();
}

async function clearCell() {
    const { trayId, row, col } = tCellModal;
    const tray = tState.trays.find(t => t.id === trayId);
    tray.cells[row][col] = null;
    await tSaveCells(trayId, tray.cells);
    closeCellModal();
    tRenderTrays();
}

// ── DRAG & DROP ────────────────────────────────────────

const ghost = document.getElementById('dragGhost');
document.addEventListener('dragover', e => {
    ghost.style.left = e.clientX + 14 + 'px';
    ghost.style.top  = e.clientY + 14 + 'px';
});

function tShowGhost(e, img, name) {
    // Ghost usa imagem em vez de emoji
    const ghostEmoji = document.getElementById('dragGhostEmoji');
    ghostEmoji.innerHTML = `<img src="${img}" alt="${name}" style="width:24px;height:24px;object-fit:contain" onerror="this.src='${IMG_DEFAULT}'">`;
    document.getElementById('dragGhostName').textContent = name;
    ghost.style.display = 'flex';
}

function tHideDrag() {
    ghost.style.display = 'none';
    document.querySelectorAll('.tray-cell.drag-over').forEach(el => el.classList.remove('drag-over'));
}

function tOnSeedDragStart(e, seedId) {
    tDrag = { type: 'library', seedId };
    const s = tState.seeds.find(s => s.id === seedId);
    e.dataTransfer.effectAllowed = 'copy';
    e.currentTarget.classList.add('dragging');
    tShowGhost(e, getSeedImg(s), s.name);
}

function tOnSeedDragEnd(e) { e.currentTarget.classList.remove('dragging'); tHideDrag(); }

function tOnCellDragStart(e, trayId, row, col) {
    const tray = tState.trays.find(t => t.id === trayId);
    const cell = tray?.cells[row][col];
    if (!cell) return;
    tDrag = { type: 'cell', seedId: cell.seedId, fromTrayId: trayId, fromRow: row, fromCol: col, cellData: { ...cell } };
    e.dataTransfer.effectAllowed = 'move';
    const s = tState.seeds.find(s => s.id === cell.seedId);
    tShowGhost(e, getSeedImg(s) || IMG_DEFAULT, s?.name || '');
}

function tOnCellDragEnd() { tHideDrag(); }

function tOnDragOver(e)  { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function tOnDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }

async function tOnDrop(e, trayId, row, col) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const tray = tState.trays.find(t => t.id === trayId);
    if (!tray) return;

    if (tDrag.type === 'library') {
        tray.cells[row][col] = {
            seedId: tDrag.seedId,
            date:   new Date().toISOString().split('T')[0],
            qty: 1, notes: ''
        };
        await tSaveCells(trayId, tray.cells);
    } else if (tDrag.type === 'cell') {
        const fromTray = tState.trays.find(t => t.id === tDrag.fromTrayId);
        const dest     = tray.cells[row][col] ? { ...tray.cells[row][col] } : null;
        tray.cells[row][col] = { ...tDrag.cellData };
        if (fromTray) {
            fromTray.cells[tDrag.fromRow][tDrag.fromCol] = dest;
            if (fromTray.id !== trayId) await tSaveCells(fromTray.id, fromTray.cells);
        }
        await tSaveCells(trayId, tray.cells);
    }

    tDrag = {};
    tRenderTrays();
}

// ── MODAL BACKDROPS ────────────────────────────────────

document.getElementById('cellModal').addEventListener('click', function(e) {
    if (e.target === this) closeCellModal();
});
document.getElementById('newTrayModal').addEventListener('click', function(e) {
    if (e.target === this) closeNewTrayModal();
});
document.getElementById('editTrayModal').addEventListener('click', function(e) {
    if (e.target === this) closeEditTrayModal();
});

// ════════════════════════════════════════════════════════
// NFC MODULE
// ════════════════════════════════════════════════════════

let nfcTags        = [];      // loaded from Supabase
let nfcReader      = null;    // NDEFReader instance (scan mode)
let nfcWriter      = null;    // NDEFReader instance (write mode)
let nfcScanActive  = false;
let nfcResultTagId = null;    // tag id shown in result modal

// ── INIT ──────────────────────────────────────────────

async function nfcInit() {
    await nfcLoadTags();
}

async function nfcLoadTags() {
    const { data, error } = await _supabase
        .from('nfc_tags')
        .select('*')
        .order('created_at', { ascending: false });
    if (!error) nfcTags = data || [];
}

// Also populate the pepper datalist for nfc modal
function nfcPopulateCatalog() {
    const dl = document.getElementById('nfcPepperCatalog');
    if (!dl) return;
    dl.innerHTML = CATALOGO.map(c => `<option value="${c.nome}">`).join('');
}

// ── RENDER ────────────────────────────────────────────

function nfcRenderLoading() {
    const container = document.getElementById('nfc-panel-inner');
    if (!container) return;
    container.innerHTML = `
        <div style="max-width:700px;margin:0 auto">
            <div class="nfc-banner nfc-banner-ok" style="opacity:0.5">A carregar…</div>
            <div style="display:flex;gap:10px;margin-bottom:20px">
                <div style="height:42px;width:110px;background:var(--bg-subtle);border-radius:10px;animation:nfcPulse 1.2s infinite"></div>
                <div style="height:42px;width:130px;background:var(--bg-subtle);border-radius:10px;animation:nfcPulse 1.2s infinite"></div>
            </div>
            ${[1,2,3].map(()=>`<div style="height:84px;background:var(--bg-card);border:1px solid var(--border);border-radius:16px;margin-bottom:12px;animation:nfcPulse 1.2s infinite"></div>`).join('')}
        </div>`;
}

function nfcRender() {
    nfcPopulateCatalog();
    const container = document.getElementById('nfc-panel-inner');
    if (!container) return;

    const nfcSupported = 'NDEFReader' in window;

    const tagsHTML = nfcTags.length === 0
        ? `<div style="text-align:center;padding:40px 20px;color:var(--text-faint)">
               <div style="font-size:40px;margin-bottom:10px">📡</div>
               <div style="font-family:'Lora',serif;font-size:16px;font-weight:600;margin-bottom:6px">Sem tags registadas</div>
               <div style="font-size:12px">Cria uma tag e grava-a numa etiqueta NFC</div>
           </div>`
        : nfcTags.map(tag => nfcTagCard(tag)).join('');

    container.innerHTML = `
        <div style="max-width:700px;margin:0 auto">

            <!-- NFC STATUS BANNER -->
            ${!nfcSupported ? `
            <div class="nfc-banner nfc-banner-warn">
                ⚠️ Web NFC não suportado neste browser. Usa <strong>Chrome para Android</strong> para ler/gravar tags físicas. Podes na mesma criar e gerir as tags aqui.
            </div>` : `
            <div class="nfc-banner nfc-banner-ok" id="nfcStatusBanner">
                ✅ Web NFC disponível. Podes ler e gravar tags NFC.
            </div>`}

            <!-- ACTIONS -->
            <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
                <button class="btn-primary" onclick="openNfcWriteModal(null)">+ Nova Tag</button>
                ${nfcSupported ? `
                <button class="btn-primary" id="nfcScanBtn" onclick="nfcToggleScan()"
                    style="background:var(--orange)">📡 Iniciar Scan</button>` : ''}
            </div>

            <!-- SCAN STATUS -->
            <div id="nfcScanStatus" style="display:none" class="nfc-scan-pulse">
                <div style="font-size:28px;margin-bottom:8px">📡</div>
                <div style="font-family:'Lora',serif;font-weight:700;font-size:16px;margin-bottom:4px">À espera de tag NFC…</div>
                <div style="font-size:12px;color:var(--text-muted)">Aproxima o telemóvel de uma tag NFC</div>
            </div>

            <!-- TAG LIST -->
            <div id="nfcTagList">
                ${tagsHTML}
            </div>
        </div>`;
}

function nfcTagCard(tag) {
    const img = getImgForSeed(tag.variety);
    const dateStr = tag.plant_date
        ? new Date(tag.plant_date + 'T00:00:00').toLocaleDateString('pt-PT', { day:'2-digit', month:'short', year:'numeric' })
        : '—';
    return `
        <div class="nfc-tag-card fade-in">
            <div style="display:flex;gap:14px;align-items:center">
                <div class="plant-img-wrap" style="width:52px;height:52px;flex-shrink:0">
                    <img src="${img}" alt="${tag.variety||''}" onerror="this.src='${IMG_DEFAULT}'" style="width:100%;height:100%;object-fit:contain;padding:4px">
                </div>
                <div style="flex:1;min-width:0">
                    <div style="font-family:'Lora',serif;font-size:15px;font-weight:700;color:var(--text);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${tag.label || 'Tag sem nome'}</div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px">
                        ${tag.variety ? `<span class="badge badge-green">${tag.variety}</span>` : ''}
                        ${tag.location ? `<span class="badge badge-muted">📍 ${tag.location}</span>` : ''}
                        <span class="badge badge-muted">📅 ${dateStr}</span>
                    </div>
                    ${tag.notes ? `<div style="font-size:11px;color:var(--text-faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${tag.notes}</div>` : ''}
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
                    <button onclick="openNfcWriteModal(${tag.id})" class="btn-ghost" style="padding:6px 12px;font-size:11px">✏️</button>
                    ${'NDEFReader' in window ? `<button onclick="nfcWriteTag(${tag.id})" class="btn-ghost" style="padding:6px 10px;font-size:11px;color:var(--orange);border-color:var(--orange)">📡</button>` : ''}
                    <button onclick="nfcDeleteTag(${tag.id})" class="btn-ghost" style="padding:6px 12px;font-size:11px;color:var(--red);border-color:var(--red)">🗑</button>
                </div>
            </div>
        </div>`;
}

// ── SCAN ──────────────────────────────────────────────

async function nfcToggleScan() {
    if (nfcScanActive) {
        nfcStopScan();
    } else {
        await nfcStartScan();
    }
}

async function nfcStartScan() {
    try {
        nfcReader = new NDEFReader();
        await nfcReader.scan();
        nfcScanActive = true;
        document.getElementById('nfcScanBtn').textContent = '⏹ Parar Scan';
        document.getElementById('nfcScanBtn').style.background = 'var(--red)';
        document.getElementById('nfcScanStatus').style.display = 'block';
        nfcUpdateBanner('scanning');

        nfcReader.onreading = ({ message, serialNumber }) => {
            nfcHandleRead(message, serialNumber);
        };
        nfcReader.onreadingerror = () => {
            nfcUpdateBanner('error');
        };
    } catch (err) {
        alert('Erro ao iniciar scan NFC: ' + err.message);
    }
}

function nfcStopScan() {
    nfcScanActive = false;
    nfcReader = null;
    const btn = document.getElementById('nfcScanBtn');
    if (btn) { btn.textContent = '📡 Iniciar Scan'; btn.style.background = 'var(--orange)'; }
    const status = document.getElementById('nfcScanStatus');
    if (status) status.style.display = 'none';
    nfcUpdateBanner('ok');
}

function nfcUpdateBanner(state) {
    const banner = document.getElementById('nfcStatusBanner');
    if (!banner) return;
    if (state === 'scanning') {
        banner.className = 'nfc-banner nfc-banner-scanning';
        banner.innerHTML = '📡 A fazer scan… aproxima o telemóvel de uma tag NFC.';
    } else if (state === 'error') {
        banner.className = 'nfc-banner nfc-banner-warn';
        banner.innerHTML = '⚠️ Erro ao ler a tag. Tenta novamente.';
    } else {
        banner.className = 'nfc-banner nfc-banner-ok';
        banner.innerHTML = '✅ Web NFC disponível. Podes ler e gravar tags NFC.';
    }
}

function nfcHandleRead(message, serialNumber) {
    nfcStopScan();

    let tagData = null;
    for (const record of message.records) {
        if (record.recordType === 'text') {
            // NDEF text records: first byte = status (encoding + lang length), then lang, then text
            try {
                const bytes      = new Uint8Array(record.data.buffer);
                const statusByte = bytes[0];
                const langLen    = statusByte & 0x3F;
                const isUTF16    = !!(statusByte & 0x80);
                const encoding   = isUTF16 ? 'utf-16' : 'utf-8';
                const textBytes  = bytes.slice(1 + langLen);
                const text       = new TextDecoder(encoding).decode(textBytes);
                try { tagData = JSON.parse(text); } catch { tagData = { raw: text }; }
            } catch {
                // Fallback: try decoding the whole buffer
                try {
                    const text = new TextDecoder('utf-8').decode(record.data);
                    try { tagData = JSON.parse(text); } catch { tagData = { raw: text }; }
                } catch { tagData = { raw: '(erro ao ler)' }; }
            }
            break;
        }
        if (record.recordType === 'url') {
            try {
                const text = new TextDecoder('utf-8').decode(record.data);
                // Extract nfc_id from URL if present
                const url = new URL(text.startsWith('http') ? text : 'https://' + text);
                const id  = url.searchParams.get('nfc_id');
                tagData   = id ? { nfc_id: parseInt(id) } : { url: text };
            } catch { tagData = { raw: 'URL inválido' }; }
            break;
        }
    }

    // Match by nfc_id (loose equality to handle string/number mismatch)
    let matchedTag = null;
    if (tagData?.nfc_id != null) {
        matchedTag = nfcTags.find(t => t.id == tagData.nfc_id);
    }
    // Fallback: match by serial
    if (!matchedTag && serialNumber) {
        matchedTag = nfcTags.find(t => t.serial === serialNumber);
    }

    nfcShowResultModal(matchedTag, tagData, serialNumber);
}

// ── RESULT MODAL ──────────────────────────────────────

function nfcShowResultModal(tag, tagData, serial) {
    nfcResultTagId = tag?.id || null;
    const img = getImgForSeed(tag?.variety || tagData?.variety);

    let html = '';
    if (tag) {
        const dateStr = tag.plant_date
            ? new Date(tag.plant_date + 'T00:00:00').toLocaleDateString('pt-PT', { day:'2-digit', month:'long', year:'numeric' })
            : '—';
        html = `
            <div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:16px">
                <div class="plant-img-wrap" style="width:64px;height:64px;flex-shrink:0">
                    <img src="${img}" alt="${tag.variety||''}" onerror="this.src='${IMG_DEFAULT}'" style="width:100%;height:100%;object-fit:contain;padding:4px">
                </div>
                <div>
                    <div style="font-family:'Lora',serif;font-size:18px;font-weight:700;margin-bottom:6px">${tag.label || 'Tag sem nome'}</div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap">
                        ${tag.variety ? `<span class="badge badge-green">${tag.variety}</span>` : ''}
                        ${tag.location ? `<span class="badge badge-muted">📍 ${tag.location}</span>` : ''}
                    </div>
                </div>
            </div>
            <div class="nfc-detail-grid">
                <div class="nfc-detail-item"><span class="field-label">Data Plantação</span><span>${dateStr}</span></div>
                ${tag.notes ? `<div class="nfc-detail-item" style="grid-column:1/-1"><span class="field-label">Notas</span><span>${tag.notes}</span></div>` : ''}
            </div>`;
        document.getElementById('nfcResultEditBtn').style.display = '';
    } else if (tagData?.raw) {
        html = `<div style="padding:12px;background:var(--bg-subtle);border-radius:10px;font-family:'DM Mono',monospace;font-size:12px;word-break:break-all">${tagData.raw}</div>
                <div style="margin-top:12px;font-size:12px;color:var(--text-faint)">Esta tag não está registada no Garden. Cria uma nova tag com este conteúdo.</div>`;
        document.getElementById('nfcResultEditBtn').style.display = 'none';
    } else {
        html = `<div style="font-size:13px;color:var(--text-muted);padding:12px 0">Tag lida mas sem dados reconhecidos.</div>`;
        document.getElementById('nfcResultEditBtn').style.display = 'none';
    }

    document.getElementById('nfcResultContent').innerHTML = html;
    document.getElementById('nfcResultModal').classList.add('open');
}

function closeNfcResultModal() {
    document.getElementById('nfcResultModal').classList.remove('open');
}

function openNfcEditFromResult() {
    closeNfcResultModal();
    if (nfcResultTagId) openNfcWriteModal(nfcResultTagId);
}

// ── WRITE/EDIT MODAL ──────────────────────────────────

function openNfcWriteModal(tagId) {
    const tag = tagId ? nfcTags.find(t => t.id === tagId) : null;
    document.getElementById('nfcWriteModalTitle').textContent = tag ? '✏️ Editar Tag' : '+ Nova Tag NFC';
    document.getElementById('nfcEditTagId').value   = tag?.id || '';
    document.getElementById('nfcTagLabel').value    = tag?.label || '';
    document.getElementById('nfcTagVariety').value  = tag?.variety || '';
    document.getElementById('nfcTagDate').value     = tag?.plant_date || new Date().toISOString().split('T')[0];
    document.getElementById('nfcTagLocation').value = tag?.location || '';
    document.getElementById('nfcTagNotes').value    = tag?.notes || '';
    document.getElementById('nfcWriteStatus').style.display = 'none';

    const writeBtn = document.getElementById('nfcWriteBtn');
    writeBtn.style.display = 'NDEFReader' in window ? '' : 'none';

    document.getElementById('nfcWriteModal').classList.add('open');
}

function closeNfcWriteModal() {
    document.getElementById('nfcWriteModal').classList.remove('open');
    if (nfcWriter) { nfcWriter = null; }
}

function nfcGetFormData() {
    return {
        label:      document.getElementById('nfcTagLabel').value.trim(),
        variety:    document.getElementById('nfcTagVariety').value.trim(),
        plant_date: document.getElementById('nfcTagDate').value || null,
        location:   document.getElementById('nfcTagLocation').value.trim(),
        notes:      document.getElementById('nfcTagNotes').value.trim(),
    };
}

async function saveNfcTagOnly() {
    const data   = nfcGetFormData();
    const editId = document.getElementById('nfcEditTagId').value;
    if (!data.label && !data.variety) return alert('Preenche pelo menos o nome ou a variedade.');

    if (editId) {
        await _supabase.from('nfc_tags').update(data).eq('id', editId);
    } else {
        await _supabase.from('nfc_tags').insert([{ ...data, user_id: currentUserId }]);
    }
    closeNfcWriteModal();
    await nfcLoadTags();
    nfcRender();
}

async function saveAndWriteNfc() {
    const data   = nfcGetFormData();
    const editId = document.getElementById('nfcEditTagId').value;
    if (!data.label && !data.variety) return alert('Preenche pelo menos o nome ou a variedade.');

    // Save to DB first
    let savedId = editId ? parseInt(editId) : null;
    if (editId) {
        await _supabase.from('nfc_tags').update(data).eq('id', editId);
    } else {
        const { data: inserted } = await _supabase
            .from('nfc_tags')
            .insert([{ ...data, user_id: currentUserId }])
            .select()
            .single();
        savedId = inserted?.id;
    }

    if (!savedId) return nfcShowWriteStatus('❌ Erro ao guardar no servidor.', 'error');

    // Build URL that opens the app and shows the tag
    // Uses current page URL + ?nfc_id=X so Android opens browser → app handles it
    const appUrl = window.location.origin + window.location.pathname + '?nfc_id=' + savedId;

    nfcShowWriteStatus('⏳ Aproxima o telemóvel da tag NFC…', 'info');
    try {
        const ndef = new NDEFReader();
        await ndef.write({
            records: [{ recordType: 'url', data: appUrl }]
        });
        nfcShowWriteStatus('✅ Tag gravada com sucesso!', 'ok');
        await nfcLoadTags();
        setTimeout(() => { closeNfcWriteModal(); nfcRender(); }, 1200);
    } catch (err) {
        nfcShowWriteStatus('❌ Erro ao gravar: ' + err.message, 'error');
    }
}

function nfcShowWriteStatus(msg, type) {
    const el = document.getElementById('nfcWriteStatus');
    if (!el) return;
    el.style.display = '';
    const colors = { info: 'var(--orange-bg)', ok: 'var(--green-bg)', error: 'var(--red-bg)' };
    const borders = { info: '#f0b070', ok: 'var(--green)', error: 'var(--red)' };
    el.innerHTML = `<div style="background:${colors[type]};border:1px solid ${borders[type]};border-radius:10px;padding:10px 14px;font-size:12px;font-weight:600">${msg}</div>`;
}

async function nfcWriteTag(tagId) {
    const tag = nfcTags.find(t => t.id === tagId);
    if (!tag) return;

    const appUrl = window.location.origin + window.location.pathname + '?nfc_id=' + tag.id;
    const status = document.getElementById('nfcStatusBanner');
    if (status) { status.className = 'nfc-banner nfc-banner-scanning'; status.innerHTML = '📡 Aproxima o telemóvel da tag NFC para gravar…'; }

    try {
        const ndef = new NDEFReader();
        await ndef.write({ records: [{ recordType: 'url', data: appUrl }] });
        if (status) { status.className = 'nfc-banner nfc-banner-ok'; status.innerHTML = `✅ Tag "${tag.label}" gravada com sucesso!`; }
        setTimeout(() => { if (status) { status.className = 'nfc-banner nfc-banner-ok'; status.innerHTML = '✅ Web NFC disponível.'; } }, 3000);
    } catch (err) {
        if (status) { status.className = 'nfc-banner nfc-banner-warn'; status.innerHTML = '❌ Erro ao gravar tag: ' + err.message; }
    }
}

async function nfcDeleteTag(tagId) {
    if (!confirm('Apagar esta tag permanentemente?')) return;
    await _supabase.from('nfc_tags').delete().eq('id', tagId);
    await nfcLoadTags();
    nfcRender();
}

// ── MODAL BACKDROPS ────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('nfcResultModal')?.addEventListener('click', function(e) {
        if (e.target === this) closeNfcResultModal();
    });
    document.getElementById('nfcWriteModal')?.addEventListener('click', function(e) {
        if (e.target === this) closeNfcWriteModal();
    });
});

// Patch loadFromSupabase to also init NFC when logged in
const _origNfcInit = nfcInit;
(function patchAuth() {
    const origLoad = loadFromSupabase;
    window.loadFromSupabaseOriginal = origLoad;
})();
