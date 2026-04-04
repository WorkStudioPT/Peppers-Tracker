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

// ── CATALOGO — fonte única de verdade, carregado da BD ──────────────
// Alimenta automaticamente: Tracker (datalist), Tabuleiros (picker), NFC (datalist)
// Entradas base (is_base=true) são partilhadas por todos os utilizadores via RLS
let CATALOGO     = [];  // todas as entradas: base + custom do utilizador
let catalogCustom = []; // apenas entradas custom (is_base=false) do utilizador

async function loadCatalogCustom() {
    const { data, error } = await _supabase
        .from('catalog_entries')
        .select('*')
        .order('is_base', { ascending: false }) // base primeiro
        .order('id',      { ascending: true });
    if (error) { console.error('[CATALOG] Erro ao carregar:', error.message); return; }
    const entries = data || [];
    CATALOGO      = entries.map(e => ({
        nome:            e.nome,
        img:             e.img || IMG_DEFAULT,
        shu:             e.shu ?? null,
        id:              e.id,
        is_base:         !!e.is_base,
        categoria:       e.categoria || 'Outro',
        descricao:       e.descricao || '',
        sow_in:          e.sow_in    || null,
        sow_out:         e.sow_out   || null,
        plant:           e.plant     || null,
        harvest:         e.harvest   || null,
        germ_days:       e.germ_days || null,
        days_to_harvest: e.days_to_harvest || null,
        spacing:         e.spacing   || null,
        height:          e.height    || null,
        sun:             e.sun       || null,
        water:           e.water     || null,
    }));
    catalogCustom = entries.filter(e => !e.is_base);
    // Atualizar todos os sítios que dependem do catálogo
    loadCatalog();
    nfcPopulateCatalog();
    tRenderCatalogPicker();
}

async function catalogAddEntry() {
    const nome = document.getElementById('catalogNewName').value.trim();
    const img  = document.getElementById('catalogNewImg').value.trim() || IMG_DEFAULT;
    if (!nome) return alert('Indica o nome da variedade.');
    const { data, error } = await _supabase
        .from('catalog_entries')
        .insert([{ user_id: currentUserId, nome, img }])
        .select().single();
    if (error) return alert('Erro ao adicionar: ' + error.message);
    document.getElementById('catalogNewName').value = '';
    document.getElementById('catalogNewImg').value  = '';
    await loadCatalogCustom();
    renderCatalogManager();
}

async function catalogDeleteEntry(id) {
    if (!confirm('Remover esta variedade do catálogo?')) return;
    await _supabase.from('catalog_entries').delete().eq('id', id);
    await loadCatalogCustom();
    renderCatalogManager();
}

