/**
 * PEPPER TRACKER PRO - CÓDIGO TOTAL INTEGRADO
 * Funcionalidades: Sincronização em cascata, Validação retroativa, Grelha de Colheita e Edição In-Card.
 */

const SUPABASE_URL = 'https://bjvjojpjhyujhyatrxlz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_dvUvVnNBD2yKxKS_Y30b2w_KDozTYOE';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const CATALOGO = [
    { nome: "Pimento Vermelho", img: "imagens/pimento_vermelho.webp" },
    { nome: "Pimento Verde", img: "imagens/pimento_verde.jpg" },
    { nome: "Jalapeño", img: "imagens/jalapeno.jpg" },
    { nome: "Habanero", img: "imagens/habanero.jpg" },
    { nome: "Carolina Reaper", img: "imagens/reaper.jpg" },
    { nome: "Piri-Piri", img: "imagens/piripiri.jpg" },
    { nome: "Pimento Padrón", img: "imagens/padron.jpg" }
];

const IMG_DEFAULT = "imagens/default.png";
let plants = [];
let isSignUpMode = false;

// --- GESTÃO DE SESSÃO ---
_supabase.auth.onAuthStateChange((event, session) => {
    const overlay = document.getElementById('authOverlay');
    const content = document.getElementById('appContent');
    if (session) {
        overlay.classList.add('hidden');
        content.classList.remove('hidden');
        document.getElementById('userEmailLabel').innerText = session.user.email;
        loadCatalog();
        loadFromSupabase();
        document.getElementById('startDate').valueAsDate = new Date();
    } else {
        overlay.classList.remove('hidden');
        content.classList.add('hidden');
    }
});

async function handleAuth() {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    if (!email || !password) return alert("Preenche os dados!");
    const { error } = isSignUpMode ? await _supabase.auth.signUp({ email, password }) : await _supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
}

function toggleAuthMode() {
    isSignUpMode = !isSignUpMode;
    document.getElementById('authTitle').innerText = isSignUpMode ? 'Criar Conta' : 'Entrar';
    document.getElementById('authPrimaryBtn').innerText = isSignUpMode ? 'Registar agora' : 'Entrar';
}

async function handleLogout() { await _supabase.auth.signOut(); }

// --- CORE LOGIC ---

async function loadFromSupabase() {
    const { data, error } = await _supabase.from('plants').select('*').order('id', { ascending: false });
    if (!error) { plants = data; render(); }
}

function loadCatalog() {
    const datalist = document.getElementById('pepperCatalog');
    if(!datalist) return;
    datalist.innerHTML = ""; 
    CATALOGO.forEach(item => {
        let option = document.createElement('option');
        option.value = item.nome;
        datalist.appendChild(option);
    });
}

function updateQtyLabel() {
    const stage = document.getElementById('stage').value;
    const label = document.getElementById('labelQty');
    const harvestContainer = document.getElementById('harvestInputContainer');
    if (stage === "Germinação") { label.innerText = "Sementes"; harvestContainer.classList.add('hidden'); } 
    else if (stage === "Plantação") { label.innerText = "Nº de Plantas"; harvestContainer.classList.add('hidden'); } 
    else if (stage === "Colheita") {
        label.innerText = "Plantas Vivas";
        harvestContainer.classList.remove('hidden');
        renderHarvestInputs('quantity', 'individualPlantsContainer', 'plant-harvest-input');
    }
}

function renderHarvestInputs(qtyInputId, containerId, inputClass) {
    const num = parseInt(document.getElementById(qtyInputId).value) || 0;
    const container = document.getElementById(containerId);
    if(!container) return;
    container.innerHTML = "";
    for (let i = 1; i <= num; i++) {
        container.innerHTML += `
            <div>
                <label class="text-[10px] text-slate-400 block ml-1 uppercase">P${i}</label>
                <input type="number" class="${inputClass} input-field text-center !p-1 !h-10 border-orange-200" data-index="${i}" placeholder="0" oninput="calculateTotalHarvest()">
            </div>`;
    }
}

function calculateTotalHarvest() {
    const inputs = document.querySelectorAll('.plant-harvest-input, .incard-harvest-input');
    let total = 0;
    inputs.forEach(input => total += parseInt(input.value) || 0);
    const displays = document.querySelectorAll('[id^="total-harvest-display-"], #totalHarvestCalc');
    displays.forEach(d => d.innerText = total);
}

