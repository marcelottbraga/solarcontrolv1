import os
import threading
from flask import Flask
from urllib.parse import quote_plus
from extensions import db
from routes import bp as routes_bp
import services

app = Flask(__name__)
app.secret_key = 'segredo_metalwize_heliot_2024'

# --- CONFIGURAÇÃO ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, 'heliot.config')
print(f"--- ARQUIVO DE CONFIGURAÇÃO: {CONFIG_FILE} ---")

DB_USER = "postgres"
DB_PASS = "metalwize!@#$"
DB_HOST = "172.17.0.1"
DB_PORT = "5432"
DB_NAME = "heliot_db"

#DB_USER = "postgres"
#DB_PASS = "792mkI5cwK6iNVwnSxOgrvNPo7LrWtn0i2Wv0vA7egKTUm7e4PmnsvWNrbYbyXRl"
#DB_HOST = "31.97.167.212"
#DB_PORT = "9000"
#DB_NAME = "heliot_db"

senha_encoded = quote_plus(DB_PASS)
app.config['SQLALCHEMY_DATABASE_URI'] = f'postgresql://{DB_USER}:{senha_encoded}@{DB_HOST}:{DB_PORT}/{DB_NAME}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# INICIALIZAÇÃO
db.init_app(app)
app.register_blueprint(routes_bp)

thread_iniciada_global = False

def iniciar_threads_background():
    global thread_iniciada_global
    # Verifica se as threads já foram iniciadas (evita duplicidade no reload)
    if not thread_iniciada_global:
        thread_iniciada_global = True
        
        # Threads agora usam o app passado por argumento
        t1 = threading.Thread(target=services.loop_gravacao_estacao, args=(app,))
        t1.daemon = True
        t1.start()

        # Thread Unificada: Monitora Emergência e Grava Termostatos
        t2 = threading.Thread(target=services.loop_termostatos_e_emergencia, args=(app,))
        t2.daemon = True
        t2.start()
        
        print(f">>> SISTEMA HELIOT: THREADS DE GRAVAÇÃO INICIADAS (PID: {os.getpid()}) <<<")

# Chama a função IMEDIATAMENTE. 
# Assim, mesmo rodando via Gunicorn (Docker), as threads ligam!
iniciar_threads_background()

# Mantém o main apenas para testes locais no Windows/Linux sem Docker
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False)