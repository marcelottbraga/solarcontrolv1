import os
import time
import json
import cv2
import numpy as np
import configparser
import csv
import io
import threading
from pymodbus.constants import Endian
from pymodbus.payload import BinaryPayloadDecoder
from datetime import datetime, timedelta
from pymodbus.client import ModbusTcpClient
from sqlalchemy import or_

from extensions import db
from models import Historico, HistoricoTermopares, LogAlarme, LogEvento, HelioBase
from flask import render_template
from weasyprint import HTML

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, 'heliot.config')

status_cameras = {1: False, 2: False}
ultimo_alarme_registrado = {}

# Estado global de emergência (booleano)
emergencia_acionada = False

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

def ler_dados_estacao():
    config = carregar_config()
    ip = config.get('SISTEMA', 'ip_estacao_meteo', fallback='143.107.188.66')
    porta = config.getint('SISTEMA', 'port_estacao_meteo', fallback=502)
    slave_id = 1  # Conforme planilha
    
    client = ModbusTcpClient(ip, port=porta)
    dados = {}
    
    if client.connect():
        try:
            # Lê 26 registradores (13 variáveis * 2 registradores de 16-bit cada)
            # Endereço 0 corresponde ao 40001
            rr = client.read_holding_registers(address=0, count=26, slave=slave_id)
            
            if not rr.isError():
                # Decodifica os bytes brutos para Float 32-bit
                decoder = BinaryPayloadDecoder.fromRegisters(rr.registers, byteorder=Endian.Big, wordorder=Endian.Big)
                
                dados = {
                    'v_bat': round(decoder.decode_32bit_float(), 2),       # 40001-40002
                    'ghi1': round(decoder.decode_32bit_float(), 2),        # 40003-40004
                    'dhi': round(decoder.decode_32bit_float(), 2),         # 40005-40006
                    'bni': round(decoder.decode_32bit_float(), 2),         # 40007-40008
                    'old': round(decoder.decode_32bit_float(), 2),         # 40009-40010
                    'lwd': round(decoder.decode_32bit_float(), 2),         # 40011-40012
                    'vento_vel': round(decoder.decode_32bit_float(), 2),   # 40013-40014
                    'vento_dir': round(decoder.decode_32bit_float(), 2),   # 40015-40016
                    'temp_ar': round(decoder.decode_32bit_float(), 2),     # 40017-40018
                    'umidade_rel': round(decoder.decode_32bit_float(), 2), # 40019-40020
                    'pressao_atm': round(decoder.decode_32bit_float(), 2), # 40021-40022
                    'chuva_acum': round(decoder.decode_32bit_float(), 2),  # 40023-40024
                    'ghi2': round(decoder.decode_32bit_float(), 2)         # 40025-40026
                }
                checar_limites_estacao(dados, config)
            else:
                print(f"[ERRO MODBUS] Falha leitura Estação: {rr}")
                
            client.close()
            return dados
        except Exception as e:
            print(f"[ERRO CRITICO] Exceção na leitura Modbus: {e}")
            client.close()
            return None
    else:
        print(f"[ERRO CONEXAO] Não foi possível conectar em {ip}:{porta}")
    return None

