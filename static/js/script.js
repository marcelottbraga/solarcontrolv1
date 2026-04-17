// static/js/script.js

// ================= VARIAVEIS GLOBAIS  =================
let currentUser = 'admin';       
let currentUserLogin = 'admin';  
let currentProfile = 'Administrador'; 
let currentCommand = null;
let ultimoEstadoSirene = false;
let dashboardSlots = { slot1: 'bni', slot2: 'ghi1', slot3: 'vento_vel', slot4: 'vento_dir' };
let timerModalHelio = null;
let limitesEstacao = {};



const weatherMeta = {
    'ghi1': { label: 'GHI 1 (Global)', unit: ' W/m²' },
    'bni': { label: 'BNI (Direta)', unit: ' W/m²' },
    'dhi': { label: 'DHI (Difusa)', unit: ' W/m²' },
    'cell_irrad': { label: 'Cell_Irrad', unit: ' W/m²' }, 
    'old': { label: 'OLD (Onda Longa Emit.)', unit: ' W/m²' },
    'lwd': { label: 'LWD (Onda Longa Desc.)', unit: ' W/m²' },
    'vento_dir': { label: 'Dir. Vento', unit: '°' },
    'vento_vel': { label: 'Vel. Vento', unit: ' m/s' },
    'chuva_acum': { label: 'Chuva Acum.', unit: ' mm' },
    'temp_ar': { label: 'Temp. Ar', unit: ' °C' },
    'umidade_rel': { label: 'Umidade Rel.', unit: ' %' },
    'pressao_atm': { label: 'Pressão Atm.', unit: ' mbar' },
    'v_bat': { label: 'Bateria', unit: ' V' },
    'cell_temp': { label: 'Cell_Temp (Célula)', unit: ' °C' } 
};



// Variável global para saber qual alarme está sendo editado
let currentAlarmKey = null;



// --- CONFIGURAÇÃO DE PRIORIDADE DE ALARMES ---
const PRIORIDADE_ALARMES = [
    "EMERGÊNCIA EXTERNA!",           // 0: Risco Máximo (Parada obrigatória)
    "Termostatos Críticos",          // 1: Risco no Foco (Pode derreter o alvo)
    
    // --- RISCOS FÍSICOS AO SISTEMA ---
    "Vel. Vento Alto",               // 2: Risco estrutural para os heliostatos
    "Bateria Baixo",                 // 3: Risco de apagão do controle
    "Bateria Alto",                  
    "Cell_Temp (Célula) Alto",       // 4: Superaquecimento de equipamento
    
    // --- LIMITES OPERACIONAIS METEOROLÓGICOS ---
    "Chuva Acum. Alto",
    "Temp. Ar Alto",
    "Temp. Ar Baixo",
    "GHI 1 (Global) Alto",
    "GHI 1 (Global) Baixo",
    "BNI (Direta) Alto",
    "BNI (Direta) Baixo",
    "DHI (Difusa) Alto",
    "DHI (Difusa) Baixo",
    "Cell_Irrad Alto",
    "Cell_Irrad Baixo",
    
    // --- OUTROS PARÂMETROS ---
    "Dir. Vento Alto",
    "Dir. Vento Baixo",
    "Umidade Rel. Alto",
    "Umidade Rel. Baixo",
    "Pressão Atm. Alto",
    "Pressão Atm. Baixo",
    "OLD (Onda Longa Emit.) Alto",
    "OLD (Onda Longa Emit.) Baixo",
    "LWD (Onda Longa Desc.) Alto",
    "LWD (Onda Longa Desc.) Baixo"
];

let sensorConfig = { min: 20, max: 600, tolerance: 5, alarmBelowMin: false };

const alarmesGlobais = { termostatos: [], estacao: [] };

const weatherAlarmThresholds = {
    'DNI': { min: 800, max: 1200 },
    'GHI': { min: 400, max: 600 },
    'Difusa': { min: 0, max: 600 }, // Novo
    'Direção do Vento': { min: 0, max: 360 },
    'Velocidade do Vento': { min: 0, max: 25 },
    'Precipitação Acumulada': { min: 0, max: 50 },
    'Taxa de Chuva': { min: 0, max: 5 },
    'Temperatura': { min: 0, max: 50 }, // Novo
    'Umidade': { min: 10, max: 90 }, // Novo
    'Pressão': { min: 900, max: 1100 } // Novo
};

const weatherMap = {
    'DNI': 'dni', 'GHI': 'ghi', 'Difusa': 'dhi',
    'Direção do Vento': 'vento_direcao', 'Velocidade do Vento': 'vento_velocidade', 
    'Precipitação Acumulada': 'precipitacao', 'Taxa de Chuva': 'taxa_chuva',
    'Temperatura': 'temperatura', 'Umidade': 'umidade', 'Pressão': 'pressao'
};

// ================= FUNÇÕES DE LOADING =================
function showLoading(msg = "Aguarde...") {
    const overlay = document.getElementById('globalLoadingOverlay');
    const msgEl = document.getElementById('loadingMessage');
    if (overlay && msgEl) {
        msgEl.textContent = msg;
        overlay.classList.add('active');
    }
}

function hideLoading() {
    const overlay = document.getElementById('globalLoadingOverlay');
    if (overlay) overlay.classList.remove('active');
}

// Função para restaurar o nível do usuário ao recarregar a página
// Função para restaurar o nível do usuário ao recarregar a página
async function verificarSessao() {
    try {
        const resp = await fetch('/api/sessao');
        const data = await resp.json();
        
        if (data.ok) {
            // Restaura o perfil correto (Admin/Operador/Visualizador)
            currentProfile = data.perfil; 
            console.log("Sessão restaurada. Nível:", currentProfile);

            // SE O USUÁRIO ESTIVER LOGADO (Não for visitante)
            if (data.nome !== 'Visitante') {
                // 1. Restaura as variáveis globais
                currentUser = data.nome;
                currentUserLogin = data.usuario;

                // 2. Esconde a tela de Login e mostra o App
                const loginScreen = document.getElementById('loginScreen');
                const appScreen = document.getElementById('appScreen');
                if (loginScreen) loginScreen.classList.remove('active');
                if (appScreen) appScreen.classList.add('active');

                // 3. Atualiza o nome do usuário no topo da tela
                const elUser = document.getElementById('currentUser');
                if (elUser) elUser.textContent = `👤 ${data.nome} (${data.perfil})`;

                // 4. Vai direto para o Dashboard
                showScreen('dashboard');
            }

            // Atualiza a interface (Botão Sair)
            const loginBtn = document.getElementById('loginBtn');
            if (loginBtn && data.nome !== 'Visitante') {
                loginBtn.innerText = `Sair (${data.nome})`;
            }
            
            // Re-aplica as regras visuais (Habilita/Desabilita botões conforme o nível)
            if (typeof aplicarRegrasDeUsuario === 'function') {
                aplicarRegrasDeUsuario();
            }
        }
    } catch (e) {
        console.error("Erro ao verificar sessão", e);
    }
}

// ================= LOGIN E NAVEGAÇÃO =================
async function handleLogin(event) {
    event.preventDefault();
    const userField = document.getElementById('username').value;
    const passField = document.getElementById('password').value;
    
    if (!userField || !passField) return alert("Preencha usuário e senha.");

    showLoading("Autenticando...");

    try {
        const result = await API.login(userField, passField);
        if (result.ok) {
            currentUser = result.nome;
            currentUserLogin = userField; // <--- GARANTA QUE ESTA LINHA EXISTA
            currentProfile = result.perfil;
            
            // ... resto do código igual ...
            document.getElementById('loginScreen').classList.remove('active');
            document.getElementById('appScreen').classList.add('active');
            document.getElementById('currentUser').textContent = `👤 ${result.nome} (${result.perfil})`;
            
            aplicarRegrasDeUsuario();
            updateDateTime();
            setInterval(updateDateTime, 1000);
            showScreen('dashboard'); 
        } else {
            alert("Erro: " + result.erro);
        }
    } catch (error) {
        alert("Erro de conexão.");
    }
    finally {
        // --- ESCONDE O LOADING SEMPRE ---
        hideLoading();
    }
}

function aplicarRegrasDeUsuario() {
    console.log(`Aplicando regras para perfil: ${currentProfile}`);
    
    // --- 1. SELETORES DOS ITENS DE MENU (SIDEBAR) ---
    const navDashboard = document.querySelector("div[onclick=\"showScreen('dashboard')\"]");
    const navWeather   = document.querySelector("div[onclick=\"showScreen('weatherStation')\"]");
    const navSensors   = document.querySelector("div[onclick=\"showScreen('sensorTemp')\"]");
    const navHelio     = document.querySelector("div[onclick=\"showScreen('helioBase')\"]");
    const navTurbine   = document.querySelector("div[onclick=\"showScreen('microturbine')\"]");
    const navSystem    = document.querySelector("div[onclick=\"showScreen('system')\"]");
    const navReports   = document.querySelector("div[onclick=\"showScreen('reports')\"]");
    const navUsers     = document.querySelector("div[onclick=\"showScreen('users')\"]");

    // --- 2. SELETORES DE CONTROLES ESPECÍFICOS ---
    const botoesDashboard = document.querySelectorAll('.command-btn-main'); 
    const formHelioCrud = document.querySelector("#helioBase .form-section"); 
    const radiosVentilador = document.getElementsByName('vt_controle');
    
    // Novos seletores baseados nos eventos de clique
    const btnNovoHelio = document.querySelector("button[onclick='abrirModalNovoHeliostato()']");
    const btnSalvarTermostatos = document.querySelector("button[onclick='salvarConfiguracoesTermostatos()']");
    const engrenagensAlarmes = document.querySelectorAll("[onclick^='openWeatherAlarmModal']");
    
    // --- 3. RESET (Habilita tudo antes de aplicar restrições) ---
    if(navDashboard) navDashboard.style.display = 'block';
    if(navWeather)   navWeather.style.display = 'block';
    if(navSensors)   navSensors.style.display = 'block';
    if(navHelio)     navHelio.style.display = 'block';
    if(navTurbine)   navTurbine.style.display = 'block';
    if(navSystem)    navSystem.style.display = 'block';
    if(navReports)   navReports.style.display = 'block';
    if(navUsers)     navUsers.style.display = 'block';
    
    if(formHelioCrud) formHelioCrud.style.display = 'block';
    botoesDashboard.forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        btn.title = "";
    });
    radiosVentilador.forEach(r => r.disabled = false);

    if(btnNovoHelio) btnNovoHelio.style.display = 'inline-block';
    if(btnSalvarTermostatos) btnSalvarTermostatos.style.display = 'inline-block';
    engrenagensAlarmes.forEach(el => el.style.display = 'inline-block');

    // --- 4. REGRAS DO VISUALIZADOR (Bloqueio Total) ---
    if (currentProfile === 'Visualizador') {
        if(navWeather)   navWeather.style.display = 'none';
        if(navSensors)   navSensors.style.display = 'none';
        if(navHelio)     navHelio.style.display = 'none';
        if(navTurbine)   navTurbine.style.display = 'none';
        if(navSystem)    navSystem.style.display = 'none';
        if(navReports)   navReports.style.display = 'none';
        if(navUsers)     navUsers.style.display = 'none';

        botoesDashboard.forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
            btn.title = "Apenas visualização";
        });
        
        showScreen('dashboard');
    }

    // --- 5. REGRAS DO OPERADOR (Acesso Parcial) ---
    // O Visualizador também passa por aqui para garantir ocultação de segurança extra
    if (currentProfile === 'Operador' || currentProfile === 'Visualizador') {
        if(navSystem) navSystem.style.display = 'none'; // Esconde menu Sistema
        if(navUsers)  navUsers.style.display = 'none';  // Esconde menu Usuários
        if(formHelioCrud) formHelioCrud.style.display = 'none'; // Esconde formulário de cadastro de helios

        radiosVentilador.forEach(r => r.disabled = true);
        
        // Bloqueia engrenagens de alarmes, salvamento de termostatos e botão Novo Helio
        if(btnNovoHelio) btnNovoHelio.style.display = 'none';
        if(btnSalvarTermostatos) btnSalvarTermostatos.style.display = 'none';
        engrenagensAlarmes.forEach(el => el.style.display = 'none');
    }

    // Força o redesenho da tabela de heliostatos caso as permissões tenham acabado de ser atualizadas pela verificação de sessão
    if (typeof carregarListaBases === 'function' && document.getElementById('tabelaHeliostatosBody')) {
        carregarListaBases();
    }
}

async function handleLogout() {
    await API.logout(currentUser);
    location.reload(); 
}

function showScreen(screenName) {
    const titles = {
        'dashboard': 'Dashboard Principal', 
        'weatherStation': 'Estação Meteorológica',
        'sensorTemp': 'Sensores de Temperatura', 
        'helioBase': 'Heliostatos',
        'microturbine': 'Microturbina', 
        'system': 'Configuração do Sistema',
        'reports': 'Relatórios', 
        'users': 'Usuários',
        'aboutScreen': 'Sobre o Solar Control'
    };
    
    // Atualiza Título
    document.getElementById('pageTitle').textContent = titles[screenName] || 'Dashboard';
    
    // Troca de Tela
    document.querySelectorAll('.content .screen').forEach(s => s.classList.remove('active'));
    
    const target = document.getElementById(screenName);
    if(target) target.classList.add('active');

    // Atualiza Menu Lateral
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    // (Pequena proteção para caso a função seja chamada via código sem clique)
    if(window.event && window.event.target && window.event.target.classList.contains('nav-item')) {
        window.event.target.classList.add('active');
    }

   
    // Se a tela for a de Sensores, força a atualização do Replay
    if (screenName === 'sensorTemp') {
        console.log("Entrou na tela de sensores: Atualizando Replay...");
        
		// #Força seleção de ultima hora em toda atualização
         document.getElementById('replayPeriodo').value = '1h';
        
        carregarDadosReplay(); 
    }
    // ------------------------
}

