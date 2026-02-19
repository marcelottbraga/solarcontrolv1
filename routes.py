from flask import Blueprint, render_template, request, jsonify, Response, current_app, session
from extensions import db
from models import Usuario, HeliostatoCadastro, HeliostatoOperacao, LogAlarme, LogEvento, HistoricoTermopares, Historico
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

@bp.route('/api/dados')
def api_dados_atualizados():
    # Opção 1: Tenta ler fresco agora mesmo
    # Isso garante que o dado na tela é o real instantâneo
    dados_frescos = services.ler_dados_estacao()
    
    if dados_frescos:
        dados_frescos['ok'] = True
        return jsonify(dados_frescos)
    
    # Opção 2: Se a leitura falhar (ocupado/timeout), pega o último cache da memória
    # (Ainda é melhor que ler do banco de dados)
    cache = services.get_dados_estacao()
    
    if cache:
        return jsonify(cache)
        
    # Opção 3: Se tudo falhar
    return jsonify({
        "ok": False, 
        "erro": f"Leitura falhou. Motivo: {services.ultimo_erro_interno}"
    })

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
        nome_usuario = data.get("usuario_solicitante") or data.get("usuario", "Desconhecido")
        
        # --- 1. VERIFICAÇÃO DE SEGURANÇA ---
        solicitante = Usuario.query.filter_by(usuario=nome_usuario).first()
        perfil = solicitante.perfil if solicitante else 'Visualizador'

        if perfil == 'Visualizador':
             return jsonify({"ok": False, "erro": "Acesso Negado: Visualizadores não podem alterar configurações."})
        
        if perfil == 'Operador':
            # Bloqueios específicos de operador
            if 'SISTEMA' in data or 'sistema' in data:
                 return jsonify({"ok": False, "erro": "Acesso Negado: Operador não pode configurar Rede/Sistema."})
            if 'ESTACAO' in data or 'estacao' in data:
                 return jsonify({"ok": False, "erro": "Acesso Negado: Operador não pode configurar Alarmes."})
        # -----------------------------------

        alteracoes = []
        # Lista de seções permitidas
        secoes = ['SISTEMA', 'ESTACAO', 'TERMOSTATOS', 'TEMPOS', 'DASHBOARD_DISPLAY']
        
        for section in secoes:
            # --- CORREÇÃO AQUI: Tenta pegar MAIÚSCULO (novo JS) ou minúsculo (compatibilidade) ---
            dados_secao = data.get(section) or data.get(section.lower())
            
            if dados_secao:
                if not config.has_section(section): config.add_section(section)
                for k, v in dados_secao.items():
                    if v is not None:
                        novo = str(v)
                        atual = config.get(section, k, fallback="")
                        if atual != novo:
                            config.set(section, k, novo)
                            alteracoes.append(f"{k}: {atual}->{novo}")
        
        # Só salva se houve alterações ou se for forçado (para garantir)
        if alteracoes or data: 
            services.salvar_config_arquivo(config)
            services.registrar_evento(current_app._get_current_object(), nome_usuario, "CONFIG", f"Alterou: {', '.join(alteracoes)}")
            print(f"--> Configurações salvas por {nome_usuario}. Alterações: {len(alteracoes)}")
        
        return jsonify({"ok": True})
    else:
        # GET: Retorna o arquivo atual
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
# --- ROTAS DE GERENCIAMENTO DE HELIOSTATOS ---

@bp.route('/api/bases', methods=['GET'])
def listar_bases():
    bases = HeliostatoCadastro.query.order_by(HeliostatoCadastro.numero).all()
    # Retorna o dicionário construído manualmente com as novas colunas
    return jsonify([{
        "numero": b.numero,
        "ip": b.ip,
        "porta": b.porta,
        "posicao": b.posicao,
        "theta": b.theta,
        "phi": b.phi,
        "taxa_atualizacao": b.taxa_atualizacao
    } for b in bases])

@bp.route('/api/bases/<int:numero>', methods=['GET'])
def obter_base(numero):
    b = HeliostatoCadastro.query.get_or_404(numero)
    return jsonify({
        "numero": b.numero, "ip": b.ip, "porta": b.porta, 
        "posicao": b.posicao, "theta": b.theta, "phi": b.phi, 
        "taxa_atualizacao": b.taxa_atualizacao
    })

@bp.route('/api/bases', methods=['POST'])
def criar_base():
    data = request.get_json()
    user_nome = data.get('usuario_solicitante')
    
    solicitante = Usuario.query.filter_by(usuario=user_nome).first()
    if not solicitante or solicitante.perfil != 'Administrador':
        return jsonify({"ok": False, "erro": "Acesso Negado: Apenas Administradores podem criar heliostatos."})

    try:
        nova_base = HeliostatoCadastro(
            numero=int(data.get('numero')),
            ip=data.get('ip'),
            porta=int(data.get('porta', 502)),
            posicao=int(data.get('posicao')) if data.get('posicao') else None,
            theta=float(data.get('theta', 0.0)),
            phi=float(data.get('phi', 0.0)),
            taxa_atualizacao=int(data.get('taxa_atualizacao', 5))
        )
        db.session.add(nova_base)
        db.session.commit()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "erro": str(e)})

