import os
import time
import json
import cv2
import numpy as np
import configparser
import csv
import io
import threading
import socket
from pymodbus.constants import Endian
from pymodbus.payload import BinaryPayloadDecoder
from datetime import datetime, timedelta
from pymodbus.client import ModbusTcpClient
from sqlalchemy import or_

from extensions import db
from models import Historico, HistoricoTermopares, LogAlarme, LogEvento, HeliostatoCadastro, HeliostatoOperacao
from flask import render_template
from weasyprint import HTML

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, 'heliot.config')

ultimo_erro_interno = "Nenhum erro ainda"

status_cameras = {1: False, 2: False}
ultimo_alarme_registrado = {}
alarme_temp_ativo = False
inicio_contagem_alarme = None

# Estado global de emergência (booleano)
emergencia_acionada = False

#  --- CACHE EM MEMÓRIA ---
CACHE_MEMORIA = {
    'estacao_dados': None,
    'termostatos_valores': None,
    'status_geral': {
        'estacao_online': False, 
        'termostatos_online': False,
        'wifi_online': False,
        'ventilador_online': False,
        'emergencia': False
    },
    'heliostatos': {}
}

# --- VARIÁVEL DA MATRIZ ---
ACTIONS_FILE = os.path.join(BASE_DIR, 'actions.config')

def executar_acoes_matriz(app, gatilho):
    """
    Lê a matriz de ações e, se o gatilho coincidir com uma regra,
    dispara os comandos Modbus de proteção automaticamente em todos os heliostatos.
    """
    try:
        if not os.path.exists(ACTIONS_FILE) or os.path.getsize(ACTIONS_FILE) == 0:
            return
            
        with open(ACTIONS_FILE, 'r', encoding='utf-8') as f:
            try:
                regras = json.load(f)
            except json.JSONDecodeError:
                return 

        for regra in regras:
            if regra.get('gatilho') == gatilho:
                comando = regra.get('comando')
                print(f"\n[⚠️ MATRIZ DE SEGURANÇA] Gatilho atingido: {gatilho}")
                print(f"[🤖 AUTOMAÇÃO] Executando ação defensiva: {comando}\n")
                
                with app.app_context():
                    bases = HeliostatoCadastro.query.all()
                    
                    if comando == 'HORIZ':
                        valores = {'alpha': 11.0, 'beta': 0.0}
                    elif comando == 'VERT':
                        valores = {'alpha': 90.0, 'beta': 180.0}
                    else:
                        continue 
                        
                    for b in bases:
                        enviar_comando_heliostato(b.numero, 'manual', valores)
                    
                    registrar_evento(app, "SISTEMA (Automação)", "COMANDO", f"Gatilho de segurança [{gatilho}] disparou o comando em lote [{comando}]")
                    
    except Exception as e:
        print(f"Erro ao executar matriz de ações: {e}")

# Configuração e utilitários

def carregar_config():
    config = configparser.ConfigParser()
    dataset = config.read(CONFIG_FILE)
    if not dataset: 
        print(f"AVISO: {CONFIG_FILE} não encontrado! Usando padrões.")
    return config

def salvar_config_arquivo(config):
    try:
        with open(CONFIG_FILE, 'w') as f:
            config.write(f)
            f.flush()
            os.fsync(f.fileno())
    except Exception as e:
        print(f"ERRO AO SALVAR CONFIG: {e}")
        raise e

def registrar_evento(app_instance, usuario, tipo, detalhes):
    try:
        if hasattr(app_instance, 'app_context'):
            context = app_instance.app_context()
        else:
            context = app_instance 

        with context:
            novo_log = LogEvento(
                usuario=usuario,
                tipo_evento=tipo,
                detalhes=detalhes,
                data_hora=datetime.now()
            )
            db.session.add(novo_log)
            db.session.commit()
            print(f"[LOG AUDITORIA] {tipo}: {detalhes}")
    except Exception as e:
        print(f"Erro ao gravar log de auditoria: {e}")

# Leitura Modbus (estação)