function updateDateTime() {
    const now = new Date();
    const el = document.getElementById('dateTime');
    if(el) el.textContent = now.toLocaleDateString('pt-BR', { 
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
}

// ================= ATUALIZAÇÃO DE DADOS DA ESTACAO =================

async function atualizarDados() {
    // Busca dados da API (que lê do Modbus/Banco)
    const dados = await API.getDadosEstacao();
    
    // Se não tiver o 'ok' (proteção contra dados vazios), para aqui
    if (!dados || dados.ok === false) return;

    // Zera lista de alarmes visuais para recalcular
    if(typeof alarmesGlobais !== 'undefined') alarmesGlobais.estacao = [];

    const mapaIds = {
        'ghi1': 'val-ghi1', 
        'bni': 'val-bni', 
        'dhi': 'val-dhi', 
        'cell_irrad': 'val-cell_irrad', 
        'cell_temp': 'val-cell_temp',   
        'vento_vel': 'val-vento_vel', 
        'vento_dir': 'val-vento_dir', 
        'chuva_acum': 'val-chuva_acum', 
        'lwd': 'val-lwd', 
        'old': 'val-old',
        'temp_ar': 'val-temp_ar', 
        'umidade_rel': 'val-umidade_rel', 
        'pressao_atm': 'val-pressao_atm', 
        'v_bat': 'val-v_bat'
    };

    for (const [key, idElemento] of Object.entries(mapaIds)) {
        const valor = dados[key];
        
        // Só processa se houver valor numérico válido
        if (valor !== undefined && valor !== null) {
            const meta = weatherMeta[key];
            const texto = valor + (meta?.unit || '');
            
            // --- LÓGICA DE ALARME SIMPLIFICADA ---
            let emAlarme = false;
            
            // Busca os limites na memória (carregados do heliot.config)
            const min = parseFloat(limitesEstacao[`${key}_min`]);
            const max = parseFloat(limitesEstacao[`${key}_max`]);

            // Compara (apenas se os limites existirem e forem números)
            if (!isNaN(min) && valor < min) emAlarme = true;
            if (!isNaN(max) && valor > max) emAlarme = true;
            
            // Se estiver em alarme, adiciona na lista global (para o topo da tela)
            if (emAlarme && typeof alarmesGlobais !== 'undefined') {
                alarmesGlobais.estacao.push(`${meta.label} fora do limite`);
            }
            // -------------------------------------

            // 1. Atualiza Tela da Estação
            const el = document.getElementById(idElemento);
            if (el) {
                el.innerText = texto;
                // Pinta de VERMELHO se estiver em alarme
                el.style.color = emAlarme ? '#ff4444' : 'var(--color-accent)';
                el.style.fontWeight = emAlarme ? '800' : 'bold';
            }
        }
    }
    
    // Atualiza hora
    const elHora = document.getElementById('val-data_hora');
    if(elHora && dados.data_hora) elHora.innerText = dados.data_hora;

    // 2. Atualiza Dashboard (Slots dinâmicos) com a mesma lógica de cor
    for (let i = 1; i <= 4; i++) {
        const key = dashboardSlots[`slot${i}`];
        if(!key) continue;
        
        const valor = dados[key];
        const meta = weatherMeta[key];
        
        if (valor !== undefined && meta) {
            const elVal = document.getElementById(`dash_slot_${i}_val`);
            const elTitle = document.getElementById(`dash_slot_${i}_title`);
            
            if (elVal) {
                elVal.innerText = valor + meta.unit;
                
                // Reaplica verificação de cor aqui também
                const min = parseFloat(limitesEstacao[`${key}_min`]);
                const max = parseFloat(limitesEstacao[`${key}_max`]);
                let emAlarme = false;
                if (!isNaN(min) && valor < min) emAlarme = true;
                if (!isNaN(max) && valor > max) emAlarme = true;
                
                elVal.style.color = emAlarme ? '#ff4444' : 'var(--color-accent)';
            }
            if (elTitle) elTitle.innerText = meta.label;
        }
    }

    // Atualiza o painel de alarmes global no topo
    if (typeof atualizarInterfaceAlarmes === 'function') {
        atualizarInterfaceAlarmes();
    }
}

// Função Auxiliar para aplicar texto e COR (Vermelho se alarme)
function aplicarValorComCor(elementId, valor, meta) {
    const el = document.getElementById(elementId);
    if (!el || valor === undefined || valor === null) return;

    const texto = valor + meta.unit;
    const limites = weatherAlarmThresholds[meta.limiteKey];
    
    let emAlarme = false;
    if (limites) {
        if (valor < limites.min || valor > limites.max) emAlarme = true;
    }

    el.textContent = texto;
    el.style.color = emAlarme ? '#ff4444' : 'var(--color-accent)';
    el.style.fontWeight = emAlarme ? '800' : 'bold';
}

// Função Auxiliar que trata Pontos A e C
function atualizarCampoEstacao(valor, config) {
    if (valor === undefined || valor === null) return;

    const textoFinal = valor + config.unit;
    const limites = weatherAlarmThresholds[config.limiteKey];
    
    // Verifica se está em alarme (Ponto C)
    let emAlarme = false;
    if (limites) {
        if (valor < limites.min || valor > limites.max) {
            emAlarme = true;
        }
    }

    // Cor a ser aplicada (Vermelho se alarme, Azul/Padrão se normal)
    const cor = emAlarme ? '#ff4444' : 'var(--color-accent)';
    const weight = emAlarme ? '800' : 'bold';

    // 1. Atualiza na Tela da Estação
    const elEstacao = document.getElementById(config.id_estacao);
    if (elEstacao) {
        elEstacao.textContent = textoFinal;
        elEstacao.style.color = cor;
        elEstacao.style.fontWeight = weight;
    }

    // 2. Atualiza no Dashboard (Se existir o elemento) - (Ponto A: Espelho)
    if (config.id_dash) {
        const elDash = document.getElementById(config.id_dash);
        if (elDash) {
            elDash.textContent = textoFinal;
            elDash.style.color = cor;
            elDash.style.fontWeight = weight;
        }
    }
}

async function atualizarStatusConexao() {
    const dados = await API.getStatusConexao();
    if (!dados.ok) return;

    // As funções updateStatusDot já têm proteção interna, então ok
    updateStatusDot('clpStatus', dados.termostatos_online);
    updateStatusDot('weatherStatus', dados.estacao_online);
    
    // Se tiver adicionado o wifiStatus antes, mantenha aqui
    if(dados.wifi_online !== undefined) {
        updateStatusDot('wifiStatus', dados.wifi_online);
    }
	
	// Status do Ventilador ---
    if(dados.ventilador_online !== undefined) {
        updateStatusDot('ventiladorStatus', dados.ventilador_online);
		}
		
    // --- LÓGICA DE EMERGÊNCIA ---
    if (dados.emergencia) {
        if (!alarmesGlobais.termostatos.includes("EMERGÊNCIA EXTERNA!")) {
            alarmesGlobais.termostatos.unshift("EMERGÊNCIA EXTERNA!");
            atualizarInterfaceAlarmes();
        }
    } else {
        const idx = alarmesGlobais.termostatos.indexOf("EMERGÊNCIA EXTERNA!");
        if (idx > -1) {
            alarmesGlobais.termostatos.splice(idx, 1);
            atualizarInterfaceAlarmes();
        }
    }

    // --- CORREÇÃO DO ERRO ---
    const statusElement = document.getElementById('connectionStatus');
    
    // Só tenta alterar as classes SE o elemento existir na tela
    if (statusElement) { 
        if (!dados.estacao_online && !dados.termostatos_online) {
            statusElement.classList.add('offline');
            statusElement.innerHTML = '<div class="status-dot offline"></div>SEM CONEXÃO';
        } else {
            statusElement.classList.remove('offline');
            statusElement.innerHTML = '<div class="status-dot"></div>CONEXÃO OK';
        }
    }
}

/* --- CÂMERAS OCULTADAS TEMPORARIAMENTE ---
async function atualizarStatusCamerasUI() {
    const status = await API.getStatusCameras();
    const lbl1 = document.getElementById('cam1_status');
    const lbl2 = document.getElementById('cam2_status');
    if (lbl1) {
        lbl1.textContent = status[1] ? "ONLINE" : "DESCONECTADO";
        lbl1.style.color = status[1] ? "#00d084" : "#ff4444";
    }
    if (lbl2) {
        lbl2.textContent = status[2] ? "ONLINE" : "DESCONECTADO";
        lbl2.style.color = status[2] ? "#00d084" : "#ff4444";
    }
}
------------------------------------------- */

// ================= CONFIGURAÇÕES E SALVAMENTO =================
async function carregarConfiguracoes() {
    const dados = await API.getConfig();
    if (!dados) return;

    // Pega os limites (min/max) direto do heliot.config e salva na memória
    if (dados.ESTACAO) {
        limitesEstacao = dados.ESTACAO;
    }

    // 1. SISTEMA
    const sis = dados.SISTEMA;
    if (sis) {
        const safeSet = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        safeSet('ip_estacao', sis.ip_estacao_meteo);
        safeSet('porta_estacao', sis.port_estacao_meteo);
        safeSet('ip_termostatos', sis.ip_termostatos);
        safeSet('porta_termostatos', sis.port_termostatos);
        safeSet('ip_roteador', sis.ip_roteador);
        safeSet('porta_roteador', sis.port_roteador);
        safeSet('ip_camera1', sis.ip_cam1);
        safeSet('porta_camera1', sis.port_cam1);
        safeSet('ip_camera2', sis.ip_cam2);
        safeSet('porta_camera2', sis.port_cam2);
        safeSet('ip_ventilador', sis.ip_ventilador);
        safeSet('porta_ventilador', sis.port_ventilador);
    }
    
    // 2. TEMPOS
    const tempos = dados.TEMPOS;
    if (tempos) {
        const elEst = document.getElementById('tempo_gravacao_estacao');
        if (elEst) elEst.value = tempos.intervalo_gravacao_estacao_segundos || 60;

        const elTerm = document.getElementById('tempo_gravacao_termostatos');
        if (elTerm) elTerm.value = tempos.intervalo_gravacao_termostatos_segundos;
    }

    // 3. TERMOSTATOS
    const term = dados.TERMOSTATOS;
    if (term) {
        if (typeof sensorConfig !== 'undefined') {
            sensorConfig.min = parseFloat(term.temp_min);
            sensorConfig.max = parseFloat(term.temp_max);
            sensorConfig.tolerance = parseInt(term.num_sensores_alarm);
            sensorConfig.alarmBelowMin = (term.toggle_ativa_min === 'true');
        }
        const safeSet = (id, val) => { const el = document.getElementById(id); if(el) el.value = val; };
        safeSet('tempMinHeatmap', term.temp_min);
        safeSet('tempMaxHeatmap', term.temp_max);
        safeSet('numsensout', term.num_sensores_alarm);

        const radioSim = document.querySelector('input[name="alarmBelowMin"][value="sim"]');
        const radioNao = document.querySelector('input[name="alarmBelowMin"][value="nao"]');
        if (radioSim && radioNao) {
            if (term.toggle_ativa_min === 'true') radioSim.checked = true;
            else radioNao.checked = true;
        }
    }

    // 4. DASHBOARD
    const dash = dados.DASHBOARD_DISPLAY;
    if (dash) {
        // Atualiza a variável global com o que veio do arquivo
        dashboardSlots.slot1 = dash.slot1 || 'bni';
        dashboardSlots.slot2 = dash.slot2 || 'ghi1';
        dashboardSlots.slot3 = dash.slot3 || 'vento_vel';
        dashboardSlots.slot4 = dash.slot4 || 'vento_dir';

        // MUDANÇA: Atualiza os Dropdowns na tela Sistema com os IDs corretos (dash_slot_X)
        const safeSetDash = (id, val) => { const el = document.getElementById(id); if(el) el.value = val; };
        safeSetDash('dash_slot_1', dashboardSlots.slot1);
        safeSetDash('dash_slot_2', dashboardSlots.slot2);
        safeSetDash('dash_slot_3', dashboardSlots.slot3);
        safeSetDash('dash_slot_4', dashboardSlots.slot4);

        // Força atualização visual imediata
        if (typeof atualizarTitulosDashboard === 'function') {
            atualizarTitulosDashboard();
        }
        // Atualiza os valores também
        atualizarDados();
    }
}

// Função para colocar o título correto no Dashboard (Ex: "Taxa de Chuva")
function atualizarTitulosDashboard() {
    for (let i = 1; i <= 4; i++) {
        const key = dashboardSlots[`slot${i}`];
        const meta = weatherMeta[key];
        const elTitle = document.getElementById(`dash_slot_${i}_title`);
        if (elTitle && meta) {
            elTitle.textContent = meta.label;
        }
    }
}

// Função do Botão "GRAVAR" da tela Sistema
async function salvarIPs() {
    const tEstacao = document.getElementById('tempo_gravacao_estacao').value;
    const tTerm = document.getElementById('tempo_gravacao_termostatos').value;

    if (!tEstacao || tEstacao <= 0) return alert("Tempo da Estação inválido.");
    if (!tTerm || tTerm <= 0) return alert("Tempo dos Termostatos inválido.");

    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };

    const payload = {
        usuario_solicitante: currentUserLogin,
        usuario: currentUser,
        SISTEMA: {
            ip_estacao_meteo: getVal('ip_estacao'),
            port_estacao_meteo: getVal('porta_estacao'),
            ip_termostatos: getVal('ip_termostatos'),
            port_termostatos: getVal('porta_termostatos'),
            ip_roteador: getVal('ip_roteador'),
            port_roteador: getVal('porta_roteador'),
            ip_ventilador: getVal('ip_ventilador'),
            port_ventilador: getVal('porta_ventilador'),
            ip_cam1: getVal('ip_camera1'),
            port_cam1: getVal('porta_camera1'),
            ip_cam2: getVal('ip_camera2'),
            port_cam2: getVal('porta_camera2')
        },
        TEMPOS: {
            intervalo_gravacao_estacao_segundos: tEstacao,
            intervalo_gravacao_termostatos_segundos: tTerm
        },
        DASHBOARD_DISPLAY: {
            slot1: getVal('dash_slot_1'),
            slot2: getVal('dash_slot_2'),
            slot3: getVal('dash_slot_3'),
            slot4: getVal('dash_slot_4')
        }
    };

    // --- MOSTRA O LOADING ---
    showLoading("Gravando novas configurações...");

    try {
        const d = await API.salvarConfig(payload);
        if (d.ok) {
            alert('Configurações do Sistema Salvas!');
            carregarConfiguracoes();
        } else {
            alert('Erro ao salvar: ' + d.erro);
        }
    } catch(e) {
        alert('Erro de conexão com o servidor.');
    } finally {
        // --- ESCONDE O LOADING SEMPRE ---
        hideLoading();
    }
}

async function salvarConfiguracoesTermostatos() {
    // TRAVA PARA OPERADOR E VISUALIZADOR
    if (currentProfile !== 'Administrador') {
        return alert("Acesso Negado: Apenas Administradores podem configurar termostatos.");
    }

    const min = document.getElementById('tempMinHeatmap').value;
    const max = document.getElementById('tempMaxHeatmap').value;
    const tol = document.getElementById('numsensout').value;
    const radioBelow = document.querySelector('input[name="alarmBelowMin"]:checked');
    let ativaMin = (radioBelow && radioBelow.value === 'sim') ? 'true' : 'false';

    const payload = {
        usuario_solicitante: currentUserLogin,
        usuario: currentUser,
        termostatos: { temp_min: min, temp_max: max, num_sensores_alarm: tol, toggle_ativa_min: ativaMin }
    };

    const result = await API.salvarConfig(payload);
    if(result.ok) {
        alert(`Configurações de Termostatos Salvas!`);
        carregarConfiguracoes();
        generateHeatmap();
    } else {
        alert('Erro ao salvar: ' + (result.erro || 'Erro desconhecido'));
    }
}

// ================= HEATMAP E ALARMES =================
async function generateHeatmap() {
    const container = document.getElementById('heatmapCells');
    if (!container) return;

    const dados = await API.getTermostatos();
    const valores = dados.ok ? (dados.valores || []) : [];

    // Chama a verificação de alarme antes de renderizar
    verificarAlarmesTemperatura(valores); 

    if (container.children.length === 0) {
        for (let i = 0; i < 90; i++) {
            const cell = document.createElement('div');
            cell.className = 'heatmap-cell-90';
            container.appendChild(cell);
        }
    }

    const celulas = container.children;
    for (let i = 0; i < 90; i++) {
        const temp = valores[i] ?? 0;
        const cell = celulas[i];

        cell.style.background = getColorForTemperature(temp);
        cell.textContent = `${i + 1}`;
        cell.title = `Sensor ${i + 1}: ${temp.toFixed(1)}°C`;
        cell.style.cursor = 'pointer'; 
        cell.onclick = () => abrirGraficoSensor(i + 1);
        
        // --- LÓGICA DE DESTAQUE ATUALIZADA ---
        // Garante comparação numérica correta com sensorConfig
        const acimaMax = temp > sensorConfig.max;
        const abaixoMin = sensorConfig.alarmBelowMin && temp < sensorConfig.min;

        if (acimaMax || abaixoMin) {
            cell.style.border = '2px solid #ffffff'; // Borda branca de destaque
            cell.style.zIndex = '10';
            cell.style.boxShadow = '0 0 10px rgba(255,255,255,0.9)';
            cell.style.fontWeight = 'bold';
        } else {
            cell.style.border = '1px solid rgba(255,255,255,0.1)'; 
            cell.style.zIndex = '1';
            cell.style.boxShadow = 'none';
            cell.style.fontWeight = 'normal';
        }
    }
    carregarListaSensores(valores);
}

function calcularMaiorHotspotJS(valores, maxTemp, minTemp, ativaMin, linhas = 10, colunas = 9) {
    // 1. Cria um array booleano marcando quem está crítico
    let estadoCritico = valores.map(temp => (temp > maxTemp) || (ativaMin && temp < minTemp));

    if (!estadoCritico.some(v => v)) return 0;

    let visitados = new Set();
    let maiorCluster = 0;
    
    // As 8 direções: Cima, Baixo, Esquerda, Direita e Diagonais
    const direcoes = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];

    for (let r = 0; r < linhas; r++) {
        for (let c = 0; c < colunas; c++) {
            let idx = r * colunas + c;
            if (idx >= estadoCritico.length) break;

            if (estadoCritico[idx] && !visitados.has(idx)) {
                let tamanhoAtual = 0;
                let pilha = [[r, c]];
                visitados.add(idx);

                while (pilha.length > 0) {
                    let [currR, currC] = pilha.pop();
                    tamanhoAtual++;

                    for (let [dr, dc] of direcoes) {
                        let nr = currR + dr;
                        let nc = currC + dc;

                        if (nr >= 0 && nr < linhas && nc >= 0 && nc < colunas) {
                            let nIdx = nr * colunas + nc;
                            if (nIdx < estadoCritico.length && estadoCritico[nIdx] && !visitados.has(nIdx)) {
                                visitados.add(nIdx);
                                pilha.push([nr, nc]);
                            }
                        }
                    }
                }
                if (tamanhoAtual > maiorCluster) {
                    maiorCluster = tamanhoAtual;
                }
            }
        }
    }
    return maiorCluster;
}