@bp.route('/api/bases/<int:numero>', methods=['PUT'])
def atualizar_base(numero):
    data = request.get_json()
    user_nome = data.get('usuario_solicitante')

    solicitante = Usuario.query.filter_by(usuario=user_nome).first()
    if not solicitante or solicitante.perfil != 'Administrador':
        return jsonify({"ok": False, "erro": "Acesso Negado."})

    base = HeliostatoCadastro.query.get_or_404(numero)
    try:
        base.ip = data.get('ip', base.ip)
        base.porta = int(data.get('porta', base.porta))
        base.posicao = int(data.get('posicao')) if data.get('posicao') else base.posicao
        base.theta = float(data.get('theta', base.theta))
        base.phi = float(data.get('phi', base.phi))
        base.taxa_atualizacao = int(data.get('taxa_atualizacao', base.taxa_atualizacao))
        
        db.session.commit()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "erro": str(e)})

@bp.route('/api/bases/<int:numero>', methods=['DELETE'])
def deletar_base(numero):
    user_nome = request.args.get('usuario_solicitante')
    
    solicitante = Usuario.query.filter_by(usuario=user_nome).first()
    if not solicitante or solicitante.perfil != 'Administrador':
        return jsonify({"ok": False, "erro": "Acesso Negado."})

    base = HeliostatoCadastro.query.get_or_404(numero)
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
    bases = HeliostatoCadastro.query.all()
    lista = {}
    
    for b in bases:
        try:
            num = b.numero
            dados_reais = services.ler_dados_heliostato(num)
            
            lista[num] = {
                "configurado": True,
                "ip": b.ip,
                "posicao": b.posicao,
                "online": dados_reais['online'],         
                "status_code": dados_reais['status_code'], 
                "status": dados_reais['status']          
            }
        except Exception as e:
            print(f"Erro ao processar base {b.numero}: {e}")
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

@bp.route('/api/config/salvar', methods=['POST'])
def api_salvar_config_geral():
    if session.get('perfil') != 'Administrador':
        return jsonify({'ok': False, 'erro': 'Acesso Negado.'}), 403

    data = request.get_json()
    try:
        config = services.carregar_config()
        
        # 1. Salva Dashboard (se vier no formato 'slots')
        if 'slots' in data:
            if not config.has_section('DASHBOARD_DISPLAY'): config.add_section('DASHBOARD_DISPLAY')
            for k, v in data['slots'].items():
                config.set('DASHBOARD_DISPLAY', k, str(v))
        
        # 2. Salva Tempos (se vier solto)
        if data.get('tempo_estacao'):
            if not config.has_section('TEMPOS'): config.add_section('TEMPOS')
            config.set('TEMPOS', 'intervalo_gravacao_estacao_segundos', str(data.get('tempo_estacao')))
            
        services.salvar_config_arquivo(config)
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'erro': str(e)})

@bp.route('/api/config/limites/salvar', methods=['POST'])
def api_salvar_limites_clima():
    # Se Operadores também puderem ajustar alarmes, mude para: 
    # if session.get('perfil') not in ['Administrador', 'Operador']:
    if session.get('perfil') != 'Administrador':
        return jsonify({'ok': False, 'erro': 'Acesso Negado.'}), 403
        
    data = request.get_json()
    key = data.get('key')
    try:
        config = services.carregar_config()
        if not config.has_section('ESTACAO'): config.add_section('ESTACAO')
            
        if data.get('min') is not None: config.set('ESTACAO', f'{key}_min', str(data['min']))
        else: config.remove_option('ESTACAO', f'{key}_min')

        if data.get('max') is not None: config.set('ESTACAO', f'{key}_max', str(data['max']))
        else: config.remove_option('ESTACAO', f'{key}_max')
        
        services.salvar_config_arquivo(config)
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'erro': str(e)})


@bp.route('/api/sessao')
def api_sessao():
    return jsonify({
        'ok': True,
        'nome': session.get('nome', 'Visitante'),
        'perfil': session.get('perfil', 'Visualizador') # Se cair a sessão, vira Visualizador
    })

# --- ROTA DE DEBUG (Adicione no final do routes.py) ---
@bp.route('/api/debug/estacao')
def api_debug_estacao():
    # Tenta ler a estação DIRETAMENTE (sem passar pelo banco)
    dados = services.ler_dados_estacao()
    
    if dados:
        # Se leu, mostra tudo (incluindo o debug_raw que você adicionou antes)
        return jsonify(dados)
    else:
        # Se falhou, mostra o motivo exato que o services.py guardou
        return jsonify({
            "ok": False, 
            "erro_real": services.ultimo_erro_interno,
            "dica": "Verifique IP, Porta e se o Simulador está rodando."
        })