def ler_dados_estacao(app=None):
    config = carregar_config()
    ip = config.get('SISTEMA', 'ip_estacao_meteo', fallback='143.107.188.66')
    porta = config.getint('SISTEMA', 'port_estacao_meteo', fallback=502)
    slave_id = 1  
    
    client = ModbusTcpClient(ip, port=porta, timeout=1)
    dados = {}
    
    if client.connect():
        try:
            rr = client.read_holding_registers(address=0, count=28, slave=slave_id)
            
            if not rr.isError():
                decoder = BinaryPayloadDecoder.fromRegisters(rr.registers, byteorder=Endian.Big, wordorder=Endian.Big)
                
                dados = {
                    'v_bat': round(decoder.decode_32bit_float(), 2),       
                    'ghi1': round(decoder.decode_32bit_float(), 2),        
                    'dhi': round(decoder.decode_32bit_float(), 2),         
                    'bni': round(decoder.decode_32bit_float(), 2),         
                    'old': round(decoder.decode_32bit_float(), 2),         
                    'lwd': round(decoder.decode_32bit_float(), 2),         
                    'vento_vel': round(decoder.decode_32bit_float(), 2),   
                    'vento_dir': round(decoder.decode_32bit_float(), 2),   
                    'temp_ar': round(decoder.decode_32bit_float(), 2),     
                    'umidade_rel': round(decoder.decode_32bit_float(), 2), 
                    'pressao_atm': round(decoder.decode_32bit_float(), 2), 
                    'chuva_acum': round(decoder.decode_32bit_float(), 2),  
                    'cell_irrad': round(decoder.decode_32bit_float(), 2),  
                    'cell_temp': round(decoder.decode_32bit_float(), 2)    
                }
                dados['debug_raw'] = rr.registers
                checar_limites_estacao(dados, config, app)
            else:
                print(f"[ERRO MODBUS] Falha leitura Estação: {rr}")
                
            client.close()
            return dados
        except Exception as e:
            global ultimo_erro_interno
            ultimo_erro_interno = str(e)  
            print(f"Erro leitura: {e}")
            return None
    else:
        print(f"[ERRO CONEXAO] Não foi possível conectar em {ip}:{porta}")
    return None

def checar_limites_estacao(dados, config, app=None):
    global ultimo_alarme_registrado
    
    # Nomes alinhados milimetricamente com o Frontend para a Matriz funcionar
    mapa = {
        'v_bat': ('v_bat', 'Bateria'),
        'ghi1': ('ghi1', 'GHI 1 (Global)'),
        'dhi': ('dhi', 'DHI (Difusa)'),
        'bni': ('bni', 'BNI (Direta)'),
        'old': ('old', 'OLD (Onda Longa Emit.)'),
        'lwd': ('lwd', 'LWD (Onda Longa Desc.)'),
        'vento_vel': ('vento_vel', 'Vel. Vento'),
        'vento_dir': ('vento_dir', 'Dir. Vento'),
        'temp_ar': ('temp_ar', 'Temp. Ar'),
        'umidade_rel': ('umidade_rel', 'Umidade Rel.'),
        'pressao_atm': ('pressao_atm', 'Pressão Atm.'),
        'chuva_acum': ('chuva_acum', 'Chuva Acum.'),
        'cell_irrad': ('cell_irrad', 'Cell_Irrad'),
        'cell_temp': ('cell_temp', 'Cell_Temp (Célula)')  
    }

    try:
        secao = 'ESTACAO'
        if not config.has_section(secao): return

        for chave_dados, (chave_cfg, nome_legivel) in mapa.items():
            valor = dados.get(chave_dados)
            if valor is None: continue

            limite_min = config.getfloat(secao, f'{chave_cfg}_min', fallback=None)
            limite_max = config.getfloat(secao, f'{chave_cfg}_max', fallback=None)

            msg_alarme = None
            gatilho_disparado = None
            
            if limite_min is not None and valor < limite_min:
                msg_alarme = f"{nome_legivel} Baixo ({valor} < {limite_min})"
                gatilho_disparado = f"{nome_legivel} Baixo"
            elif limite_max is not None and valor > limite_max:
                msg_alarme = f"{nome_legivel} Alto ({valor} > {limite_max})"
                gatilho_disparado = f"{nome_legivel} Alto"

            if msg_alarme:
                ultimo = ultimo_alarme_registrado.get(chave_dados)
                agora = datetime.now()
                
                if not ultimo or (agora - ultimo['tempo']).total_seconds() > 60 or ultimo['msg'] != msg_alarme:
                    
                    if app: # Só grava no banco se o contexto existir
                        with app.app_context():
                            novo_alarme = LogAlarme(categoria="Clima", mensagem=msg_alarme, data_hora=agora)
                            db.session.add(novo_alarme)
                            db.session.commit()
                            
                    ultimo_alarme_registrado[chave_dados] = {'tempo': agora, 'msg': msg_alarme}
                    print(f"[ALARME CLIMA] {msg_alarme}")
                    
                    # --- A MÁGICA ACONTECE AQUI: DISPARA A AUTOMAÇÃO ---
                    if app and gatilho_disparado:
                        executar_acoes_matriz(app, gatilho_disparado)

    except Exception as e:
        print(f"Erro ao checar limites: {e}")


# Threads: gravação e monitoramento

def loop_gravacao_estacao(app):
    while True:
        with app.app_context():
            try:
                dados = ler_dados_estacao(app) # <-- Agora passa o 'app'
                if dados:
                    h = Historico(
                        v_bat=dados.get('v_bat'),
                        ghi1=dados.get('ghi1'),
                        dhi=dados.get('dhi'),
                        bni=dados.get('bni'),
                        old=dados.get('old'),
                        lwd=dados.get('lwd'),
                        vento_vel=dados.get('vento_vel'),
                        vento_dir=dados.get('vento_dir'),
                        temp_ar=dados.get('temp_ar'),
                        umidade_rel=dados.get('umidade_rel'),
                        pressao_atm=dados.get('pressao_atm'),
                        chuva_acum=dados.get('chuva_acum'),
                        cell_irrad=dados.get('cell_irrad'),
                        cell_temp=dados.get('cell_temp'),
                        data_hora=datetime.now()
                    )
                    db.session.add(h)
                    db.session.commit()
                    
            except Exception as e:
                print(f"Erro thread estação: {e}")
        
        cfg = carregar_config()
        intervalo = cfg.getint('TEMPOS', 'intervalo_gravacao_estacao_segundos', fallback=60)
        if intervalo < 1: 
            intervalo = 60
        time.sleep(intervalo)