function verificarAlarmesTemperatura(valores) {
    // 1. Usa o novo algoritmo de hotspot para contar apenas vizinhos
    const maiorHotspot = calcularMaiorHotspotJS(
        valores, 
        sensorConfig.max, 
        sensorConfig.min, 
        sensorConfig.alarmBelowMin, 
        10, 9 // 10 linhas, 9 colunas
    );

    // 2. GUARDA O ESTADO DA EMERGÊNCIA ANTES DE LIMPAR O ARRAY
    const temEmergencia = alarmesGlobais.termostatos.includes("EMERGÊNCIA EXTERNA!");

    // 3. Reseta o array de alarmes de termostatos
    alarmesGlobais.termostatos = [];

    // 4. REINSERE A EMERGÊNCIA SE ELA ESTAVA ATIVA
    if (temEmergencia) {
        alarmesGlobais.termostatos.push("EMERGÊNCIA EXTERNA!");
    }

    // 5. DISPARO DO ALARME: Se o MAIOR HOTSPOT for MAIOR que a tolerância
    if (maiorHotspot > sensorConfig.tolerance) {
        alarmesGlobais.termostatos.push("Termostatos Críticos");
        console.warn(`[ALARME] Hotspot perigoso detetado! ${maiorHotspot} sensores críticos adjacentes (Limite: ${sensorConfig.tolerance})`);
    }

    // Chama a interface.
    atualizarInterfaceAlarmes();
}

function verificarAlarmesEstacao(dados) {
    // Reseta o array de alarmes da estação
    alarmesGlobais.estacao = [];

    // Usa os limites carregados dinamicamente do heliot.config (limitesEstacao)
    // em vez de weatherAlarmThresholds fixos, se disponível.
    for (const [key, idElemento] of Object.entries(weatherMeta)) {
        const valor = dados[key];
        if (valor === undefined || valor === null) continue;

        const min = parseFloat(limitesEstacao[`${key}_min`]);
        const max = parseFloat(limitesEstacao[`${key}_max`]);

        if (!isNaN(min) && valor < min) {
            alarmesGlobais.estacao.push(`${weatherMeta[key].label} Baixo`);
        }
        if (!isNaN(max) && valor > max) {
            alarmesGlobais.estacao.push(`${weatherMeta[key].label} Alto`);
        }
    }
    atualizarInterfaceAlarmes();
}

// --- VARIÁVEL DE ESTADO DA SIRENE MANUAL ---
let sireneSilenciadaManualmente = false;

function atualizarInterfaceAlarmes() {
    const container = document.querySelector('.alarm-global-card');
    const icon = document.getElementById('alarme_global_icon');
    const status = document.getElementById('alarme_global_status');
    const counterDiv = document.getElementById('alarme_global_counter');

    const todosAlarmes = [...alarmesGlobais.termostatos, ...alarmesGlobais.estacao];
    const qtdAlarmes = todosAlarmes.length;
    const alarmeAtivo = qtdAlarmes > 0;

    todosAlarmes.sort((a, b) => {
        let idxA = PRIORIDADE_ALARMES.indexOf(a);
        let idxB = PRIORIDADE_ALARMES.indexOf(b);
        if (idxA === -1) idxA = 999;
        if (idxB === -1) idxB = 999;
        return idxA - idxB;
    });

    // 1. Destrava a sirene automaticamente se todos os alarmes sumirem
    if (!alarmeAtivo) {
        sireneSilenciadaManualmente = false;
    }

    // 2. A Sirene só deve tocar se houver alarme E não tiver sido silenciada pelo utilizador
    const deveTocarSirene = alarmeAtivo && !sireneSilenciadaManualmente;

    if (deveTocarSirene !== ultimoEstadoSirene) {
        API.setSirene(deveTocarSirene);
        ultimoEstadoSirene = deveTocarSirene;
    }

    // 3. Interface Visual do Banner
    if (alarmeAtivo && container) {
        container.style.background = 'rgba(255, 68, 68, 0.15)';
        
        // Altera o ícone e adiciona o evento de clique
        if(icon) {
            icon.textContent = sireneSilenciadaManualmente ? '🔕' : '🚨';
            icon.style.cursor = 'pointer';
            icon.title = sireneSilenciadaManualmente ? 'Sirene Física Silenciada' : 'Clique para silenciar a sirene física';
            icon.onclick = iniciarSilenciamentoSirene;
        }
        
        const alarmePrincipal = todosAlarmes[0];
        if (qtdAlarmes === 1) if(status) status.textContent = `ATENÇÃO: ${alarmePrincipal}`;
        else if(status) status.textContent = `ATENÇÃO: ${alarmePrincipal} (+${qtdAlarmes - 1})`;
        if(counterDiv) counterDiv.textContent = `${qtdAlarmes} alarmes ativos`;
        
    } else if (container) {
        container.style.background = 'linear-gradient(120deg, rgba(255, 68, 68, 0.08), rgba(0, 208, 132, 0.05))';
        if(icon) {
            icon.textContent = '✅';
            icon.style.cursor = 'default';
            icon.title = '';
            icon.onclick = null; // Remove o evento de clique quando está tudo normal
        }
        if(status) status.textContent = "Sistema Monitorando";
        if(counterDiv) counterDiv.textContent = "0 alarmes ativos";
    }
}

// --- FUNÇÕES DOS MODAIS DE SILENCIAMENTO DA SIRENE ---

function iniciarSilenciamentoSirene() {
    if (currentProfile === 'Visualizador') return alert("Acesso restrito. Apenas Operadores ou Administradores podem silenciar a sirene.");
    
    if (sireneSilenciadaManualmente) return alert("A sirene física já foi silenciada para os alarmes atuais.");

    document.getElementById('modalSilenciar1').style.display = 'flex';
}

function confirmarSilenciamentoEtapa1() {
    document.getElementById('modalSilenciar1').style.display = 'none';
    document.getElementById('modalSilenciar2').style.display = 'flex';
}

function cancelarSilenciamento() {
    document.getElementById('modalSilenciar1').style.display = 'none';
    document.getElementById('modalSilenciar2').style.display = 'none';
}

function confirmarSilenciamentoFinal() {
    document.getElementById('modalSilenciar2').style.display = 'none';
    
    // Altera a variável global
    sireneSilenciadaManualmente = true;
    
    // Força a atualização da interface (o que vai disparar a API para desligar o Modbus da sirene na hora)
    atualizarInterfaceAlarmes(); 
    
    alert("A sirene física foi DESLIGADA. O painel continuará exibindo as luzes de emergência.");
}

// ================= UTILITÁRIOS =================
function setVal(id, val) { const el = document.getElementById(id); if(el) el.textContent = val; }
function setValInput(id, val) { const el = document.getElementById(id); if(el) el.value = val; }
function updateStatusDot(elementId, isOnline) {
    const container = document.getElementById(elementId);
    if (!container) return;
    const dot = container.querySelector('.clp-status-dot');
    const text = container.querySelector('.clp-status-text');
    dot.className = isOnline ? 'clp-status-dot online' : 'clp-status-dot offline';
    text.textContent = isOnline ? 'ONLINE' : 'OFFLINE';
}
function getColorForTemperature(temp) {
    const t = Math.max(0, Math.min(700, temp));
    if (t <= 200) return interpolateColor('#0047ab', '#00a8ff', t / 200);
    if (t <= 300) return interpolateColor('#00a8ff', '#00ffff', (t - 200) / 100);
    if (t <= 400) return interpolateColor('#00ffff', '#00ff00', (t - 300) / 100);
    if (t <= 500) return interpolateColor('#00ff00', '#ffff00', (t - 400) / 100);
    if (t <= 600) return interpolateColor('#ffff00', '#ffa500', (t - 500) / 100);
    if (t <= 700) return interpolateColor('#ffa500', '#ff0000', (t - 600) / 100);
    return '#800000';
}
function interpolateColor(color1, color2, factor) {
    const c1 = parseInt(color1.slice(1), 16);
    const c2 = parseInt(color2.slice(1), 16);
    const r = Math.round(((c1 >> 16) & 255) + (((c2 >> 16) & 255) - ((c1 >> 16) & 255)) * factor);
    const g = Math.round(((c1 >> 8) & 255) + (((c2 >> 8) & 255) - ((c1 >> 8) & 255)) * factor);
    const b = Math.round((c1 & 255) + ((c2 & 255) - (c1 & 255)) * factor);
    return `rgb(${r}, ${g}, ${b})`;
}
function carregarListaSensores(valores) {
    const container = document.getElementById('sensoresGrid');
    if (!container) return;
    if(container.children.length === 0) {
        valores.forEach((valor, idx) => {
            const card = document.createElement('div');
            card.className = 'weather-data-card';
            card.style.padding = '12px';
            card.innerHTML = `<div class="card-title">Sensor ${idx+1}</div><div class="card-value" id="temp_sensor_${idx}">${Number(valor).toFixed(1)} °C</div>`;
            container.appendChild(card);
        });
    } else {
        valores.forEach((valor, idx) => {
            const el = document.getElementById(`temp_sensor_${idx}`);
            if(el) el.textContent = `${Number(valor).toFixed(1)} °C`;
        });
    }
}

