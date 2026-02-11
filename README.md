# Plaanss App

Dockerized full-stack calendar app with authentication.

## Features
- Register/login with email and password
- JWT-protected API
- Personal interactive calendar per user
- Add events by selecting days in calendar
- Delete events by clicking existing events
- PostgreSQL persistence

## Run on Ubuntu VPS with Docker Compose

1. Install Docker + Compose plugin:
   ```bash
   sudo apt update
   sudo apt install -y docker.io docker-compose-plugin
   sudo systemctl enable --now docker
   ```
2. Clone this repository and enter it:
   ```bash
   git clone <your-repo-url>
   cd plaanss-app
   ```
3. Start all services:
   ```bash
   docker compose up --build -d
   ```
4. Open:
   - Frontend: `http://YOUR_VPS_IP:3000`
   - Backend health: `http://YOUR_VPS_IP:8000/health`

## Environment notes
- Change `JWT_SECRET` in `docker-compose.yml` before production use.
- For domain/proxy deployments, set `REACT_APP_API_URL` to your backend URL.

## Useful commands
```bash
# Watch logs
sudo docker compose logs -f

# Stop stack
sudo docker compose down

# Stop and remove DB data
sudo docker compose down -v
```