// --- FORMULÁRIOS IN-CARD (EDIÇÃO E AVANÇO) ---

function openInCardForm(id, type, historyId = null) {
    const p = plants.find(x => x.id == id);
    const area = document.getElementById(`in-card-area-${id}`);
    area.classList.remove('hidden');
    
    let title = "";
    let defaultQty = p.quantity;
    let defaultDate = new Date().toISOString().split('T')[0];
    let action = "";
    let isHarvest = false;

    // Determinar a data mínima (deve ser pelo menos 1 dia após a última etapa)
    const lastDate = new Date(p.lastUpdated);
    lastDate.setDate(lastDate.getDate() + 1);
    const minDateStr = lastDate.toISOString().split('T')[0];

    if (type === 'next') {
        const nextStage = p.stage === "Germinação" ? "Plantação" : "Colheita";
        isHarvest = nextStage === "Colheita";
        title = `Avançar para: ${nextStage}`;
        action = `submitNextStage(${id}, '${nextStage}')`;
    } else {
        const hItem = p.history.find(h => h.id === historyId);
        title = `Corrigir Etapa`;
        defaultQty = parseInt(hItem.text.match(/\d+/) || p.quantity);
        defaultDate = hItem.date;
        action = `submitHistoryEdit(${id}, ${historyId})`;
    }

    area.innerHTML = `
        <div class="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
            <p class="text-[10px] font-black text-slate-500 uppercase">${title}</p>
            <div class="grid grid-cols-2 gap-2">
                <div class="${isHarvest ? 'hidden' : ''}">
                    <label class="text-[10px] font-bold text-slate-400 uppercase">Quantidade</label>
                    <input type="number" id="incard-qty-${id}" value="${defaultQty}" class="input-field !h-10 text-sm">
                </div>
                <div class="${isHarvest ? 'col-span-2' : ''}">
                    <label class="text-[10px] font-bold text-slate-400 uppercase">Data (Posterior a ${p.lastUpdated})</label>
                    <input type="date" id="incard-date-${id}" value="${defaultDate}" min="${minDateStr}" class="input-field !h-10 text-sm">
                </div>
            </div>
            
            <div id="incard-harvest-area-${id}" class="${isHarvest ? '' : 'hidden'} space-y-2">
                <label class="text-[10px] font-bold text-orange-500 uppercase">Frutos por planta:</label>
                <div id="incard-harvest-grid-${id}" class="grid grid-cols-4 gap-1"></div>
                <div class="text-[10px] font-bold text-orange-700 bg-orange-50 p-2 rounded border border-orange-100 flex justify-between">
                    <span>TOTAL:</span> <span id="total-harvest-display-${id}">0</span>
                </div>
            </div>

            <div class="flex gap-2">
                <button onclick="${action}" class="btn-primary !py-2 !text-[10px]">Confirmar</button>
                <button onclick="document.getElementById('in-card-area-${id}').classList.add('hidden')" class="btn-cancel px-3 !text-[10px]">Cancelar</button>
            </div>
        </div>
    `;

    if (isHarvest || (type === 'edit' && p.history.find(h => h.id === historyId).text.includes("Colheita"))) {
        const grid = document.getElementById(`incard-harvest-grid-${id}`);
        grid.innerHTML = "";
        for(let i=1; i <= p.quantity; i++) {
            grid.innerHTML += `<input type="number" class="incard-harvest-input input-field !p-1 !h-8 text-center text-xs border-orange-200" placeholder="P${i}" oninput="calculateTotalHarvest()">`;
        }
    }
}