def calcular_maior_hotspot(estado_critico_sensores, linhas=10, colunas=9):

    if not any(estado_critico_sensores):
        return 0

    visitados = set()
    maior_cluster = 0
    
    # Movimentos possíveis: Cima, Baixo, Esquerda, Direita e as 4 Diagonais
    direcoes = [(0, 1), (1, 0), (0, -1), (-1, 0), (1, 1), (1, -1), (-1, 1), (-1, -1)]

    for r in range(linhas):
        for c in range(colunas):
            idx = r * colunas + c
            
            # Prevenção de erro caso a lista seja menor que a grelha
            if idx >= len(estado_critico_sensores):
                break 

            if estado_critico_sensores[idx] and idx not in visitados:
                # Inicia a procura (DFS) a partir deste sensor crítico
                tamanho_atual = 0
                pilha = [(r, c)]
                visitados.add(idx)

                while pilha:
                    curr_r, curr_c = pilha.pop()
                    tamanho_atual += 1

                    for dr, dc in direcoes:
                        nr, nc = curr_r + dr, curr_c + dc
                        
                        # Se o vizinho está dentro dos limites da grelha
                        if 0 <= nr < linhas and 0 <= nc < colunas:
                            n_idx = nr * colunas + nc
                            
                            # Se o vizinho também está crítico e ainda não foi visitado
                            if n_idx < len(estado_critico_sensores) and estado_critico_sensores[n_idx] and n_idx not in visitados:
                                visitados.add(n_idx)
                                pilha.append((nr, nc))

                if tamanho_atual > maior_cluster:
                    maior_cluster = tamanho_atual

    return maior_cluster

#  Loop Unificado: Monitora Emergência + Grava Histórico
def loop_termostatos_e_emergencia(app):
    global emergencia_acionada, alarme_temp_ativo, inicio_contagem_alarme
    ultimo_historico = 0  
    
    while True:
        with app.app_context():
            try:
                cfg = carregar_config()
                ip = cfg.get('SISTEMA', 'ip_termostatos', fallback='172.18.0.1')
                porta = cfg.getint('SISTEMA', 'port_termostatos', fallback=503)
                
                intervalo_gravacao = cfg.getint('TEMPOS', 'intervalo_gravacao_termostatos_segundos', fallback=30)
                if intervalo_gravacao < 1: 
                    intervalo_gravacao = 30
                
                client = ModbusTcpClient(ip, port=porta, timeout=1)
                if client.connect():
                    # --- 1. EMERGÊNCIA (Botão Físico) ---
                    rr_input = client.read_discrete_inputs(address=0, count=1, slave=1)
                    if rr_input.isError():
                        rr_input = client.read_coils(address=0, count=1, slave=1)
                    if not rr_input.isError():
                        estado_atual = bool(rr_input.bits[0])
                        if estado_atual and not emergencia_acionada:
                            emergencia_acionada = True
                            db.session.add(LogAlarme(categoria="SEGURANÇA", mensagem="EMERGÊNCIA EXTERNA ACIONADA", data_hora=datetime.now()))
                            db.session.commit()
                            
                            # --- A MÁGICA: DISPARA AUTOMAÇÃO ---
                            executar_acoes_matriz(app, "EMERGÊNCIA EXTERNA!")
                            
                        elif not estado_atual:
                            emergencia_acionada = False

                    # --- 2. LÓGICA DE ALARME (HOTSPOT ADJACENTE) E GRAVAÇÃO ---
                    rr_regs = client.read_holding_registers(address=0, count=90, slave=1)
                    
                    if not rr_regs.isError():
                        regs = rr_regs.registers
                        dados_term = {f'tp{i+1}': round(regs[i] / 10.0, 1) for i in range(90)}
                        
                        CACHE_MEMORIA['termostatos_valores'] = [round(v / 10.0, 1) for v in regs]
                        
                        agora_ts = time.time()
                        agora_dt = datetime.now()

                        # Gravação Histórica
                        if (agora_ts - ultimo_historico) >= intervalo_gravacao:
                            dados_hist = dados_term.copy()
                            dados_hist['data_hora'] = agora_dt
                            db.session.add(HistoricoTermopares(**dados_hist))
                            db.session.commit()
                            ultimo_historico = agora_ts

                        # ==========================================
                        # AVALIAÇÃO DE HOTSPOT E MATRIZ
                        # ==========================================
                        t_max = cfg.getfloat('TERMOSTATOS', 'temp_max', fallback=100.0)
                        t_min = cfg.getfloat('TERMOSTATOS', 'temp_min', fallback=0.0)
                        t_ativa_min = cfg.getboolean('TERMOSTATOS', 'toggle_ativa_min', fallback=False)
                        tolerancia = cfg.getint('TERMOSTATOS', 'num_sensores_alarm', fallback=6)
                        
                        grid_linhas = cfg.getint('TERMOSTATOS', 'grid_linhas', fallback=10)
                        grid_colunas = cfg.getint('TERMOSTATOS', 'grid_colunas', fallback=9)

                        estado_critico_sensores = []
                        for i in range(90):
                            val = dados_term[f'tp{i+1}']
                            is_critico = (val > t_max) or (t_ativa_min and val < t_min)
                            estado_critico_sensores.append(is_critico)

                        maior_hotspot = calcular_maior_hotspot(estado_critico_sensores, grid_linhas, grid_colunas)

                        if maior_hotspot > tolerancia:
                            if not alarme_temp_ativo:
                                if inicio_contagem_alarme is None:
                                    inicio_contagem_alarme = agora_ts
                                    print(f"[AGUARDANDO ESTABILIZAÇÃO] Condição crítica detetada ({maior_hotspot} sensores adjacentes). Aguardando 4s...")

                                elif (agora_ts - inicio_contagem_alarme) >= 4:
                                    alarme_temp_ativo = True
                                    inicio_contagem_alarme = None 
                                    
                                    dados_alarme = dados_term.copy()
                                    dados_alarme['data_hora'] = agora_dt
                                    db.session.add(HistoricoTermopares(**dados_alarme))
                                    
                                    db.session.add(LogAlarme(
                                        categoria="TERMOSTATOS", 
                                        mensagem=f"ALERTA: HOTSPOT DETETADO! {maior_hotspot} sensores adjacentes críticos (Limite: {t_max}°C)", 
                                        data_hora=agora_dt
                                    ))
                                    db.session.commit()
                                    
                                    # --- A MÁGICA: DISPARA AUTOMAÇÃO ---
                                    executar_acoes_matriz(app, "Termostatos Críticos")
                        else:
                            if alarme_temp_ativo:
                                print("[EVENTO FINALIZADO] Temperaturas normalizadas.")
                            alarme_temp_ativo = False
                            inicio_contagem_alarme = None

                    client.close()
            except Exception as e:
                print(f"Erro loop termostatos/emergencia: {e}")
                db.session.rollback()
        
        time.sleep(1)