// ================= MODAL DE CLIMA =================
function openWeatherAlarmModal(paramName, unit) {
    // TRAVA PARA OPERADOR E VISUALIZADOR
    if (currentProfile !== 'Administrador') {
        return alert("Acesso Negado: Apenas Administradores podem configurar alarmes.");
    }

    const modal = document.getElementById('modalWeatherConfig');
    if (!modal) return;
    const configAtual = weatherAlarmThresholds[paramName];
    document.getElementById('modalWeatherTitle').textContent = `Configurar Alarmes: ${paramName}`;
    document.getElementById('weatherParamKey').value = paramName; 
    document.getElementById('weatherModalUnitMin').textContent = unit;
    document.getElementById('weatherModalUnitMax').textContent = unit;
    if (configAtual) {
        document.getElementById('weatherMinInput').value = configAtual.min;
        document.getElementById('weatherMaxInput').value = configAtual.max;
    }
    modal.style.display = 'flex';
}

function closeWeatherModal() { document.getElementById('modalWeatherConfig').style.display = 'none'; }

async function saveWeatherConfig() {
    const paramName = document.getElementById('weatherParamKey').value;
    const minVal = parseFloat(document.getElementById('weatherMinInput').value);
    const maxVal = parseFloat(document.getElementById('weatherMaxInput').value);
    if (isNaN(minVal) || isNaN(maxVal)) return alert("Valores inválidos.");

    if (weatherAlarmThresholds[paramName]) {
        weatherAlarmThresholds[paramName].min = minVal;
        weatherAlarmThresholds[paramName].max = maxVal;
    }

    const safeKey = weatherMap[paramName] || paramName.toLowerCase().replace(/ /g, '_');
    const payload = { 
        usuario_solicitante: currentUserLogin, // NOVO
        usuario: currentUser, 
        estacao: { [`${safeKey}_min`]: minVal, [`${safeKey}_max`]: maxVal } 
    };
    
    const resp = await API.salvarConfig(payload);
    if (resp.ok) {
        alert(`Configuração salva!`);
        closeWeatherModal();
        carregarConfiguracoes();
    } else {
        alert("Erro ao salvar: " + (resp.erro || "Permissão negada"));
    }
}

// ================= RELATÓRIOS E UTILITÁRIOS =================
function formatDateLocal(date) {
    const offset = date.getTimezoneOffset() * 60000;
    return (new Date(date - offset)).toISOString().slice(0, 16);
}
function initReportDates() { setReportPeriod(1); }
function setReportPeriod(days) {
    const end = new Date();
    const start = new Date();
    if (days === 0) start.setHours(0, 0, 0, 0);
    else start.setDate(end.getDate() - days);
    document.getElementById('reportStartDate').value = formatDateLocal(start);
    document.getElementById('reportEndDate').value = formatDateLocal(end);
}

async function carregarFiltrosHeliostatos() {
    const container = document.getElementById('helioCheckboxContainer');
    if (!container) return;
    try {
        const bases = await API.getBases();
        // Recria apenas mantendo o TODOS
        container.innerHTML = `
            <label style="cursor: pointer; display: flex; align-items: center; gap: 5px;">
                <input type="checkbox" id="helioCheckTodos" value="TODOS" checked onchange="toggleTodosHelios(this)"> TODOS
            </label>
        `;
        bases.forEach(b => {
            container.innerHTML += `
                <label style="cursor: pointer; display: flex; align-items: center; gap: 5px;">
                    <input type="checkbox" class="helio-cb" value="${b.numero}" checked onchange="checkHelioIndividual()"> Helio ${b.numero}
                </label>
            `;
        });
    } catch (e) {
        console.error("Erro ao carregar filtros de heliostatos.");
    }
}

function toggleTodosHelios(source) {
    document.querySelectorAll('.helio-cb').forEach(cb => cb.checked = source.checked);
}

function checkHelioIndividual() {
    const total = document.querySelectorAll('.helio-cb').length;
    const marcados = document.querySelectorAll('.helio-cb:checked').length;
    document.getElementById('helioCheckTodos').checked = (total > 0 && total === marcados);
}

function obterFiltrosRelatorio(tipo) {
    let filtros = [];
    if (tipo === 'events') {
        document.querySelectorAll('input[name="eventType"]:checked').forEach(cb => {
            filtros.push(cb.value);
            // Mantém a regra do Logout casada com o Login
            if (cb.value === 'LOGIN') filtros.push('LOGOUT'); 
        });
    } else if (tipo === 'heliostatos' || tipo === 'calibracoes') {
        const todos = document.getElementById('helioCheckTodos');
        if (todos && todos.checked) {
            filtros.push('TODOS');
        } else {
            document.querySelectorAll('.helio-cb:checked').forEach(cb => filtros.push(cb.value));
        }
    }
    return filtros;
}
    
function toggleReportOptions() {
    const tipo = document.getElementById('reportType').value;
    const divEvents = document.getElementById('eventFilterOptions');
    const divHelios = document.getElementById('helioFilterOptions'); 
    
    divEvents.style.display = (tipo === 'events') ? 'block' : 'none';
    if(divHelios) divHelios.style.display = (tipo === 'heliostatos' || tipo === 'calibracoes') ? 'block' : 'none'; 

    const btnView = document.getElementById('btnVisualizarTela');
    const previewArea = document.getElementById('previewArea');
    
    if (tipo === 'weather' || tipo === 'sensors'|| tipo === 'heliostatos') {
        btnView.style.visibility = 'hidden'; 
        previewArea.style.display = 'none';
    } else {
        btnView.style.visibility = 'visible';
        previewArea.style.display = 'block';
    }

    const btnPDF = document.getElementById('btnExportarPDF');
    if (tipo === 'sensors') {
        btnPDF.style.visibility = 'hidden'; 
    } else {
        btnPDF.style.visibility = 'visible';
    }
}
async function buscarDadosRelatorio() {
    const tipo = document.getElementById('reportType').value;
    const inicio = document.getElementById('reportStartDate').value;
    const fim = document.getElementById('reportEndDate').value;
    if (!inicio || !fim) { alert("Selecione o período."); return null; }

    let filtrosEvento = obterFiltrosRelatorio(tipo);

    const payload = { tipo, inicio, fim, filtros: filtrosEvento };
    return await API.gerarRelatorioTela(payload);
}

async function gerarRelatorioTela() {
    const tbody = document.getElementById('reportTableBody');
    const thead = document.getElementById('reportTableHead');
    
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Carregando...</td></tr>';
    
    const dados = await buscarDadosRelatorio();
    tbody.innerHTML = ''; thead.innerHTML = '';

    if (!dados || dados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Nenhum registro encontrado no período.</td></tr>';
        return;
    }

    const colunas = Object.keys(dados[0]);
    let headerHTML = '<tr style="background: rgba(255,255,255,0.1); text-align: left;">';
    colunas.forEach(col => { headerHTML += `<th style="padding: 10px; text-transform: capitalize;">${col}</th>`; });
    headerHTML += '</tr>';
    thead.innerHTML = headerHTML;

    dados.forEach(linha => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #333';
        colunas.forEach(col => { tr.innerHTML += `<td style="padding: 10px;">${linha[col]}</td>`; });
        tbody.appendChild(tr);
    });
}

// FUNÇÃO CSV (REIMPLEMENTADA VIA API)
async function baixarCSV() {
    const tipo = document.getElementById('reportType').value;
    const inicio = document.getElementById('reportStartDate').value;
    const fim = document.getElementById('reportEndDate').value;
    if (!inicio || !fim) return alert("Selecione o período.");

    let filtrosEvento = obterFiltrosRelatorio(tipo);

    const btns = document.querySelectorAll('button');
    let btn = null;
    btns.forEach(b => { if(b.textContent.includes('CSV')) btn = b; });
    let textoOriginal = "📥 Exportar CSV (Excel)";
    if(btn) { textoOriginal = btn.textContent; btn.textContent = "⏳ Gerando CSV..."; btn.disabled = true; }

    try {
        const payload = { tipo, inicio, fim, filtros: filtrosEvento };
        const resp = await API.baixarCSV(payload);

        if (resp.ok) {
            const blob = await resp.blob();
            const url = window.URL.createObjectURL(blob);
            const fIni = inicio.replace(/[:T]/g, '-'); 
            const nomeArquivo = `Relatorio_${tipo}_${fIni}.csv`;
            const a = document.createElement('a');
            a.href = url; a.download = nomeArquivo; document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
        } else {
            alert("Erro ao gerar CSV.");
        }
    } catch (e) {
        alert("Erro de conexão.");
    } finally {
        if(btn) { btn.textContent = textoOriginal; btn.disabled = false; }
    }
}

// FUNÇÃO PDF (REIMPLEMENTADA VIA API)
async function baixarPDF() {
    const tipo = document.getElementById('reportType').value;
    const inicio = document.getElementById('reportStartDate').value;
    const fim = document.getElementById('reportEndDate').value;
    if (!inicio || !fim) return alert("Selecione o período.");

    let filtrosEvento = obterFiltrosRelatorio(tipo);

    const btn = document.getElementById('btnExportarPDF');
    let txtOriginal = "📄 Exportar PDF";
    if (btn) { txtOriginal = btn.textContent; btn.textContent = "⏳ Gerando PDF..."; btn.disabled = true; }

    try {
        const payload = { tipo, inicio, fim, filtros: filtrosEvento };
        const resp = await API.baixarPDF(payload);

        if (resp.ok) {
            const blob = await resp.blob();
            const url = window.URL.createObjectURL(blob);
            const nomeArquivo = `Relatorio_${tipo}_${inicio.replace(/[:T]/g, '-')}.pdf`;
            const a = document.createElement('a');
            a.href = url; a.download = nomeArquivo; document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
        } else {
            const erro = await resp.json();
            alert("Erro ao gerar PDF: " + (erro.erro || "Desconhecido"));
        }
    } catch (e) {
        alert("Erro de conexão ao gerar PDF.");
    } finally {
        if (btn) { btn.textContent = txtOriginal; btn.disabled = false; }
    }
}




let currentHelioID = null;
timerModalHelio = null;

// 1. GERA O GRID 
async function gerarGridHeliostatos() {
    const grid = document.getElementById('heliostatosGrid');
    if (!grid) return;
    
    if (grid.children.length === 0) {
        grid.style.display = 'flex';
        grid.style.flexDirection = 'column';
        grid.style.alignItems = 'center'; 
        grid.style.gap = '4px'; 
    }

    let configurados = {};
    try {
        const res = await fetch('/api/heliostatos/status_geral');
        configurados = await res.json();
    } catch (e) {
        console.error("Erro status geral", e);
        return; 
    }

    grid.innerHTML = ''; 

    const layoutLinhas = [3, 5, 7, 10, 10, 7, 5, 3]; 
    let contadorPosicao = 1; // <--- Agora isso conta o buraco no chão (Posição 1 a 50)

    layoutLinhas.forEach(qtdNaLinha => {
        const rowDiv = document.createElement('div');
        rowDiv.style.display = 'flex';
        rowDiv.style.gap = '4px'; 
        rowDiv.style.justifyContent = 'center';

        for (let i = 0; i < qtdNaLinha; i++) {
            if (contadorPosicao > 50) break; 
            const posicaoAtual = contadorPosicao; 

            const cell = document.createElement('div');
            cell.className = 'heliostato-cell'; 
            cell.style.backgroundColor = ''; 

            // --- MAGICA: Procura qual heliostato está nesta POSIÇÃO ---
            let helioNumero = null;
            let dadosHelio = null;

            for (const [numeroStr, dados] of Object.entries(configurados)) {
                if (dados.posicao === posicaoAtual) {
                    helioNumero = parseInt(numeroStr);
                    dadosHelio = dados;
                    break;
                }
            }

            if (!dadosHelio) {
                // --- POSIÇÃO VAZIA ---
                cell.textContent = ""; 
                cell.classList.add('status-gray');
                cell.title = `Posição ${posicaoAtual} - Vazia`;
                cell.style.cursor = 'not-allowed';
            } else {
                // --- HELIOSTATO ENCONTRADO NESTA POSIÇÃO ---
                cell.textContent = helioNumero; // Mostra o NÚMERO real (Ex: 257)
                cell.style.cursor = 'pointer';
                cell.onclick = () => abrirModalHeliostato(helioNumero); // Clica usando o número real

                let isOnline = (String(dadosHelio.online).toLowerCase() === 'true' || dadosHelio.online == 1);
                if (dadosHelio.status_code === 1) isOnline = true;

                if (!isOnline) {
                    cell.classList.add('status-red');
                    cell.title = `Helio ${helioNumero} (Pos ${posicaoAtual}) - Offline`;
                } else if (dadosHelio.status_code === 1) {
                    cell.style.backgroundColor = '#00d084'; 
                    cell.style.color = '#000';
                    cell.style.border = 'none';
                    cell.title = `Helio ${helioNumero} (Pos ${posicaoAtual}) - MOVENDO...`;
                } else {
                    cell.classList.add('status-blue');
                    cell.title = `Helio ${helioNumero} (Pos ${posicaoAtual}) - Online`;
                }
            }
            rowDiv.appendChild(cell);
            contadorPosicao++;
        }
        grid.appendChild(rowDiv);
    });
}

