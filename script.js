// Supabase Connectie initialiseren
// LET OP: dit script wordt geladen NA de supabase-js library, maar de
// pagina die dit script insluit (groep.html) maakt zelf geen eigen client
// meer aan -- alles gebeurt hier, zodat er maar één 'db' bestaat.
const SUPABASE_URL = "https://rqcnjgavethraxgmczvy.supabase.co";
const SUPABASE_KEY = "sb_publishable_nJ8SP8_AbJ9og0OPmQEc5Q_ZylQogOU";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Tabbladen logica switch
function schakelTabblad(tabId, knop) {
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
    document.querySelectorAll('.tab-navigation-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    knop.classList.add('active');
}

// Lokale data ophalen via localStorage voor de actieve groep-sessie
let groepenLijst = JSON.parse(localStorage.getItem('mijnGroepen')) || [];
const actieveId = localStorage.getItem('actieveGroepId');
let actieveGroep = groepenLijst.find(g => g.id == actieveId);
const mijnNaam = localStorage.getItem('ingelogdeGebruiker') || "Anoniem";
const mijnAvatar = localStorage.getItem('gebruikerAvatar') || "👤";

if (!actieveId || !actieveGroep) {
    alert("Groep niet gevonden.");
    window.location.href = 'index.html';
}

// Dynamische accentkleuren toevoegen op basis van het type groep
if (actieveGroep) {
    if (actieveGroep.type === "gezin") {
        document.documentElement.style.setProperty('--primary-color', '#f97316'); // Oranje
        document.documentElement.style.setProperty('--primary-light', '#fb923c');
    } else {
        document.documentElement.style.setProperty('--primary-color', '#38bdf8'); // Lichtblauw
        document.documentElement.style.setProperty('--primary-light', '#7dd3fc');
    }
}

let taken = [];
let bijnamen = JSON.parse(localStorage.getItem(`bijnamen_groep_${actieveId}`)) || {};
let schulden = [];
let basisLeden = JSON.parse(localStorage.getItem(`basis_leden_groep_${actieveId}`)) || [];

function pakNaamOfBijnaam(echteNaam) {
    if (echteNaam === "Iedereen") return "Iedereen";
    return bijnamen[echteNaam] ? `${bijnamen[echteNaam]} (${echteNaam})` : echteNaam;
}

function vindEchteNaamViaInvoer(invoerTekst) {
    const opgeschoondeInvoer = invoerTekst.trim();
    if (opgeschoondeInvoer === "" || opgeschoondeInvoer.toLowerCase() === "iedereen") return "Iedereen";
    for (const [echteNaam, bijnaam] of Object.entries(bijnamen)) {
        if (bijnaam.toLowerCase() === opgeschoondeInvoer.toLowerCase()) return echteNaam;
    }
    return opgeschoondeInvoer;
}

function laadGroepsData() {
    if (actieveGroep) {
        document.getElementById('groeps-titel').innerText = actieveGroep.naam + (actieveGroep.type === "vrienden" ? " 🏖️" : " 🏡");
        if (actieveGroep.heeftGeld === false) {
            document.getElementById('geld-tab-knop').style.display = 'none';
        }
        berekenEnToonGeld();
    }
}

function pasGroepsNaamAan() {
    const nieuweNaam = prompt("Nieuwe naam voor deze groep:", actieveGroep.naam);
    if (!nieuweNaam || nieuweNaam.trim() === "") return;
    actieveGroep.naam = nieuweNaam.trim();
    const index = groepenLijst.findIndex(g => g.id == actieveId);
    if (index !== -1) groepenLijst[index].naam = actieveGroep.naam;
    localStorage.setItem('mijnGroepen', JSON.stringify(groepenLijst));
    laadGroepsData();
}

function haalAlleActievePersonen() {
    let personen = [mijnNaam];
    basisLeden.forEach(p => { if (!personen.includes(p)) personen.push(p); });
    taken.forEach(taak => {
        if (taak.wie && taak.wie.trim() !== "" && taak.wie !== "Iedereen" && !personen.includes(taak.wie)) personen.push(taak.wie);
    });
    schulden.forEach(schuld => {
        if (schuld.wie && !personen.includes(schuld.wie)) personen.push(schuld.wie);
    });
    return personen;
}

function updateLedenLijst() {
    const personen = haalAlleActievePersonen();
    const ledenContainer = document.getElementById('groeps-leden-lijst');
    if (!ledenContainer) return;
    ledenContainer.innerHTML = "";

    personen.forEach(persoon => {
        const badge = document.createElement('div');
        const heeftBijnaam = bijnamen[persoon];
        badge.className = persoon === mijnNaam ? "member-badge is-me" : "member-badge";
        badge.innerHTML = persoon === mijnNaam ? `${mijnAvatar} ${heeftBijnaam ? heeftBijnaam + " (Jij)" : persoon + " (Jij)"}` : `👤 ${heeftBijnaam ? heeftBijnaam : persoon}`;
        badge.setAttribute('onclick', `geefBijnaam('${persoon}')`);
        ledenContainer.appendChild(badge);
    });
}

function uitloggen() {
    localStorage.removeItem('ingelogdeGebruiker');
    localStorage.removeItem('gebruikerAvatar');
    window.location.href = 'login.html';
}

function voegExtraLidToe() {
    const naam = prompt("Naam van het nieuwe lid:");
    if (!naam || naam.trim() === "") return;
    if (!basisLeden.includes(naam.trim())) {
        basisLeden.push(naam.trim());
        localStorage.setItem(`basis_leden_groep_${actieveId}`, JSON.stringify(basisLeden));
        toonTaken();
    }
}

function geefBijnaam(echteNaam) {
    const huidige = bijnamen[echteNaam] || "";
    const nieuwe = prompt(`Geef een bijnaam voor ${echteNaam}:`, huidige);
    if (nieuwe === null) return;
    if (nieuwe.trim() === "") delete bijnamen[echteNaam];
    else bijnamen[echteNaam] = nieuwe.trim();
    localStorage.setItem(`bijnamen_groep_${actieveId}`, JSON.stringify(bijnamen));
    toonTaken();
}

// LIVE SCHULDEN VIA CLOUD TOEVOEGEN
async function openSchuldPopUp() {
    const wie = prompt("Wie heeft er een schuld? (Naam/Bijnaam):");
    if (!wie) return;
    const echteNaam = vindEchteNaamViaInvoer(wie);
    const reden = prompt("Reden/Omschrijving:");
    const bedrag = parseFloat(prompt("Bedrag (€):"));
    if (isNaN(bedrag) || bedrag <= 0) return;

    const { error } = await db.from('schulden').insert([
        { groep_id: parseInt(actieveId), wie: echteNaam, reden: reden, bedrag: bedrag }
    ]);

    if (error) console.error("Fout bij schuld opslaan:", error);
    else laadLiveData();
}

async function verwijderSchuld(id) {
    const { error } = await db.from('schulden').delete().eq('id', id);
    if (error) console.error("Fout bij schuld verwijderen:", error);
    else laadLiveData();
}

function berekenEnToonGeld() {
    const hoofdTabelBody = document.getElementById('hoofd-geld-tabel-body');
    const schuldenBody = document.getElementById('schulden-tabel-body');
    if (!hoofdTabelBody) return;

    if (schuldenBody) {
        schuldenBody.innerHTML = schulden.length === 0 ? `<tr><td colspan="4" style="color:#64748b; font-style:italic; font-size:13px; text-align:center;">Geen openstaande schulden. 🎉</td></tr>` : "";
        schulden.forEach(s => {
            schuldenBody.innerHTML += `<tr>
                <td><strong>${pakNaamOfBijnaam(s.wie)}</strong></td>
                <td>${s.reden}</td>
                <td style="color:#ef4444;">-€${parseFloat(s.bedrag).toFixed(2)}</td>
                <td><button class="debt-delete-btn" onclick="verwijderSchuld(${s.id})">✅ Vink af</button></td>
            </tr>`;
        });
    }

    const allePersonen = haalAlleActievePersonen();
    let geldData = {};
    allePersonen.forEach(p => geldData[p] = { verdiend: 0, schuld: 0 });

    taken.forEach(taak => {
        if (taak.reward > 0 && (actieveGroep.type !== "gezin" || taak.status === "done")) {
            const wie = taak.wie || "Iedereen";
            if (!geldData[wie]) geldData[wie] = { verdiend: 0, schuld: 0 };
            geldData[wie].verdiend += parseFloat(taak.reward);
        }
    });

    schulden.forEach(s => {
        if (!geldData[s.wie]) geldData[s.wie] = { verdiend: 0, schuld: 0 };
        geldData[s.wie].schuld += parseFloat(s.bedrag);
    });

    hoofdTabelBody.innerHTML = "";
    Object.keys(geldData).forEach(naam => {
        const item = geldData[naam];
        const netto = item.verdiend - item.schuld;
        hoofdTabelBody.innerHTML += `<tr>
            <td><strong>${pakNaamOfBijnaam(naam)}</strong></td>
            <td style="color:#10b981;">+€${item.verdiend.toFixed(2)}</td>
            <td style="color:#ef4444;">-€${item.schuld.toFixed(2)}</td>
            <td style="color:${netto >= 0 ? '#10b981':'#ef4444'}; font-weight:bold;">€${netto.toFixed(2)}</td>
        </tr>`;
    });
}

// RENDERT DE TAKEN DIE RECHTSTREEKS UIT DE CLOUD KOMEN
function toonTaken() {
    const todoContainer = document.getElementById('todo-tasks');
    const doingContainer = document.getElementById('doing-tasks');
    const doneContainer = document.getElementById('done-tasks');

    if (!todoContainer || !doingContainer || !doneContainer) return;

    todoContainer.innerHTML = "";
    doingContainer.innerHTML = "";
    doneContainer.innerHTML = "";

    taken.forEach(taak => {
        const card = document.createElement('div');
        card.className = "task-card";
        card.setAttribute('onclick', `wisselTaakStatus(${taak.id}, event)`);

        const reward = taak.reward > 0 ? `<span class="task-reward-badge" onclick="wijzigTaakGeld(${taak.id}, event)">💰 €${parseFloat(taak.reward).toFixed(2)}</span>` : '';
        
        card.innerHTML = `
            <strong>${taak.titel}</strong><br>
            <small>Wie: <span class="edit-who-badge" onclick="wijzigTaakNaam(${taak.id}, event)">${pakNaamOfBijnaam(taak.wie || 'Iedereen')} ✏️</span></small>
            ${taak.datum ? `<span class="task-date">📅 ${taak.datum}</span>` : ''}
            ${reward}
            <button class="delete-task-btn" onclick="verwijderTaak(${taak.id}, event)">❌</button>
        `;

        if (taak.status === "todo") todoContainer.appendChild(card);
        if (taak.status === "doing") doingContainer.appendChild(card);
        if (taak.status === "done") doneContainer.appendChild(card);
    });

    berekenEnToonGeld();
    updateLedenLijst();
}

// LIVE TAKEN TOEVOEGEN AAN CLOUD
async function voegTaakToe() {
    const titel = document.getElementById('task-title').value;
    if (titel.trim() === "") return;
    const wie = vindEchteNaamViaInvoer(document.getElementById('task-who').value);
    const datum = document.getElementById('task-date').value;
    const reward = document.getElementById('task-reward').value;
    const status = document.getElementById('task-status').value;

    const { error } = await db.from('taken').insert([
        { 
            groep_id: parseInt(actieveId), 
            titel: titel, 
            wie: wie, 
            datum: datum, 
            reward: reward ? parseFloat(reward) : 0, 
            status: status 
        }
    ]);

    if (error) {
        console.error("Fout bij taak toevoegen:", error);
    } else {
        document.getElementById('task-title').value = "";
        document.getElementById('task-who').value = "";
        document.getElementById('task-date').value = "";
        document.getElementById('task-reward').value = "";
        laadLiveData();
    }
}

// LIVE STATUS WISSELEN
async function wisselTaakStatus(id, event) {
    if (event.target.tagName === 'BUTTON' || event.target.classList.contains('edit-who-badge') || event.target.classList.contains('task-reward-badge')) return;
    const taak = taken.find(t => t.id === id);
    if (!taak) return;
    
    const nieuweStatus = taak.status === "todo" ? "doing" : (taak.status === "doing" ? "done" : "todo");
    
    const { error } = await db.from('taken').update({ status: nieuweStatus }).eq('id', id);
    if (error) console.error("Fout bij status veranderen:", error);
    else laadLiveData();
}

// LIVE TAAK PERSOON UPADTEN
async function wijzigTaakNaam(id, event) {
    event.stopPropagation();
    const taak = taken.find(t => t.id === id);
    if (!taak) return;
    const nw = prompt("Wie moet dit doen?", taak.wie || "");
    if (nw === null) return;
    const echteNaam = vindEchteNaamViaInvoer(nw);

    const { error } = await db.from('taken').update({ wie: echteNaam }).eq('id', id);
    if (error) console.error("Fout bij naam aanpassen:", error);
    else laadLiveData();
}

// LIVE TAAK BELONING UPDATEN
async function wijzigTaakGeld(id, event) {
    event.stopPropagation();
    const taak = taken.find(t => t.id === id);
    const nw = prompt("Pas bedrag aan (€):", taak.reward || 0);
    if (nw === null || isNaN(parseFloat(nw))) return;

    const { error } = await db.from('taken').update({ reward: parseFloat(nw) }).eq('id', id);
    if (error) console.error("Fout bij bedrag aanpassen:", error);
    else laadLiveData();
}

// LIVE TAAK VERWIJDEREN
async function verwijderTaak(id, event) {
    event.stopPropagation();
    const { error } = await db.from('taken').delete().eq('id', id);
    if (error) console.error("Fout bij taak verwijderen:", error);
    else laadLiveData();
}

function stuurBericht() {
    const input = document.getElementById('chat-input');
    if (input.value.trim() === "") return;
    const box = document.getElementById('chat-berichten');
    box.innerHTML += `<div class="chat-msg"><strong>${mijnNaam} ${mijnAvatar}:</strong> ${input.value.trim()}</div>`;
    input.value = "";
    box.scrollTop = box.scrollHeight;
}

function kiesWillekeurigPersoon() {
    const personen = haalAlleActievePersonen();
    document.getElementById('random-resultaat').innerText = "Kiezen... 🎲";
    setTimeout(() => {
        const winnaar = personen[Math.floor(Math.random() * personen.length)];
        document.getElementById('random-resultaat').innerText = `🎉 ${pakNaamOfBijnaam(winnaar)} is de sjaak!`;
    }, 600);
}

// INTEGRATIE FUNCTIE: Haalt live alle data uit Supabase
async function laadLiveData() {
    const { data: dbTaken, error: takenError } = await db
        .from('taken')
        .select('*')
        .eq('groep_id', parseInt(actieveId));

    if (!takenError && dbTaken) {
        taken = dbTaken;
    }

    const { data: dbSchulden, error: schuldenError } = await db
        .from('schulden')
        .select('*')
        .eq('groep_id', parseInt(actieveId));

    if (!schuldenError && dbSchulden) {
        schulden = dbSchulden;
    }

    toonTaken();
}

laadGroepsData();
laadLiveData();

// REALTIME-MONITORING: Als iemand anders op zijn mobiel iets aanpast, ververst jouw scherm meteen!
db.channel('custom-all-channel')
  .on('postgres_changes', { event: '*', schema: 'public' }, () => {
      laadLiveData();
  })
  .subscribe();
