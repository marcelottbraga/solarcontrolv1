Heliot — Documentação Rasa (Resumo)

Uma visão concisa do projeto: requisitos, árvore de ficheiros e propósito básico de cada ficheiro.

O que é o Heliot? Um sistema web desenvolvido em Flask para monitorização e controlo em tempo real de uma planta solar, incluindo bases heliotérmicas (heliostatos), estação meteorológica, microturbina e sensores de temperatura, via protocolo Modbus.
✅ Requisitos mínimos

    Sistema: Linux (Ubuntu/Debian recomendado) ou Windows para desenvolvimento

    Python 3.10+

    PostgreSQL (ou ajustar a URI para outro SGBD)

    Ferramentas do sistema (ex.: build-essential, libpq-dev)

    Dependências Python (veja requirements.txt; ao mínimo: flask, flask_sqlalchemy, psycopg2-binary, pymodbus, requests, pillow, reportlab, weasyprint)

📁 Estrutura do projeto (ácida e rápida)

    app.py: Aplicação Flask + bootstrap (threads/background)

    extensions.py: Inicializa extensões (SQLAlchemy, etc.)

    heliot.config: Arquivo de configuração (IPs, portas, tempos)

    models.py: Modelos/ORM do banco (SQLAlchemy)

    routes.py: Endpoints web e integrações com dispositivos

    services.py: Serviços/integrações com hardware (Modbus, coleta)

    requirements.txt: Dependências Python do projeto

    docs_db/: Documentação e scripts do banco (SQL examples)

        database.py: Helpers/execução de scripts para o DB

        README_BANCO.md: Instruções de instalação do banco

    static/: Assets estáticos (css, js, imagens)

    templates/: Templates HTML (páginas e partials)

        partials/: Componentes reutilizáveis (sidebar, head, modals)

        reports/: Templates de relatório (PDF)

    testar_banco.py: Script para testar conexão/queries no DB

    README.md: Documentação do projeto (este arquivo)

🔧 Função básica de arquivos principais (rápido)

    app.py: configura Flask, carrega heliot.config, define DB URI e inicia threads de coleta quando executado diretamente.

    extensions.py: centraliza a inicialização de extensões (ex.: db = SQLAlchemy()).

    models.py: contém classes de modelo (tabelas) usadas pela aplicação.

    routes.py: implementa rotas HTTP e wrappers que consultam/comandam dispositivos externos.

    services.py: implementa lógica de comunicação com dispositivos (Modbus, leitura de estação, atuadores).

    heliot.config: configura endereços IP, portas, e tempos de coleta/gravação (editável via interface web).

    templates/reports/pdf_template.html: template base renderizado para gerar relatórios em PDF.

🚀 Como começar (rápido)

1. Crie e ative um venv:
(Linux/macOS)
python3 -m venv venv
source venv/bin/activate

(Windows)
venv\Scripts\activate

2. Instale as dependências:
pip install -r requirements.txt

3. Configure o banco (PostgreSQL) garantindo que a URI no código ou nas variáveis de ambiente está correta.

4. Crie as tabelas do banco de dados:
python -c "from extensions import db; from app import app; with app.app_context(): db.create_all()"

5. Rodar em desenvolvimento:
python app.py
(Acesse http://localhost:5000)
⚠️ Observações rápidas e Produção

    Credenciais: Configurações sensíveis (como strings de conexão do banco e senhas) não devem ficar hard-coded. Utilize variáveis de ambiente ou um ficheiro .env.

    Threads em Background: O projeto inicia threads de monitorização Modbus diretamente no app.py.

        Atenção em Produção: Se utilizar servidores WSGI como gunicorn, configure-o para usar apenas 1 worker (--workers 1). Usar múltiplos workers criará múltiplos loops de leitura Modbus em paralelo, causando colisões de porta e sobrecarga no hardware.

    Para produção contínua, considere empacotar como container Docker ou gerir via systemd + nginx como reverse-proxy.