# Câmeras (captura de frames e reconexão)

def obter_frame_erro():
    # Retorna imagem substituta indicando reconexão
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    cv2.putText(img, "RECONECTANDO...", (180, 180), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
    ret, buffer = cv2.imencode('.jpg', img)
    return buffer.tobytes()

def gerar_frames_camera_generico(id_camera):
    global status_cameras
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"
    
    while True:
        cfg = carregar_config()
        if id_camera == 1: 
            ip = cfg.get('SISTEMA', 'ip_cam1', fallback='192.168.1.168')
        else: 
            ip = cfg.get('SISTEMA', 'ip_cam2', fallback='192.168.1.167')
            
        rtsp_url = f"rtsp://admin:metalwize2025*@{ip}:554/user=admin&password=metalwize2025*&channel=1&stream=0.sdp"
        camera = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)

        if not camera.isOpened():
            status_cameras[id_camera] = False
            yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + obter_frame_erro() + b'\r\n')
            time.sleep(5)
            continue

        status_cameras[id_camera] = True
        while True:
            success, frame = camera.read()
            if not success:
                status_cameras[id_camera] = False
                break
            
            ret, buffer = cv2.imencode('.jpg', frame)
            frame_bytes = buffer.tobytes()
            yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
        camera.release()

# Geração de relatórios (CSV/PDF)

