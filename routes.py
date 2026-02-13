from flask import Blueprint, render_template, request, jsonify, Response, current_app, session
from extensions import db
from models import Usuario, HelioBase, LogAlarme, LogEvento, HistoricoTermopares, Historico
import services
from datetime import datetime, timedelta
from pymodbus.client import ModbusTcpClient
import io
import socket

bp = Blueprint('routes', __name__)

# Rota: página principal
@bp.route('/')
def index():
    lista_usuarios = Usuario.query.order_by(Usuario.id).all()
    return render_template('index.html', users=lista_usuarios)

# API: login
@bp.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('usuario') or data.get('username')
    password = data.get('senha') or data.get('password')
    
    user = Usuario.query.filter_by(usuario=username).first()
    
    if user and user.senha == password:
        # --- CORREÇÃO: GRAVAR NA SESSÃO ---
        session['usuario_id'] = user.id
        session['nome'] = user.nome
        session['perfil'] = user.perfil
        
        services.registrar_evento(current_app._get_current_object(), user.nome, "LOGIN", "Login realizado")
        return jsonify({"ok": True, "nome": user.nome, "perfil": user.perfil})
    
    return jsonify({"ok": False, "erro": "Credenciais inválidas"})

# API: logout
@bp.route('/api/logout', methods=['POST'])
def logout():
    data = request.get_json()
    usuario = data.get('usuario', 'Desconhecido')
    services.registrar_evento(current_app._get_current_object(), usuario, "LOGOUT", "Logout realizado")
    return jsonify({"ok": True})

# APIs de dados
@bp.route("/api/dados")
def api_dados():
    # Busca o último registro no Banco de Dados (seguro para concorrência)
    ultimo = Historico.query.order_by(Historico.data_hora.desc()).first()
    
    if ultimo:
        return jsonify({
            "ok": True,
            "v_bat": ultimo.v_bat,
            "ghi1": ultimo.ghi1,
            "dhi": ultimo.dhi,
            "bni": ultimo.bni,
            "old": ultimo.old,
            "lwd": ultimo.lwd,
            "vento_vel": ultimo.vento_vel,
            "vento_dir": ultimo.vento_dir,
            "temp_ar": ultimo.temp_ar,
            "umidade_rel": ultimo.umidade_rel,
            "pressao_atm": ultimo.pressao_atm,
            "chuva_acum": ultimo.chuva_acum,
            "ghi2": ultimo.ghi2,
            "data_hora": ultimo.data_hora.strftime("%d/%m/%Y %H:%M:%S")
        })
    return jsonify({"ok": False, "erro": "Aguardando primeira leitura..."})

@bp.route("/api/termostatos")
def api_termostatos():
    cfg = services.carregar_config()
    ip = cfg.get('SISTEMA', 'ip_termostatos', fallback='127.0.0.1')
    porta = cfg.getint('SISTEMA', 'port_termostatos', fallback=1502)
    
    client = ModbusTcpClient(ip, port=porta)
    if not client.connect(): 
        return jsonify({"ok": False, "erro": "sem_conexao"})
    
    try:
        rr = client.read_holding_registers(address=1, count=90, slave=1)
    except:
        rr = None
        
    client.close()
    
    if rr is None or rr.isError(): 
        return jsonify({"ok": False, "erro": "erro_leitura"})
    
    return jsonify({"ok": True, "valores": rr.registers})

@bp.route("/api/termostatos/historico/<int:sensor_id>")
def api_historico_sensor(sensor_id):
    if sensor_id < 1 or sensor_id > 90: return jsonify([])
    
    uma_hora_atras = datetime.now() - timedelta(hours=1)
    registros = HistoricoTermopares.query.filter(HistoricoTermopares.data_hora >= uma_hora_atras).order_by(HistoricoTermopares.data_hora).all()

    coluna = f'tp{sensor_id}'
    resultado = []
    for reg in registros:
        val = getattr(reg, coluna)
        if val is not None:
            resultado.append({"hora": reg.data_hora.strftime("%H:%M"), "valor": val})
    return jsonify(resultado)

