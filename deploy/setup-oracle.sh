#!/bin/bash
# ============================================================
# Script de deploiement PortailKPI sur Oracle Cloud Free Tier
# Usage: ssh ubuntu@<IP> puis coller ce script
# ============================================================

set -e

echo "=== 1/6 Mise a jour systeme ==="
sudo apt-get update && sudo apt-get upgrade -y

echo "=== 2/6 Installation Docker ==="
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
sudo systemctl enable docker
sudo systemctl start docker

echo "=== 3/6 Installation Docker Compose ==="
sudo apt-get install -y docker-compose-plugin

echo "=== 4/6 Configuration swap (2GB) ==="
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
# Reduire swappiness pour privilegier la RAM
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
sudo sysctl vm.swappiness=10

echo "=== 5/6 Ouverture des ports (firewall) ==="
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT
sudo netfilter-persistent save || sudo apt-get install -y iptables-persistent && sudo netfilter-persistent save

echo "=== 6/6 Clone du repo ==="
cd /home/ubuntu
git clone https://github.com/toumifethi/portailKPI.git
cd portailKPI

echo ""
echo "============================================================"
echo "  Setup termine !"
echo ""
echo "  Prochaines etapes :"
echo ""
echo "  1. Creer le fichier .env :"
echo "     nano /home/ubuntu/portailKPI/.env"
echo ""
echo "  2. Copier et adapter le contenu suivant :"
echo "     MYSQL_ROOT_PASSWORD=VotreMotDePasseRoot"
echo "     MYSQL_PASSWORD=VotreMotDePasseProd"
echo "     AZURE_AD_TENANT_ID=votre-tenant-id"
echo "     AZURE_AD_CLIENT_ID=votre-client-id"
echo "     FRONTEND_URL=http://<IP_PUBLIQUE>"
echo "     AUTH_MODE=azure   (ou 'dev' pour tester)"
echo ""
echo "  3. Lancer l'application :"
echo "     cd /home/ubuntu/portailKPI"
echo "     docker compose -f docker-compose.prod.yml up -d --build"
echo ""
echo "  4. Executer les migrations + seed :"
echo "     docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy"
echo "     docker compose -f docker-compose.prod.yml exec backend npx prisma db seed"
echo ""
echo "  5. IMPORTANT : ouvrir les ports dans Oracle Cloud Console :"
echo "     Networking > Virtual Cloud Networks > vcn > Security Lists"
echo "     Ajouter Ingress Rule : Source 0.0.0.0/0, Port 80, TCP"
echo "     Ajouter Ingress Rule : Source 0.0.0.0/0, Port 443, TCP"
echo ""
echo "  L'app sera accessible sur http://<IP_PUBLIQUE>"
echo "============================================================"