def gerar_conteudo_csv(tipo, dt_inicio, dt_fim, filtros):
    si = io.StringIO()
    si.write("sep=;\n") 
    
    writer = csv.writer(si, delimiter=';', quoting=csv.QUOTE_MINIMAL)

    if tipo == 'events':
        writer.writerow(['Data/Hora', 'Usuario', 'Evento', 'Detalhes'])
        query = LogEvento.query.filter(LogEvento.data_hora.between(dt_inicio, dt_fim))
        if filtros: query = query.filter(LogEvento.tipo_evento.in_(filtros))
        registros = query.order_by(LogEvento.data_hora.desc()).all()
        for r in registros:
            writer.writerow([r.data_hora.strftime("%d/%m/%Y %H:%M:%S"), r.usuario, r.tipo_evento, r.detalhes])

    elif tipo == 'alarms':
        writer.writerow(['Data/Hora', 'Categoria', 'Mensagem'])
        registros = LogAlarme.query.filter(LogAlarme.data_hora.between(dt_inicio, dt_fim)).order_by(LogAlarme.data_hora.desc()).all()
        for r in registros:
            writer.writerow([r.data_hora.strftime("%d/%m/%Y %H:%M:%S"), r.categoria, r.mensagem])

    elif tipo == 'weather':
        writer.writerow([
            'Data/Hora', 'Bateria (V)', 'GHI1 (W/m2)', 'DHI (W/m2)', 'BNI (W/m2)', 
            'OLD (W/m2)', 'LWD (W/m2)', 'Vento Vel. (m/s)', 'Vento Dir. (°)', 
            'Temp. Ar (°C)', 'Umidade Rel. (%)', 'Pressão Atm. (mbar)', 'Chuva Acum. (mm)', 
            'Cell Irrad. (W/m2)', 'Cell Temp. (°C)'
        ])
        registros = Historico.query.filter(Historico.data_hora.between(dt_inicio, dt_fim)).order_by(Historico.data_hora.desc()).all()
        for r in registros:
            def fmt(val): return str(val).replace('.', ',') if val is not None else ''
            writer.writerow([
                r.data_hora.strftime("%d/%m/%Y %H:%M:%S"),
                fmt(r.v_bat), fmt(r.ghi1), fmt(r.dhi), fmt(r.bni),
                fmt(r.old), fmt(r.lwd), fmt(r.vento_vel), fmt(r.vento_dir),
                fmt(r.temp_ar), fmt(r.umidade_rel), fmt(r.pressao_atm),
                fmt(r.chuva_acum), fmt(r.cell_irrad), fmt(r.cell_temp) # <--- AQUI
            ])

    elif tipo == 'sensors':
        header = ['Data/Hora'] + [f'TP{i}' for i in range(1, 91)]
        writer.writerow(header)
        registros = HistoricoTermopares.query.filter(HistoricoTermopares.data_hora.between(dt_inicio, dt_fim)).order_by(HistoricoTermopares.data_hora.desc()).all()
        for r in registros:
            linha = [r.data_hora.strftime("%d/%m/%Y %H:%M:%S")]
            for i in range(1, 91):
                val = getattr(r, f'tp{i}')
                linha.append(str(val).replace('.', ',') if val is not None else '')
            writer.writerow(linha)

    elif tipo == 'heliostatos':
        writer.writerow(['Data/Hora', 'Helio Nº', 'Status', 'Alpha (°)', 'Beta (°)', 'Theta (°)', 'Phi (°)'])
        query = HeliostatoOperacao.query.filter(HeliostatoOperacao.data_hora.between(dt_inicio, dt_fim))
        if filtros and 'TODOS' not in filtros:
            num_filtros = [int(f) for f in filtros if f.isdigit()]
            if num_filtros: query = query.filter(HeliostatoOperacao.numero.in_(num_filtros))
            
        registros = query.order_by(HeliostatoOperacao.data_hora.desc()).all()
        for r in registros:
            def fmt(val): return str(val).replace('.', ',') if val is not None else ''
            writer.writerow([r.data_hora.strftime("%d/%m/%Y %H:%M:%S"), r.numero, r.status, fmt(r.alpha), fmt(r.beta), fmt(r.theta), fmt(r.phi)])

    return si.getvalue()