async function submitNextStage(id, nextStage) {
    const p = plants.find(x => x.id == id);
    const date = document.getElementById(`incard-date-${id}`).value;
    const qty = nextStage === "Colheita" ? p.quantity : (parseInt(document.getElementById(`incard-qty-${id}`).value) || 0);
    
    // Validação de Data: Não pode ser igual ou anterior à última etapa
    if (new Date(date) <= new Date(p.lastUpdated)) {
        return alert(`⚠️ A data da nova etapa (${date}) tem de ser posterior à etapa anterior (${p.lastUpdated})!`);
    }

    if(nextStage === "Plantação" && qty > p.quantity) {
        return alert(`⚠️ Erro: Não podes plantar mais do que germinou!`);
    }

    let history = [...p.history];
    const days = calculateDays(p.startDate, date);
    let info = "";

    if(nextStage === "Plantação") {
        info = `🌿 Plantação: ${qty}/${p.quantity} plantas. Taxa: ${Math.round((qty/p.quantity)*100)}% (Dia ${days}).`;
    } else {
        let total = 0;
        let rows = "";
        const inputs = document.querySelectorAll('.incard-harvest-input');
        inputs.forEach((input, i) => {
            const val = parseInt(input.value) || 0;
            total += val;
            rows += `<tr><td class="border px-2 py-1">P${i+1}</td><td class="border px-2 py-1 text-center font-bold text-orange-600">${val}</td></tr>`;
        });
        info = `<div class="mb-1 text-orange-600 font-bold">🍎 Colheita: Total ${total} frutos (Dia ${days})</div><table class="w-full text-[10px] border border-orange-100 bg-orange-50/30"><tbody>${rows}</tbody></table>`;
    }

    history.push({ id: Date.now(), text: info, date: date });
    await _supabase.from('plants').update({ stage: nextStage, quantity: qty, lastUpdated: date, history: history }).eq('id', id);
    loadFromSupabase();
}

async function submitHistoryEdit(pId, hId) {
    const p = plants.find(x => x.id == pId);
    const newQty = parseInt(document.getElementById(`incard-qty-${pId}`).value);
    const newDate = document.getElementById(`incard-date-${pId}`).value;
    
    let history = [...p.history];
    const index = history.findIndex(h => h.id === hId);

    // 1. Atualiza o item editado
    if (history[index].text.includes("Germinação")) {
        history[index].text = `🌱 Germinação: ${newQty} sementes iniciadas.`;
        history[index].date = newDate;
    } else if (history[index].text.includes("Plantação")) {
        const sementesQty = parseInt(history[0].text.match(/\d+/)[0]);
        // Validação na edição direta da plantação
        if (newQty > sementesQty) return alert(`Limite máximo de ${sementesQty} plantas!`);
        
        const taxa = Math.round((newQty / sementesQty) * 100);
        const dias = calculateDays(history[0].date, newDate);
        history[index].text = `🌿 Plantação: ${newQty}/${sementesQty} plantas. Taxa: ${taxa}% (Dia ${dias}).`;
        history[index].date = newDate;
    }

    // 2. CASCATA: Se mudei a Germinação, a Plantação tem de se ajustar
    if (index === 0 && history.length > 1) {
        const plantIndex = history.findIndex(h => h.text.includes("Plantação"));
        if (plantIndex !== -1) {
            let plantQty = parseInt(history[plantIndex].text.match(/\d+/)[0]);
            
            // Se as sementes agora são menos que as plantas, as plantas baixam para o novo máximo
            if (plantQty > newQty) plantQty = newQty;
            
            const novaTaxa = Math.round((plantQty / newQty) * 100);
            const novosDias = calculateDays(newDate, history[plantIndex].date);
            history[plantIndex].text = `🌿 Plantação: ${plantQty}/${newQty} plantas. Taxa: ${novaTaxa}% (Dia ${novosDias}).`;
        }
    }

    // 3. Update Final
    const updateData = { history: history };
    if (index === 0) updateData.startDate = newDate;
    
    // Atualiza a quantidade global do card baseada no último estado do histórico
    const lastHistoryItem = history[history.length - 1];
    updateData.quantity = parseInt(lastHistoryItem.text.match(/\d+/)[0]);
    updateData.lastUpdated = lastHistoryItem.date;

    await _supabase.from('plants').update(updateData).eq('id', pId);
    loadFromSupabase();
}

// --- CRUD BASE ---

async function handleAction() {
    const variety = document.getElementById('variety').value;
    const qty = parseInt(document.getElementById('quantity').value) || 0;
    const date = document.getElementById('startDate').value;
    const stage = document.getElementById('stage').value;

    if (!variety) return alert("Indique a variedade!");
    const match = CATALOGO.find(p => p.nome.toLowerCase() === variety.toLowerCase());

    const payload = {
        variety: variety,
        quantity: qty,
        stage: stage,
        imgUrl: match ? match.img : IMG_DEFAULT,
        startDate: date,
        lastUpdated: date,
        archived: false,
        history: [{ id: Date.now(), text: `🌱 Germinação: ${qty} sementes iniciadas.`, date: date }]
    };

    await _supabase.from('plants').insert([payload]);
    resetForm();
    loadFromSupabase();
}

