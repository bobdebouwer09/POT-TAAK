// Supabase Connectie initialiseren
// LET OP: dit script wordt geladen NA de supabase-js library, maar de
// pagina die dit script insluit (groep.html) maakt zelf geen eigen client
// meer aan -- alles gebeurt hier, zodat er maar één 'db' bestaat.
const SUPABASE_URL = "https://rqcnjgavethraxgmczvy.supabase.co";
const SUPABASE_KEY = "sb_publishable_nJ8SP8_AbJ9og0OPmQEc5Q_ZylQogOU";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let huidigeGebruiker = null;
let isEigenaarVanGroep = false;

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
let bijnamen = {}; // wordt gevuld vanuit de database via laadBijnamen()
let schulden = [];
let ledenProfielen = []; // volledige lijst van groepsleden (user_id, username, avatar) voor herkenning

// Haalt de gedeelde bijnamen op uit de database (1 bijnaam per persoon, per groep)
async function laadBijnamen() {
    const { data: leden, error } = await db
        .from('groepsleden')
        .select('user_id, bijnaam, profiles(username)')
        .eq('groep_id', actieveId);

    if (error) {
        console.error("Fout bij ophalen bijnamen:", error);
        return;
    }

    bijnamen = {};
    ledenProfielen = leden || [];
    (leden || []).forEach(lid => {
        if (lid.bijnaam && lid.profiles) {
            bijnamen[lid.profiles.username] = lid.bijnaam;
        }
    });
}

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
        const codeLabel = document.getElementById('groeps-code-label');
        if (codeLabel && actieveGroep.code) {
            codeLabel.innerText = `Groepscode: ${actieveGroep.code}`;
        }
        berekenEnToonGeld();
    }
}

// Controleert of de ingelogde gebruiker de eigenaar van deze groep is,
// en verbergt/toont de verwijder-knop op basis daarvan.
async function checkEigenaarschap() {
    const { data } = await db.auth.getSession();
    if (!data.session) {
        window.location.href = 'login.html';
        return;
    }
    huidigeGebruiker = data.session.user;
    isEigenaarVanGroep = actieveGroep && actieveGroep.owner_id === huidigeGebruiker.id;

    const verwijderKnop = document.getElementById('verwijder-groep-knop');
    if (verwijderKnop) {
        verwijderKnop.style.display = isEigenaarVanGroep ? 'inline-block' : 'none';
    }
}

async function verwijderHuidigeGroep() {
    if (!isEigenaarVanGroep) {
        alert("Alleen de eigenaar van de groep kan deze verwijderen.");
        return;
    }
    if (!confirm("Weet je zeker dat je deze groep wilt verwijderen? Dit verwijdert hem voor alle leden!")) return;

    const { error } = await db.from('groepen').delete().eq('id', actieveId);
    if (error) {
        console.error("Fout bij groep verwijderen:", error);
        alert("Verwijderen mislukt.");
    } else {
        window.location.href = 'index.html';
    }
}

async function pasGroepsNaamAan() {
    const nieuweNaam = prompt("Nieuwe naam voor deze groep:", actieveGroep.naam);
    if (!nieuweNaam || nieuweNaam.trim() === "") return;

    const { error } = await db.from('groepen').update({ naam: nieuweNaam.trim() }).eq('id', actieveId);
    if (error) {
        console.error("Fout bij naam aanpassen:", error);
        alert("Naam aanpassen mislukt.");
        return;
    }

    actieveGroep.naam = nieuweNaam.trim();
    const index = groepenLijst.findIndex(g => g.id == actieveId);
    if (index !== -1) groepenLijst[index].naam = actieveGroep.naam;
    localStorage.setItem('mijnGroepen', JSON.stringify(groepenLijst));
    laadGroepsData();
}

function haalAlleActievePersonen() {
    let personen = [mijnNaam];
    ledenProfielen.forEach(lid => {
        const naam = lid.profiles ? lid.profiles.username : null;
        if (naam && !personen.includes(naam)) personen.push(naam);
    });
    taken.forEach(taak => {
        if (taak.wie && taak.wie.trim() !== "" && taak.wie !== "Iedereen" && !personen.includes(taak.wie)) personen.push(taak.wie);
    });
    schulden.forEach(schuld => {
        if (schuld.wie && !personen.includes(schuld.wie)) personen.push(schuld.wie);
    });
    return personen;
}