def checar_limites_estacao(dados, config):
    global ultimo_alarme_registrado
    
    # Mapeia: Chave do Dicionário de Dados -> (Chave no Config, Nome para Exibir)
    mapa = {
        'v_bat': ('v_bat', 'Bateria (V)'),
        'ghi1': ('ghi1', 'GHI1'),
        'dhi': ('dhi', 'DHI'),
        'bni': ('bni', 'BNI'),
        'old': ('old', 'OLD'),
        'lwd': ('lwd', 'LWD'),
        'vento_vel': ('vento_vel', 'Vel. Vento'),
        'vento_dir': ('vento_dir', 'Dir. Vento'),
        'temp_ar': ('temp_ar', 'Temp. Ar'),
        'umidade_rel': ('umidade_rel', 'Umidade'),
        'pressao_atm': ('pressao_atm', 'Pressão'),
        'chuva_acum': ('chuva_acum', 'Chuva Acum.'),
        'ghi2': ('ghi2', 'GHI2')
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
            if limite_min is not None and valor < limite_min:
                msg_alarme = f"{nome_legivel} Baixo ({valor} < {limite_min})"
            elif limite_max is not None and valor > limite_max:
                msg_alarme = f"{nome_legivel} Alto ({valor} > {limite_max})"

            if msg_alarme:
                ultimo = ultimo_alarme_registrado.get(chave_dados)
                agora = datetime.now()
                
                # Só grava se mudou ou passou 1 minuto (anti-flood)
                if not ultimo or (agora - ultimo['tempo']).total_seconds() > 60 or ultimo['msg'] != msg_alarme:
                    novo_alarme = LogAlarme(categoria="Clima", mensagem=msg_alarme, data_hora=agora)
                    db.session.add(novo_alarme)
                    db.session.commit()
                    ultimo_alarme_registrado[chave_dados] = {'tempo': agora, 'msg': msg_alarme}
                    print(f"[ALARME CLIMA] {msg_alarme}")

    except Exception as e:
        print(f"Erro ao checar limites: {e}")


# Threads: gravação e monitoramento

def loop_gravacao_estacao(app):
    while True:
        with app.app_context():
            try:
                dados = ler_dados_estacao()
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
                        ghi2=dados.get('ghi2'),
                        data_hora=datetime.now()
                    )
                    db.session.add(h)
                    db.session.commit()
                    print(f"[HISTORICO] Clima gravado: {dados.get('temp_ar')}C | {dados.get('ghi1')}W/m2")
            except Exception as e:
                print(f"Erro thread estação: {e}")
        
        cfg = carregar_config()
        # Agora lendo diretamente em SEGUNDOS conforme padrão do sistema
        intervalo = cfg.getint('TEMPOS', 'intervalo_gravacao_estacao_segundos', fallback=60)
        
        # Garante que não seja zero ou negativo para evitar loop infinito de CPU
        if intervalo < 1: 
            intervalo = 60
            
        time.sleep(intervalo)


