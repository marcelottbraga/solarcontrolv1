// static/js/script.js

// ================= VARIAVEIS GLOBAIS  =================
let currentUser = 'admin';       
let currentUserLogin = 'admin';  
let currentProfile = 'Administrador'; 
let currentCommand = null;
let ultimoEstadoSirene = false;
let dashboardSlots = { slot1: 'dni', slot2: 'ghi', slot3: 'vento_velocidade', slot4: 'vento_direcao' };
let timerModalHelio = null;

const weatherMeta = {
    'dni': { label: 'DNI', unit: ' W/m²', limiteKey: 'DNI' },
    'ghi': { label: 'GHI', unit: ' W/m²', limiteKey: 'GHI' },
    'dhi': { label: 'Difusa', unit: ' W/m²', limiteKey: 'Difusa' }, // Novo
    'vento_direcao': { label: 'Dir. Vento', unit: '°', limiteKey: 'Direção do Vento' },
    'vento_velocidade': { label: 'Vel. Vento', unit: ' m/s', limiteKey: 'Velocidade do Vento' },
    'precipitacao': { label: 'Precipitação', unit: ' mm', limiteKey: 'Precipitação Acumulada' },
    'taxa_chuva': { label: 'Taxa Chuva', unit: ' mm/h', limiteKey: 'Taxa de Chuva' },
    'temperatura': { label: 'Temp. Ar', unit: ' °C', limiteKey: 'Temperatura' }, // Novo
    'umidade': { label: 'Umidade', unit: ' %', limiteKey: 'Umidade' }, // Novo
    'pressao': { label: 'Pressão', unit: ' hPa', limiteKey: 'Pressão' } // Novo
};