// 2. ABRE MODAL 
async function abrirModalHeliostato(id) {
    currentHelioID = id;
    const modal = document.getElementById('modalHeliostato');
    
    // 1. Atualiza o Título
    document.getElementById('modalHelioTitle').textContent = id;
    
    // 2. === LIMPEZA IMEDIATA DA TELA (O Segredo anti-fantasma) ===
    const elStatus = document.getElementById('modalHelioStatus');
    const elModo = document.getElementById('modalHelioModo');
    const elBorder = document.getElementById('statusBorder');
    const btnMover = document.getElementById('btnMover');
    const inpAlpha = document.getElementById('inputAlpha');
    const inpBeta = document.getElementById('inputBeta');

    // Força visual de "Carregando"
    if (elStatus) {
        elStatus.textContent = "CARREGANDO...";
        elStatus.style.color = "#aaa"; // Cinza
    }
    if (elModo) elModo.textContent = "--";
    if (elBorder) elBorder.style.borderLeftColor = "#aaa";

    // Zera valores numéricos
    document.getElementById('valAlpha').textContent = "--";
    document.getElementById('valBeta').textContent = "--";
    //document.getElementById('valTheta').textContent = "--"; nao vai mais ter

    // Bloqueia e limpa inputs
    if (inpAlpha) { inpAlpha.value = ""; inpAlpha.disabled = true; }
    if (inpBeta) { inpBeta.value = ""; inpBeta.disabled = true; }

    // Bloqueia botão
    if (btnMover) {
        btnMover.textContent = "AGUARDE...";
        btnMover.disabled = true;
        btnMover.style.opacity = "0.5";
        btnMover.style.cursor = "wait";
    }
    // ==============================================================

    modal.style.display = 'flex'; 
    
    // 3. Chama a API para buscar o dado real
    await atualizarDadosModal();

    // 4. Inicia o loop de atualização 
    if (timerModalHelio) clearTimeout(timerModalHelio);
    const loopModalHelio = async () => {
        if (!currentHelioID) return; // Trava de segurança: para se o modal for fechado
        await atualizarDadosModal();
        timerModalHelio = setTimeout(loopModalHelio, 1000);
    };
    timerModalHelio = setTimeout(loopModalHelio, 1000);
}
// 3. ATUALIZA DADOS DO MODAL 
async function atualizarDadosModal() {
    if (!currentHelioID) return;

    try {
        const res = await fetch(`/api/heliostato/${currentHelioID}`);
        const dados = await res.json();

        const btnMover = document.getElementById('btnMover');
        const inpAlpha = document.getElementById('inputAlpha');
        const inpBeta = document.getElementById('inputBeta');
        const elStatus = document.getElementById('modalHelioStatus');
        const elModo = document.getElementById('modalHelioModo');
        const elBorder = document.getElementById('statusBorder');

        // --- SELETORES DE BOTÕES ---
        const btnSalvarVetor = document.querySelector("button[onclick*='salvar_vetor']");
        const btnRastrear = document.querySelector("button[onclick*='auto']");
        const btnRef = document.querySelector("button[onclick*='comandoRefHelio']");
        
        // NOVO: Seleciona todos os botões de JOG (A+, A-, B+, B-)
        const btnsJog = document.querySelectorAll("button[onclick*='jogHeliostato']");
        // ---------------------------

        let isOnline = (String(dados.online).toLowerCase() === 'true' || dados.online == 1);
        if (dados.status_code === 1) isOnline = true;

        if (isOnline) {
            // ... (manter lógica de alfa/beta/modo igual ao original) ...
            let vAlpha = "--";
            if (dados.alpha !== undefined && dados.alpha !== "--" && !isNaN(dados.alpha)) {
                vAlpha = parseFloat(dados.alpha).toFixed(3) + '°';
            }
            let vBeta = "--";
            if (dados.beta !== undefined && dados.beta !== "--" && !isNaN(dados.beta)) {
                vBeta = parseFloat(dados.beta).toFixed(3) + '°';
            }
            const elAlpha = document.getElementById('valAlpha');
            if (elAlpha) elAlpha.textContent = vAlpha;
            const elBeta = document.getElementById('valBeta');
            if (elBeta) elBeta.textContent = vBeta;
            if(elModo) elModo.textContent = (dados.modo || '--').toUpperCase();

            if (dados.status_code === 1) {
                // --- ESTADO: MOVENDO ---
                if(elStatus) { elStatus.textContent = "MOVENDO"; elStatus.style.color = '#00d084'; }
                if(elBorder) elBorder.style.borderLeftColor = '#00d084';
                if(btnMover) { btnMover.disabled = true; btnMover.textContent = "MOVENDO..."; btnMover.style.opacity = "0.6"; }
                if(inpAlpha) inpAlpha.disabled = true; if(inpBeta) inpBeta.disabled = true;
                
                // Bloqueia botões de ação
                if(btnSalvarVetor) btnSalvarVetor.disabled = true;
                if(btnRastrear) btnRastrear.disabled = true;
                if(btnRef) btnRef.disabled = true;
                
                // NOVO: Bloqueia todos os botões de JOG (A+, A-, B+, B-)
                btnsJog.forEach(btn => {
                    btn.disabled = true;
                    btn.style.opacity = "0.5";
                    btn.style.cursor = "not-allowed";
                });
                
            } else {
                // --- ESTADO: OCIOSO ---
                if(elStatus) { elStatus.textContent = (dados.status || 'ONLINE').toUpperCase(); elStatus.style.color = '#00a8ff'; }
                if(elBorder) elBorder.style.borderLeftColor = '#00a8ff';
                if(btnMover) { btnMover.disabled = false; btnMover.textContent = "MOVER PARA POSIÇÃO"; btnMover.style.opacity = "1"; }
                if(inpAlpha) inpAlpha.disabled = false; if(inpBeta) inpBeta.disabled = false;
                
                // Libera botões de ação
                if(btnSalvarVetor) btnSalvarVetor.disabled = false;
                if(btnRastrear) btnRastrear.disabled = false;
                if(btnRef) btnRef.disabled = false;

                // NOVO: Libera todos os botões de JOG
                btnsJog.forEach(btn => {
                    btn.disabled = false;
                    btn.style.opacity = "1";
                    btn.style.cursor = "pointer";
                });
            }
        } else {
            // --- ESTADO: OFFLINE ---
            // ... (lógica de offline padrão) ...
            if(btnMover) btnMover.disabled = true;
            if(btnSalvarVetor) btnSalvarVetor.disabled = true;
            if(btnRastrear) btnRastrear.disabled = true;
            if(btnRef) btnRef.disabled = true;
            
            // Bloqueia JOG no offline
            btnsJog.forEach(btn => {
                btn.disabled = true;
                btn.style.opacity = "0.4";
            });
        }
    } catch (e) {
        console.error("Erro no modal:", e);
    }
}

// ================= FIM BLOCO HELIOSTATOS =================

async function enviarComandoHelio(acao) {
    if (!currentHelioID) return;
    
    // --- NOVO: Intercepta o "Salvar Vetor" para usar a nossa nova rota da API ---
    if (acao === 'salvar_vetor') {
        showLoading("Salvando vetor de calibração...");
        try {
            const res = await fetch('/api/calibra_vetores', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                // Envia apenas o ID e o Usuário. O Python vai puxar Alfa e Beta do Cache!
                body: JSON.stringify({ heliostato_id: currentHelioID, usuario: currentUser }) 
            });
            
            const json = await res.json();
            if (json.ok) {
                alert("Vetor de calibração salvo com sucesso!");
            } else {
                alert("Erro: " + (json.erro || json.msg));
            }
        } catch(e) {
            alert("Erro de comunicação com o servidor.");
        } finally {
            hideLoading();
        }
        return; // Sai da função aqui para não rodar o código do Modbus abaixo
    }
    // -----------------------------------------------------------------------------

    let payload = {};
    
    if (acao === 'manual') {
        const alpha = document.getElementById('inputAlpha').value;
        const beta = document.getElementById('inputBeta').value;
        if (!alpha || !beta) return alert("Preencha Alpha e Beta");
        
        // Força a conversão para Float (Número) em vez de Texto
        payload = { tipo: 'manual', valores: { alpha: parseFloat(alpha), beta: parseFloat(beta) }, usuario: currentUser };
    } else if (acao === 'auto') {
        payload = { tipo: 'modo', valores: { modo: 1 }, usuario: currentUser };
    } else if (acao === 'stop') {
        payload = { tipo: 'modo', valores: { modo: 0 }, usuario: currentUser };
    }
    
    showLoading("Enviando comando ao heliostato...");
    
    try {
        const res = await fetch(`/api/heliostato/${currentHelioID}/comando`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) {
            alert("Erro HTTP " + res.status + " no Servidor Python.");
            return;
        }

        const json = await res.json();
        if (json.ok) {
            alert("Comando Aceite!");
            atualizarDadosModal(); 
        } else {
            alert("Erro: " + (json.msg || json.erro || "Falha desconhecida no Modbus"));
        }
    } catch (e) {
        alert("Erro de comunicação com o servidor.");
    } finally {
        hideLoading();
    }
}

// ================= FUNÇÕES DO JOG WEB E ZERAMENTO =================

function jogHeliostato(eixo, direcao) {
    if (!currentHelioID) return alert("Nenhum Heliostato selecionado!");

    // Descobre qual o passo selecionado
    const stepRadios = document.getElementsByName('jogStep');
    let stepVal = 0.1;
    for (let r of stepRadios) {
        if (r.checked) { stepVal = parseFloat(r.value); break; }
    }

    const inputAlfa = document.getElementById('inputAlpha');
    const inputBeta = document.getElementById('inputBeta');

    let alfaAtual = parseFloat(inputAlfa.value);
    if (isNaN(alfaAtual)) alfaAtual = parseFloat(document.getElementById('valAlpha').textContent) || 0;

    let betaAtual = parseFloat(inputBeta.value);
    if (isNaN(betaAtual)) betaAtual = parseFloat(document.getElementById('valBeta').textContent) || 0;

    if (eixo === 'A') {
        alfaAtual += (stepVal * direcao);
        inputAlfa.value = alfaAtual.toFixed(3);
        if (inputBeta.value === "") inputBeta.value = betaAtual.toFixed(3);
    } else if (eixo === 'B') {
        betaAtual += (stepVal * direcao);
        inputBeta.value = betaAtual.toFixed(3);
        if (inputAlfa.value === "") inputAlfa.value = alfaAtual.toFixed(3);
    }

    // Dispara o comando manual com as novas coordenadas incrementadas
    enviarComandoHelio('manual');
}

