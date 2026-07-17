#!/bin/bash
# =============================================================================
# deploy-worker.sh — Blue/Green deploy cho uc-stellar Worker
# =============================================================================
# Worker không phục vụ HTTP traffic trực tiếp nhưng vẫn dùng Blue/Green
# để tránh downtime khi image mới crash lúc khởi động.
# Chiến lược: run green -> verify stable -> atomic swap -> auto cleanup.
#
# Yêu cầu các biến môi trường:
#   IMAGE           — Full image URI
#   IMAGE_REPO      — Image repo URI không có tag
#   SERVICE_NAME    — Tên container (vd: uc-stellar-worker-dev)
#   AR_HOSTNAME     — Artifact Registry hostname
#   SA_JSON_PATH    — Đường dẫn tới service-account.json trên VM
#   ENV_FILE_PATH   — Đường dẫn tới .env file trên VM
#   DOCKER_NETWORK  — Docker network (mặc định: uct_internal_net)
# =============================================================================

set -euo pipefail

DOCKER_NETWORK="${DOCKER_NETWORK:-uct_internal_net}"
VERIFY_ATTEMPTS="${VERIFY_ATTEMPTS:-30}"
VERIFY_SLEEP_SEC="${VERIFY_SLEEP_SEC:-2}"
OLD_CONTAINER="${SERVICE_NAME}_old"
GREEN_CONTAINER="${SERVICE_NAME}_green"

echo "=============================================="
echo "  uc-stellar Worker — Blue/Green Deploy"
echo "  Service  : ${SERVICE_NAME}"
echo "  Image    : ${IMAGE}"
echo "  Network  : ${DOCKER_NETWORK}"
echo "=============================================="

# ── Step 1: Login Artifact Registry ──────────────────────────────────────────
echo "> [1/8] Logging into Artifact Registry..."
cat "${SA_JSON_PATH}" | sudo docker login -u _json_key --password-stdin "https://${AR_HOSTNAME}"

# ── Step 2: Prune dangling images ────────────────────────────────────────────
echo "> [2/8] Pruning dangling images..."
sudo docker image prune -f 2>/dev/null || true

# ── Step 3: Pull new image ────────────────────────────────────────────────────
echo "> [3/8] Pulling new image: ${IMAGE}..."
sudo docker pull "${IMAGE}"

# ── Step 4: Logout immediately ───────────────────────────────────────────────
echo "> [4/8] Logging out from Artifact Registry..."
sudo docker logout "${AR_HOSTNAME}" 2>/dev/null || true

# ── Step 5: Start Green container ─────────────────────────────────────────────
echo "> [5/8] Starting Green container (${GREEN_CONTAINER})..."
sudo docker rm -f "${GREEN_CONTAINER}" 2>/dev/null || true

sudo docker run -d \
  --name "${GREEN_CONTAINER}" \
  --restart=always \
  --network "${DOCKER_NETWORK}" \
  --env-file "${ENV_FILE_PATH}" \
  "${IMAGE}"

# ── Step 6: Verify Green container stability (detect crash-loop) ─────────────
echo "> [6/8] Verifying Green container stability (${VERIFY_ATTEMPTS} attempts)..."
HEALTHY=0

for i in $(seq 1 "${VERIFY_ATTEMPTS}"); do
  RUNNING=$(sudo docker inspect -f '{{.State.Running}}' "${GREEN_CONTAINER}" 2>/dev/null || echo 'false')
  RESTARTS=$(sudo docker inspect -f '{{.RestartCount}}' "${GREEN_CONTAINER}" 2>/dev/null || echo '0')
  EXIT_CODE=$(sudo docker inspect -f '{{.State.ExitCode}}' "${GREEN_CONTAINER}" 2>/dev/null || echo '1')

  if [ "${RUNNING}" != "true" ] || [ "${RESTARTS}" != "0" ]; then
    if [ "${i}" -eq "${VERIFY_ATTEMPTS}" ]; then
      echo "[ERROR] Green container failed stability check (running=${RUNNING}, restarts=${RESTARTS}, exit=${EXIT_CODE})"
      echo "[LOG] Green container logs:"
      sudo docker logs "${GREEN_CONTAINER}" --tail=100 2>/dev/null || true
      sudo docker rm -f "${GREEN_CONTAINER}" 2>/dev/null || true
      exit 1
    fi
    echo "[WAIT] Green attempt ${i}/${VERIFY_ATTEMPTS} — running=${RUNNING} restarts=${RESTARTS}"
    sleep "${VERIFY_SLEEP_SEC}"
    continue
  fi

  # After a few successful stable polls, accept
  if [ "${i}" -ge 5 ]; then
    echo "[OK] Green container stable after $((i * VERIFY_SLEEP_SEC))s (restarts=${RESTARTS})."
    HEALTHY=1
    break
  fi

  sleep "${VERIFY_SLEEP_SEC}"
done

if [ "${HEALTHY}" -ne 1 ]; then
  echo "[ERROR] Green container not stable after verification window!"
  sudo docker logs "${GREEN_CONTAINER}" --tail=100 2>/dev/null || true
  sudo docker rm -f "${GREEN_CONTAINER}" 2>/dev/null || true
  exit 1
fi

# ── Step 7: Atomic swap ───────────────────────────────────────────────────────
echo "> [7/8] Swapping Green into service name..."
sudo docker rm -f "${OLD_CONTAINER}" 2>/dev/null || true
sudo docker rename "${SERVICE_NAME}" "${OLD_CONTAINER}" 2>/dev/null || true
sudo docker rename "${GREEN_CONTAINER}" "${SERVICE_NAME}"

# ── Step 8: Cleanup old container + stale images ─────────────────────────────
echo "> [8/8] Cleaning old container and stale images..."
sudo docker stop "${OLD_CONTAINER}" 2>/dev/null || true
sudo docker rm -f "${OLD_CONTAINER}" 2>/dev/null || true

OLD_IDS=$(sudo docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' \
  | awk -v current="${IMAGE}" -v repo="${IMAGE_REPO}" \
    'substr($1, 1, length(repo)+1) == repo":" && $1 != current { print $2 }' \
  | sort -u)
[ -n "${OLD_IDS}" ] && echo "${OLD_IDS}" | xargs -r sudo docker rmi -f 2>/dev/null || true
sudo docker image prune -f 2>/dev/null || true

echo ""
echo "[OK] uc-stellar Worker deployment complete!"
echo "     Service  : ${SERVICE_NAME}"
echo "     Image    : ${IMAGE}"
echo "=============================================="