// --- CONFIGURAÇÃO DE PRIORIDADE DE ALARMES ---
const PRIORIDADE_ALARMES = [
    "Termostatos Críticos",          
    "Velocidade do Vento Alta",      
    "DNI Alto",
    "GHI Alto",
    "Taxa de Chuva Alta",
    "Precipitação Acumulada Alta",
    "DNI Baixo",
    "GHI Baixo",
    "Direção do Vento Baixo",
    "Direção do Vento Alto"
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

// ================= LOGIN E NAVEGAÇÃO =================
async function handleLogin(event) {
    event.preventDefault();
    const userField = document.getElementById('username').value;
    const passField = document.getElementById('password').value;
    
    if (!userField || !passField) return alert("Preencha usuário e senha.");

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
}

function aplicarRegrasDeUsuario() {
    console.log(`Aplicando regras para perfil: ${currentProfile}`);
    
    // --- 1. SELETORES DOS ITENS DE MENU (SIDEBAR) ---
    // Usamos o atributo onclick para identificar cada botão do menu
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
    const formHelioCrud = document.querySelector("#helioBase .form-section"); // Área de cadastro
    const radiosVentilador = document.getElementsByName('vt_controle');
    
    // Botões de Configuração (Estação e Termostatos)
    // Vamos tentar esconder os botões que abrem os modais, se eles tiverem IDs ou classes conhecidas.
    // Caso contrário, a proteção será feita ao clicar (nas funções openWeatherAlarmModal etc).
    
    // --- 3. RESET (Habilita tudo antes de aplicar restrições) ---
    // Exibe todos os menus
    if(navDashboard) navDashboard.style.display = 'block';
    if(navWeather)   navWeather.style.display = 'block';
    if(navSensors)   navSensors.style.display = 'block';
    if(navHelio)     navHelio.style.display = 'block';
    if(navTurbine)   navTurbine.style.display = 'block';
    if(navSystem)    navSystem.style.display = 'block';
    if(navReports)   navReports.style.display = 'block';
    if(navUsers)     navUsers.style.display = 'block';
    
    // Reabilita formulários e botões
    if(formHelioCrud) formHelioCrud.style.display = 'block';
    botoesDashboard.forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
    });
    radiosVentilador.forEach(r => r.disabled = false);


    // --- 4. REGRAS DO VISUALIZADOR (Bloqueio Total) ---
    if (currentProfile === 'Visualizador') {
        // ESCONDE TODOS OS MENUS exceto Dashboard
        if(navWeather)   navWeather.style.display = 'none';
        if(navSensors)   navSensors.style.display = 'none';
        if(navHelio)     navHelio.style.display = 'none';
        if(navTurbine)   navTurbine.style.display = 'none';
        if(navSystem)    navSystem.style.display = 'none';
        if(navReports)   navReports.style.display = 'none';
        if(navUsers)     navUsers.style.display = 'none';

        // Bloqueia botões de comando do Dashboard (Visualização apenas)
        botoesDashboard.forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
            btn.title = "Apenas visualização";
        });
        
        // Se o usuário já estiver em uma tela proibida (ex: deu F5), joga pro dashboard
        showScreen('dashboard');
    }

    // --- 5. REGRAS DO OPERADOR (Acesso Parcial) ---
    if (currentProfile === 'Operador') {
        // Esconde menus de ADMIN
        if(navSystem) navSystem.style.display = 'none'; // Config Sistema
        if(navUsers)  navUsers.style.display = 'none';  // Usuários

        // Heliostatos: Vê a lista, mas NÃO VÊ o formulário de cadastro/edição
        if(formHelioCrud) formHelioCrud.style.display = 'none';

        // Ventilador: Não pode trocar modo (Local/Remoto)
        radiosVentilador.forEach(r => r.disabled = true);
        
        // Nota: As configurações de Alarme e Termostatos são bloqueadas nas funções abaixo
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
    const dados = await API.getDadosEstacao();
    if (!dados.ok) return;

    // 1. Atualiza a Tela "Estação Meteorológica" (Campos Fixos)
    for (const [key, meta] of Object.entries(weatherMeta)) {
        let idEstacao = null;
        if (key === 'dni') idEstacao = 'dni_estacao_valor';
        else if (key === 'ghi') idEstacao = 'ghi_estacao_valor';
        else if (key === 'dhi') idEstacao = 'dhi_estacao_valor'; // Novo
        else if (key === 'vento_direcao') idEstacao = 'vento_dir_estacao_valor';
        else if (key === 'vento_velocidade') idEstacao = 'vento_vel_estacao_valor';
        else if (key === 'precipitacao') idEstacao = 'precipitacao_estacao_valor';
        else if (key === 'taxa_chuva') idEstacao = 'taxa_estacao_valor';
        else if (key === 'temperatura') idEstacao = 'temperatura_estacao_valor'; // Novo
        else if (key === 'umidade') idEstacao = 'umidade_estacao_valor'; // Novo
        else if (key === 'pressao') idEstacao = 'pressao_estacao_valor'; // Novo

        if (idEstacao) aplicarValorComCor(idEstacao, dados[key], meta);
    }

    // 2. Atualiza o Dashboard (Slots Dinâmicos 1 a 4)
    for (let i = 1; i <= 4; i++) {
        const key = dashboardSlots[`slot${i}`]; 
        const meta = weatherMeta[key];
        if (meta) {
            aplicarValorComCor(`dash_slot_${i}_val`, dados[key], meta);
        }
    }

    verificarAlarmesEstacao(dados);
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

// ================= CONFIGURAÇÕES E SALVAMENTO =================
async function carregarConfiguracoes() {
    const dados = await API.getConfig();
    if (!dados) return;

    const sis = dados.SISTEMA;
    if (sis) {
        setValInput('ip_estacao', sis.ip_estacao_meteo);
        setValInput('porta_estacao', sis.port_estacao_meteo);
        setValInput('ip_termostatos', sis.ip_termostatos);
        setValInput('porta_termostatos', sis.port_termostatos);
        setValInput('ip_roteador', sis.ip_roteador);
        setValInput('porta_roteador', sis.port_roteador);
        setValInput('ip_camera1', sis.ip_cam1);
        setValInput('porta_camera1', sis.port_cam1);
        setValInput('ip_camera2', sis.ip_cam2);
        setValInput('porta_camera2', sis.port_cam2);
		setValInput('ip_ventilador', sis.ip_ventilador);
		setValInput('porta_ventilador', sis.port_ventilador);;
    }
    
    const tempos = dados.TEMPOS;
    if (tempos) {
        setValInput('tempo_gravacao_estacao', tempos.intervalo_gravacao_estacao_minutos);
        setValInput('tempo_gravacao_termostatos', tempos.intervalo_gravacao_termostatos_minutos);
    }

    const est = dados.ESTACAO;
    if (est) {
        for (const [nomeLegivel, obj] of Object.entries(weatherAlarmThresholds)) {
            const safeKey = weatherMap[nomeLegivel]; 
            if (est[`${safeKey}_min`]) obj.min = parseFloat(est[`${safeKey}_min`]);
            if (est[`${safeKey}_max`]) obj.max = parseFloat(est[`${safeKey}_max`]);
        }
    }

    const term = dados.TERMOSTATOS;
    if (term) {
        sensorConfig.min = parseFloat(term.temp_min);
        sensorConfig.max = parseFloat(term.temp_max);
        sensorConfig.tolerance = parseInt(term.num_sensores_alarm);
        sensorConfig.alarmBelowMin = (term.toggle_ativa_min === 'true');
        
        setValInput('tempMinHeatmap', term.temp_min);
        setValInput('tempMaxHeatmap', term.temp_max);
        setValInput('numsensout', term.num_sensores_alarm);

        const radioSim = document.querySelector('input[name="alarmBelowMin"][value="sim"]');
        const radioNao = document.querySelector('input[name="alarmBelowMin"][value="nao"]');
        if (radioSim && radioNao) {
            if (term.toggle_ativa_min === 'true') radioSim.checked = true;
            else radioNao.checked = true;
        }
    }
    const dash = dados.DASHBOARD_DISPLAY;
    if (dash) {
        if(dash.slot1) document.getElementById('cfg_dash_slot1').value = dash.slot1;
        if(dash.slot2) document.getElementById('cfg_dash_slot2').value = dash.slot2;
        if(dash.slot3) document.getElementById('cfg_dash_slot3').value = dash.slot3;
        if(dash.slot4) document.getElementById('cfg_dash_slot4').value = dash.slot4;
        
        // Atualiza a global e os títulos imediatamente
        dashboardSlots.slot1 = dash.slot1 || 'dni';
        dashboardSlots.slot2 = dash.slot2 || 'ghi';
        dashboardSlots.slot3 = dash.slot3 || 'vento_velocidade';
        dashboardSlots.slot4 = dash.slot4 || 'vento_direcao';
        
        atualizarTitulosDashboard();
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

async function salvarIPs() {
    const tEstacao = document.getElementById('tempo_gravacao_estacao').value;
    const tTermostatos = document.getElementById('tempo_gravacao_termostatos').value;

    if (!tEstacao || isNaN(tEstacao) || !Number.isInteger(Number(tEstacao)) || Number(tEstacao) <= 0) {
        return alert("Erro: O intervalo da Estação deve ser inteiro em SEGUNDOS.");
    }
    if (!tTermostatos || isNaN(tTermostatos) || !Number.isInteger(Number(tTermostatos)) || Number(tTermostatos) <= 0) {
        return alert("Erro: O intervalo dos Termostatos deve ser inteiro em SEGUNDOS.");
    }

    const payload = {
        usuario_solicitante: currentUserLogin, // NOVO: Validação backend
        usuario: currentUser, // Log visual
        sistema: {
            ip_estacao_meteo: document.getElementById('ip_estacao').value,
            port_estacao_meteo: document.getElementById('porta_estacao').value,
            ip_termostatos: document.getElementById('ip_termostatos').value,
            port_termostatos: document.getElementById('porta_termostatos').value,
            ip_roteador: document.getElementById('ip_roteador').value,
            port_roteador: document.getElementById('porta_roteador').value,
            ip_ventilador: document.getElementById('ip_ventilador').value,
            port_ventilador: document.getElementById('porta_ventilador').value,
            ip_cam1: document.getElementById('ip_camera1').value,
            port_cam1: document.getElementById('porta_camera1').value,
            ip_cam2: document.getElementById('ip_camera2').value,
            port_cam2: document.getElementById('porta_camera2').value
        },
        tempos: {
            intervalo_gravacao_estacao_minutos: tEstacao, 
            intervalo_gravacao_termostatos_minutos: tTermostatos
        },
        dashboard_display: {
            slot1: document.getElementById('cfg_dash_slot1').value,
            slot2: document.getElementById('cfg_dash_slot2').value,
            slot3: document.getElementById('cfg_dash_slot3').value,
            slot4: document.getElementById('cfg_dash_slot4').value
        }
    };

    const d = await API.salvarConfig(payload);
    if (d.ok) {
        alert('Configurações salvas!');
        carregarConfiguracoes();
    } else {
        alert('Erro ao salvar: ' + d.erro);
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
        cell.title = `Sensor ${i + 1}: ${temp}°C`;
		cell.style.cursor = 'pointer'; 
		cell.onclick = () => abrirGraficoSensor(i + 1);
        
        if (temp > sensorConfig.max || (sensorConfig.alarmBelowMin && temp < sensorConfig.min)) {
            cell.style.border = '2px solid #fff';
            cell.style.zIndex = '10';
            cell.style.boxShadow = '0 0 5px rgba(255,255,255,0.8)';
        } else {
            cell.style.border = ''; 
            cell.style.zIndex = '';
            cell.style.boxShadow = '';
        }
    }
    carregarListaSensores(valores);
}

function verificarAlarmesTemperatura(valores) {
    let sensoresCriticos = 0;
    valores.forEach((temp) => {
        if (temp > sensorConfig.max || (sensorConfig.alarmBelowMin && temp < sensorConfig.min)) {
            sensoresCriticos++;
        }
    });

    alarmesGlobais.termostatos = [];
    if (sensoresCriticos > sensorConfig.tolerance) {
        alarmesGlobais.termostatos.push("Termostatos Críticos");
    }
    atualizarInterfaceAlarmes();
}

function verificarAlarmesEstacao(dados) {
    alarmesGlobais.estacao = [];
    for (const [label, limites] of Object.entries(weatherAlarmThresholds)) {
        const jsonKey = weatherMap[label];
        const valor = dados[jsonKey];
        if (valor !== undefined && valor !== null) {
            if (valor < limites.min) alarmesGlobais.estacao.push(`${label} Baixo`);
            else if (valor > limites.max) alarmesGlobais.estacao.push(`${label} Alto`);
        }
    }
    atualizarInterfaceAlarmes();
}

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

    if (alarmeAtivo !== ultimoEstadoSirene) {
        API.setSirene(alarmeAtivo);
        ultimoEstadoSirene = alarmeAtivo;
    }

    if (alarmeAtivo && container) {
        container.style.background = 'rgba(255, 68, 68, 0.15)';
        if(icon) icon.textContent = '🚨';
        const alarmePrincipal = todosAlarmes[0];
        if (qtdAlarmes === 1) if(status) status.textContent = `ATENÇÃO: ${alarmePrincipal}`;
        else if(status) status.textContent = `ATENÇÃO: ${alarmePrincipal} (+${qtdAlarmes - 1})`;
        if(counterDiv) counterDiv.textContent = `${qtdAlarmes} alarmes ativos`;
    } else if (container) {
        container.style.background = 'linear-gradient(120deg, rgba(255, 68, 68, 0.08), rgba(0, 208, 132, 0.05))';
        if(icon) icon.textContent = '✅';
        if(status) status.textContent = "Sistema Monitorando";
        if(counterDiv) counterDiv.textContent = "0 alarmes ativos";
    }
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
            card.innerHTML = `<div class="card-title">Sensor ${idx+1}</div><div class="card-value" id="temp_sensor_${idx}">${valor} °C</div>`;
            container.appendChild(card);
        });
    } else {
        valores.forEach((valor, idx) => {
            const el = document.getElementById(`temp_sensor_${idx}`);
            if(el) el.textContent = `${valor} °C`;
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

function toggleReportOptions() {
    const tipo = document.getElementById('reportType').value;
    const divEvents = document.getElementById('eventFilterOptions');
    divEvents.style.display = (tipo === 'events') ? 'block' : 'none';

    const btnView = document.getElementById('btnVisualizarTela');
    const previewArea = document.getElementById('previewArea');
    if (tipo === 'weather' || tipo === 'sensors') {
        btnView.style.display = 'none';
        previewArea.style.display = 'none';
    } else {
        btnView.style.display = 'inline-block';
        previewArea.style.display = 'block';
    }

    const btnPDF = document.getElementById('btnExportarPDF');
    if (tipo === 'sensors') btnPDF.style.display = 'none';
    else btnPDF.style.display = 'inline-block';
}

async function buscarDadosRelatorio() {
    const tipo = document.getElementById('reportType').value;
    const inicio = document.getElementById('reportStartDate').value;
    const fim = document.getElementById('reportEndDate').value;
    if (!inicio || !fim) { alert("Selecione o período."); return null; }

    let filtrosEvento = [];
    if (tipo === 'events') {
        document.querySelectorAll('input[name="eventType"]:checked').forEach(cb => {
            filtrosEvento.push(cb.value);
            if (cb.value === 'LOGIN') filtrosEvento.push('LOGOUT');
        });
    }

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

    let filtrosEvento = [];
    if (tipo === 'events') {
        document.querySelectorAll('input[name="eventType"]:checked').forEach(cb => {
            filtrosEvento.push(cb.value);
            if (cb.value === 'LOGIN') filtrosEvento.push('LOGOUT');
        });
    }

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

    let filtrosEvento = [];
    if (tipo === 'events') {
        document.querySelectorAll('input[name="eventType"]:checked').forEach(cb => {
            filtrosEvento.push(cb.value);
            if (cb.value === 'LOGIN') filtrosEvento.push('LOGOUT');
        });
    }

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


// ================= BLOCO HELIOSTATOS (Copie e substitua tudo aqui) =================

let currentHelioID = null;
timerModalHelio = null;

// 1. GERA O GRID (Resolve o problema do Vermelho)
async function gerarGridHeliostatos() {
    const grid = document.getElementById('heliostatosGrid');
    if (!grid) return;
    
    // Se primeira vez, define layout
    if (grid.children.length === 0) {
        grid.style.display = 'flex';
        grid.style.flexDirection = 'column';
        grid.style.alignItems = 'center'; 
        grid.style.gap = '5px'; 
    }

    let configurados = {};
    try {
        const res = await fetch('/api/heliostatos/status_geral');
        configurados = await res.json();
    } catch (e) {
        console.error("Erro status geral", e);
        return; 
    }

    // Limpa HTML para garantir que não haja lixo visual
    grid.innerHTML = ''; 

    const layoutLinhas = [13, 11, 9, 7, 5, 3, 2]; 
    let contadorHeliostato = 1;

    layoutLinhas.forEach(qtdNaLinha => {
        const rowDiv = document.createElement('div');
        rowDiv.style.display = 'flex';
        rowDiv.style.gap = '5px'; 
        rowDiv.style.justifyContent = 'center';

        for (let i = 0; i < qtdNaLinha; i++) {
            if (contadorHeliostato > 50) break; 
            const idAtual = contadorHeliostato; // Congela ID

            const cell = document.createElement('div');
            cell.className = 'heliostato-cell'; 
            cell.textContent = idAtual;
            cell.style.backgroundColor = ''; 

            const dadosHelio = configurados[idAtual];

            if (!dadosHelio) {
                // --- NÃO EXISTE ---
                cell.classList.add('status-gray');
                cell.title = "Não Configurado";
                cell.style.cursor = 'not-allowed';
            } else {
                // --- EXISTE ---
                cell.style.cursor = 'pointer';
                cell.onclick = () => abrirModalHeliostato(idAtual);

                // LÓGICA DE COR:
                // Se status_code for 1 (Movendo), FORÇA ONLINE (Azul/Verde).
                // Se status_code for 0, depende do ping (online: true/false).
                let isOnline = (String(dadosHelio.online).toLowerCase() === 'true' || dadosHelio.online == 1);
                
                if (dadosHelio.status_code === 1) {
                    isOnline = true; // Override: Movendo é Online
                }

                if (!isOnline) {
                    // Offline Real -> Vermelho
                    cell.classList.add('status-red');
                    cell.title = `Offline`;
                } else {
                    // Online -> Azul
                    cell.classList.add('status-blue');
                    if (dadosHelio.status_code === 1) cell.title = `Helio ${idAtual}: MOVENDO...`;
                    else cell.title = `Helio ${idAtual}: Online`;
                }
            }
            rowDiv.appendChild(cell);
            contadorHeliostato++;
        }
        grid.appendChild(rowDiv);
    });
}

// 2. ABRE MODAL (Resolve o "Fantasma" limpando tudo ANTES de carregar)
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
    document.getElementById('valTheta').textContent = "--";

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
    if (timerModalHelio) clearInterval(timerModalHelio);
    timerModalHelio = setInterval(atualizarDadosModal, 1000); 
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

        // Lógica de Override: Movendo (1) conta como Online
        let isOnline = (String(dados.online).toLowerCase() === 'true' || dados.online == 1);
        if (dados.status_code === 1) isOnline = true;

        if (isOnline) {
            // --- ONLINE ---
            document.getElementById('valAlpha').textContent = (dados.alpha || 0).toFixed(2) + '°';
            document.getElementById('valBeta').textContent = (dados.beta || 0).toFixed(2) + '°';
            document.getElementById('valTheta').textContent = (dados.theta || 0).toFixed(2) + '°';
            
            if(elModo) elModo.textContent = (dados.modo || '--').toUpperCase();
            
            if (dados.status_code === 1) { 
                // MOVENDO
                if(elStatus) { elStatus.textContent = "MOVENDO"; elStatus.style.color = '#00d084'; }
                if(elBorder) elBorder.style.borderLeftColor = '#00d084';
                
                if(btnMover) {
                    btnMover.disabled = true;
                    btnMover.textContent = "MOVENDO...";
                    btnMover.style.opacity = "0.6";
                    btnMover.style.cursor = "wait";
                }
                if(inpAlpha) inpAlpha.disabled = true;
                if(inpBeta) inpBeta.disabled = true;

            } else { 
                // OCIOSO / PARADO
                if(elStatus) { 
                    elStatus.textContent = (dados.status || 'ONLINE').toUpperCase(); 
                    elStatus.style.color = '#00a8ff'; 
                }
                if(elBorder) elBorder.style.borderLeftColor = '#00a8ff';

                if(btnMover) {
                    btnMover.disabled = false;
                    btnMover.textContent = "MOVER PARA POSIÇÃO";
                    btnMover.style.opacity = "1";
                    btnMover.style.cursor = "pointer";
                }
                if(inpAlpha) inpAlpha.disabled = false;
                if(inpBeta) inpBeta.disabled = false;
            }

        } else {
            // --- OFFLINE ---
            if(elStatus) { elStatus.textContent = "OFFLINE"; elStatus.style.color = '#aaa'; }
            if(elModo) elModo.textContent = "---";
            if(elBorder) elBorder.style.borderLeftColor = '#aaa';
            
            document.getElementById('valAlpha').textContent = "--";
            document.getElementById('valBeta').textContent = "--";
            document.getElementById('valTheta').textContent = "--";

            // Garante bloqueio
            if(btnMover) {
                btnMover.disabled = true;
                btnMover.textContent = "SEM CONEXÃO";
                btnMover.style.opacity = "0.4";
                btnMover.style.cursor = "not-allowed";
            }
            if(inpAlpha) inpAlpha.disabled = true;
            if(inpBeta) inpBeta.disabled = true;
        }
    } catch (e) {
        console.error("Erro no modal:", e);
    }
}

// ================= FIM BLOCO HELIOSTATOS =================

async function enviarComandoHelio(acao) {
    if (!currentHelioID) return;
    
    let payload = {};
    
    if (acao === 'manual') {
        const alpha = document.getElementById('inputAlpha').value;
        const beta = document.getElementById('inputBeta').value;
        if (!alpha || !beta) return alert("Preencha Alpha e Beta");
        
        payload = {
            tipo: 'manual',
            valores: { alpha: alpha, beta: beta }
        };
    } else if (acao === 'auto') {
        payload = {
            tipo: 'modo',
            valores: { modo: 1 }
        };
    } else if (acao === 'stop') {
        // Parar é basicamente ir para manual sem mover
        payload = {
            tipo: 'modo',
            valores: { modo: 0 }
        };
    }
    
    try {
        const res = await fetch(`/api/heliostato/${currentHelioID}/comando`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.ok) {
            alert("Comando Enviado!");
            atualizarDadosModal(); // Atualiza UI
        } else {
            alert("Erro: " + (json.msg || "Falha desconhecida"));
        }
    } catch (e) {
        alert("Erro de comunicação");
    }
}
// BASES CRUD
let listaBasesCache = [];
async function carregarListaBases() {
    const select = document.getElementById('baseSelect');
    if (!select) return;
    listaBasesCache = await API.getBases();
    select.innerHTML = '<option value="">-- Novo Heliostato (Clique para criar) --</option>';
    listaBasesCache.forEach(base => {
        const opt = document.createElement('option');
        opt.value = base.id; opt.textContent = base.nome; select.appendChild(opt);
    });
}
// Função para preencher o formulário quando seleciona um item no Select
async function carregarBaseSelecionada() {
    const id = document.getElementById('baseSelect').value;
    if (!id) {
        resetFormBase();
        return;
    }

    try {
        const res = await fetch(`/api/bases/${id}`);
        const base = await res.json();

        document.getElementById('baseId').value = base.id;
        document.getElementById('baseNome').value = base.nome; // Agora é o número (1-50)
        document.getElementById('baseIp').value = base.ip;
        document.getElementById('basePort').value = base.porta;
        
        // NOVOS CAMPOS
        document.getElementById('baseAlpha').value = base.alpha || 0;
        document.getElementById('baseBeta').value = base.beta || 0;
        document.getElementById('baseTheta').value = base.theta || 0;

    } catch (e) {
        console.error("Erro ao carregar base:", e);
    }
}

// Função para salvar (Novo ou Edição)
async function salvarBase() {
    const id = document.getElementById('baseId').value;
    
    const payload = {
        usuario_solicitante: currentUserLogin, // NOVO
        nome: document.getElementById('baseNome').value, 
        ip: document.getElementById('baseIp').value,
        porta: document.getElementById('basePort').value,
        alpha: document.getElementById('baseAlpha').value,
        beta: document.getElementById('baseBeta').value,
        theta: document.getElementById('baseTheta').value
    };

    if (!payload.nome || !payload.ip) {
        alert("Preencha o Número e o IP!");
        return;
    }

    const url = id ? `/api/bases/${id}` : '/api/bases';
    const method = id ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method: method,
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        
        const json = await res.json();
        if (json.ok) {
            alert("Salvo com sucesso!");
            carregarListaBases(); 
            resetFormBase();      
        } else {
            alert("Erro ao salvar: " + json.erro);
        }
    } catch (e) {
        console.error(e);
        alert("Erro de comunicação.");
    }
}

// Função auxiliar para limpar o formulário
function resetFormBase() {
    document.getElementById('baseId').value = '';
    document.getElementById('baseSelect').value = '';
    document.getElementById('baseNome').value = '';
    document.getElementById('baseIp').value = '';
    document.getElementById('basePort').value = '502';
    
    document.getElementById('baseAlpha').value = '';
    document.getElementById('baseBeta').value = '';
    document.getElementById('baseTheta').value = '';
}


async function apagarBase() {
    const id = document.getElementById('baseId').value;
    if (!id) return alert("Selecione um heliostato para excluir.");
    
    if (confirm("Tem certeza que deseja excluir este heliostato?")) {
        // CORREÇÃO: Usar currentUserLogin (admin) e não currentUser (Administrador)
        const res = await API.deletarBase(id, currentUserLogin);
        
        if (res.ok) { 
            alert("Heliostato excluído."); 
            resetFormBase(); 
            carregarListaBases(); 
        } else {
            alert("Erro ao excluir: " + res.erro);
        }
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

// ================= EASTER EGG (SECRET EDITOR) =================

let eggClicks = 0;
let eggTimer = null;

function triggerEasterEgg() {
    eggClicks++;
    
    // Se tiver um timer rodando, limpa ele (o usuário foi rápido)
    if (eggTimer) clearTimeout(eggTimer);

    // Se chegou a 3 cliques
    if (eggClicks === 3) {
        eggClicks = 0; // Zera para a próxima
        abrirEditorSecreto(); // BINGO!
    } else {
        // Se não clicou de novo em 500ms (meio segundo), zera a contagem
        eggTimer = setTimeout(() => {
            eggClicks = 0;
        }, 500);
    }
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
    if(ventiladorUpdateTimer) clearInterval(ventiladorUpdateTimer);
    ventiladorUpdateTimer = setInterval(atualizarDadosVentilador, 2000);
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
        clearInterval(timerModalHelio);
        timerModalHelio = null;
    }
}


// ================= START =================
document.addEventListener('DOMContentLoaded', () => {
    // 1. Inicia relógios e configurações
    updateDateTime();
    carregarConfiguracoes();
    
    // 2. Inicia visualizações
    generateHeatmap();
    gerarGridHeliostatos(); 
	carregarDadosReplay();
    
    // 3. Busca dados iniciais
    atualizarDados();
    atualizarStatusConexao();
    carregarListaBases();
    
    // Carregar a tabela de usuários ao iniciar
    atualizarTabelaUsuarios(); 

    // 4. Configura Relatórios
    initReportDates();
    toggleReportOptions(); 
    
    // 5. Define os loops de atualização (Timers)
    setInterval(updateDateTime, 1000);
    setInterval(generateHeatmap, 5000); 
    setInterval(atualizarDados, 2000);  
    setInterval(atualizarStatusConexao, 5000);
    setInterval(gerarGridHeliostatos, 2000);
    setInterval(atualizarStatusCamerasUI, 2000);

    // 6. Inicia Ventilador
    initVentiladorEvents();
});