async function comandoRefHelio() {
    if (!currentHelioID) return;
    if (currentProfile === 'Visualizador') return alert("Acesso Negado.");
    
    if (confirm("⚠️ ATENÇÃO: Deseja definir a posição física atual dos motores como ZERO (0°)? Isso irá reescrever a referência interna do encoder.")) {
        
        const payload = { tipo: 'set_zero', valores: {}, usuario: currentUser };
        showLoading("A zerar posição dos motores...");
        
        try {
            const res = await fetch(`/api/heliostato/${currentHelioID}/comando`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            const json = await res.json();
            if (json.ok) {
                alert("Posição Zerada com sucesso!");
                atualizarDadosModal(); 
            } else {
                alert("Erro: " + (json.msg || "Falha ao zerar"));
            }
        } catch (e) {
            alert("Erro de comunicação com o servidor.");
        } finally {
            hideLoading();
        }
    }
}
// =================  (BOTOES DE COMANDO 1 E 2 - MOVER HELIOSTATOS) =================
async function enviarComandoLote(acao) {
    // Trava de segurança
    if (currentProfile === 'Visualizador') {
        return alert("Acesso Negado: Apenas visualização.");
    }

    let mensagemConfirmacao = "";
    if (acao === 'HORIZ') mensagemConfirmacao = "Tem certeza que deseja mover TODOS os heliostatos para a posição HORIZONTAL?";
    if (acao === 'LIMPEZA') mensagemConfirmacao = "Tem certeza que deseja mover TODOS os heliostatos para a posição de LIMPEZA?";

    if (!confirm(mensagemConfirmacao)) return;

    // --- MOSTRA O LOADING ---
    showLoading("Movendo todos os heliostatos...");

    try {
        const res = await API.enviarComandoLote(acao, currentUserLogin);
        
        if (res.ok) {
            let resumo = "Resultado dos Comandos:\n\n";
            res.detalhes.forEach(d => {
                resumo += `Helio ${d.numero}: ${d.mensagem}\n`;
            });
            alert(resumo);
        } else {
            alert("Erro ao enviar comando: " + (res.erro || "Desconhecido"));
        }
    } catch (e) {
        alert("Erro de comunicação ao tentar enviar o comando em lote.");
        console.error(e);
    } finally {
        // --- ESCONDE O LOADING SEMPRE ---
        hideLoading();
    }
}

// =================  (GERENCIAMENTO DE HELIOSTATOS - CADASTROS) =================
let listaBasesCache = [];

async function carregarListaBases() {
    const tbody = document.getElementById('tabelaHeliostatosBody');
    if (!tbody) return;
    
    try {
        const res = await fetch('/api/bases?t=' + new Date().getTime());
        listaBasesCache = await res.json();
        
        tbody.innerHTML = '';
        
        if (listaBasesCache.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px; color: #aaa;">Nenhum heliostato cadastrado.</td></tr>';
            return;
        }
        
        // Pinta a tabela linha a linha
        listaBasesCache.forEach(base => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #333';
            
            // --- Controle de Permissão Visual da Tabela ---
            let botoesAcao = '';
            if (currentProfile === 'Administrador') {
                botoesAcao = `
                    <button class="btn-secondary" style="padding: 4px 10px; font-size: 0.8em;" title="Editar" onclick="abrirModalEditarHeliostato(${base.numero})">✏️</button>
                    <button class="btn-danger" style="padding: 4px 10px; font-size: 0.8em; margin-left: 5px;" title="Excluir" onclick="apagarBase(${base.numero})">🗑️</button>
                `;
            } else {
                botoesAcao = `<span style="color: #666; font-size: 0.85em; font-style: italic;">Somente Leitura</span>`;
            }
            // ----------------------------------------------

            tr.innerHTML = `
                <td style="padding: 12px; font-weight: bold; color: var(--color-primary);">${base.numero}</td>
                <td style="padding: 12px;">${base.ip || '--'}</td>
                <td style="padding: 12px;">${base.porta || 502}</td>
                <td style="padding: 12px;">${base.posicao || '--'}</td>
                <td style="padding: 12px;">${base.theta !== null ? base.theta : '--'}</td>
                <td style="padding: 12px;">${base.phi !== null ? base.phi : '--'}</td>
                <td style="padding: 12px;">${base.taxa_atualizacao || '--'}</td>
                <td style="padding: 12px; text-align: center;">
                    ${botoesAcao}
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error("Erro ao carregar bases:", e);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px; color: #ff4444;">Erro ao carregar a lista.</td></tr>';
    }
}

async function apagarBase(numero) {
    if (!numero) return;
    
    // Trava de Segurança
    if (currentProfile !== 'Administrador') {
        return alert("Acesso Negado: Apenas Administradores podem excluir heliostatos.");
    }
    
    if (confirm(`Tem certeza que deseja excluir permanentemente o heliostato número ${numero}?`)) {
        const res = await API.deletarBase(numero, currentUserLogin);
        
        if (res.ok) { 
            alert("Heliostato excluído com sucesso."); 
            carregarListaBases(); 
            // Atualiza os pontinhos do Dashboard instantaneamente
            if (typeof gerarGridHeliostatos === 'function') {
                gerarGridHeliostatos(); 
            }
        } else {
            alert("Erro ao excluir: " + (res.erro || "Desconhecido"));
        }
    }
}

// ================= MODAL NOVO / EDITAR HELIOSTATO =================

function fecharModalCadastroHeliostato() {
    document.getElementById('modalCadastroHeliostato').style.display = 'none';
}

function abrirModalNovoHeliostato() {
    if (currentProfile !== 'Administrador') return alert("Acesso Negado: Apenas Administradores.");
    
    document.getElementById('modalCadastroTitulo').textContent = "Novo Heliostato";
    
    // Limpa os campos e libera o Número
    document.getElementById('cadNumero').value = "";
    document.getElementById('cadNumero').disabled = false; // Libera digitação
    document.getElementById('cadTaxa').value = "5";
    document.getElementById('cadIP').value = "";
    document.getElementById('cadPorta').value = "502";
    document.getElementById('cadTheta').value = "0.0";
    document.getElementById('cadPhi').value = "0.0";
    document.getElementById('cadPosicao').value = "";
    document.getElementById('displayPosicao').textContent = "Nenhuma";
    document.getElementById('displayPosicao').style.color = "#aaa";
    
    // Renderiza grid liberando todas as posições (exceto as já cadastradas no BD)
    gerarGridSelecaoPosicao(null);
    document.getElementById('modalCadastroHeliostato').style.display = 'flex';
}

function abrirModalEditarHeliostato(numero) {
    if (currentProfile !== 'Administrador') return alert("Acesso Negado: Apenas Administradores.");
    
    const base = listaBasesCache.find(b => b.numero === numero);
    if (!base) return alert("Erro: Heliostato não encontrado no cache.");
    
    document.getElementById('modalCadastroTitulo').textContent = `Editar Heliostato ${numero}`;
    
    // Preenche campos e TRAVA o Número (Chave Primária não muda)
    document.getElementById('cadNumero').value = base.numero;
    document.getElementById('cadNumero').disabled = true; 
    document.getElementById('cadTaxa').value = base.taxa_atualizacao || 5;
    document.getElementById('cadIP').value = base.ip || "";
    document.getElementById('cadPorta').value = base.porta || 502;
    document.getElementById('cadTheta').value = base.theta !== null ? base.theta : 0.0;
    document.getElementById('cadPhi').value = base.phi !== null ? base.phi : 0.0;
    
    const pos = base.posicao || "";
    document.getElementById('cadPosicao').value = pos;
    document.getElementById('displayPosicao').textContent = pos || "Nenhuma";
    document.getElementById('displayPosicao').style.color = pos ? "var(--color-primary)" : "#aaa";
    
    // Renderiza grid liberando as livres + a posição pertencente a ESTE próprio heliostato
    gerarGridSelecaoPosicao(pos);
    document.getElementById('modalCadastroHeliostato').style.display = 'flex';
}

// ================= MAPA DE SELEÇÃO VISUAL =================

function gerarGridSelecaoPosicao(posicaoDoHelioAtual) {
    const grid = document.getElementById('gridSelecaoPosicao');
    grid.innerHTML = '';
    
    const layoutLinhas = [3, 5, 7, 10, 10, 7, 5, 3];
    let contadorPosicao = 1;
    
    // Descobre quais buracos já têm dono (ignora a posição do dono atual se estiver editando)
    let posicoesOcupadas = listaBasesCache
        .map(b => b.posicao)
        .filter(p => p !== null && p !== posicaoDoHelioAtual);

    const posSelecionadaNoForm = parseInt(document.getElementById('cadPosicao').value) || null;

    layoutLinhas.forEach(qtdNaLinha => {
        const rowDiv = document.createElement('div');
        rowDiv.style.display = 'flex';
        rowDiv.style.gap = '4px';
        rowDiv.style.justifyContent = 'center';

        for (let i = 0; i < qtdNaLinha; i++) {
            if (contadorPosicao > 50) break;
            const pos = contadorPosicao;
            
            const cell = document.createElement('div');
            // Reutiliza a classe do dashboard para manter mesmo tamanho e visual
            cell.className = 'heliostato-cell'; 
            cell.style.display = 'flex';
            cell.style.alignItems = 'center';
            cell.style.justifyContent = 'center';
            cell.style.fontSize = '12px';
            
            if (posicoesOcupadas.includes(pos)) {
                // BURADO OCUPADO: Fica cinza escuro e bloqueado
                cell.classList.add('status-gray');
                cell.style.cursor = 'not-allowed';
                cell.style.opacity = '0.3';
                cell.title = `Posição ${pos} - Já Ocupada`;
                cell.textContent = "x";
            } else {
                // BURACO LIVRE (ou pertencente ao Helio sendo editado)
                cell.style.cursor = 'pointer';
                cell.textContent = pos;
                
                if (pos === posSelecionadaNoForm) {
                    // Selecionada agora na tela
                    cell.style.backgroundColor = 'var(--color-primary)';
                    cell.style.color = '#000';
                    cell.style.fontWeight = 'bold';
                    cell.title = `Posição ${pos} (Selecionada)`;
                } else {
                    // Totalmente Livre
                    cell.style.backgroundColor = 'rgba(255,255,255,0.05)';
                    cell.style.border = '1px dashed #555';
                    cell.style.color = '#aaa';
                    cell.title = `Clique para selecionar Posição ${pos}`;
                }
                
                cell.onclick = () => selecionarPosicao(pos, posicaoDoHelioAtual);
            }
            
            rowDiv.appendChild(cell);
            contadorPosicao++;
        }
        grid.appendChild(rowDiv);
    });
}

function selecionarPosicao(pos, posicaoDoHelioAtual) {
    document.getElementById('cadPosicao').value = pos;
    document.getElementById('displayPosicao').textContent = pos;
    document.getElementById('displayPosicao').style.color = "var(--color-primary)";
    // Renderiza de novo só para pintar a cor da nova seleção
    gerarGridSelecaoPosicao(posicaoDoHelioAtual); 
}

// ================= SALVAR (POST / PUT) =================

async function salvarHeliostato() {
    if (currentProfile !== 'Administrador') return alert("Acesso Negado.");
    
    const numInput = document.getElementById('cadNumero');
    const numeroStr = numInput.value.trim();
    
    if (!numeroStr) return alert("⚠️ Erro: Falta o campo 'Número'. Ele não pode ficar vazio.");
    const numero = parseInt(numeroStr);
    
    if (isNaN(numero) || numero < 0 || numero > 999) return alert("⚠️ Erro: O 'Número' deve ser entre 0 e 999.");
    
    const ip = document.getElementById('cadIP').value.trim();
    if (!ip) return alert("⚠️ Erro: Falta o campo 'Endereço IP'.");

    const portaStr = document.getElementById('cadPorta').value.trim();
    if (!portaStr) return alert("⚠️ Erro: Falta o campo 'Porta Modbus'.");

    const taxaStr = document.getElementById('cadTaxa').value.trim();
    if (!taxaStr) return alert("⚠️ Erro: Falta o campo 'Taxa de Atualização'.");

    const thetaStr = document.getElementById('cadTheta').value.trim();
    if (!thetaStr) return alert("⚠️ Erro: Falta o campo 'Theta (θ)'.");

    const phiStr = document.getElementById('cadPhi').value.trim();
    if (!phiStr) return alert("⚠️ Erro: Falta o campo 'Phi (φ)'.");

    const posicaoStr = document.getElementById('cadPosicao').value.trim();
    if (!posicaoStr) return alert("⚠️ Erro: Falta selecionar uma 'Posição' no mapa visual.");

    const payload = {
        numero: numero,
        usuario_solicitante: currentUserLogin,
        ip: ip,
        porta: parseInt(portaStr),
        posicao: parseInt(posicaoStr),
        theta: parseFloat(thetaStr),
        phi: parseFloat(phiStr),
        taxa_atualizacao: parseInt(taxaStr)
    };
    
    const isEdit = numInput.disabled; 
    
    if (!isEdit && listaBasesCache.some(b => String(b.numero) === String(numero))) {
        return alert(`⚠️ Erro: Já existe um heliostato cadastrado com o número ${numero}!`);
    }
    
    // --- MOSTRA O LOADING ---
    showLoading("Salvando heliostato no banco de dados...");

    try {
        const url = isEdit ? `/api/bases/${numero}` : `/api/bases`;
        const method = isEdit ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const res = await response.json();
        
        if (res.ok) {
            fecharModalCadastroHeliostato();
            await carregarListaBases(); 
            if (typeof gerarGridHeliostatos === 'function') {
                gerarGridHeliostatos(); 
            }
        } else {
            alert("❌ Erro ao salvar: " + (res.erro || "Falha desconhecida."));
        }
    } catch (e) {
        console.error("Erro requisição:", e);
        alert("❌ Erro de conexão com o servidor ao tentar salvar.");
    } finally {
        // --- ESCONDE O LOADING SEMPRE ---
        hideLoading();
    }
}


// ================= HISTÓRICO ALARMES =================
async function abrirHistoricoAlarmes() {
    const modal = document.getElementById('modalAlarmHistory');
    const tbody = document.getElementById('alarmHistoryTableBody');
    if (!modal || !tbody) return;
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 20px;">Carregando...</td></tr>';
    modal.style.display = 'flex';
    try {
        const lista = await API.getAlarmesRecentes();
        tbody.innerHTML = ''; 
        if (lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 20px; color: #666;">Nenhum alarme registrado ainda.</td></tr>';
        } else {
            lista.forEach(alarme => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #333';
                tr.innerHTML = `<td style="padding: 10px; color: #aaa;">${alarme.data}</td><td style="padding: 10px; font-weight: bold; color: #fff;">${alarme.categoria}</td><td style="padding: 10px; color: #ff6b6b;">${alarme.mensagem}</td>`;
                tbody.appendChild(tr);
            });
        }
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 20px; color: red;">Erro ao carregar histórico.</td></tr>';
    }
}

// ================= GRÁFICOS SENSORES =================
let myChart = null; 
async function abrirGraficoSensor(idSensor) {
    const modal = document.getElementById('modalSensorChart');
    const ctx = document.getElementById('sensorChartCanvas');
    const titulo = document.getElementById('chartTitle');
    if (!modal || !ctx) return;

    titulo.textContent = `Histórico - Sensor ${idSensor} (Última Hora)`;
    modal.style.display = 'flex';

    if (myChart) { myChart.destroy(); myChart = null; }

    try {
        const resp = await fetch(`/api/termostatos/historico/${idSensor}`);
        const dados = await resp.json();
        const labels = dados.map(d => d.hora);
        const valores = dados.map(d => d.valor);

        myChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Temperatura (°C)', data: valores,
                    borderColor: '#00d084', backgroundColor: 'rgba(0, 208, 132, 0.05)',
                    borderWidth: 3, tension: 0.4, pointRadius: 0,
                    pointHoverRadius: 8, pointHoverBackgroundColor: '#ffffff',
                    pointHoverBorderColor: '#00d084', pointHoverBorderWidth: 3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { labels: { color: '#fff', font: { size: 14 } } }, tooltip: { backgroundColor: '#1e1e1e', titleColor: '#00d084', bodyColor: '#fff', borderColor: '#333', borderWidth: 1, displayColors: false } },
                scales: { y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#aaa' }, beginAtZero: false }, x: { grid: { display: false }, ticks: { color: '#aaa', maxTicksLimit: 8 } } }
            }
        });
    } catch (e) { titulo.textContent = `Erro ao carregar dados do Sensor ${idSensor}`; }
}

// ================= USUÁRIOS =================
function abrirModalUsuario() {
    document.getElementById('editUserId').value = '';
    document.getElementById('inputUserNome').value = '';
    document.getElementById('inputUserLogin').value = '';
    document.getElementById('inputUserEmail').value = '';
    document.getElementById('inputUserPass').value = '';
    document.getElementById('inputUserProfile').value = 'Operador';
    document.getElementById('modalUserTitle').textContent = 'Novo Usuário';
    document.getElementById('modalUserConfig').style.display = 'flex';
}
function editarUsuario(id, nome, usuario, email, perfil) {
    document.getElementById('editUserId').value = id;
    document.getElementById('inputUserNome').value = nome;
    document.getElementById('inputUserLogin').value = usuario;
    document.getElementById('inputUserEmail').value = email === 'None' ? '' : email;
    document.getElementById('inputUserProfile').value = perfil;
    document.getElementById('inputUserPass').value = '';
    document.getElementById('modalUserTitle').textContent = 'Editar Usuário';
    document.getElementById('modalUserConfig').style.display = 'flex';
}
function fecharModalUsuario() { document.getElementById('modalUserConfig').style.display = 'none'; }

async function salvarUsuario() {
    const id = document.getElementById('editUserId').value;
    const payload = {
        admin_user: currentUser,
        nome: document.getElementById('inputUserNome').value,
        usuario: document.getElementById('inputUserLogin').value,
        email: document.getElementById('inputUserEmail').value,
        perfil: document.getElementById('inputUserProfile').value,
        senha: document.getElementById('inputUserPass').value
    };
    if (!payload.nome || !payload.usuario) return alert("Nome e Usuário são obrigatórios.");
    if (!id && !payload.senha) return alert("Senha é obrigatória para novos usuários.");

    let res;
    if (id) res = await API.editarUsuario(id, payload);
    else res = await API.criarUsuario(payload);

    if (res.ok) { alert("Usuário salvo!"); fecharModalUsuario(); await atualizarTabelaUsuarios(); }
    else alert("Erro ao salvar: " + res.erro);
}

async function apagarUsuario(id, nomeUsuario) {
    if (confirm(`Tem certeza que deseja apagar o usuário ${nomeUsuario}?`)) {
        const res = await API.deletarUsuario(id, currentUser);
        if (res.ok) { alert("Usuário removido."); await atualizarTabelaUsuarios(); }
        else alert("Erro ao remover: " + res.erro);
    }
}

async function atualizarTabelaUsuarios() {
    const tbody = document.getElementById('tabelaUsuariosBody');
    if (!tbody) return;
    const usuarios = await API.getUsuarios();
    tbody.innerHTML = '';
    usuarios.forEach(u => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #333';
        let badgeColor = '#444'; 
        if (u.perfil === 'Administrador') badgeColor = '#00d084'; 
        else if (u.perfil === 'Visualizador') badgeColor = '#00a8ff';
        tr.innerHTML = `<td style="padding: 12px;">${u.id}</td><td style="padding: 12px; font-weight: bold;">${u.nome}</td><td style="padding: 12px; color: #aaa;">${u.usuario}</td><td style="padding: 12px;"><span style="background: ${badgeColor}; color: ${badgeColor === '#444' ? '#fff' : '#000'}; padding: 2px 8px; border-radius: 4px; font-size: 0.8em; font-weight: bold;">${u.perfil}</span></td><td style="padding: 12px; text-align: center;"><button class="btn-secondary" style="padding: 4px 10px; font-size: 0.8em;" onclick="editarUsuario('${u.id}', '${u.nome}', '${u.usuario}', '${u.email || ''}', '${u.perfil}')">✏️</button><button class="btn-danger" style="padding: 4px 10px; font-size: 0.8em; margin-left: 5px;" onclick="apagarUsuario('${u.id}', '${u.usuario}')">🗑️</button></td>`;
        tbody.appendChild(tr);
    });
}

// Cache global para os dados do replay
let replayFrames = [];

async function carregarDadosReplay() {
    const periodo = document.getElementById('replayPeriodo').value;
    const timeDisplay = document.getElementById('replayTimeDisplay');
    const slider = document.getElementById('timeSlider');
    const container = document.getElementById('replayHeatmap');

    if (timeDisplay) timeDisplay.textContent = "Carregando dados...";
    if (slider) slider.disabled = true;

    // 1. Gera o Grid 18x5 (se estiver vazio)
    if (container && container.children.length === 0) {
        for (let i = 0; i < 90; i++) {
            const cell = document.createElement('div');
            cell.className = 'replay-cell';
            cell.title = `Sensor ${i+1}`;
            container.appendChild(cell);
        }
    }

    try {
        // 2. Busca dados com o filtro selecionado
        const resp = await fetch(`/api/termostatos/replay?periodo=${periodo}`);
        replayFrames = await resp.json();

        if (replayFrames.length > 0) {
            // Configura o slider para o tamanho dos dados
            slider.max = replayFrames.length - 1;
            slider.value = replayFrames.length - 1; // Vai para o final (mais recente)
            slider.disabled = false;
            
            // Renderiza o último frame
            atualizarFrameReplay(replayFrames.length - 1);
        } else {
            timeDisplay.textContent = "Nenhum dado neste período.";
            // Limpa o grid (deixa cinza)
            Array.from(container.children).forEach(c => c.style.backgroundColor = '#333');
        }

    } catch (e) {
        console.error("Erro replay:", e);
        timeDisplay.textContent = "Erro ao carregar.";
    }
}

function atualizarFrameReplay(index) {
    if (!replayFrames || !replayFrames[index]) return;

    const frame = replayFrames[index];
    
    // Atualiza texto da data
    const timeDisplay = document.getElementById('replayTimeDisplay');
    if (timeDisplay) timeDisplay.textContent = frame.hora;

    // Pinta o grid e escreve os textos
    const container = document.getElementById('replayHeatmap');
    if (!container) return;
    
    const cells = container.children;
    for (let i = 0; i < 90; i++) {
        if (cells[i]) {
            const temp = frame.valores[i];
            
            // Define a cor de fundo
            cells[i].style.backgroundColor = getColorForTemperature(temp);
            
            // Tooltip completo (mouse over)
            cells[i].title = `Sensor ${i+1}: ${temp}°C`;

            // MUDANÇA: Escreve o número e a temperatura dentro da célula
            // Usamos Math.round para não ocupar espaço com decimais
            cells[i].innerHTML = `
                <span style="font-size: 9px; opacity: 0.8;">#${i+1}</span>
                <span>${Math.round(temp)}°</span>
            `;
        }
    }
}

// ================= EASTER EGGS (SECRET EDITOR E MATRIZ DE AÇÕES) =================

let eggClicks = 0;
let eggTimer = null;

function triggerEasterEgg() {
    eggClicks++;
    
    // Limpa o timer para o utilizador poder continuar a clicar
    if (eggTimer) clearTimeout(eggTimer);

    // Inicia uma contagem decrescente curta. Se o utilizador parar de clicar por 400ms, avaliamos o resultado.
    eggTimer = setTimeout(() => {
        if (eggClicks === 3) {
            // 3 Cliques: Easter Egg Antigo (Editor Raw)
            abrirEditorSecreto();
        } else if (eggClicks >= 5) {
            // 5+ Cliques: Novo Easter Egg (Matriz de Ações)
            abrirMatrizAcoes();
        }
        
        // Zera os cliques após a execução
        eggClicks = 0;
    }, 400); 
}

async function abrirEditorSecreto() {
    // 1. Busca o conteúdo bruto
    const resp = await fetch('/api/admin/config/raw');
    const dados = await resp.json();

    if (dados.ok) {
        document.getElementById('secretConfigContent').value = dados.conteudo;
        document.getElementById('modalSecretEditor').style.display = 'flex';
    } else {
        alert("Acesso negado: " + dados.erro);
    }
}

async function salvarConfigSecreta() {
    if(!confirm("⚠️ CUIDADO EXTREMO ⚠️\n\nQualquer erro de digitação aqui pode PARAR o sistema.\nTem certeza que quer salvar?")) return;

    const conteudo = document.getElementById('secretConfigContent').value;
    
    const resp = await fetch('/api/admin/config/raw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: currentUser, conteudo: conteudo })
    });

    const dados = await resp.json();
    if(dados.ok) {
        alert("Arquivo reescrito com sucesso. O sistema recarregará as configurações.");
        document.getElementById('modalSecretEditor').style.display = 'none';
        carregarConfiguracoes(); // Recarrega na hora para aplicar
    } else {
        alert("Erro ao gravar: " + dados.erro);
    }
}

// --- FUNÇÕES DA MATRIZ DE AÇÕES E SEGURANÇA ---

function abrirMatrizAcoes() {
    if (currentProfile !== 'Administrador') {
        return alert("Acesso restrito. Apenas desenvolvedores/administradores podem acessar a Matriz de Segurança.");
    }
    document.getElementById('modalMatrizAcoes').style.display = 'flex';
    carregarMatrizAcoesInterface(); 
}

function fecharMatrizAcoes() {
    document.getElementById('modalMatrizAcoes').style.display = 'none';
}

function abrirFormNovaAcao() {
    document.getElementById('acaoGatilho').value = "Vel. Vento Alto";
    document.getElementById('acaoComando').value = "STOW";
    document.getElementById('modalFormAcao').style.display = 'flex';
}

function fecharFormAcao() {
    document.getElementById('modalFormAcao').style.display = 'none';
}

async function carregarMatrizAcoesInterface() {
    const tbody = document.getElementById('tabelaMatrizAcoes');
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 25px; color: #aaa;">Carregando regras...</td></tr>';
    
    try {
        const resp = await fetch('/api/admin/actions');
        const regras = await resp.json();
        
        tbody.innerHTML = '';
        if (regras.length === 0 || regras.erro) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 25px; color: #aaa; font-style: italic;">Nenhuma regra configurada. A planta está operando sem autonomia de segurança.</td></tr>';
            return;
        }
        
        regras.forEach((regra, index) => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #444';
            tr.innerHTML = `
                <td style="padding: 12px; font-weight: bold; color: #ff6b6b;">${regra.gatilho}</td>
                <td style="padding: 12px; color: var(--color-primary);">${regra.comando}</td>
                <td style="padding: 12px; text-align: center;">
                    <button class="btn-danger" style="padding: 4px 10px; font-size: 0.8em;" onclick="apagarAcaoInterface(${index})">🗑️ Excluir</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 25px; color: #ff4444;">Erro de conexão ao carregar as regras.</td></tr>';
    }
}

async function salvarAcaoInterface() {
    const gatilho = document.getElementById('acaoGatilho').value;
    const comando = document.getElementById('acaoComando').value;
    
    showLoading("Salvando regra de segurança...");
    try {
        const resp = await fetch('/api/admin/actions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gatilho, comando })
        });
        const result = await resp.json();
        
        if (result.ok) {
            fecharFormAcao();
            carregarMatrizAcoesInterface(); // Recarrega a tabela instantaneamente
        } else {
            alert("Erro ao salvar: " + (result.erro || "Desconhecido"));
        }
    } catch (e) {
        alert("Erro de comunicação com o servidor.");
    } finally {
        hideLoading();
    }
}

async function apagarAcaoInterface(index) {
    if (!confirm("Tem certeza que deseja remover esta regra de segurança? O sistema deixará de atuar automaticamente neste caso.")) return;
    
    showLoading("Removendo regra...");
    try {
        const resp = await fetch(`/api/admin/actions/${index}`, { method: 'DELETE' });
        const result = await resp.json();
        
        if (result.ok) {
            carregarMatrizAcoesInterface(); // Recarrega a tabela instantaneamente
        } else {
            alert("Erro ao remover: " + (result.erro || "Desconhecido"));
        }
    } catch (e) {
        alert("Erro de comunicação com o servidor.");
    } finally {
        hideLoading();
    }
}

// ================= VENTILADOR (MICROTURBINA) =================

// Variáveis de controle
let ventiladorEmRemoto = false;
let ventiladorUpdateTimer = null;

// Inicializa os eventos da tela
function initVentiladorEvents() {
    // Slider de Velocidade
    const slider = document.getElementById('vt_slider_velocidade');
    const display = document.getElementById('vt_slider_val');
    
    if (slider && display) {
        // Atualiza o número enquanto arrasta
        slider.oninput = function() {
            display.textContent = this.value + ' %';
        };
        // Envia o comando só quando solta o mouse (para não travar o Modbus)
        slider.onchange = function() {
            enviarComandoVentilador('velocidade', this.value);
        };
    }

    // Botão Ligar/Desligar
    const btnPower = document.getElementById('vt_btn_power');
    if (btnPower) {
        btnPower.onclick = function() {
            const estadoAtual = btnPower.getAttribute('data-state') === 'on';
            const novoEstado = estadoAtual ? 0 : 1; // Se tá on, manda 0. Se tá off, manda 1.
            enviarComandoVentilador('power', novoEstado);
        };
    }

    // Radios Local/Remoto
    const radios = document.getElementsByName('vt_controle');
    radios.forEach(r => {
        r.addEventListener('change', (e) => {
            verificarModoControle();
        });
    });
    
    // Verifica estado inicial
    verificarModoControle();
    
// Inicia loop de atualização (a cada 2s) 
    if(ventiladorUpdateTimer) clearTimeout(ventiladorUpdateTimer);
    const loopVentilador = async () => {
        await atualizarDadosVentilador();
        ventiladorUpdateTimer = setTimeout(loopVentilador, 2000);
    };
    loopVentilador(); // Dispara o ciclo
}

function verificarModoControle() {
    const radioRemoto = document.querySelector('input[name="vt_controle"][value="remoto"]');
    ventiladorEmRemoto = radioRemoto ? radioRemoto.checked : false;

    const slider = document.getElementById('vt_slider_velocidade');
    const btn = document.getElementById('vt_btn_power');

    // Se estiver em LOCAL, desabilita os controles na tela
    if (slider) slider.disabled = !ventiladorEmRemoto;
    if (btn) btn.disabled = !ventiladorEmRemoto;
    
    const statusDiv = document.getElementById('vt_status_text');
    if(!ventiladorEmRemoto && statusDiv) {
        statusDiv.textContent = "CONTROLE LOCAL (Bloqueado via Web)";
        statusDiv.style.color = "#ffa500";
    }
}

async function atualizarDadosVentilador() {
    const telaMicro = document.getElementById('microturbine');
    // REMOVIDO: !telaMicro.classList.contains('active') 
    // Motivo: Para garantir que atualize mesmo se a classe 'active' falhar na navegação.
    if (!telaMicro) return;

    try {
        const resp = await fetch('/api/ventilador');
        const dados = await resp.json();

        // Debug: Veja no Console (F12) se os dados estão chegando
        // console.log("Dados Ventilador:", dados);

        // --- MAPEAMENTO DOS ELEMENTOS (IDs DO SEU ARQUIVO) ---
        const elStatusGeral = document.getElementById('vt_status_geral');
        const elFalhas = document.getElementById('vt_falhas');
        const elVelocidade = document.getElementById('vt_velocidade_read');
        const elCorrente = document.getElementById('vt_corrente');
        const elModo = document.getElementById('vt_modo_texto');
        
        // Estado do Motor (Led e Texto)
        const elLedRun = document.getElementById('vt_led_run');
        const elLedText = document.getElementById('vt_led_text');

        // Controles
        const btn = document.getElementById('vt_btn_power');
        const slider = document.getElementById('vt_slider_velocidade');
        const display = document.getElementById('vt_slider_val');
        
        // Verifica se está em modo remoto (radio button)
        const radioRemoto = document.querySelector('input[name="vt_controle"][value="remoto"]');
        const isRemoto = radioRemoto ? radioRemoto.checked : false;

        if (dados.online) {
            // 1. Status Geral
            if (elStatusGeral) {
                elStatusGeral.textContent = "ONLINE";
                elStatusGeral.style.color = "#00d084"; // Verde
            }

            // 2. Falhas (Lógica simples: se online, Normal)
            if (elFalhas) {
                elFalhas.textContent = "NORMAL";
                elFalhas.style.color = "#00d084";
            }

            // 3. Velocidade (Hz do Inversor -> RPM Estimado)
            // Ex: 60Hz * 30 = 1800 RPM (Motor 4 Polos)
            if (elVelocidade) {
                const rpm = (dados.frequencia_real * 30).toFixed(0);
                elVelocidade.textContent = rpm + " RPM";
            }

            // 4. Corrente
            if (elCorrente) {
                elCorrente.textContent = dados.corrente.toFixed(1) + " A";
            }

            // 5. Modo de Operação
            if (elModo) {
                elModo.textContent = isRemoto ? "REMOTO" : "LOCAL";
                elModo.style.color = isRemoto ? "#fff" : "#ffcc00";
            }

            // 6. Estado do Motor (Lógica Principal)
            if (dados.status_operacao) {
                // --- MOTOR RODANDO ---
                if(elLedRun) elLedRun.className = 'clp-status-dot online'; // Verde
                if(elLedText) {
                    elLedText.textContent = "EM OPERAÇÃO";
                    elLedText.style.color = "#00d084";
                }
                
                // Botão vira "DESLIGA"
                if(btn) {
                    btn.textContent = "DESLIGA";
                    btn.style.background = "var(--color-error)"; // Vermelho
                    btn.setAttribute('data-state', 'on');
                    btn.style.boxShadow = "0 0 15px rgba(255, 68, 68, 0.4)";
                }

            } else {
                // --- MOTOR PARADO ---
                if(elLedRun) elLedRun.className = 'clp-status-dot offline'; // Cinza/Vermelho
                if(elLedText) {
                    elLedText.textContent = "PARADO";
                    elLedText.style.color = "#aaa";
                }

                // Botão vira "LIGA"
                if(btn) {
                    btn.textContent = "LIGA";
                    btn.style.background = "var(--color-primary)"; // Azul
                    btn.setAttribute('data-state', 'off');
                    btn.style.boxShadow = "none";
                }
            }

            // 7. Slider (Só atualiza se não estiver arrastando)
            if(slider && document.activeElement !== slider) {
                slider.value = dados.velocidade_setpoint;
                if(display) display.textContent = dados.velocidade_setpoint + ' %';
            }

        } else {
            // --- OFFLINE (Sem conexão Modbus) ---
            if (elStatusGeral) {
                elStatusGeral.textContent = "OFFLINE";
                elStatusGeral.style.color = "#ff4444";
            }
            if (elCorrente) elCorrente.textContent = "--- A";
            if (elVelocidade) elVelocidade.textContent = "--- RPM";
            
            if (elLedRun) elLedRun.className = 'clp-status-dot offline';
            if (elLedText) {
                elLedText.textContent = "DESCONECTADO";
                elLedText.style.color = "#ff4444";
            }
        }

    } catch (e) {
        console.error("Erro ao atualizar ventilador:", e);
    }
}

async function enviarComandoVentilador(tipo, valor) {
    // Bloqueio rápido no frontend
    if (currentProfile === 'Visualizador') return alert("Acesso restrito a visualização.");

    if (!ventiladorEmRemoto) {
        alert("Passe para modo REMOTO para operar.");
        return;
    }

    try {
        const resp = await fetch('/api/ventilador/comando', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                tipo: tipo, 
                valor: valor,
                usuario_solicitante: currentUserLogin // NOVO
            })
        });
        const res = await resp.json();
        
        if(res.ok) {
            // Atualização Otimista
            if (tipo === 'power') {
                const btn = document.getElementById('vt_btn_power');
                const txt = document.getElementById('vt_status_text');
                
                if (valor === 1) { 
                    btn.textContent = "DESLIGAR VENTILADOR";
                    btn.style.background = "var(--color-error)";
                    btn.setAttribute('data-state', 'on');
                    if(txt) { txt.textContent = "COMANDO ENVIADO..."; txt.style.color = "#ffa500"; }
                } else {
                    btn.textContent = "LIGAR VENTILADOR";
                    btn.style.background = "var(--color-primary)";
                    btn.setAttribute('data-state', 'off');
                    if(txt) { txt.textContent = "PARANDO..."; txt.style.color = "#aaa"; }
                }
            }
            setTimeout(atualizarDadosVentilador, 500);
            
        } else {
            alert("Erro no comando: " + (res.erro || "Desconhecido"));
        }
    } catch (e) {
        alert("Erro de conexão ao enviar comando.");
    }
}

