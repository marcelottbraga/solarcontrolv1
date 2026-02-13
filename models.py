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
    ghi2 = db.Column(db.Float)           # GHI2 (W/m²) - Reg 40025

# Modelo: Histórico dos termopares
class HistoricoTermopares(db.Model):
    # Observação: nome da tabela ajustado para o banco de dados
    __tablename__ = 'historico_termopares' 
    
    id = db.Column(db.Integer, primary_key=True)
    data_hora = db.Column(db.DateTime, default=datetime.now)
    
    # Campos: tp1..tp90 (termopares)
    tp1 = db.Column(db.Integer); tp2 = db.Column(db.Integer); tp3 = db.Column(db.Integer); tp4 = db.Column(db.Integer); tp5 = db.Column(db.Integer)
    tp6 = db.Column(db.Integer); tp7 = db.Column(db.Integer); tp8 = db.Column(db.Integer); tp9 = db.Column(db.Integer); tp10 = db.Column(db.Integer)
    tp11 = db.Column(db.Integer); tp12 = db.Column(db.Integer); tp13 = db.Column(db.Integer); tp14 = db.Column(db.Integer); tp15 = db.Column(db.Integer)
    tp16 = db.Column(db.Integer); tp17 = db.Column(db.Integer); tp18 = db.Column(db.Integer); tp19 = db.Column(db.Integer); tp20 = db.Column(db.Integer)
    tp21 = db.Column(db.Integer); tp22 = db.Column(db.Integer); tp23 = db.Column(db.Integer); tp24 = db.Column(db.Integer); tp25 = db.Column(db.Integer)
    tp26 = db.Column(db.Integer); tp27 = db.Column(db.Integer); tp28 = db.Column(db.Integer); tp29 = db.Column(db.Integer); tp30 = db.Column(db.Integer)
    tp31 = db.Column(db.Integer); tp32 = db.Column(db.Integer); tp33 = db.Column(db.Integer); tp34 = db.Column(db.Integer); tp35 = db.Column(db.Integer)
    tp36 = db.Column(db.Integer); tp37 = db.Column(db.Integer); tp38 = db.Column(db.Integer); tp39 = db.Column(db.Integer); tp40 = db.Column(db.Integer)
    tp41 = db.Column(db.Integer); tp42 = db.Column(db.Integer); tp43 = db.Column(db.Integer); tp44 = db.Column(db.Integer); tp45 = db.Column(db.Integer)
    tp46 = db.Column(db.Integer); tp47 = db.Column(db.Integer); tp48 = db.Column(db.Integer); tp49 = db.Column(db.Integer); tp50 = db.Column(db.Integer)
    tp51 = db.Column(db.Integer); tp52 = db.Column(db.Integer); tp53 = db.Column(db.Integer); tp54 = db.Column(db.Integer); tp55 = db.Column(db.Integer)
    tp56 = db.Column(db.Integer); tp57 = db.Column(db.Integer); tp58 = db.Column(db.Integer); tp59 = db.Column(db.Integer); tp60 = db.Column(db.Integer)
    tp61 = db.Column(db.Integer); tp62 = db.Column(db.Integer); tp63 = db.Column(db.Integer); tp64 = db.Column(db.Integer); tp65 = db.Column(db.Integer)
    tp66 = db.Column(db.Integer); tp67 = db.Column(db.Integer); tp68 = db.Column(db.Integer); tp69 = db.Column(db.Integer); tp70 = db.Column(db.Integer)
    tp71 = db.Column(db.Integer); tp72 = db.Column(db.Integer); tp73 = db.Column(db.Integer); tp74 = db.Column(db.Integer); tp75 = db.Column(db.Integer)
    tp76 = db.Column(db.Integer); tp77 = db.Column(db.Integer); tp78 = db.Column(db.Integer); tp79 = db.Column(db.Integer); tp80 = db.Column(db.Integer)
    tp81 = db.Column(db.Integer); tp82 = db.Column(db.Integer); tp83 = db.Column(db.Integer); tp84 = db.Column(db.Integer); tp85 = db.Column(db.Integer)
    tp86 = db.Column(db.Integer); tp87 = db.Column(db.Integer); tp88 = db.Column(db.Integer); tp89 = db.Column(db.Integer); tp90 = db.Column(db.Integer)
    
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
class HelioBase(db.Model):
    __tablename__ = 'helio_bases'
    
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(50), nullable=False)
    ip = db.Column(db.String(20))
    porta = db.Column(db.Integer)
    

    alpha = db.Column(db.String(50)) 
    beta = db.Column(db.String(50))
    theta = db.Column(db.String(50))


    def to_dict(self):
        return {
            "id": self.id,
            "nome": self.nome,
            "ip": self.ip,
            "porta": self.porta,
            "alpha": self.alpha,
            "beta": self.beta,
            "theta": self.theta
        }
        
# Modelo: Log de eventos
class LogEvento(db.Model):
    __tablename__ = 'log_eventos'
    
    id = db.Column(db.Integer, primary_key=True)
    data_hora = db.Column(db.DateTime, default=datetime.now)
    usuario = db.Column(db.String(50))
    tipo_evento = db.Column(db.String(50))
    detalhes = db.Column(db.Text)