@bp.route("/api/status")
def api_status():
    cfg = services.carregar_config()
    
    # 1. Checa Estação
    c1 = ModbusTcpClient(cfg.get('SISTEMA', 'ip_estacao_meteo'), port=cfg.getint('SISTEMA', 'port_estacao_meteo'))
    est_ok = c1.connect()
    c1.close()
    
    # 2. Checa Termostatos/CLP
    c2 = ModbusTcpClient(cfg.get('SISTEMA', 'ip_termostatos'), port=cfg.getint('SISTEMA', 'port_termostatos'))
    term_ok = c2.connect()
    c2.close()

    # 3. Checa Roteador WiFi
    ip_rot = cfg.get('SISTEMA', 'ip_roteador', fallback='192.168.5.12')
    port_rot = cfg.getint('SISTEMA', 'port_roteador', fallback=6065)
    wifi_ok = False
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.5)
        if s.connect_ex((ip_rot, port_rot)) == 0:
            wifi_ok = True
        s.close()
    except:
        wifi_ok = False

    # 4. Checa ventilador (Modbus)
    ip_vent = cfg.get('SISTEMA', 'ip_ventilador', fallback='192.168.1.55')
    port_vent = cfg.getint('SISTEMA', 'port_ventilador', fallback=502)
    
    c_vent = ModbusTcpClient(ip_vent, port=port_vent)
    vent_ok = c_vent.connect()
    c_vent.close()
    # ------------------------------------------

    return jsonify({
        "ok": True, 
        "estacao_online": est_ok, 
        "termostatos_online": term_ok,
        "wifi_online": wifi_ok,
        "ventilador_online": vent_ok, # Estado do ventilador
        "emergencia": services.emergencia_acionada
    })
    
@bp.route("/api/status/cameras")
def api_status_cameras():
    return jsonify(services.status_cameras)

# API: configuração
@bp.route("/api/config", methods=["GET", "POST"])
def api_config_geral():
    config = services.carregar_config()

    if request.method == "POST":
        data = request.get_json()
        # Pega o usuário que está solicitando (enviado pelo JS)
        nome_usuario = data.get("usuario_solicitante") or data.get("usuario", "Desconhecido")
        
        # --- VERIFICAÇÃO DE SEGURANÇA ---
        solicitante = Usuario.query.filter_by(usuario=nome_usuario).first()
        perfil = solicitante.perfil if solicitante else 'Visualizador'

        if perfil == 'Visualizador':
             return jsonify({"ok": False, "erro": "Acesso Negado: Visualizadores não podem alterar configurações."})
        
        if perfil == 'Operador':
            # Operador não pode mexer nestas seções críticas
            if 'SISTEMA' in data:
                 return jsonify({"ok": False, "erro": "Acesso Negado: Operador não pode configurar Rede/Sistema."})
            if 'ESTACAO' in data:
                 return jsonify({"ok": False, "erro": "Acesso Negado: Operador não pode configurar Alarmes."})
            if 'TERMOSTATOS' in data:
                 return jsonify({"ok": False, "erro": "Acesso Negado: Operador não pode configurar Termostatos."})
        # -------------------------------

        alteracoes = []
        secoes = ['SISTEMA', 'ESTACAO', 'TERMOSTATOS', 'TEMPOS', 'DASHBOARD_DISPLAY']
        
        for section in secoes:
            if section.lower() in data:
                if not config.has_section(section): config.add_section(section)
                for k, v in data[section.lower()].items():
                    if v is not None:
                        novo = str(v)
                        atual = config.get(section, k, fallback="")
                        if atual != novo:
                            config.set(section, k, novo)
                            alteracoes.append(f"{k}: {atual}->{novo}")
        
        if alteracoes:
            services.salvar_config_arquivo(config)
            services.registrar_evento(current_app._get_current_object(), nome_usuario, "CONFIG", f"Alterou: {', '.join(alteracoes)}")
        
        return jsonify({"ok": True})
    else:
        return jsonify({s: dict(config.items(s)) for s in config.sections()})

@bp.route("/api/comando", methods=["POST"])
def api_comando():
    data = request.get_json()
    usuario = data.get("usuario", "Desconhecido")
    comando = data.get("comando")
    services.registrar_evento(current_app._get_current_object(), usuario, "COMANDO", f"Executou: {comando}")
    return jsonify({"ok": True})

# API: alarmes
@bp.route("/api/alarme/sirene", methods=["POST"])
def api_alarme_sirene():
    cfg = services.carregar_config()
    ip = cfg.get('SISTEMA', 'ip_termostatos')
    porta = cfg.getint('SISTEMA', 'port_termostatos')
    
    data = request.get_json()
    ligar = data.get("ativo", False)
    
    client = ModbusTcpClient(ip, port=porta)
    if client.connect():
        try:
            client.write_coil(address=0, value=ligar)
            client.close()
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"ok": False, "erro": str(e)})
    return jsonify({"ok": False, "erro": "conexao"})