// ================= FUNÇÃO DE FECHAR (RESTAURAÇÃO) =================
function fecharModalHeliostato() {
    const modal = document.getElementById('modalHeliostato');
    if (modal) {
        modal.style.display = 'none';
    }
    
    currentHelioID = null;
    
    // Para o timer para não ficar consumindo CPU em segundo plano
    if (timerModalHelio) {
        clearTimeout(timerModalHelio); 
        timerModalHelio = null;
    }
}

// Abre o modal de configuração de alarmes
// --- FUNÇÕES DOS MODAIS DA ESTAÇÃO ---

// Abre o modal ao clicar na engrenagem
function openWeatherAlarmModal(key, unit) {
    // Verifica permissão
    if (currentProfile !== 'Administrador') {
        return alert("Acesso Negado: Apenas Administradores podem configurar alarmes.");
    }

    // Define qual variável estamos editando
    currentAlarmKey = key;
    const meta = weatherMeta[key];
    
    // Atualiza título
    const elTitle = document.getElementById('weatherAlarmTitle');
    if (elTitle) elTitle.innerText = `Configurar: ${meta ? meta.label : key}`;

    // --- AQUI ESTÁ A CORREÇÃO SIMPLES ---
    // Lê direto da variável global (ex: ghi1_min, ghi1_max)
    const valMin = limitesEstacao[`${key}_min`];
    const valMax = limitesEstacao[`${key}_max`];

    // Preenche os inputs (se o valor não existir, deixa em branco)
    const inpMin = document.getElementById('weatherAlarmMin');
    const inpMax = document.getElementById('weatherAlarmMax');
    
    if (inpMin) inpMin.value = (valMin !== undefined) ? valMin : '';
    if (inpMax) inpMax.value = (valMax !== undefined) ? valMax : '';
    // -------------------------------------

    // Abre o modal
    const modal = document.getElementById('weatherAlarmModal');
    if (modal) modal.style.display = 'flex';
}