async function updateLedenLijst() {
    const ledenContainer = document.getElementById('groeps-leden-lijst');
    if (!ledenContainer) return;

    ledenContainer.innerHTML = "";

    ledenProfielen.forEach(lid => {
        const profiel = lid.profiles;
        if (!profiel) return;
        const badge = document.createElement('div');
        const benIkHet = huidigeGebruiker && lid.user_id === huidigeGebruiker.id;
        const naamOmTeTonen = lid.bijnaam ? `${lid.bijnaam} (${profiel.username})` : profiel.username;
        badge.className = benIkHet ? "member-badge is-me" : "member-badge";
        badge.innerHTML = `${profiel.avatar || '👤'} ${naamOmTeTonen}${benIkHet ? ' (Jij)' : ''}`;
        badge.style.cursor = 'pointer';
        badge.setAttribute('onclick', `geefBijnaam('${lid.user_id}', '${profiel.username}')`);
        ledenContainer.appendChild(badge);
    });
}

async function uitloggen() {
    await db.auth.signOut();
    localStorage.removeItem('ingelogdeGebruiker');
    localStorage.removeItem('gebruikerAvatar');
    window.location.href = 'login.html';
}

async function geefBijnaam(userId, username) {
    const huidige = bijnamen[username] || "";
    const nieuwe = prompt(`Geef een bijnaam voor ${username}:`, huidige);
    if (nieuwe === null) return;

    const nieuweBijnaam = nieuwe.trim() === "" ? null : nieuwe.trim();

    const { error } = await db
        .from('groepsleden')
        .update({ bijnaam: nieuweBijnaam })
        .eq('groep_id', actieveId)
        .eq('user_id', userId);

    if (error) {
        console.error("Fout bij bijnaam opslaan:", error);
        alert("Bijnaam opslaan mislukt.");
        return;
    }

    await laadBijnamen();
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

async function stuurBericht() {
    const input = document.getElementById('chat-input');
    if (input.value.trim() === "") return;

    const { error } = await db.from('chatberichten').insert([
        { groep_id: parseInt(actieveId), user_id: huidigeGebruiker.id, bericht: input.value.trim() }
    ]);

    if (error) {
        console.error("Fout bij versturen bericht:", error);
        alert("Bericht versturen mislukt.");
        return;
    }

    input.value = "";
    await laadChat();
}

// Haalt alle chatberichten van deze groep op en toont ze, met naam + avatar van de afzender
async function laadChat() {
    const box = document.getElementById('chat-berichten');
    if (!box) return;

    const { data: berichten, error } = await db
        .from('chatberichten')
        .select('bericht, created_at, user_id, profiles(username, avatar)')
        .eq('groep_id', actieveId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error("Fout bij ophalen chat:", error);
        return;
    }

    box.innerHTML = "";
    (berichten || []).forEach(b => {
        const naam = b.profiles ? (bijnamen[b.profiles.username] || b.profiles.username) : "Onbekend";
        const avatar = b.profiles ? b.profiles.avatar : "👤";
        box.innerHTML += `<div class="chat-msg"><strong>${naam} ${avatar}:</strong> ${b.bericht}</div>`;
    });
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

(async () => {
    console.log('Start met laden van groepspagina...');
    try {
        await laadBijnamen();
        console.log('Bijnamen geladen');
        laadGroepsData();
        console.log('Groepsdata geladen');
        laadLiveData();
        console.log('Live data (taken/schulden) geladen');
        laadChat();
        console.log('Chat geladen');
        checkEigenaarschap();
        console.log('Eigenaarschap gecheckt');
    } catch (err) {
        console.error('FOUT tijdens opstarten:', err);
    }
})();

console.log('Script komt nu bij het opzetten van de realtime-verbinding...');

// REALTIME-MONITORING: Als iemand anders op zijn mobiel iets aanpast, ververst jouw scherm meteen!
const realtimeKanaal = db.channel('groep-' + actieveId)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'chatberichten', filter: 'groep_id=eq.' + actieveId }, () => {
      console.log('Nieuw chatbericht ontvangen via realtime');
      laadChat();
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'taken', filter: 'groep_id=eq.' + actieveId }, () => {
      console.log('Taken-update ontvangen via realtime');
      laadLiveData();
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'schulden', filter: 'groep_id=eq.' + actieveId }, () => {
      console.log('Schulden-update ontvangen via realtime');
      laadLiveData();
  })
  .subscribe((status) => {
      console.log('Realtime status:', status);
  });