function renderCatalogManager() {
    const el = document.getElementById('catalogManagerList');
    if (!el) return;
    if (catalogCustom.length === 0) {
        el.innerHTML = `<div style="font-size:11px;color:var(--text-faint);text-align:center;padding:8px 0">Sem variedades personalizadas</div>`;
        return;
    }
    el.innerHTML = catalogCustom.map(e => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
            <img src="${e.img}" onerror="this.src='${IMG_DEFAULT}'" style="width:24px;height:24px;object-fit:contain;border-radius:4px;flex-shrink:0">
            <span style="flex:1;font-size:12px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.nome}</span>
            <button onclick="catalogDeleteEntry(${e.id})"
                style="background:none;border:none;cursor:pointer;font-size:11px;color:var(--red);font-weight:700;flex-shrink:0">✕</button>
        </div>`).join('');
}

const IMG_DEFAULT = "imagens/default.webp";

// ── IMAGE LIGHTBOX ────────────────────────────────────────────────
function openLightbox(src, e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    const lb  = document.getElementById('imgLightbox');
    const img = document.getElementById('imgLightboxImg');
    if (!lb || !img) return;
    img.src = src;
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
}
function closeLightbox() {
    const lb = document.getElementById('imgLightbox');
    if (!lb) return;
    lb.classList.remove('open');
    document.body.style.overflow = '';
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });



// Devolve a imagem do catálogo para um nome de semente
function getImgForSeed(name) {
    if (!name) return IMG_DEFAULT;
    const match = CATALOGO.find(c => c.nome.toLowerCase() === name.toLowerCase());
    return match ? match.img : IMG_DEFAULT;
}

let plants = [];
let isSignUpMode = false;
let currentUserId = null;

// ── TRACKER SORT STATE ─────────────────────────────────
let _plantSortState = null;

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

        // loadCatalogCustom MUST run first — tInit depends on CATALOGO being populated
        loadCatalogCustom().then(() => Promise.all([
            loadFromSupabase(),
            tInit(),
            nfcLoadTags(),
        ])).then(() => {
            if (nfcId) {
                switchTab('nfc');
                const tag = nfcTags.find(t => t.id == nfcId);
                nfcShowResultModal(tag, tag ? null : { raw: 'ID: ' + nfcId }, null);
            } else {
                const saved = localStorage.getItem('activeTab');
                if (saved && saved !== 'tracker') switchTab(saved);
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
    localStorage.setItem('activeTab', tab);
    ['tracker', 'tray', 'catalogo', 'nfc'].forEach(t => {
        document.getElementById(`panel-${t}`).style.display = t === tab ? '' : 'none';
        document.getElementById(`tab-${t}`).classList.toggle('active', t === tab);
    });
    if (tab === 'tray') { tRenderSeeds(); tRenderTrays(); }
    if (tab === 'catalogo') { catalogTabInit(); }
    if (tab === 'nfc') {
        if (nfcTags.length === 0) { nfcRenderLoading(); await nfcLoadTags(); }
        nfcRender();
    }
}

// ════════════════════════════════════════════════════════
// PEPPER TRACKER — CORE
// ════════════════════════════════════════════════════════

async function loadFromSupabase() {
    const { data, error } = await _supabase
        .from('plants')
        .select('*')
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('id', { ascending: false });
    if (!error) { plants = data; render(); }
}

async function savePlantOrder() {
    const updates = plants.map((p, i) =>
        _supabase.from('plants').update({ sort_order: i }).eq('id', p.id)
    );
    await Promise.all(updates);
}

function plantDragStart(e, plantId) {
    e.stopPropagation();
    e.preventDefault();
    const container = document.getElementById('plantList');
    const srcEl = e.currentTarget.closest('.plant-sortable');
    if (!srcEl) return;

    const ghost = srcEl.cloneNode(true);
    ghost.style.cssText = `
        position:fixed; z-index:9000; pointer-events:none; opacity:0.88;
        width:${srcEl.offsetWidth}px; border-radius:12px;
        box-shadow:0 8px 32px rgba(0,0,0,0.28); transition:none;
        background:var(--bg-card); border:2px solid var(--green);
    `;
    document.body.appendChild(ghost);
    const rect = srcEl.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    ghost.style.left = rect.left + 'px';
    ghost.style.top  = rect.top  + 'px';
    srcEl.style.opacity = '0.35';
    srcEl.style.pointerEvents = 'none';
    _plantSortState = { plantId, srcEl, ghost, offsetY, container };
    document.addEventListener('pointermove', _plantSortMove, { passive: false });
    document.addEventListener('pointerup',   _plantSortEnd,  { once: true });
}

function _plantSortMove(e) {
    e.preventDefault();
    if (!_plantSortState) return;
    const { ghost, offsetY, container, srcEl } = _plantSortState;
    const y = e.clientY;
    ghost.style.top = (y - offsetY) + 'px';
    const items = [...container.querySelectorAll('.plant-sortable')].filter(el => el !== srcEl);
    let target = null, insertBefore = true;
    for (const el of items) {
        const r = el.getBoundingClientRect();
        if (y >= r.top && y <= r.bottom) {
            target = el; insertBefore = y < r.top + r.height / 2; break;
        }
    }
    container.querySelectorAll('.plant-drop-line').forEach(l => l.remove());
    if (target) {
        const line = document.createElement('div');
        line.className = 'plant-drop-line';
        line.style.cssText = 'height:3px;background:var(--green);border-radius:2px;margin:2px 0;transition:none';
        if (insertBefore) target.before(line);
        else target.after(line);
        _plantSortState.target = target;
        _plantSortState.insertBefore = insertBefore;
    } else {
        _plantSortState.target = null;
    }
}

async function _plantSortEnd(e) {
    document.removeEventListener('pointermove', _plantSortMove);
    if (!_plantSortState) return;
    const { plantId, srcEl, ghost, container, target, insertBefore } = _plantSortState;
    _plantSortState = null;
    ghost.remove();
    container.querySelectorAll('.plant-drop-line').forEach(l => l.remove());
    srcEl.style.opacity = '';
    srcEl.style.pointerEvents = '';
    if (!target) return;

    // Only reorder active (non-archived) plants
    const activePlants  = plants.filter(p => !p.archived);
    const archivedPlants = plants.filter(p => p.archived);
    const fromIdx = activePlants.findIndex(p => p.id === plantId);
    const toId    = parseInt(target.dataset.plantId);
    let   toIdx   = activePlants.findIndex(p => p.id === toId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
    const [moved] = activePlants.splice(fromIdx, 1);
    toIdx = activePlants.findIndex(p => p.id === toId);
    if (insertBefore) activePlants.splice(toIdx, 0, moved);
    else              activePlants.splice(toIdx + 1, 0, moved);

    plants = [...activePlants, ...archivedPlants];
    render();
    await savePlantOrder();
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
        const dragHandle = !p.archived ? `
            <span class="tray-drag-handle" title="Arrastar para reordenar"
                onpointerdown="plantDragStart(event, ${p.id})"
                onclick="event.stopPropagation();event.preventDefault()">⠿</span>` : '';
        const card = `
            <details class="collapsible-section ${!p.archived ? 'plant-sortable' : ''}" data-plant-id="${p.id}" ${isFirst ? 'open' : ''}>
                <summary class="collapsible-header">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${dragHandle}
                        <div style="display: flex; flex-direction: column; align-items: flex-start;">
                            <span style="font-family:'Lora',serif;font-size:14px;font-weight:700;color:var(--text);text-transform:none;letter-spacing:0">${p.variety}</span>
                            <span class="badge badge-muted badge-tracker">${p.startDate}</span>
                        </div>
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
const T_COLORS = [
    '#e53e3e','#e8a020','#f6c90e','#5d9b3c','#27ae60','#2980b9',
    '#8e44ad','#e74c3c','#d35400','#16a085','#c0392b','#7f8c8d',
    '#ff6b9d','#a0522d','#1abc9c'
];
let tSelectedColor = '#5d9b3c';
let tCustomColor = null;

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
    // Reset button in case it was in edit mode
    const btn = document.getElementById('tSeedAddBtn');
    if (btn) { btn.textContent = '+ Adicionar'; btn.onclick = tAddSeed; }
    tRenderSeeds();
    // Re-render trays but preserve open state (tRenderTrays already handles this)
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

function tEditSeed(id) {
    const s = tState.seeds.find(s => s.id === id);
    if (!s) return;
    // Fill the "Nova Semente" form with the seed data for editing
    document.getElementById('tSeedName').value = s.name;
    tSelectedCatalogIdx = CATALOGO.findIndex(c => c.img === s.img);
    if (tSelectedCatalogIdx < 0) tSelectedCatalogIdx = 0;
    tSelectedColor = s.color;
    tCustomColor   = T_COLORS.includes(s.color) ? null : s.color;
    tRenderCatalogPicker();
    tRenderColorRow();
    // Switch the add button to "save edit" mode
    const btn = document.getElementById('tSeedAddBtn');
    btn.textContent = '✓ Guardar Alterações';
    btn.onclick = () => tSaveEditSeed(id);
    // Expand the "Nova Semente" section
    const det = btn.closest('details');
    if (det) det.open = true;
    // Scroll to form
    btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function tSaveEditSeed(id) {
    const name = document.getElementById('tSeedName').value.trim();
    if (!name) return;
    const selectedCatalog = CATALOGO[tSelectedCatalogIdx] || CATALOGO[0];
    const payload = { name, img: selectedCatalog.img, color: tSelectedColor };
    const { error } = await _supabase.from('tray_seeds').update(payload).eq('id', id);
    if (error) return alert('Erro ao guardar: ' + error.message);
    const s = tState.seeds.find(s => s.id === id);
    if (s) Object.assign(s, payload);
    // Reset add button
    const btn = document.getElementById('tSeedAddBtn');
    btn.textContent = '+ Adicionar';
    btn.onclick = tAddSeed;
    document.getElementById('tSeedName').value = '';
    tRenderSeeds();
    tRenderTrays();
}

// ── SUPABASE: TRAYS ────────────────────────────────────

async function tLoadTrays() {
    const { data, error } = await _supabase
        .from('trays')
        .select('*')
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('id', { ascending: false });
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
    // Assign sort_order = current minimum - 1 so it appears first
    const minOrder = tState.trays.length > 0
        ? Math.min(...tState.trays.map(t => t.sort_order ?? 0))
        : 0;
    const payload = {
        user_id: currentUserId,
        name, cols, rows, cells,
        sort_order: minOrder - 1,
        created: new Date().toISOString().split('T')[0]
    };
    const { data, error } = await _supabase.from('trays').insert([payload]).select().single();
    if (error) return alert('Erro ao criar tabuleiro: ' + error.message);
    tState.trays.unshift(data); // prepend so it shows first
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

async function tSaveTrayOrder() {
    // Write sort_order = index for each tray in current order
    const updates = tState.trays.map((t, i) =>
        _supabase.from('trays').update({ sort_order: i }).eq('id', t.id)
    );
    await Promise.all(updates);
}

// ── TRAY SORT (pointer-events drag, works on touch + mouse) ───────────────

let _tSortState = null;

function tTrayDragStart(e, trayId) {
    e.stopPropagation();
    e.preventDefault();

    const container = document.getElementById('tTraysContainer');
    const srcEl = e.currentTarget.closest('.tray-sortable');
    if (!srcEl) return;

    // Clone as visual drag ghost
    const ghost = srcEl.cloneNode(true);
    ghost.style.cssText = `
        position:fixed; z-index:9000; pointer-events:none; opacity:0.88;
        width:${srcEl.offsetWidth}px; border-radius:12px;
        box-shadow:0 8px 32px rgba(0,0,0,0.28); transition:none;
        background:var(--bg-card); border:2px solid var(--green);
    `;
    document.body.appendChild(ghost);

    const rect = srcEl.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;

    ghost.style.left = rect.left + 'px';
    ghost.style.top  = rect.top + 'px';

    srcEl.style.opacity = '0.35';
    srcEl.style.pointerEvents = 'none';

    _tSortState = { trayId, srcEl, ghost, offsetY, container };

    document.addEventListener('pointermove', _tSortMove, { passive: false });
    document.addEventListener('pointerup',   _tSortEnd,  { once: true });
}

function _tSortMove(e) {
    e.preventDefault();
    if (!_tSortState) return;
    const { ghost, offsetY, container, srcEl } = _tSortState;

    const y = e.clientY;
    ghost.style.top = (y - offsetY) + 'px';

    // Find which tray we're hovering over
    const items = [...container.querySelectorAll('.tray-sortable')].filter(el => el !== srcEl);
    let target = null;
    let insertBefore = true;
    for (const el of items) {
        const r = el.getBoundingClientRect();
        if (y >= r.top && y <= r.bottom) {
            target = el;
            insertBefore = y < r.top + r.height / 2;
            break;
        }
    }

    // Visual drop indicator
    container.querySelectorAll('.tray-drop-line').forEach(l => l.remove());
    if (target) {
        const line = document.createElement('div');
        line.className = 'tray-drop-line';
        line.style.cssText = 'height:3px;background:var(--green);border-radius:2px;margin:2px 0;transition:none';
        if (insertBefore) target.before(line);
        else target.after(line);
        _tSortState.target = target;
        _tSortState.insertBefore = insertBefore;
    } else {
        _tSortState.target = null;
    }
}

async function _tSortEnd(e) {
    document.removeEventListener('pointermove', _tSortMove);
    if (!_tSortState) return;

    const { trayId, srcEl, ghost, container, target, insertBefore } = _tSortState;
    _tSortState = null;

    // Cleanup visuals
    ghost.remove();
    container.querySelectorAll('.tray-drop-line').forEach(l => l.remove());
    srcEl.style.opacity = '';
    srcEl.style.pointerEvents = '';

    if (!target) return; // dropped in place, no change

    // Reorder tState.trays array
    const fromIdx = tState.trays.findIndex(t => t.id === trayId);
    const toId    = parseInt(target.dataset.trayId);
    let   toIdx   = tState.trays.findIndex(t => t.id === toId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;

    const [moved] = tState.trays.splice(fromIdx, 1);
    // Recalculate toIdx after splice
    toIdx = tState.trays.findIndex(t => t.id === toId);
    if (insertBefore) tState.trays.splice(toIdx, 0, moved);
    else              tState.trays.splice(toIdx + 1, 0, moved);

    tRenderTrays();
    await tSaveTrayOrder();
}

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
    if (CATALOGO.length === 0) return; // ainda a carregar
    if (tSelectedCatalogIdx >= CATALOGO.length) tSelectedCatalogIdx = 0;
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
    if (nameInput && !nameInput.value && CATALOGO[tSelectedCatalogIdx]) nameInput.value = CATALOGO[tSelectedCatalogIdx].nome;
}

function tSelectCatalog(idx) {
    tSelectedCatalogIdx = idx;
    tRenderCatalogPicker();
    // Auto-preenche o nome
    const nameInput = document.getElementById('tSeedName');
    if (nameInput && CATALOGO[idx]) nameInput.value = CATALOGO[idx].nome;
}

function tRenderColorRow() {
    const row = document.getElementById('tColorRow');
    if (!row) return;
    const swatches = T_COLORS.map(c =>
        `<div class="color-swatch ${c === tSelectedColor ? 'selected' : ''}"
              style="background:${c}" onclick="tSelectColor('${c}')"></div>`
    ).join('');
    // Custom color swatch (shown if a custom color is active)
    const customSwatch = tCustomColor
        ? `<div class="color-swatch ${tCustomColor === tSelectedColor ? 'selected' : ''}"
                style="background:${tCustomColor}" onclick="tSelectColor('${tCustomColor}')"></div>`
        : '';
    // "+" button to open native color picker
    const addBtn = `<label title="Cor personalizada" style="width:22px;height:22px;border-radius:50%;border:2px dashed var(--border);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;color:var(--text-faint);transition:all 0.15s;flex-shrink:0" onmouseover="this.style.borderColor='var(--green)'" onmouseout="this.style.borderColor='var(--border)'">
        +<input type="color" id="tColorPicker" style="position:absolute;width:0;height:0;opacity:0;pointer-events:none" onchange="tApplyCustomColor(this.value)">
    </label>`;
    row.innerHTML = swatches + customSwatch + addBtn;
}

function tApplyCustomColor(hex) {
    tCustomColor = hex;
    tSelectedColor = hex;
    tRenderColorRow();
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
        lib.innerHTML = '<div style="font-size:11px;color:var(--text-faint);text-align:center;margin:16px">Adiciona sementes</div>';
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
            <div onclick="event.stopPropagation();tEditSeed(${s.id})"
                style="cursor:pointer;font-size:11px;color:var(--text-faint);padding:2px 5px;border-radius:4px;transition:all 0.1s"
                onmouseover="this.style.color='var(--green)'"
                onmouseout="this.style.color='var(--text-faint)'"
                title="Editar">✏️</div>
            <div onclick="event.stopPropagation();tDeleteSeed(${s.id})"
                style="cursor:pointer;font-size:11px;color:var(--text-faint);padding:2px 4px;border-radius:4px;transition:all 0.1s"
                onmouseover="this.style.color='var(--red)'"
                onmouseout="this.style.color='var(--text-faint)'"
                title="Remover">✕</div>
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

    // Save which trays are currently open by their id
    const openIds = new Set();
    c.querySelectorAll('details[data-tray-id]').forEach(d => {
        if (d.open) openIds.add(parseInt(d.dataset.trayId));
    });

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

        // Determine if this tray should be open:
        // - if we have saved state, use it; otherwise open the first one
        const shouldBeOpen = openIds.size > 0 ? openIds.has(tray.id) : trayIdx === 0;

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
                if (!s) return tEmptyCell(tray.id, ri, ci, pos);
                const img = getSeedImg(s);
                return `
                    <div class="tray-cell filled"
                        style="border-color:${s.color}55;background:${s.color}14"
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
                            style="width:36px;height:36px;object-fit:contain;transition:transform 0.15s"
                            onerror="this.src='${IMG_DEFAULT}'"
                            class="cell-img">
                        <span class="cell-label" style="color:${s.color}">${s.name}</span>
                    </div>`;
            }
            return tEmptyCell(tray.id, ri, ci, pos);
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
            <details class="collapsible-section tray-sortable" data-tray-id="${tray.id}" ${shouldBeOpen ? 'open' : ''}>
                <summary class="collapsible-header">
                    <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
                        <span class="tray-drag-handle" title="Arrastar para reordenar"
                            onpointerdown="tTrayDragStart(event, ${tray.id})"
                            onclick="event.stopPropagation();event.preventDefault()">⠿</span>
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
                    <div style="margin:16px;overflow-x:auto">
                        <div class="tray-grid" style="--tray-cols:${tray.cols}">
                            ${cellsHTML}
                        </div>
                    </div>
                    ${legend ? `<div style="padding:10px 16px;border-top:1px solid var(--border);display:flex;flex-wrap:wrap;gap:12px">${legend}</div>` : ''}
                </div>
            </details>`;
    }).join('');
}

function tEmptyCell(trayId, ri, ci, pos) {
    return `
        <div class="tray-cell"
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
let _nfcSortState  = null;    // drag-to-reorder state

// ── INIT ──────────────────────────────────────────────

async function nfcInit() {
    await nfcLoadTags();
}

async function nfcLoadTags() {
    const { data, error } = await _supabase
        .from('nfc_tags')
        .select('*')
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
    if (!error) nfcTags = data || [];
}

async function saveNfcTagOrder() {
    const updates = nfcTags.map((t, i) =>
        _supabase.from('nfc_tags').update({ sort_order: i }).eq('id', t.id)
    );
    await Promise.all(updates);
}

function nfcTagDragStart(e, tagId) {
    e.stopPropagation();
    e.preventDefault();
    const container = document.getElementById('nfcTagList');
    const srcEl = e.currentTarget.closest('.nfc-sortable');
    if (!srcEl) return;
    const ghost = srcEl.cloneNode(true);
    ghost.style.cssText = `
        position:fixed; z-index:9000; pointer-events:none; opacity:0.88;
        width:${srcEl.offsetWidth}px; border-radius:16px;
        box-shadow:0 8px 32px rgba(0,0,0,0.28); transition:none;
        background:var(--bg-card); border:2px solid var(--green);
    `;
    document.body.appendChild(ghost);
    const rect = srcEl.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    ghost.style.left = rect.left + 'px';
    ghost.style.top  = rect.top  + 'px';
    srcEl.style.opacity = '0.35';
    srcEl.style.pointerEvents = 'none';
    _nfcSortState = { tagId, srcEl, ghost, offsetY, container };
    document.addEventListener('pointermove', _nfcSortMove, { passive: false });
    document.addEventListener('pointerup',   _nfcSortEnd,  { once: true });
}

function _nfcSortMove(e) {
    e.preventDefault();
    if (!_nfcSortState) return;
    const { ghost, offsetY, container, srcEl } = _nfcSortState;
    const y = e.clientY;
    ghost.style.top = (y - offsetY) + 'px';
    const items = [...container.querySelectorAll('.nfc-sortable')].filter(el => el !== srcEl);
    let target = null, insertBefore = true;
    for (const el of items) {
        const r = el.getBoundingClientRect();
        if (y >= r.top && y <= r.bottom) {
            target = el; insertBefore = y < r.top + r.height / 2; break;
        }
    }
    container.querySelectorAll('.nfc-drop-line').forEach(l => l.remove());
    if (target) {
        const line = document.createElement('div');
        line.className = 'nfc-drop-line';
        line.style.cssText = 'height:3px;background:var(--green);border-radius:2px;margin:2px 0;transition:none';
        if (insertBefore) target.before(line);
        else target.after(line);
        _nfcSortState.target = target;
        _nfcSortState.insertBefore = insertBefore;
    } else {
        _nfcSortState.target = null;
    }
}

async function _nfcSortEnd(e) {
    document.removeEventListener('pointermove', _nfcSortMove);
    if (!_nfcSortState) return;
    const { tagId, srcEl, ghost, container, target, insertBefore } = _nfcSortState;
    _nfcSortState = null;
    ghost.remove();
    container.querySelectorAll('.nfc-drop-line').forEach(l => l.remove());
    srcEl.style.opacity = '';
    srcEl.style.pointerEvents = '';
    if (!target) return;
    const fromIdx = nfcTags.findIndex(t => t.id === tagId);
    const toId    = parseInt(target.dataset.tagId);
    let   toIdx   = nfcTags.findIndex(t => t.id === toId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
    const [moved] = nfcTags.splice(fromIdx, 1);
    toIdx = nfcTags.findIndex(t => t.id === toId);
    if (insertBefore) nfcTags.splice(toIdx, 0, moved);
    else              nfcTags.splice(toIdx + 1, 0, moved);
    nfcRender();
    await saveNfcTagOrder();
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
        <div class="nfc-tag-card nfc-sortable fade-in" data-tag-id="${tag.id}">
            <div style="display:flex;gap:14px;align-items:center">
                <span class="tray-drag-handle" title="Arrastar para reordenar"
                    onpointerdown="nfcTagDragStart(event, ${tag.id})"
                    onclick="event.stopPropagation();event.preventDefault()"
                    style="flex-shrink:0;font-size:18px;color:var(--text-faint);cursor:grab;padding:4px 2px">⠿</span>
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

    // Disable button to prevent multiple clicks while waiting
    const writeBtn = document.getElementById('nfcWriteBtn');
    const saveBtn  = document.getElementById('nfcSaveOnlyBtn');
    writeBtn.disabled = true;
    saveBtn.disabled  = true;

    // Step 1: write to physical tag FIRST — no DB changes yet
    // We need a temporary URL if new tag (use placeholder, update after)
    nfcShowWriteStatus('⏳ Aproxima o telemóvel da tag NFC…', 'info');

    try {
        const ndef = new NDEFReader();

        if (editId) {
            // Editing existing tag — ID already known, write URL immediately
            const appUrl = window.location.origin + window.location.pathname + '?nfc_id=' + editId;
            await ndef.write({ records: [{ recordType: 'url', data: appUrl }] });
            // Tag written OK — now update DB
            await _supabase.from('nfc_tags').update(data).eq('id', editId);
        } else {
            // New tag — insert into DB to get the ID, then write URL, rollback if write fails
            const { data: inserted, error: insertErr } = await _supabase
                .from('nfc_tags')
                .insert([{ ...data, user_id: currentUserId }])
                .select()
                .single();
            if (insertErr || !inserted) {
                nfcShowWriteStatus('❌ Erro ao criar registo no servidor.', 'error');
                writeBtn.disabled = false;
                saveBtn.disabled  = false;
                return;
            }
            const savedId = inserted.id;
            const appUrl  = window.location.origin + window.location.pathname + '?nfc_id=' + savedId;
            try {
                await ndef.write({ records: [{ recordType: 'url', data: appUrl }] });
            } catch (writeErr) {
                // Tag write failed — delete the DB record we just created
                await _supabase.from('nfc_tags').delete().eq('id', savedId);
                nfcShowWriteStatus('❌ Erro ao gravar na tag: ' + writeErr.message, 'error');
                writeBtn.disabled = false;
                saveBtn.disabled  = false;
                return;
            }
        }

        nfcShowWriteStatus('✅ Tag gravada com sucesso!', 'ok');
        await nfcLoadTags();
        setTimeout(() => { closeNfcWriteModal(); nfcRender(); }, 1200);

    } catch (err) {
        nfcShowWriteStatus('❌ Erro ao gravar: ' + err.message, 'error');
        writeBtn.disabled = false;
        saveBtn.disabled  = false;
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

// ════════════════════════════════════════════════════════
// CATÁLOGO TAB — categorias, variedades, info detalhada
// ════════════════════════════════════════════════════════

// ── Categorias com emoji e cor ─────────────────────────
const CAT_META = {
    'Ervas Aromáticas': { emoji: '🌿', color: '#27ae60', bg: '#edf5e8' },
    'Picantes':         { emoji: '🌶️', color: '#e53e3e', bg: '#fdf0ee' },
    'Legumes':          { emoji: '🥦', color: '#2980b9', bg: '#e8f2fb' },
    'Frutos':           { emoji: '🍅', color: '#e8a020', bg: '#fef4e8' },
    'Tubérculos':       { emoji: '🥔', color: '#b47d06', bg: '#fef4e8' },
    'Bolbo':            { emoji: '🧅', color: '#c07f39', bg: '#fef4e8' },
    'Flores':           { emoji: '🌸', color: '#8e44ad', bg: '#f5eaf9' },
    'Outro':            { emoji: '📦', color: '#7f8c8d', bg: '#f2f0eb' },
};

const MONTHS_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];


// ── Estado do catálogo tab ─────────────────────────────
let catalogTabEntries = []; // merged base + custom
let catalogActiveCat  = 'Todos';
let catalogDetailId   = null; // id or index being viewed

function catalogTabInit() {
    // CATALOGO ja tem tudo da BD (base + custom) carregado por loadCatalogCustom
    catalogTabEntries = CATALOGO.map(e => ({
        ...e,
        desc:    e.descricao || '',
        _id:     `db_${e.id}`,
        _custom: !e.is_base,
        _dbId:   e.id
    }));
    catalogRenderPills();
    catalogFilterRender();
}

function catalogRenderPills() {
    const el = document.getElementById('catalogCatPills');
    if (!el) return;
    const cats = ['Todos', ...Object.keys(CAT_META)];
    el.innerHTML = cats.map(c => {
        const meta = CAT_META[c];
        const active = c === catalogActiveCat;
        const style = active && meta
            ? `background:${meta.color};color:#fff;border-color:${meta.color}`
            : active
            ? 'background:var(--text);color:var(--bg-card);border-color:var(--text)'
            : '';
        return `<button class="cat-pill ${active ? 'active' : ''}" style="${style}" onclick="catalogSetCat('${c}')">
            ${meta ? meta.emoji + ' ' : ''}${c}
        </button>`;
    }).join('');
}

function catalogSetCat(cat) {
    catalogActiveCat = cat;
    catalogRenderPills();
    catalogFilterRender();
}

function catalogFilterRender() {
    const search = (document.getElementById('catalogSearch')?.value || '').toLowerCase();
    let entries = catalogTabEntries;
    if (catalogActiveCat !== 'Todos') {
        entries = entries.filter(e => e.categoria === catalogActiveCat);
    }
    if (search) {
        entries = entries.filter(e => e.nome.toLowerCase().includes(search) ||
            (e.descricao || '').toLowerCase().includes(search));
    }
    catalogRenderGrid(entries);
}

function catalogRenderGrid(entries) {
    const grid = document.getElementById('catalogGrid');
    if (!grid) return;
    if (entries.length === 0) {
        grid.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--text-muted)">
            <div style="font-size:36px;margin-bottom:12px">🌱</div>
            <div style="font-family:'Lora',serif;font-size:16px;font-weight:600">Sem variedades encontradas</div>
            <div style="font-size:12px;margin-top:6px">Tenta outra pesquisa ou adiciona uma nova variedade</div>
        </div>`;
        return;
    }

    // Group by category if showing all
    if (catalogActiveCat === 'Todos') {
        const groups = {};
        entries.forEach(e => {
            if (!groups[e.categoria]) groups[e.categoria] = [];
            groups[e.categoria].push(e);
        });
        grid.innerHTML = Object.entries(groups).map(([cat, items]) => {
            const meta = CAT_META[cat] || CAT_META['Outro'];
            return `
            <div style="margin-bottom:24px">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
                    <span style="font-size:18px">${meta.emoji}</span>
                    <span style="font-family:'Lora',serif;font-size:16px;font-weight:700">${cat}</span>
                    <span style="font-family:'DM Mono',monospace;font-size:10px;color:var(--text-faint)">(${items.length})</span>
                </div>
                <div class="catalog-grid">${items.map(e => catalogCardHTML(e)).join('')}</div>
            </div>`;
        }).join('');
    } else {
        grid.innerHTML = `<div class="catalog-grid">${entries.map(e => catalogCardHTML(e)).join('')}</div>`;
    }
}

function catalogCardHTML(e) {
    const meta = CAT_META[e.categoria] || CAT_META['Outro'];
    const shuBadge = e.shu != null
        ? `<div style="font-family:'DM Mono',monospace;font-size:9px;color:${meta.color};font-weight:700;margin-top:4px">${e.shu.toLocaleString()} SHU</div>`
        : '';
    const harvestBadge = e.harvest
        ? `<div style="font-size:10px;color:var(--text-faint);margin-top:4px">🍴 ${formatMonthRange(e.harvest)}</div>`
        : '';
    const customBadge = e._custom
        ? `<span style="font-size:9px;background:var(--green-bg);color:var(--green);padding:2px 6px;border-radius:6px;font-weight:700">CUSTOM</span>`
        : '';
    return `
    <div class="catalog-card" onclick="openCatalogDetail('${e._id}')">
        <div style="display:flex;gap:12px;align-items:flex-start">
            <div style="width:52px;height:52px;border-radius:10px;background:${meta.bg};border:1px solid ${meta.color}22;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center">
                <img src="${e.img || 'imagens/default.webp'}" alt="${e.nome}"
                    class="img-zoomable"
                    style="width:100%;height:100%;object-fit:contain"
                    onclick="openLightbox(this.src, event)"
                    onerror="this.src='imagens/default.webp'">
            </div>
            <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                    <span style="font-family:'Lora',serif;font-size:14px;font-weight:700">${e.nome}</span>
                    ${customBadge}
                </div>
                <div style="font-size:10px;color:${meta.color};font-weight:600;margin-top:2px">${meta.emoji} ${e.categoria}</div>
                ${shuBadge}
                ${harvestBadge}
                ${e.germ_days ? `<div style="font-size:10px;color:var(--text-faint);margin-top:3px">🌱 Germ. ${e.germ_days} dias</div>` : ''}
            </div>
        </div>
        ${e.descricao ? `<div style="font-size:11px;color:var(--text-muted);margin-top:10px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${e.descricao}</div>` : ''}
    </div>`;
}

function formatMonthRange(str) {
    if (!str) return '';
    const parts = str.split('-');
    if (parts.length === 2) {
        const a = parseInt(parts[0]) - 1;
        const b = parseInt(parts[1]) - 1;
        if (!isNaN(a) && !isNaN(b) && MONTHS_PT[a] && MONTHS_PT[b])
            return MONTHS_PT[a] + ' – ' + MONTHS_PT[b];
    }
    return str;
}

function openCatalogDetail(id) {
    catalogDetailId = id;
    const e = catalogTabEntries.find(x => x._id === id);
    if (!e) return;
    const meta = CAT_META[e.categoria] || CAT_META['Outro'];

    document.getElementById('cdImg').src = e.img || 'imagens/default.webp';
    document.getElementById('cdName').textContent = e.nome;
    document.getElementById('cdCatBadge').innerHTML =
        `<span style="font-size:11px;font-weight:700;color:${meta.color}">${meta.emoji} ${e.categoria}</span>`;
    document.getElementById('cdDesc').textContent = e.descricao || '';

    // SHU
    const shuEl = document.getElementById('cdShu');
    if (e.shu != null) {
        shuEl.style.display = '';
        shuEl.innerHTML = `
            <div style="background:var(--red-bg);border:1px solid var(--red);border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:10px">
                <span style="font-size:20px">🌶️</span>
                <div>
                    <div style="font-family:'DM Mono',monospace;font-size:11px;font-weight:700;color:var(--red)">${e.shu.toLocaleString()} SHU</div>
                    <div style="font-size:10px;color:var(--text-faint)">${shuLevel(e.shu)}</div>
                </div>
            </div>`;
    } else {
        shuEl.style.display = 'none';
    }

    // Info grid
    const rows = [
        { icon: '🌱', label: 'Semear (interior)', val: formatMonthRange(e.sow_in) },
        { icon: '🌤️', label: 'Semear (exterior)',  val: formatMonthRange(e.sow_out) },
        { icon: '🌿', label: 'Plantar / Transpl.', val: formatMonthRange(e.plant) },
        { icon: '🍴', label: 'Colher',             val: formatMonthRange(e.harvest) },
        { icon: '⏱️', label: 'Germinação',         val: e.germ_days ? e.germ_days + ' dias' : null },
        { icon: '📅', label: 'Dias até colheita',  val: e.days_to_harvest ? e.days_to_harvest + ' dias' : null },
        { icon: '📏', label: 'Espaçamento',        val: e.spacing ? e.spacing + ' cm' : null },
        { icon: '📐', label: 'Altura',             val: e.height ? e.height + ' cm' : null },
        { icon: '☀️', label: 'Sol',                val: e.sun },
        { icon: '💧', label: 'Rega',               val: e.water },
    ].filter(r => r.val);

    document.getElementById('cdInfoGrid').innerHTML = rows.map(r => `
        <div class="catalog-info-item">
            <span style="font-size:16px">${r.icon}</span>
            <div>
                <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-faint);font-weight:600">${r.label}</div>
                <div style="font-size:13px;font-weight:600;color:var(--text)">${r.val}</div>
            </div>
        </div>`).join('');

    // Month bars
    document.getElementById('cdExtraInfo').innerHTML = buildMonthBar(e);

    // Show/hide edit button
    document.getElementById('cdEditBtn').style.display = e._custom ? '' : 'none';

    document.getElementById('catalogDetailModal').classList.add('open');
}

function shuLevel(shu) {
    if (shu === 0) return 'Sem picante';
    if (shu < 5000) return 'Muito suave';
    if (shu < 30000) return 'Suave / Moderado';
    if (shu < 100000) return 'Médio';
    if (shu < 500000) return 'Forte';
    if (shu < 1000000) return 'Muito forte';
    return '🔥 Extremo / Recorde';
}

function buildMonthBar(e) {
    const ranges = [
        { label: 'Semear Interior', range: e.sow_in, color: '#27ae60' },
        { label: 'Semear Exterior', range: e.sow_out, color: '#2980b9' },
        { label: 'Plantar',         range: e.plant,   color: '#8e44ad' },
        { label: 'Colheita',        range: e.harvest, color: '#e8a020' },
    ].filter(r => r.range);
    if (!ranges.length) return '';

    function parseRange(str) {
        const [a, b] = str.split('-').map(Number);
        return { a, b };
    }
    function inRange(m, str) {
        const { a, b } = parseRange(str);
        if (a <= b) return m >= a && m <= b;
        return m >= a || m <= b; // wrap-around (e.g. 10-3)
    }

    const bars = ranges.map(r => {
        const cells = Array.from({ length: 12 }, (_, i) => {
            const active = inRange(i + 1, r.range);
            return `<div style="flex:1;height:10px;background:${active ? r.color : 'var(--border)'};border-radius:3px"></div>`;
        }).join('');
        return `
        <div style="margin-bottom:8px">
            <div style="font-size:10px;font-weight:600;color:var(--text-muted);margin-bottom:4px">${r.label}</div>
            <div style="display:flex;gap:2px">${cells}</div>
        </div>`;
    }).join('');

    const header = `<div style="display:flex;gap:2px;margin-bottom:4px">
        ${MONTHS_PT.map(m => `<div style="flex:1;text-align:center;font-size:8px;color:var(--text-faint);font-family:'DM Mono',monospace">${m}</div>`).join('')}
    </div>`;

    return `
    <div style="background:var(--bg-subtle);border:1px solid var(--border);border-radius:12px;padding:14px">
        <div style="font-family:'DM Mono',monospace;font-size:9px;text-transform:uppercase;letter-spacing:2px;color:var(--text-faint);margin-bottom:12px">Calendário anual</div>
        ${header}${bars}
    </div>`;
}

function closeCatalogDetailModal() {
    document.getElementById('catalogDetailModal').classList.remove('open');
}

function openEditCatalogFromDetail() {
    closeCatalogDetailModal();
    const e = catalogTabEntries.find(x => x._id === catalogDetailId);
    if (!e || !e._custom) return;
    openEditCatalogModal(e._dbId);
}

// ── Add/Edit Modal ─────────────────────────────────────

function openAddCatalogModal() {
    document.getElementById('catalogAddModalTitle').textContent = 'Nova Variedade';
    document.getElementById('catalogEditId').value = '';
    ['camName','camDesc','camImg','camSowIn','camSowOut','camPlant','camHarvest',
     'camGermDays','camDaysToHarvest','camSpacing','camHeight','camShu'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('camCat').value = 'Ervas Aromáticas';
    document.getElementById('camSun').value = '';
    document.getElementById('camWater').value = '';
    document.getElementById('catalogAddModal').classList.add('open');
}

function openEditCatalogModal(dbId) {
    const e = catalogCustom.find(x => x.id === dbId);
    if (!e) return;
    document.getElementById('catalogAddModalTitle').textContent = 'Editar Variedade';
    document.getElementById('catalogEditId').value = dbId;
    document.getElementById('camName').value          = e.nome || '';
    document.getElementById('camCat').value           = e.categoria || 'Outro';
    document.getElementById('camDesc').value          = e.descricao || '';
    document.getElementById('camImg').value           = e.img === IMG_DEFAULT ? '' : (e.img || '');
    document.getElementById('camSowIn').value         = e.sow_in || '';
    document.getElementById('camSowOut').value        = e.sow_out || '';
    document.getElementById('camPlant').value         = e.plant || '';
    document.getElementById('camHarvest').value       = e.harvest || '';
    document.getElementById('camGermDays').value      = e.germ_days || '';
    document.getElementById('camDaysToHarvest').value = e.days_to_harvest || '';
    document.getElementById('camSpacing').value       = e.spacing || '';
    document.getElementById('camHeight').value        = e.height || '';
    document.getElementById('camSun').value           = e.sun || '';
    document.getElementById('camWater').value         = e.water || '';
    document.getElementById('camShu').value           = e.shu != null ? e.shu : '';
    document.getElementById('catalogAddModal').classList.add('open');
}

function closeCatalogAddModal() {
    document.getElementById('catalogAddModal').classList.remove('open');
}

async function saveCatalogEntry() {
    const nome = document.getElementById('camName').value.trim();
    if (!nome) return alert('Indica o nome da variedade.');
    const img  = document.getElementById('camImg').value.trim() || IMG_DEFAULT;
    const shuRaw = document.getElementById('camShu').value.trim();
    const payload = {
        user_id:          currentUserId,
        nome,
        img,
        categoria:        document.getElementById('camCat').value,
        descricao:        document.getElementById('camDesc').value.trim(),
        sow_in:           document.getElementById('camSowIn').value.trim() || null,
        sow_out:          document.getElementById('camSowOut').value.trim() || null,
        plant:            document.getElementById('camPlant').value.trim() || null,
        harvest:          document.getElementById('camHarvest').value.trim() || null,
        germ_days:        document.getElementById('camGermDays').value.trim() || null,
        days_to_harvest:  document.getElementById('camDaysToHarvest').value.trim() || null,
        spacing:          document.getElementById('camSpacing').value.trim() || null,
        height:           document.getElementById('camHeight').value.trim() || null,
        sun:              document.getElementById('camSun').value || null,
        water:            document.getElementById('camWater').value || null,
        shu:              shuRaw !== '' ? parseInt(shuRaw) : null,
    };
    const editId = document.getElementById('catalogEditId').value;
    if (editId) {
        const { error } = await _supabase.from('catalog_entries').update(payload).eq('id', editId);
        if (error) return alert('Erro ao guardar: ' + error.message);
    } else {
        const { error } = await _supabase.from('catalog_entries').insert([payload]);
        if (error) return alert('Erro ao adicionar: ' + error.message);
    }
    closeCatalogAddModal();
    await loadCatalogCustom();
    catalogTabInit();
}

// Backdrop close for catalog modals
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('catalogDetailModal')?.addEventListener('click', function(e) {
        if (e.target === this) closeCatalogDetailModal();
    });
    document.getElementById('catalogAddModal')?.addEventListener('click', function(e) {
        if (e.target === this) closeCatalogAddModal();
    });
});

function getSeedImg(s) {
    // Tenta primeiro o catálogo (fonte de verdade)
    const fromCatalog = CATALOGO.find(c => c.nome.toLowerCase() === (s.name || '').toLowerCase());
    if (fromCatalog && fromCatalog.img && fromCatalog.img !== IMG_DEFAULT) {
        return fromCatalog.img;
    }
    // Fallback: imagem guardada na própria seed
    if (s.img && s.img !== IMG_DEFAULT) return s.img;
    return IMG_DEFAULT;
}