// Fecha o modal
function closeWeatherAlarmModal() {
    const modal = document.getElementById('weatherAlarmModal');
    if (modal) modal.style.display = 'none';
}

// Salva os limites
async function saveWeatherAlarmThresholds() {
    if (!currentAlarmKey) return;

    const minVal = document.getElementById('weatherAlarmMin').value;
    const maxVal = document.getElementById('weatherAlarmMax').value;

    const payload = {
        key: currentAlarmKey,
        min: minVal === '' ? null : parseFloat(minVal),
        max: maxVal === '' ? null : parseFloat(maxVal)
    };

    try {
        const resp = await fetch('/api/config/limites/salvar', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await resp.json();
        
        if(data.ok) {
            alert("Salvo com sucesso!");
            closeWeatherAlarmModal();
            carregarConfiguracoes();
        } else {
            alert("Erro ao salvar: " + (data.erro || 'Erro desconhecido'));
        }
    } catch (e) {
        alert("Erro de comunicação.");
    }
}

// Função do Botão "Gravar" (Tela Sistema)
async function salvarConfiguracoesGerais() {
    // 1. Captura Tempos
    const tEstacao = document.getElementById('tempo_gravacao_estacao').value;
    const tTerm = document.getElementById('tempo_gravacao_termostatos').value;
    
    // 2. Captura Dashboard (Slots)
    const s1 = document.getElementById('cfg_dash_slot1').value;
    const s2 = document.getElementById('cfg_dash_slot2').value;
    const s3 = document.getElementById('cfg_dash_slot3').value;
    const s4 = document.getElementById('cfg_dash_slot4').value;

    // 3. Captura IPs e Portas (SISTEMA)
    // Função auxiliar para pegar valor ou vazio se não existir
    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };

    const sistemaData = {
        'ip_estacao_meteo': getVal('ip_estacao'),
        'port_estacao_meteo': getVal('porta_estacao'),
        'ip_termostatos': getVal('ip_termostatos'),
        'port_termostatos': getVal('porta_termostatos'),
        'ip_roteador': getVal('ip_roteador'),
        'port_roteador': getVal('porta_roteador'),
        'ip_cam1': getVal('ip_camera1'),
        'port_cam1': getVal('porta_camera1'),
        'ip_cam2': getVal('ip_camera2'),
        'port_cam2': getVal('porta_camera2'),
        'ip_ventilador': getVal('ip_ventilador'),
        'port_ventilador': getVal('porta_ventilador')
    };

    // Monta o pacote completo
    const payload = {
        'TEMPOS': {
            'intervalo_gravacao_estacao_segundos': tEstacao,
            'intervalo_gravacao_termostatos_segundos': tTerm
        },
        'DASHBOARD_DISPLAY': { 
            'slot1': s1,
            'slot2': s2,
            'slot3': s3,
            'slot4': s4
        },
        'SISTEMA': sistemaData, // Adicionamos a seção nova
        'usuario': currentUser
    };

    // Envia
    const res = await API.salvarConfig(payload);
    if (res.ok) {
        alert("Configurações (IPs, Tempos e Dashboard) salvas!");
        carregarConfiguracoes(); // Recarrega para confirmar
    } else {
        alert("Erro: " + res.erro);
    }
}

// ================= START (INICIALIZAÇÃO ÚNICA) =================
document.addEventListener('DOMContentLoaded', () => {
    // 1. Inicia relógios e recupera sessão
    updateDateTime();
    verificarSessao();
    
    // 2. Carrega configurações do servidor
    carregarConfiguracoes();
    
    // 3. Inicia visualizações
    generateHeatmap();
    gerarGridHeliostatos(); 
    carregarDadosReplay();
    carregarFiltrosHeliostatos();
    
    // 4. Busca dados iniciais
    atualizarDados();
    atualizarStatusConexao();
    carregarListaBases();
    atualizarTabelaUsuarios(); 

    // 5. Configura Relatórios
    initReportDates();
    toggleReportOptions(); 
    
    // 6. Define os loops de atualização 
    setInterval(updateDateTime, 1000); 
    
    const loopHeatmap = async () => { await generateHeatmap(); setTimeout(loopHeatmap, 5000); };
    const loopDados = async () => { await atualizarDados(); setTimeout(loopDados, 2000); };
    const loopConexao = async () => { await atualizarStatusConexao(); setTimeout(loopConexao, 1000); };
    const loopHeliostatos = async () => { await gerarGridHeliostatos(); setTimeout(loopHeliostatos, 2000); };
    const loopCameras = async () => { await atualizarStatusCamerasUI(); setTimeout(loopCameras, 2000); };

    // Inicia os loops após a primeira chamada já feita na inicialização
    setTimeout(loopHeatmap, 5000);
    setTimeout(loopDados, 2000);
    setTimeout(loopConexao, 5000);
    setTimeout(loopHeliostatos, 2000);
    // setTimeout(loopCameras, 2000); // CÂMERAS OCULTADAS TEMPORARIAMENTE

    // 7. Inicia Ventilador
    initVentiladorEvents();
    
    // 8. Garante que o botão Gravar (Sistema) use a função correta
    const btnGravarSistema = document.querySelector('#system .btn-primary');
    if(btnGravarSistema) {
        // Remove qualquer onclick antigo do HTML e força o novo
        btnGravarSistema.onclick = null; 
        btnGravarSistema.addEventListener('click', salvarIPs);
    }
});