def gerar_arquivo_pdf(tipo, dt_inicio, dt_fim, filtros, usuario_solicitante):
    titulo = "Relatório Geral"
    colunas = []
    linhas = []

    if tipo == 'events':
        titulo = "Log de Eventos (Auditoria)"
        colunas = ['Data/Hora', 'Usuário', 'Evento', 'Detalhes']
        query = LogEvento.query.filter(LogEvento.data_hora.between(dt_inicio, dt_fim))
        if filtros: query = query.filter(LogEvento.tipo_evento.in_(filtros))
        registros = query.order_by(LogEvento.data_hora.desc()).all()
        for r in registros:
            linhas.append([r.data_hora.strftime("%d/%m/%Y %H:%M:%S"), r.usuario, r.tipo_evento, r.detalhes])

    elif tipo == 'alarms':
        titulo = "Histórico de Alarmes"
        colunas = ['Data/Hora', 'Categoria', 'Mensagem']
        registros = LogAlarme.query.filter(LogAlarme.data_hora.between(dt_inicio, dt_fim)).order_by(LogAlarme.data_hora.desc()).all()
        for r in registros:
            linhas.append([r.data_hora.strftime("%d/%m/%Y %H:%M:%S"), r.categoria, r.mensagem])

    elif tipo == 'weather':
        titulo = "Histórico da Estação Meteorológica"
        # Nomes mais curtos para caber no PDF
        colunas = ['Data/Hora', 'Bat.', 'GHI1', 'DHI', 'BNI', 'OLD', 'LWD', 'Vel.Vento', 'Dir.Vento', 'Temp.', 'Umid.', 'Pressão', 'Chuva', 'Cell_Irr', 'Cell_Tmp']
        registros = Historico.query.filter(Historico.data_hora.between(dt_inicio, dt_fim)).order_by(Historico.data_hora.desc()).all()
        for r in registros:
            def fmt(val): return str(val) if val is not None else '--'
            linhas.append([
                r.data_hora.strftime("%d/%m/%Y %H:%M"),
                fmt(r.v_bat), fmt(r.ghi1), fmt(r.dhi), fmt(r.bni),
                fmt(r.old), fmt(r.lwd), fmt(r.vento_vel), fmt(r.vento_dir),
                fmt(r.temp_ar), fmt(r.umidade_rel), fmt(r.pressao_atm),
                fmt(r.chuva_acum), fmt(r.cell_irrad), fmt(r.cell_temp) # <--- AQUI
            ])

    elif tipo == 'heliostatos':
        titulo = "Histórico de Operação dos Heliostatos"
        colunas = ['Data/Hora', 'Helio', 'Status', 'Alpha', 'Beta', 'Theta', 'Phi']
        query = HeliostatoOperacao.query.filter(HeliostatoOperacao.data_hora.between(dt_inicio, dt_fim))
        if filtros and 'TODOS' not in filtros:
            num_filtros = [int(f) for f in filtros if f.isdigit()]
            if num_filtros: query = query.filter(HeliostatoOperacao.numero.in_(num_filtros))
            
        # Limite de 2000 linhas no PDF para evitar falta de memória RAM na hora de desenhar a tabela
        registros = query.order_by(HeliostatoOperacao.data_hora.desc()).limit(2000).all()
        for r in registros:
            def fmt(val): return str(val) if val is not None else '--'
            linhas.append([r.data_hora.strftime("%d/%m/%Y %H:%M:%S"), str(r.numero), r.status, fmt(r.alpha), fmt(r.beta), fmt(r.theta), fmt(r.phi)])

    # Renderiza HTML
    html_string = render_template('reports/pdf_template.html', 
                                  titulo=titulo,
                                  usuario=usuario_solicitante,
                                  data_emissao=datetime.now().strftime("%d/%m/%Y %H:%M"),
                                  inicio=dt_inicio.strftime("%d/%m/%Y %H:%M"),
                                  fim=dt_fim.strftime("%d/%m/%Y %H:%M"),
                                  colunas=colunas,
                                  linhas=linhas)
    
    # Gera PDF
    pdf_io = io.BytesIO()
    HTML(string=html_string).write_pdf(target=pdf_io)
    return pdf_io.getvalue()

# Funções: ventilador (WEG CFW500)

def ler_dados_ventilador():
    """Lê status do Inversor WEG CFW500 com LOGS e Correção de Erro"""
    config = carregar_config()
    ip = config.get('SISTEMA', 'ip_ventilador', fallback='127.0.0.1')
    porta = config.getint('SISTEMA', 'port_ventilador', fallback=502)
    
    client = ModbusTcpClient(ip, port=porta, timeout=1)
    
    dados = {
        "online": False,
        "ligado": False,
        "velocidade_setpoint": 0,
        "frequencia_real": 0.0,
        "corrente": 0.0,
        "tensao": 0,
        "potencia": 0.0,
        "status_operacao": False
    }

    if client.connect():
        try:
            # CORREÇÃO: Usando argumentos nomeados para evitar TypeError
            # Lê monitoramento (P0002-P0010) e registradores de controle (P0680-P0683)
            rr_leituras = client.read_holding_registers(address=2, count=9)
            rr_controle = client.read_holding_registers(address=680, count=4)

            if not rr_leituras.isError() and not rr_controle.isError():
                r_read = rr_leituras.registers
                r_ctrl = rr_controle.registers

                dados["online"] = True
                
                # --- LOG DE DEBUG (Olhe no Terminal!) ---
                status_word = r_ctrl[0] # Endereço 680
                cmd_word = r_ctrl[2]    # Endereço 682
                
                print(f"--- DEBUG VENTILADOR ---")
                print(f"Lendo Modbus IP {ip}:{porta}")
                print(f"Status (680): {status_word} | Comando (682): {cmd_word}")
                print(f"Bits Status: {bin(status_word)}")
                print(f"------------------------")
                # ----------------------------------------

                # Processamento Padrão WEG
                dados["frequencia_real"] = r_read[0] / 10.0 
                dados["corrente"] = r_read[1] / 10.0
                dados["tensao"] = r_read[5]
                dados["potencia"] = r_read[8] / 10.0 

                # Bit 2 (valor 4) indica EM OPERAÇÃO (RUN)
                dados["status_operacao"] = (status_word & 4) > 0 
                dados["ligado"] = (cmd_word > 0)
                
                raw_speed = r_ctrl[3]
                dados["velocidade_setpoint"] = int((raw_speed / 8192.0) * 100)

        except Exception as e:
            print(f"ERRO DE LEITURA: {e}")
        finally:
            client.close()
    
    return dados

