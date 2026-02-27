from datetime import datetime
from extensions import db

# Modelo: Usuário
class Usuario(db.Model):
    __tablename__ = 'usuarios'
    
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(100), nullable=False)
    usuario = db.Column(db.String(50), unique=True, nullable=False)
    email = db.Column(db.String(100))
    perfil = db.Column(db.String(20), default='Operador')
    senha = db.Column(db.String(200), nullable=False)

    def __repr__(self):
        return f"<Usuario {self.usuario}>"

    def to_dict(self):
        return {
            "id": self.id,
            "nome": self.nome,
            "usuario": self.usuario,
            "email": self.email,
            "perfil": self.perfil
        }

# Modelo: Histórico da estação (Atualizado conforme interface Modbus do fornecedor)
class Historico(db.Model):
    __tablename__ = 'historico_clima'
    
    id = db.Column(db.Integer, primary_key=True)
    data_hora = db.Column(db.DateTime, default=datetime.now)
    
    v_bat = db.Column(db.Float)          # Tensão da Bateria (V) - Reg 40001
    ghi1 = db.Column(db.Float)           # GHI1 (W/m²) - Reg 40003
    dhi = db.Column(db.Float)            # DHI (W/m²) - Reg 40005
    bni = db.Column(db.Float)            # BNI (W/m²) - Reg 40007
    old = db.Column(db.Float)            # OLD (W/m²) - Reg 40009
    lwd = db.Column(db.Float)            # LWD (W/m²) - Reg 40011
    vento_vel = db.Column(db.Float)      # Vel (m/s) - Reg 40013
    vento_dir = db.Column(db.Float)      # Dir (deg) - Reg 40015
    temp_ar = db.Column(db.Float)        # Temp (°C) - Reg 40017
    umidade_rel = db.Column(db.Float)    # UR (%) - Reg 40019
    pressao_atm = db.Column(db.Float)    # Pres (mbar) - Reg 40021
    chuva_acum = db.Column(db.Float)     # Chuva (mm) - Reg 40023
    cell_irrad = db.Column(db.Float)     #Irradiacao Global Horiz - Reg 40025
    cell_temp = db.Column(db.Float)      #Temperat Celia de Refer - Reg 40027