@bp.route("/api/alarmes/recentes")
def api_alarmes_recentes():
    alarmes = LogAlarme.query.order_by(LogAlarme.id.desc()).limit(10).all()
    return jsonify([a.to_dict() for a in alarmes])

# API: bases heliotérmicas
@bp.route("/api/bases", methods=["GET"])
def api_get_bases():
    bases = HelioBase.query.order_by(HelioBase.id).all()
    return jsonify([b.to_dict() for b in bases])

# --- ROTAS DE GERENCIAMENTO DE BASES (HELIOSTATOS) ---

@bp.route('/api/bases', methods=['GET'])
def listar_bases():
    bases = HelioBase.query.order_by(HelioBase.nome).all()
    return jsonify([b.to_dict() for b in bases])

@bp.route('/api/bases/<int:id>', methods=['GET'])
def obter_base(id):
    base = HelioBase.query.get_or_404(id)
    return jsonify(base.to_dict())

@bp.route('/api/bases', methods=['POST'])
def criar_base():
    data = request.get_json()
    user_nome = data.get('usuario_solicitante')
    
    # --- VERIFICAÇÃO ADMIN ---
    solicitante = Usuario.query.filter_by(usuario=user_nome).first()
    if not solicitante or solicitante.perfil != 'Administrador':
        return jsonify({"ok": False, "erro": "Acesso Negado: Apenas Administradores podem criar heliostatos."})
    # -------------------------

    try:
        nova_base = HelioBase(
            nome=data.get('nome'),
            ip=data.get('ip'),
            porta=int(data.get('porta', 502)),
            alpha=data.get('alpha'),
            beta=data.get('beta'),
            theta=data.get('theta')
        )
        db.session.add(nova_base)
        db.session.commit()
        return jsonify({"ok": True, "id": nova_base.id})
    except Exception as e:
        return jsonify({"ok": False, "erro": str(e)})

@bp.route('/api/bases/<int:id>', methods=['PUT'])
def atualizar_base(id):
    data = request.get_json()
    user_nome = data.get('usuario_solicitante')

    # --- VERIFICAÇÃO ADMIN ---
    solicitante = Usuario.query.filter_by(usuario=user_nome).first()
    if not solicitante or solicitante.perfil != 'Administrador':
        return jsonify({"ok": False, "erro": "Acesso Negado: Apenas Administradores podem editar heliostatos."})
    # -------------------------

    base = HelioBase.query.get_or_404(id)
    try:
        base.nome = data.get('nome')
        base.ip = data.get('ip')
        base.porta = int(data.get('porta', 502))
        base.alpha = data.get('alpha')
        base.beta = data.get('beta')
        base.theta = data.get('theta')
        
        db.session.commit()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "erro": str(e)})

@bp.route('/api/bases/<int:id>', methods=['DELETE'])
def deletar_base(id):
    # Usuário vem via Query String no DELETE
    user_nome = request.args.get('usuario_solicitante')
    
    # --- VERIFICAÇÃO ADMIN ---
    solicitante = Usuario.query.filter_by(usuario=user_nome).first()
    if not solicitante or solicitante.perfil != 'Administrador':
        return jsonify({"ok": False, "erro": "Acesso Negado: Apenas Administradores podem excluir heliostatos."})
    # -------------------------

    base = HelioBase.query.get_or_404(id)
    try:
        db.session.delete(base)
        db.session.commit()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "erro": str(e)})
    
# API: usuários (listar/criar)
@bp.route('/api/users', methods=['GET'])
def get_users():
    users = Usuario.query.all()
    return jsonify([u.to_dict() for u in users])

@bp.route('/api/users', methods=['POST'])
def create_user():
    data = request.get_json()
    admin_user = data.get("admin_user", "Sistema")
    if Usuario.query.filter_by(usuario=data['usuario']).first():
        return jsonify({'ok': False, 'erro': 'Usuário já existe'})
    novo = Usuario(nome=data['nome'], usuario=data['usuario'], email=data.get('email'), senha=data['senha'], perfil=data['perfil'])
    db.session.add(novo)
    db.session.commit()
    services.registrar_evento(current_app._get_current_object(), admin_user, "USUARIOS", f"Criou usuário: {novo.usuario}")
    return jsonify({'ok': True})