def escrever_comando_ventilador(tipo, valor):
    config = carregar_config()
    ip = config.get('SISTEMA', 'ip_ventilador', fallback='127.0.0.1')
    porta = config.getint('SISTEMA', 'port_ventilador', fallback=502)
    
    client = ModbusTcpClient(ip, port=porta, timeout=1)
    sucesso = False

    if client.connect():
        try:
            if tipo == 'power':
                # P0682: Comando Lógico
                val_to_write = 7 if int(valor) == 1 else 0
                # CORREÇÃO: Argumentos nomeados
                client.write_register(address=682, value=val_to_write)
                sucesso = True
                
            elif tipo == 'velocidade':
                # P0683: Referência 13 bits
                pct = int(valor)
                if pct < 0: pct = 0
                if pct > 100: pct = 100
                
                val_weg = int((pct / 100.0) * 8192)
                # CORREÇÃO: Argumentos nomeados
                client.write_register(address=683, value=val_weg)
                sucesso = True
                
        except Exception as e:
            print(f"Erro escrita Ventilador: {e}")
        finally:
            client.close()
            
    return sucesso

# ==============================================================================
# CONTROLE DE HELIOSTATOS (FIRMWARE ESP32 CUSTOM)
# ==============================================================================

def codificar_angulo_custom(angulo):
    """
    Converte ângulo float para o formato MSB/LSB do firmware.
    Regra: Valor_Normalizado = Angulo + 360.0
    MSB = int(Valor)
    LSB = int((Valor - MSB) * 1000)
    """
    try:
        valor_norm = float(angulo) + 360.0
        msb = int(valor_norm)
        lsb = int((valor_norm - msb) * 1000.0)
        return msb, lsb
    except Exception as e:
        print(f"Erro codificação angulo: {e}")
        return 0, 0

def decodificar_angulo_custom(msb, lsb):
    """
    Converte MSB/LSB do firmware para ângulo real.
    Regra: Valor = float(MSB) + (float(LSB) / 1000.0)
    Angulo = Valor - 360.0
    """
    try:
        valor = float(msb) + (float(lsb) / 1000.0)
        return round(valor - 360.0, 3)
    except:
        return 0.0

def ler_dados_heliostato(heliostato_id):
    """
    Lê todos os dados vitais do heliostato via Modbus
    """
    try:
        # Garante que é um número inteiro válido
        busca_num = int(heliostato_id)
    except ValueError:
        return {"online": False, "erro_real": "Número de heliostato inválido."}

    # Busca APENAS pelo 'numero' que é a sua chave primária real
    base = HeliostatoCadastro.query.filter_by(numero=busca_num).first()

    if not base:
        return {
            "online": False, 
            "alpha": 0.0, "beta": 0.0, "theta": 0.0, "modo": "Desconhecido", "status": "Desconectado", "status_code": 0,
            "erro_real": f"Heliostato {busca_num} não encontrado no banco de dados."
        }

    # Proteção caso o banco retorne IP ou porta vazios
    ip = base.ip if base.ip else '127.0.0.1'
    porta = base.porta if base.porta else 502

    client = ModbusTcpClient(ip, port=porta, timeout=1.0)
    
    dados = {
        "online": False,
        "alpha": 0.0,
        "beta": 0.0,
        "theta": 0.0,
        "modo": "Desconhecido", 
        "status": "Desconectado", 
        "status_code": 0,
        "erro_real": "Nenhum erro"
    }

    if client.connect():
        try:
            # Lendo 13 registradores com slave=1 explícito
            rr = client.read_holding_registers(address=0, count=13, slave=1)
            
            if not rr.isError():
                regs = rr.registers
                dados["online"] = True
                
                # Proteção extra: só lê os índices se o simulador realmente devolveu 13 itens
                if len(regs) >= 13:
                    dados["alpha"] = decodificar_angulo_custom(regs[0], regs[1])
                    dados["beta"] = decodificar_angulo_custom(regs[2], regs[3])
                    dados["modo"] = "Automático" if regs[10] == 1 else "Manual"
                    dados["status_code"] = regs[11]
                    dados["status"] = "Movendo" if regs[11] == 1 else "Ocioso"
                    dados["theta"] = regs[12] / 1000.0 if regs[12] > 360 else regs[12]
                    dados["erro_real"] = "Sucesso"
                else:
                    dados["erro_real"] = f"Simulador retornou apenas {len(regs)} registradores (esperado 13)."
            else:
                dados["erro_real"] = f"Erro Modbus no simulador: Leitura rejeitada (isError)."

        except Exception as e:
            dados["erro_real"] = f"Erro interno Python: {str(e)}"
        finally:
            client.close()
    else:
        dados["erro_real"] = f"Falha ao conectar no IP {ip} e Porta {porta}"
            
    return dados