# Modelo: Histórico dos termopares
class HistoricoTermopares(db.Model):
    __tablename__ = 'historico_termopares' 
    
    id = db.Column(db.Integer, primary_key=True)
    data_hora = db.Column(db.DateTime, default=datetime.now)
    
    # Campos: tp1..tp90 (termopares)
    tp1 = db.Column(db.Float); tp2 = db.Column(db.Float); tp3 = db.Column(db.Float); tp4 = db.Column(db.Float); tp5 = db.Column(db.Float)
    tp6 = db.Column(db.Float); tp7 = db.Column(db.Float); tp8 = db.Column(db.Float); tp9 = db.Column(db.Float); tp10 = db.Column(db.Float)
    tp11 = db.Column(db.Float); tp12 = db.Column(db.Float); tp13 = db.Column(db.Float); tp14 = db.Column(db.Float); tp15 = db.Column(db.Float)
    tp16 = db.Column(db.Float); tp17 = db.Column(db.Float); tp18 = db.Column(db.Float); tp19 = db.Column(db.Float); tp20 = db.Column(db.Float)
    tp21 = db.Column(db.Float); tp22 = db.Column(db.Float); tp23 = db.Column(db.Float); tp24 = db.Column(db.Float); tp25 = db.Column(db.Float)
    tp26 = db.Column(db.Float); tp27 = db.Column(db.Float); tp28 = db.Column(db.Float); tp29 = db.Column(db.Float); tp30 = db.Column(db.Float)
    tp31 = db.Column(db.Float); tp32 = db.Column(db.Float); tp33 = db.Column(db.Float); tp34 = db.Column(db.Float); tp35 = db.Column(db.Float)
    tp36 = db.Column(db.Float); tp37 = db.Column(db.Float); tp38 = db.Column(db.Float); tp39 = db.Column(db.Float); tp40 = db.Column(db.Float)
    tp41 = db.Column(db.Float); tp42 = db.Column(db.Float); tp43 = db.Column(db.Float); tp44 = db.Column(db.Float); tp45 = db.Column(db.Float)
    tp46 = db.Column(db.Float); tp47 = db.Column(db.Float); tp48 = db.Column(db.Float); tp49 = db.Column(db.Float); tp50 = db.Column(db.Float)
    tp51 = db.Column(db.Float); tp52 = db.Column(db.Float); tp53 = db.Column(db.Float); tp54 = db.Column(db.Float); tp55 = db.Column(db.Float)
    tp56 = db.Column(db.Float); tp57 = db.Column(db.Float); tp58 = db.Column(db.Float); tp59 = db.Column(db.Float); tp60 = db.Column(db.Float)
    tp61 = db.Column(db.Float); tp62 = db.Column(db.Float); tp63 = db.Column(db.Float); tp64 = db.Column(db.Float); tp65 = db.Column(db.Float)
    tp66 = db.Column(db.Float); tp67 = db.Column(db.Float); tp68 = db.Column(db.Float); tp69 = db.Column(db.Float); tp70 = db.Column(db.Float)
    tp71 = db.Column(db.Float); tp72 = db.Column(db.Float); tp73 = db.Column(db.Float); tp74 = db.Column(db.Float); tp75 = db.Column(db.Float)
    tp76 = db.Column(db.Float); tp77 = db.Column(db.Float); tp78 = db.Column(db.Float); tp79 = db.Column(db.Float); tp80 = db.Column(db.Float)
    tp81 = db.Column(db.Float); tp82 = db.Column(db.Float); tp83 = db.Column(db.Float); tp84 = db.Column(db.Float); tp85 = db.Column(db.Float)
    tp86 = db.Column(db.Float); tp87 = db.Column(db.Float); tp88 = db.Column(db.Float); tp89 = db.Column(db.Float); tp90 = db.Column(db.Float)
    
# Modelo: Log de alarmes
class LogAlarme(db.Model):
    __tablename__ = 'log_alarmes'
    
    id = db.Column(db.Integer, primary_key=True)
    categoria = db.Column(db.String(50))
    mensagem = db.Column(db.String(200))
    data_hora = db.Column(db.DateTime, default=datetime.now)

    def to_dict(self):
        return {
            "data": self.data_hora.strftime("%d/%m/%Y %H:%M:%S"),
            "categoria": self.categoria,
            "mensagem": self.mensagem
        }
        
# Modelo: Bases heliotérmicas
class HeliostatoCadastro(db.Model):
    __tablename__ = 'heliostato_cadastro'
    
    numero = db.Column(db.Integer, primary_key=True)
    data_cadastro = db.Column(db.DateTime, default=datetime.utcnow)
    ip = db.Column(db.String(50))
    porta = db.Column(db.Integer, default=502)
    posicao = db.Column(db.Integer)
    theta = db.Column(db.Float, default=0.0)
    phi = db.Column(db.Float, default=0.0)
    taxa_atualizacao = db.Column(db.Integer, default=5)

class HeliostatoOperacao(db.Model):
    __tablename__ = 'heliostato_operacao'
    
    id = db.Column(db.Integer, primary_key=True)
    numero = db.Column(db.Integer, nullable=False)
    data_hora = db.Column(db.DateTime, default=datetime.utcnow)
    status = db.Column(db.String(50)) 
    alpha = db.Column(db.Float, default=0.0)
    beta = db.Column(db.Float, default=0.0)
    theta = db.Column(db.Float, default=0.0)
    phi = db.Column(db.Float, default=0.0)
        
# Modelo: Log de eventos
class LogEvento(db.Model):
    __tablename__ = 'log_eventos'
    
    id = db.Column(db.Integer, primary_key=True)
    data_hora = db.Column(db.DateTime, default=datetime.now)
    usuario = db.Column(db.String(50))
    tipo_evento = db.Column(db.String(50))
    detalhes = db.Column(db.Text)