# API: usuários (editar)
@bp.route('/api/users/<int:user_id>', methods=['PUT'])
def update_user(user_id):
    data = request.get_json()
    admin_user = data.get("admin_user", "Sistema")
    u = Usuario.query.get(user_id)
    if not u: return jsonify({'ok': False, 'erro': 'Não encontrado'})
    
    # 1. Atualiza Nome e Perfil
    u.nome = data['nome']
    u.perfil = data['perfil']
    u.email = data.get('email')
    
    # 2. Atualiza Usuário (Login) com verificação de duplicidade
    novo_usuario = data.get('usuario')
    if novo_usuario and novo_usuario != u.usuario:
        existente = Usuario.query.filter_by(usuario=novo_usuario).first()
        if existente:
            return jsonify({'ok': False, 'erro': 'Este nome de usuário já está em uso.'})
        u.usuario = novo_usuario # LINHA QUE FALTAVA!

    # 3. Atualiza Senha (se vier preenchida)
    if data.get('senha'): 
        u.senha = data['senha']
    
    db.session.commit()
    services.registrar_evento(current_app._get_current_object(), admin_user, "USUARIOS", f"Editou usuário: {u.usuario}")
    return jsonify({'ok': True})

@bp.route('/api/users/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    admin_user = request.args.get("usuario", "Sistema")
    u = Usuario.query.get(user_id)
    if u:
        nome = u.usuario
        db.session.delete(u)
        db.session.commit()
        services.registrar_evento(current_app._get_current_object(), admin_user, "USUARIOS", f"Apagou usuário: {nome}")
        return jsonify({'ok': True})
    return jsonify({'ok': False})

# API: relatórios
@bp.route("/api/relatorios/gerar", methods=["POST"])
def api_gerar_relatorio_tela():
    data = request.get_json()
    tipo = data.get('tipo')
    dt_inicio = datetime.strptime(data.get('inicio'), "%Y-%m-%dT%H:%M")
    dt_fim = datetime.strptime(data.get('fim'), "%Y-%m-%dT%H:%M")
    filtros = data.get('filtros', [])
    
    resultado = []
    if tipo == 'events':
        query = LogEvento.query.filter(LogEvento.data_hora.between(dt_inicio, dt_fim))
        if filtros: query = query.filter(LogEvento.tipo_evento.in_(filtros))
        regs = query.order_by(LogEvento.data_hora.desc()).all()
        for r in regs: resultado.append({"Data": r.data_hora.strftime("%d/%m/%Y %H:%M"), "Usuário": r.usuario, "Evento": r.tipo_evento, "Detalhes": r.detalhes})
    elif tipo == 'alarms':
        regs = LogAlarme.query.filter(LogAlarme.data_hora.between(dt_inicio, dt_fim)).order_by(LogAlarme.data_hora.desc()).all()
        for r in regs: resultado.append({"Data": r.data_hora.strftime("%d/%m/%Y %H:%M"), "Categoria": r.categoria, "Mensagem": r.mensagem})
    return jsonify(resultado)

@bp.route("/api/relatorios/exportar/csv", methods=["POST"])
def api_exportar_csv():
    data = request.get_json()
    try:
        dt_inicio = datetime.strptime(data.get('inicio'), "%Y-%m-%dT%H:%M")
        dt_fim = datetime.strptime(data.get('fim'), "%Y-%m-%dT%H:%M")
        csv_content = services.gerar_conteudo_csv(data.get('tipo'), dt_inicio, dt_fim, data.get('filtros', []))
        
        output = io.BytesIO()
        output.write(b'\xef\xbb\xbf')
        output.write(csv_content.encode('utf-8'))
        output.seek(0)
        return Response(output, mimetype="text/csv", headers={"Content-Disposition": "attachment;filename=relatorio.csv"})
    except Exception as e:
        return jsonify({"ok": False, "erro": str(e)})

@bp.route("/api/relatorios/exportar/pdf", methods=["POST"])
def api_exportar_pdf():
    data = request.get_json()
    try:
        dt_inicio = datetime.strptime(data.get('inicio'), "%Y-%m-%dT%H:%M")
        dt_fim = datetime.strptime(data.get('fim'), "%Y-%m-%dT%H:%M")
        pdf_file = services.gerar_arquivo_pdf(data.get('tipo'), dt_inicio, dt_fim, data.get('filtros', []), "Administrador")
        return Response(pdf_file, mimetype="application/pdf", headers={"Content-Disposition": f"attachment;filename=relatorio.pdf"})
    except Exception as e:
        print(f"ERRO PDF: {e}")
        return jsonify({"ok": False, "erro": str(e)}), 500

# Video feed
@bp.route('/video_feed_1')
def video_feed_1():
    mime = 'multipart/x-mixed-replace; boundary=frame'
    return Response(services.gerar_frames_camera_generico(1), mimetype=mime)

@bp.route('/video_feed_2')
def video_feed_2():
    mime = 'multipart/x-mixed-replace; boundary=frame'
    return Response(services.gerar_frames_camera_generico(2), mimetype=mime)
    
@bp.route("/api/termostatos/replay")
def api_termostatos_replay():
    # Período de consulta (padrão: 1h)
    periodo = request.args.get('periodo', '1h')
    agora = datetime.now()
    
    if periodo == '12h':
        inicio = agora - timedelta(hours=12)
    elif periodo == '24h': # Caso queira adicionar depois
        inicio = agora - timedelta(hours=24)
    elif periodo == 'hoje':
        inicio = agora.replace(hour=0, minute=0, second=0, microsecond=0)
    elif periodo == '30d':
        inicio = agora - timedelta(days=30)
    else: # '1h' ou padrão
        inicio = agora - timedelta(hours=1)

    # Busca registros ordenados por data (antigo->novo)
    registros = HistoricoTermopares.query\
        .filter(HistoricoTermopares.data_hora >= inicio)\
        .order_by(HistoricoTermopares.data_hora.asc())\
        .all()

    frames = []
    for reg in registros:
        # Monta lista com 90 valores (termopares)
        temps = []
        for i in range(1, 91):
            val = getattr(reg, f'tp{i}')
            temps.append(val if val is not None else 0)
            
        frames.append({
            "hora": reg.data_hora.strftime("%d/%m %H:%M"), # Inclui dia/mês para períodos longos
            "valores": temps
        })
        
    return jsonify(frames)

# API: config raw (avançado)
@bp.route("/api/admin/config/raw", methods=["GET", "POST"])
def api_config_raw():
    try:
        # Se for para salvar
        if request.method == "POST":
            data = request.get_json()
            novo_conteudo = data.get('conteudo')
            usuario = data.get('usuario', 'Admin Secreto')
            
            # Sobrescreve o arquivo heliot.config
            with open(services.CONFIG_FILE, 'w') as f:
                f.write(novo_conteudo)
            
            # Registra no log que alguém mexeu no núcleo
            services.registrar_evento(current_app._get_current_object(), usuario, "SISTEMA", "Edição Manual do Arquivo de Configuração")
            return jsonify({"ok": True})
            
        # Se for para ler
        else:
            with open(services.CONFIG_FILE, 'r') as f:
                conteudo = f.read()
            return jsonify({"ok": True, "conteudo": conteudo})
            
    except Exception as e:
        return jsonify({"ok": False, "erro": str(e)})
    

@bp.route('/api/ventilador', methods=['GET'])
def api_get_ventilador():
    dados = services.ler_dados_ventilador()
    return jsonify(dados)

@bp.route('/api/ventilador/comando', methods=['POST'])
def api_post_ventilador():
    data = request.get_json()
    user_nome = data.get('usuario_solicitante')
    tipo = data.get('tipo')   
    valor = data.get('valor') 

    # --- VERIFICAÇÃO ---
    solicitante = Usuario.query.filter_by(usuario=user_nome).first()
    perfil = solicitante.perfil if solicitante else 'Visualizador'

    if perfil == 'Visualizador':
        return jsonify({"ok": False, "erro": "Acesso Negado: Apenas visualização."})

    # Regra: Operador não altera modo de controle
    if perfil == 'Operador' and tipo == 'modo': 
         return jsonify({"ok": False, "erro": "Acesso Negado: Operador não pode alterar modo de controle."})
    # -------------------
        
    if services.escrever_comando_ventilador(tipo, valor):
        return jsonify({"ok": True})
    else:
        return jsonify({"ok": False, "erro": "Falha na comunicação Modbus"})
    

@bp.route('/api/heliostatos/status_geral', methods=['GET'])
def api_status_heliostatos():
    """Retorna status resumido COM LEITURA REAL para pintar o grid corretamente"""
    bases = HelioBase.query.all()
    lista = {}
    
    for b in bases:
        try:
            # Extrai o ID do nome (ex: "Base 1" -> 1)
            num_str = ''.join(filter(str.isdigit, b.nome))
            if num_str:
                num = int(num_str)
                
                # --- A MÁGICA ACONTECE AQUI ---
                # Chamamos a função que vai lá no ESP32/Simulador e pergunta: "E aí?"
                # Isso preenche 'online', 'status_code' (0 ou 1) e 'status'
                dados_reais = services.ler_dados_heliostato(num)
                
                lista[num] = {
                    "configurado": True,
                    "ip": b.ip,
                    # Agora estamos enviando os dados que faltavam!
                    "online": dados_reais['online'],         
                    "status_code": dados_reais['status_code'], 
                    "status": dados_reais['status']          
                }
        except Exception as e:
            print(f"Erro ao processar base {b.nome}: {e}")
            pass
            
    return jsonify(lista)

@bp.route('/api/heliostato/<id_helio>', methods=['GET'])
def api_detalhe_heliostato(id_helio):
    """Lê Modbus para o Popup"""
    dados = services.ler_dados_heliostato(id_helio)
    return jsonify(dados)

@bp.route('/api/heliostato/<id_helio>/comando', methods=['POST'])
def api_comando_heliostato(id_helio):
    data = request.get_json()
    tipo = data.get('tipo')
    valores = data.get('valores')
    res = services.enviar_comando_heliostato(id_helio, tipo, valores)
    return jsonify(res)

    # --- NOVAS ROTAS DE CONFIGURAÇÃO ---

# 1. Salvar limites de alarme da Estação
@bp.route('/api/config/limites/salvar', methods=['POST'])
def api_salvar_limites_clima():
    # Segurança: Apenas Admins
    if session.get('perfil') != 'Administrador':
        return jsonify({'ok': False, 'erro': 'Acesso Negado: Apenas administradores.'}), 403

    try:
        data = request.get_json()
        key = data.get('key')
        v_min = data.get('min')
        v_max = data.get('max')
        
        if not key: return jsonify({'ok': False, 'erro': 'Chave inválida'}), 400
        
        config = services.carregar_config()
        if not config.has_section('ESTACAO'):
            config.add_section('ESTACAO')
            
        if v_min is not None: config.set('ESTACAO', f'{key}_min', str(v_min))
        else: config.remove_option('ESTACAO', f'{key}_min')

        if v_max is not None: config.set('ESTACAO', f'{key}_max', str(v_max))
        else: config.remove_option('ESTACAO', f'{key}_max')
        
        # --- CORREÇÃO DO NOME DA FUNÇÃO ---
        services.salvar_config_arquivo(config)
        
        return jsonify({'ok': True})

    except Exception as e:
        return jsonify({'ok': False, 'erro': str(e)}), 500


# 2. Salvar Configurações Gerais (Tela Sistema)
@bp.route('/api/config/salvar', methods=['POST'])
def api_salvar_config_geral():
    if session.get('perfil') != 'Administrador':
        return jsonify({'ok': False, 'erro': 'Acesso Negado: Apenas administradores.'}), 403

    data = request.get_json()
    tempo_estacao = data.get('tempo_estacao')
    tempo_term = data.get('tempo_termostatos')
    
    try:
        config = services.carregar_config()
        
        if tempo_estacao:
            config.set('TEMPOS', 'intervalo_gravacao_estacao_segundos', str(tempo_estacao))
        if tempo_term:
            config.set('TEMPOS', 'intervalo_gravacao_termostatos_minutos', str(tempo_term))
            
        # --- CORREÇÃO DO NOME DA FUNÇÃO ---
        services.salvar_config_arquivo(config)
        
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'erro': str(e)})

# Buscar limites atuais (Para preencher o modal da engrenagem)
@bp.route('/api/config/limites/<key>')
def api_get_limites_clima(key):
    config = services.carregar_config()
    v_min = config.getfloat('ESTACAO', f'{key}_min', fallback=None)
    v_max = config.getfloat('ESTACAO', f'{key}_max', fallback=None)
    return jsonify({'ok': True, 'min': v_min, 'max': v_max})

