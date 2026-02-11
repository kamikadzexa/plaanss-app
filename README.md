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

1. Install Docker Engine + Compose plugin (Compose v2):
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
   - Backend root: `http://YOUR_VPS_IP:8000`
   - Backend health: `http://YOUR_VPS_IP:8000/health`

## User approval and admin management
- The **first registered user** is automatically created as **admin** and **approved**.
- Every later registration starts as **not approved** and cannot log in until approved by an admin.
- Admins can open **User Management** in the UI to:
  - approve/reject users
  - grant/revoke admin role
  - change user email
  - reset user password

## Important Compose note
Use `docker compose` (plugin/v2), not legacy `docker-compose` (python/v1).

If you run into this error:

```text
KeyError: 'ContainerConfig'
```

it is typically caused by old `docker-compose` v1 metadata compatibility issues. Fix with:

```bash
# Stop and clean old stack state
docker compose down --remove-orphans

# If containers were created by old docker-compose v1, remove them
docker rm -f $(docker ps -aq --filter "name=plaanss-app") 2>/dev/null || true

# Optionally remove stale images and rebuild
docker image prune -f
docker compose up --build -d
```

If your server still defaults to the old binary, prefer explicit plugin invocation:

```bash
docker compose version
```

## Environment notes
- Change `JWT_SECRET` in `docker-compose.yml` before production use.
- By default, the frontend targets `http(s)://<current-host>:8000`, which works for VPS access without hardcoding localhost.

## Useful commands
```bash
# Watch logs
sudo docker compose logs -f

# Stop stack
sudo docker compose down

# Stop and remove DB data
sudo docker compose down -v
```
