# Heliot — Documentação Rasa (Resumo)

Uma visão concisa do projeto: **requisitos**, **árvore de arquivos** e **propósito básico** de cada arquivo.

---

## ✅ Requisitos mínimos

- Sistema: Linux (Ubuntu/Debian recomendado) ou Windows para desenvolvimento
- Python 3.10+
- PostgreSQL (ou ajustar a URI para outro SGBD)
- Ferramentas do sistema (ex.: build-essential, libpq-dev)
- Dependências Python (veja `docs_db/requirements.txt`; ao mínimo: `flask`, `flask_sqlalchemy`, `psycopg2-binary`, `pymodbus`, `requests`, `pillow`, `reportlab`)

---

## 📁 Estrutura do projeto (ácida e rápida)

```
app.py                  - Aplicação Flask + bootstrap (threads/background)
extensions.py           - Inicializa extensões (SQLAlchemy, etc.)
heliot.config           - Arquivo de configuração (IPs, portas, tempos)
models.py               - Modelos/ORM do banco (SQLAlchemy)
routes.py               - Endpoints web e integrações com dispositivos
services.py             - Serviços/integrações com hardware (Modbus, coleta)

docs_db/                - Documentação e scripts do banco (requirements, SQL examples)
  ├─ database.py        - Helpers/execução de scripts para o DB
  ├─ requirements.txt   - Dependências Python do projeto
  └─ README_BANCO.md    - Instruções de instalação do banco

static/                 - Assets estáticos (css, js, imagens)
templates/              - Templates HTML (páginas e partials)
  └─ partials/          - Componentes reutilizáveis (sidebar, head, modals)
reports/                - Templates de relatório (PDF)

testar_banco.py         - Script para testar conexão/queries no DB
README.md               - Documentação do projeto (este arquivo)
build/                  - Artefatos de build/pyinstaller (binários, tocs)
```

---

## 🔧 Função básica de arquivos principais (rápido)

- app.py: configura Flask, carrega `heliot.config`, define DB URI e inicia threads de coleta quando executado diretamente.
- extensions.py: centraliza a inicialização de extensões (ex.: `db = SQLAlchemy()`).
- models.py: contém classes de modelo (tabelas) usadas pela aplicação.
- routes.py: implementa rotas HTTP e wrappers que consultam/hitam dispositivos externos.
- services.py: implementa lógica de comunicação com dispositivos (Modbus, leitura de estação, atuadores).
- heliot.config: configura endereços IP, portas, e tempos de coleta/gravação.
- docs_db/*: instruções e scripts para preparar o banco (criação, exemplos SQL, requirements).
- static/, templates/: front-end (HTML, CSS, JS) e componentes de interface.
- reports/pdf_template.html: template usado para gerar relatórios em PDF.
- testar_banco.py: utilitário para validar conexão e queries no PostgreSQL.
- build/: artefatos de empacotamento (quando gerado via pyinstaller).

---

## Como começar (rápido)

1. Crie e ative um venv:

```bash
python3 -m venv venv
source venv/bin/activate   # Linux/macOS
venv\\Scripts\\activate     # Windows
pip install -r docs_db/requirements.txt
```

2. Configure o banco (PostgreSQL) e variáveis/`app.py` conforme necessário.
3. Crie as tabelas (exemplo):

```bash
python -c "from extensions import db; from app import app; with app.app_context(): db.create_all()"
```

4. Rodar em desenvolvimento:

```bash
python app.py
# acessar http://localhost:5000
```

5. Para produção, usar `gunicorn` + reverse-proxy (`nginx`) ou empacotar como container; exemplos podem ser adicionados sob demanda.

---

## Observações rápidas

- Configurações sensíveis não devem ficar hard-coded; prefira variáveis de ambiente para credenciais.
- O projeto inicia threads no `app.py` (verificar comportamento ao usar gunicorn/uvicorn em produção).

---

Se desejar, posso: adicionar um `docker-compose.yml` simples, um `systemd` unit file exemplificativo, ou expandir a documentação com comandos detalhados. Deseja que eu adicione algum desses itens? ✨