def enviar_comando_heliostato(heliostato_id, tipo_comando, valores=None):
    """
    Envia comandos manuais ou de modo.
    """
    base = HeliostatoCadastro.query.filter_by(numero=int(heliostato_id)).first()
    ip = base.ip if base else '127.0.0.1'
    porta = base.porta if base else 502

    client = ModbusTcpClient(ip, port=porta, timeout=0.5)
    sucesso = False
    msg_erro = None
    
    if client.connect():
        try:
            if tipo_comando == 'modo':
                novo_modo = int(valores.get('modo', 0))
                client.write_register(address=10, value=novo_modo)
                sucesso = True
                
            elif tipo_comando == 'manual':
                rr_status = client.read_holding_registers(address=11, count=1)
                if not rr_status.isError() and rr_status.registers[0] == 1:
                    client.close()
                    return {"ok": False, "msg": "Heliostato em movimento. Aguarde chegar na posição."}

                client.write_register(address=10, value=0) 
                
                alpha = float(valores.get('alpha', 0))
                beta = float(valores.get('beta', 0))
                
                msb_a, lsb_a = codificar_angulo_custom(alpha)
                msb_b, lsb_b = codificar_angulo_custom(beta)
                
                client.write_registers(address=0, values=[msb_a, lsb_a, msb_b, lsb_b])
                sucesso = True

            elif tipo_comando == 'salvar_vetor':
                client.write_register(address=15, value=1)
                sucesso = True

        except Exception as e:
            print(f"Erro escrita Heliostato: {e}")
            msg_erro = str(e)
        finally:
            client.close()
    else:
        msg_erro = "Falha de Conexão com o Heliostato"
            
    if sucesso:
        return {"ok": True}
    else:
        return {"ok": False, "msg": msg_erro or "Erro desconhecido"}

def loop_gravacao_heliostatos(app):
    """
    Loop em background que lê a 'taxa_atualizacao' (em ms) do banco 
    e grava o histórico de operação continuamente.
    """
    ultimas_gravacoes = {}
    
    while True:
        with app.app_context():
            try:
                bases = HeliostatoCadastro.query.all()
                agora = time.time()
                
                for b in bases:
                    num = b.numero
                    taxa_ms = b.taxa_atualizacao if b.taxa_atualizacao else 5000
                    
                    # Converte ms para segundos. Mínimo de 0.5s para não engasgar a CPU do servidor.
                    taxa_segundos = max(0.5, taxa_ms / 1000.0) 
                    
                    ultimo_tempo = ultimas_gravacoes.get(num, 0)
                    
                   # Chegou a hora de gravar para este heliostato específico?
                    if (agora - ultimo_tempo) >= taxa_segundos:
                        dados = ler_dados_heliostato(num)
                        
                        # --- NOVO: SALVA NO CACHE IMEDIATAMENTE PARA O FLASK LER ---
                        if dados:
                            CACHE_MEMORIA['heliostatos'][num] = dados
                            
                        # Só grava no histórico se a comunicação Modbus funcionou (online = True)
                        if dados and dados.get('online'):
                            nova_operacao = HeliostatoOperacao(
                                numero=num,
                                status=dados.get('status', 'Desconhecido'),
                                alpha=dados.get('alpha', 0.0),
                                beta=dados.get('beta', 0.0),
                                theta=b.theta,
                                phi=b.phi,
                                data_hora=datetime.now()
                            )
                            db.session.add(nova_operacao)
                            
                        # Atualiza o relógio interno para este heliostato
                        ultimas_gravacoes[num] = agora
                
                db.session.commit()
            except Exception as e:
                print(f"Erro loop gravacao heliostatos: {e}")
                db.session.rollback()
                
        # Pausa curta para não monopolizar o processador
        time.sleep(0.5)
        
def loop_monitoramento_rapido(app):
    """Worker rápido para manter os dados em memória RAM e evitar lentidão na UI."""
    global CACHE_MEMORIA, emergencia_acionada
    
    while True:
        with app.app_context():
            try:
                cfg = carregar_config()
                
                # 1. ESTAÇÃO METEOROLÓGICA (Passa o 'app' para habilitar alarmes)
                dados_est = ler_dados_estacao(app)
                if dados_est:
                    CACHE_MEMORIA['estacao_dados'] = dados_est
                    CACHE_MEMORIA['status_geral']['estacao_online'] = True
                else:
                    CACHE_MEMORIA['status_geral']['estacao_online'] = False
                    
                # 2. TERMOSTATOS (Ping rápido)
                ip_term = cfg.get('SISTEMA', 'ip_termostatos', fallback='172.18.0.1')
                port_term = cfg.getint('SISTEMA', 'port_termostatos', fallback=503)
                c_term = ModbusTcpClient(ip_term, port=port_term, timeout=1)
                CACHE_MEMORIA['status_geral']['termostatos_online'] = c_term.connect()
                c_term.close()
                
                # 3. WIFI (Ping rápido via Socket)
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
                    pass
                CACHE_MEMORIA['status_geral']['wifi_online'] = wifi_ok
                
                # 4. VENTILADOR (Ping rápido)
                ip_vent = cfg.get('SISTEMA', 'ip_ventilador', fallback='192.168.1.55')
                port_vent = cfg.getint('SISTEMA', 'port_ventilador', fallback=502)
                c_vent = ModbusTcpClient(ip_vent, port=port_vent, timeout=1)
                CACHE_MEMORIA['status_geral']['ventilador_online'] = c_vent.connect()
                c_vent.close()
                
                # 5. EMERGÊNCIA (Cópia do estado global)
                CACHE_MEMORIA['status_geral']['emergencia'] = emergencia_acionada

            except Exception as e:
                print(f"Erro no loop de monitoramento rápido: {e}")

        time.sleep(2)