function render() {
    const list = document.getElementById('plantList');
    const archive = document.getElementById('archiveList');
    list.innerHTML = ""; archive.innerHTML = "";

    plants.forEach(p => {
        const days = calculateDays(p.startDate, new Date());
        const historyHTML = p.history.map(h => `
            <div class="timeline-item flex flex-col gap-1 !border-l-2 ">
                <div class="flex justify-between items-center opacity-60">
                    <span class="font-bold text-[10px] uppercase">${h.date}</span>
                    <div class="flex gap-2">
                        <span onclick="openInCardForm(${p.id}, 'edit', ${h.id})" class="btn-hist-edit cursor-pointer text-[10px] font-black uppercase">Editar</span>
                        <span onclick="deleteHistory(${p.id}, ${h.id})" class="btn-hist-del cursor-pointer text-[10px] font-black uppercase">Apagar</span>
                    </div>
                </div>
                <div class="text-[11px] text-slate-700">${h.text}</div>
            </div>`).join('');

        const card = `
            <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mb-4 ${p.archived ? 'grayscale' : ''}">
                <div class="flex justify-between items-center mb-3 opacity-40 border-b pb-2 text-[10px] font-bold">
                    <span>📅 ${p.startDate}</span>
                    <span class="bg-slate-100 px-2 py-1 rounded">${days} DIAS</span>
                </div>
                <div class="flex gap-4 items-center">
                    <div class="img-frame"><img src="${p.imgUrl}" class="plant-thumb" onerror="this.src='${IMG_DEFAULT}'"></div>
                    <div class="flex-1">
                        <h3 class="font-bold text-slate-800">${p.variety}</h3>
                        <p class="text-[10px] text-slate-400 font-bold uppercase mt-1">${p.quantity} Unid. | ${p.stage}</p>
                    </div>
                    ${p.stage !== 'Colheita' && !p.archived ? `<button onclick="openInCardForm(${p.id}, 'next')" class=" text-white text-[10px] font-black px-3 py-2 rounded-lg uppercase shadow-sm">Próxima Etapa</button>` : ''}
                </div>
                <div id="in-card-area-${p.id}" class="hidden mt-4 pt-4 border-t border-dashed animate-in fade-in duration-300"></div>
                <div class="mt-4 space-y-2 border-t pt-4">${historyHTML}</div>
                <div class="mt-4 flex justify-between items-center border-t pt-3">
                    <button onclick="deletePlant(${p.id})" class="text-[10px] font-bold text-slate-300 hover:text-red-400 uppercase">Eliminar</button>
                    <button onclick="toggleArchive(${p.id})" class="text-[10px] font-bold text-slate-400 uppercase">${p.archived ? '📤 Restaurar' : '📥 Arquivar'}</button>
                </div>
            </div>`;

        p.archived ? archive.innerHTML += card : list.innerHTML += card;
    });
    document.getElementById('archiveCount').innerText = `(${archive.childElementCount})`;
}

// --- AUXILIARES ---

function resetForm() {
    document.getElementById('variety').value = "";
    document.getElementById('quantity').value = "1";
    document.getElementById('startDate').valueAsDate = new Date();
    document.getElementById('stage').value = "Germinação";
    updateQtyLabel();
}

function calculateDays(s, e) {
    const start = new Date(s); const end = new Date(e);
    start.setHours(0,0,0,0); end.setHours(0,0,0,0);
    return Math.max(0, Math.floor((end - start) / (1000 * 60 * 60 * 24)));
}

async function deleteHistory(pId, hId) {
    if(!confirm("Apagar registo?")) return;
    const p = plants.find(x => x.id == pId);
    const newHistory = p.history.filter(h => h.id !== hId);
    await _supabase.from('plants').update({ history: newHistory }).eq('id', pId);
    loadFromSupabase();
}

async function deletePlant(id) { if(confirm("Apagar permanentemente?")) { await _supabase.from('plants').delete().eq('id', id); loadFromSupabase(); } }

async function toggleArchive(id) { 
    const p = plants.find(x => x.id == id);
    await _supabase.from('plants').update({ archived: !p.archived }).eq('id', id); 
    loadFromSupabase(); 
}