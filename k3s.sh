#!/bin/bash
set -e

echo "=== Updating system ==="
sudo apt update -y
sudo apt install -y curl wget apt-transport-https

echo "=== Installing K3s ==="
curl -sfL https://get.k3s.io | sh -

echo "=== Waiting for K3s service ==="
sleep 5

echo "=== K3s Status ==="
sudo systemctl status k3s --no-pager

echo "=== kubectl version ==="
sudo k3s kubectl version --short

echo "=== Setting kubectl alias ==="
echo "alias kubectl='sudo k3s kubectl'" >> ~/.bashrc

echo
echo "K3s Installed!"
echo "Use this to check nodes:"
echo "  sudo k3s kubectl get nodes"