# [MODIFICADO] Loop Unificado: Monitora Emergência + Grava Histórico
def loop_termostatos_e_emergencia(app):
    global emergencia_acionada
    ultimo_historico = time.time()
    
    while True:
        with app.app_context():
            try:
                cfg = carregar_config()
                ip = cfg.get('SISTEMA', 'ip_termostatos', fallback='127.0.0.1')
                porta = cfg.getint('SISTEMA', 'port_termostatos', fallback=1502)
                intervalo_seg = cfg.getint('TEMPOS', 'intervalo_gravacao_termostatos_minutos', fallback=300)
                if intervalo_seg < 5: intervalo_seg = 5 # Proteção mínima
                
                client = ModbusTcpClient(ip, port=porta)
                if client.connect():
                    
                    # 1. Verifica emergência (endereço 0)
                    # Tenta ler como Discrete Input (FC02)
                    rr_input = client.read_discrete_inputs(address=0, count=1)
                    
                    # Fallback: tenta ler como Coil (FC01) se FC02 falhar
                    if rr_input.isError():
                        # print(f"[DEBUG] FC02 falhou, tentando FC01...")
                        rr_input = client.read_coils(address=0, count=1)

                    if not rr_input.isError():
                        # Converte para booleano
                        estado_atual = bool(rr_input.bits[0])
                        
                        # Linha opcional de debug (descomente para testar)
                        # print(f"[DEBUG] Botão Emergência: {estado_atual}")

                        # Detecta borda de ativação/desativação
                        if estado_atual and not emergencia_acionada:
                            emergencia_acionada = True
                            # Grava ALARME no Banco
                            log = LogAlarme(categoria="SEGURANÇA", mensagem="EMERGÊNCIA EXTERNA ACIONADA", data_hora=datetime.now())
                            db.session.add(log)
                            db.session.commit()
                            print("\n>>> 🚨 ALARME: EMERGÊNCIA ACIONADA NO CAMPO 🚨 <<<\n")
                        
                        elif not estado_atual and emergencia_acionada:
                            emergencia_acionada = False
                            print(">>> 🟢 Emergência Normalizada <<<")
                    else:
                        print(f"[ERRO MODBUS] Falha ao ler botão de emergência: {rr_input}")

                    # 2. Verifica se é hora de gravar histórico
                    if (time.time() - ultimo_historico) >= intervalo_seg:
                        rr_regs = client.read_holding_registers(address=0, count=90)
                        if not rr_regs.isError():
                            regs = rr_regs.registers
                            dados_term = {f'tp{i+1}': regs[i] for i in range(len(regs))}
                            dados_term['data_hora'] = datetime.now()
                            
                            # Usa a classe correta do models.py (HistoricoTermopares)
                            h = HistoricoTermopares(**dados_term)
                            db.session.add(h)
                            db.session.commit()
                            print(f"[HISTORICO] Termopares gravados com sucesso.")
                            ultimo_historico = time.time() # Reseta o timer
                    
                    client.close()
            
            except Exception as e:
                print(f"Erro loop termostatos/emergencia: {e}")
                # Pausa extra em caso de erro para não floodar o log
                time.sleep(2)
        
        # Loop moderado (1.5s) para não engasgar o CLP se a API web também estiver acessando
        time.sleep(1.5)

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
        writer.writerow(['Data/Hora', 'DNI (W/m2)', 'GHI (W/m2)', 'Vento Dir.', 'Vento Vel. (m/s)', 'Precipitacao (mm)', 'Taxa Chuva (mm/h)'])
        registros = Historico.query.filter(Historico.data_hora.between(dt_inicio, dt_fim)).order_by(Historico.data_hora.desc()).all()
        for r in registros:
            def fmt(val): return str(val).replace('.', ',') if val is not None else ''
            writer.writerow([
                r.data_hora.strftime("%d/%m/%Y %H:%M:%S"),
                fmt(r.dni), fmt(r.ghi), fmt(r.vento_direcao), fmt(r.vento_velocidade),
                fmt(r.precipitacao), fmt(r.taxa_chuva)
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
        colunas = ['Data/Hora', 'DNI', 'GHI', 'Dir. Vento', 'Vel. Vento', 'Chuva (mm)', 'Taxa (mm/h)']
        registros = Historico.query.filter(Historico.data_hora.between(dt_inicio, dt_fim)).order_by(Historico.data_hora.desc()).all()
        for r in registros:
            linhas.append([
                r.data_hora.strftime("%d/%m/%Y %H:%M"),
                str(r.dni), str(r.ghi), str(r.vento_direcao), str(r.vento_velocidade), str(r.precipitacao), str(r.taxa_chuva)
            ])

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
    return HTML(string=html_string).write_pdf()

# Funções: ventilador (WEG CFW500)

def ler_dados_ventilador():
    """Lê status do Inversor WEG CFW500 com LOGS e Correção de Erro"""
    config = carregar_config()
    ip = config.get('SISTEMA', 'ip_ventilador', fallback='127.0.0.1')
    porta = config.getint('SISTEMA', 'port_ventilador', fallback=502)
    
    client = ModbusTcpClient(ip, port=porta)
    
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
    
    client = ModbusTcpClient(ip, port=porta)
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
    # 1. Busca IP no Banco
    base = HelioBase.query.filter_by(nome=str(heliostato_id)).first() # Assumindo que 'nome' guarda o numero ou ID
    # Se no banco o nome for "Base 01", precisaremos ajustar a lógica de busca. 
    # Vou assumir busca pelo ID ou adaptar se você usar o campo 'nome' como identificador numérico.
    
    # Fallback para teste se não achar no banco (apenas para não quebrar o dev)
    ip = base.ip if base else '127.0.0.1' 
    porta = base.porta if base else 502

    client = ModbusTcpClient(ip, port=porta, timeout=0.5)
    
    dados = {
        "online": False,
        "alpha": 0.0,
        "beta": 0.0,
        "theta": 0.0,
        "modo": "Desconhecido", # 0=Manual, 1=Auto
        "status": "Desconectado", # 0=Ocioso, 1=Movendo
        "status_code": 0
    }

    if client.connect():
        try:
            # Lê registradores 0 a 12 (13 registros)
            rr = client.read_holding_registers(address=0, count=13)
            
            if not rr.isError():
                regs = rr.registers
                dados["online"] = True
                
                # Decodifica Alpha (Reg 0 e 1)
                dados["alpha"] = decodificar_angulo_custom(regs[0], regs[1])
                
                # Decodifica Beta (Reg 2 e 3)
                dados["beta"] = decodificar_angulo_custom(regs[2], regs[3])
                
                # Vetores (Reg 4, 5, 6) - Apenas informativo se quiser usar depois
                # bx = regs[4] / 1000.0
                
                # Modo (Reg 10)
                dados["modo"] = "Automático" if regs[10] == 1 else "Manual"
                
                # Status (Reg 11)
                dados["status_code"] = regs[11]
                dados["status"] = "Movendo" if regs[11] == 1 else "Ocioso"
                
                # Theta (Reg 12) - Tratando como float simples ou escalado
                # Se for float IEEE 754 precisaria ler 2 regs, mas o firmware parece usar int escalado.
                # Vou assumir escala 1000 igual aos vetores por segurança, ou direto.
                dados["theta"] = regs[12] / 1000.0 if regs[12] > 360 else regs[12]

        except Exception as e:
            print(f"Erro leitura Heliostato {heliostato_id}: {e}")
        finally:
            client.close()
            
    return dados

def enviar_comando_heliostato(heliostato_id, tipo_comando, valores=None):
    """
    Envia comandos. 
    tipo_comando: 'manual' (requer valores={'alpha': x, 'beta': y}) ou 'modo' (valores={'modo': 0/1})
    """
    base = HelioBase.query.filter_by(nome=str(heliostato_id)).first()
    ip = base.ip if base else '127.0.0.1'
    porta = base.porta if base else 502

    client = ModbusTcpClient(ip, port=porta, timeout=0.5)
    sucesso = False
    msg_erro = None
    
    if client.connect():
        try:
            if tipo_comando == 'modo':
                # REGRA: Troca de modo (Auto/Manual) é SEMPRE permitida.
                # É assim que abortamos um movimento ou iniciamos o rastreio.
                novo_modo = int(valores.get('modo', 0))
                client.write_register(address=10, value=novo_modo)
                sucesso = True
                
            elif tipo_comando == 'manual':
                # REGRA: Para enviar NOVAS COORDENADAS, verificamos se já está movendo.
                # Se estiver movendo (Reg 11=1), BLOQUEAMOS a escrita para "esperar o parâmetro chegar".
                rr_status = client.read_holding_registers(address=11, count=1)
                
                if not rr_status.isError() and rr_status.registers[0] == 1:
                    client.close()
                    return {"ok": False, "msg": "Heliostato em movimento. Aguarde chegar na posição."}

                # Se estiver parado, envia o novo alvo:
                client.write_register(address=10, value=0) # Garante modo manual
                
                alpha = float(valores.get('alpha', 0))
                beta = float(valores.get('beta', 0))
                
                msb_a, lsb_a = codificar_angulo_custom(alpha)
                msb_b, lsb_b = codificar_angulo_custom(beta)
                
                # Escreve Alpha e Beta nos registradores de alvo
                client.write_registers(address=0, values=[msb_a, lsb_a, msb_b, lsb_b])
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