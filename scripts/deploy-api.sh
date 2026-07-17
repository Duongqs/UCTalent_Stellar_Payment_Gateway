#!/bin/bash

set -euo pipefail

# ── Defaults ─────────────────────────────────────────────────────────────────
PORT="${PORT:-8081}"
DOCKER_NETWORK="${DOCKER_NETWORK:-uct_internal_net}"
HOST_PORT="${HOST_PORT:-}"

OLD_CONTAINER="${SERVICE_NAME}_old"
GREEN_CONTAINER="${SERVICE_NAME}_green"

echo "=============================================="
echo "  uc-stellar API — Blue/Green Deploy"
echo "  Service  : ${SERVICE_NAME}"
echo "  Image    : ${IMAGE}"
echo "  Network  : ${DOCKER_NETWORK}"
echo "  Port     : ${PORT}"
echo "=============================================="

# ── Step 1: Login Artifact Registry ──────────────────────────────────────────
echo "> [1/9] Logging into Artifact Registry..."
cat "${SA_JSON_PATH}" | sudo docker login -u _json_key --password-stdin "https://${AR_HOSTNAME}"

# ── Step 2: Prune dangling images to free disk space ─────────────────────────
echo "> [2/9] Pruning dangling images..."
sudo docker image prune -f 2>/dev/null || true

# ── Step 3: Pull new image ────────────────────────────────────────────────────
echo "> [3/9] Pulling new image: ${IMAGE}..."
sudo docker pull "${IMAGE}"

# ── Step 4: Logout immediately after pull ────────────────────────────────────
echo "> [4/9] Logging out from Artifact Registry..."
sudo docker logout "${AR_HOSTNAME}" 2>/dev/null || true

# ── Step 5: Start Green container ────────────────────────────────────────────
echo "> [5/9] Starting Green container (${GREEN_CONTAINER})..."
sudo docker rm -f "${GREEN_CONTAINER}" 2>/dev/null || true

PORT_BINDING=""
if [ -n "${HOST_PORT}" ]; then
  PORT_BINDING="-p 127.0.0.1:${HOST_PORT}:${PORT}"
fi

sudo docker run -d \
  --name "${GREEN_CONTAINER}" \
  --restart=always \
  --network "${DOCKER_NETWORK}" \
  --env-file "${ENV_FILE_PATH}" \
  ${PORT_BINDING} \
  "${IMAGE}"

# ── Step 6: Health check (HTTP only — never TCP-as-success) ──────────────────
echo "> [6/9] Health checking Green container on port ${PORT}..."

HEALTHY=0

probe_http() {
  local path="$1"
  timeout 5 sudo docker exec "${GREEN_CONTAINER}" node -e '
    const http = require("http");
    const port = Number(process.argv[1] || "8081");
    const path = process.argv[2] || "/api/health/live";
    const req = http.get(
      { host: "127.0.0.1", port, path, timeout: 4000 },
      (res) => {
        res.resume();
        process.exit(res.statusCode >= 200 && res.statusCode < 400 ? 0 : 1);
      }
    );
    req.on("error", () => process.exit(1));
    req.on("timeout", () => { req.destroy(); process.exit(1); });
  ' "${PORT}" "${path}" >/dev/null 2>&1
}

MAX_ATTEMPTS=210
for i in $(seq 1 ${MAX_ATTEMPTS}); do
  RUNNING=$(sudo docker inspect -f '{{.State.Running}}' "${GREEN_CONTAINER}" 2>/dev/null || echo 'false')
  if [ "${RUNNING}" != "true" ]; then
    echo "[WAIT] Green container not running yet (${i}/${MAX_ATTEMPTS})"
    sleep 2
    continue
  fi

  HEALTH_STATUS=$(sudo docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${GREEN_CONTAINER}" 2>/dev/null || echo 'unknown')

  if [ "${HEALTH_STATUS}" = "healthy" ]; then
    echo "[OK] Docker healthcheck passed after $((i*2))s"
    HEALTHY=1
    break
  fi

  if [ "${HEALTH_STATUS}" = "unhealthy" ]; then
    echo "[WARN] Docker healthcheck unhealthy at attempt ${i}; trying direct HTTP probe..."
  fi

  # Prefer live (process up) for deploy gate; fall back to ready/legacy paths
  if probe_http "/api/health/live" || probe_http "/api/health"; then
    echo "[OK] HTTP readiness passed on port ${PORT} after $((i*2))s"
    HEALTHY=1
    break
  fi

  echo "[WAIT] Attempt ${i}/${MAX_ATTEMPTS} — sleeping 2s..."
  sleep 2
done

# ── Step 6b: Rollback if health check failed ──────────────────────────────────
if [ "${HEALTHY}" -eq 0 ]; then
  echo "[ERROR] Health check failed after $((MAX_ATTEMPTS*2))s — rolling back!"
  echo "[LOG] Last 100 lines of container logs:"
  sudo docker logs "${GREEN_CONTAINER}" --tail=100 2>/dev/null || true
  sudo docker stop "${GREEN_CONTAINER}" 2>/dev/null || true
  sudo docker rm -f "${GREEN_CONTAINER}" 2>/dev/null || true
  echo "[ROLLBACK] Deployment aborted. Previous container (${SERVICE_NAME}) still serving."
  exit 1
fi

# ── Step 7: Atomic swap ───────────────────────────────────────────────────────
echo "> [7/9] Health check passed! Swapping traffic to new container..."
sudo docker rename "${SERVICE_NAME}" "${OLD_CONTAINER}" 2>/dev/null || true
sudo docker rename "${GREEN_CONTAINER}" "${SERVICE_NAME}"

# ── Step 8: Wait for Nginx DNS cache to expire (valid=30s in upstream block) ──
echo "> [8/9] Waiting 35s for Nginx DNS cache to expire..."
sleep 35

# ── Step 9: Cleanup old container & images ────────────────────────────────────
echo "> [9/9] Removing old container and stale images..."
sudo docker stop "${OLD_CONTAINER}" 2>/dev/null || true
sudo docker rm -f "${OLD_CONTAINER}" 2>/dev/null || true

OLD_IDS=$(sudo docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' \
  | awk -v current="${IMAGE}" -v repo="${IMAGE_REPO}" \
    'substr($1, 1, length(repo)+1) == repo":" && $1 != current { print $2 }' \
  | sort -u)
[ -n "${OLD_IDS}" ] && echo "${OLD_IDS}" | xargs -r sudo docker rmi -f 2>/dev/null || true
sudo docker image prune -f 2>/dev/null || true

echo ""
echo "[OK] uc-stellar API deployment complete!"
echo "     Service  : ${SERVICE_NAME}"
echo "     Image    : ${IMAGE}"
echo "=============================================="
