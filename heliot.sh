#!/bin/bash

# 1. CONFIGURAÇÕES
PROJECT_DIR="/home/metalwize/Documentos/sistemas/heliot_app_metalwize"
CONTAINER_NAME="heliot-sistema"
HOST_PORT=8000

IP_LOCAL=$(hostname -I | tr ' ' '\n' | grep -vE '^127\.|^172\.17\.' | tr '\n' ' ')

# 3. AMBIENTE
cd "$PROJECT_DIR" || { echo "Erro: Diretório não encontrado!"; exit 1; }

# 4. MENU PRINCIPAL
while true; do
    clear
    cat << "EOF"
############################################################
#                                                          #
#   _   _  _____ _       ___  ___ _____                    #
#  | | | ||  ___| |     |_ _|/ _ \_   _|                   #
#  | |_| || |_  | |      | || | | || |                     #
#  |  _  ||  _| | |___   | || |_| || |                     #
#  |_| |_||_____|_____| ___| \___/ |_|                     #
#                                                          #
#                  >>> SYSTEM HELIOT <<<                   #
#                                                          #
#          Desenvolvedor: MetalWize                        #
#          Lançamento:    Fevereiro / 2026                 #
#          Suporte:       metalwize@metalwize.com.br       #
#                                                          #
############################################################
EOF
    echo "=========================================================="
    ST_RUNNING=$(docker ps -q -f name=$CONTAINER_NAME)
    
    if [ "$ST_RUNNING" ]; then
        echo -e "  STATUS ATUAL: \e[32mON-LINE (Volume Ativo)\e[0m"
        echo -e "  ACESSO REDE LOCAL:"
        for ip in $IP_LOCAL; do
            if [ ! -z "$ip" ]; then
                echo -e "    > http://$ip:$HOST_PORT"
            fi
        done
    else
        echo -e "  STATUS ATUAL: \e[31mOFF-LINE\e[0m"
    fi
    echo "=========================================================="
    echo
    echo "1) Iniciar Heliot"
    echo "2) Parar o Heliot"
    echo "3) Remover Tudo (Preserva heliot.config)"
    echo "4) Reiniciar Heliot"
    echo "5) Rebuild ONLINE (Verifica atualizações)"
    echo "6) Ver Logs (Realtime | crtl + c para sair)"
    echo "7) Sair"
    echo
    
    read -p "Escolha uma opção: " opcao

    case $opcao in
        1)
            echo "Iniciando via Docker Compose..."
            docker compose up -d
            sleep 2
            ;;
        2)
            echo "Parando serviços..."
            docker compose stop
            read -p "Pressione Enter..."
            ;;
        3)
            echo "Removendo containers..."
            docker compose down
            echo "Removido."
            read -p "Pressione Enter..."
            ;;
        4)
            echo "Reiniciando..."
            docker compose restart
            sleep 2
            ;;
        5)
            echo "Fazendo rebuild ONLINE..."
            # Força o pull para garantir que pega a imagem mais nova
            # docker compose build --no-cache --pull
            # docker compose up -d --pull always
            docker compose up -d --build
            echo "Rebuild online concluído."
            read -p "Pressione Enter..."
            ;;
        6)
            echo "Ctrl+C para sair dos logs..."
            docker compose logs -f
            ;;
        7)
            exit 0
            ;;
        *)
            if [ ! -z "$opcao" ]; then
                echo "Opção '$opcao' inválida!"
                sleep 1
            fi
            ;;
    esac
done