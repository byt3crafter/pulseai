#!/usr/bin/env bash
# Build and push images on the build host, without filling its disk.
#
#   ./scripts/remote-build.sh 0.20.19 dashboard gateway
#
# Exists because iterating by hand — systemd-run with a throwaway build script —
# skips the pruning that deploy.sh and fleet-update.sh do, and nineteen builds in
# a day took the box from 76% to 100% full. At 123 MB free Postgres is one write
# away from failing, so this reclaims first and refuses to start if it cannot.
set -euo pipefail

VERSION="${1:?usage: remote-build.sh <version> [service ...]}"
shift
SERVICES=("${@:-dashboard gateway}")
HOST="${PULSE_VPS_HOST:-pulse-vps}"
REGISTRY="${PULSE_REGISTRY:-registry.runstate.mu}"
MIN_FREE_GB="${MIN_FREE_GB:-12}"

read -r -d '' REMOTE <<REMOTE_EOF || true
set -euo pipefail
cd /opt/pulse-ai

# Reclaim before building, not after: the build is what runs out of room.
docker builder prune -af >/dev/null 2>&1 || true
docker image prune -f >/dev/null 2>&1 || true

FREE_GB=\$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
echo "free after prune: \${FREE_GB}G"
if [ "\$FREE_GB" -lt ${MIN_FREE_GB} ]; then
    echo "REFUSING: only \${FREE_GB}G free, need ${MIN_FREE_GB}G." >&2
    echo "Old image tags are the usual culprit — list with:" >&2
    echo "  docker images ${REGISTRY}/pulse-dashboard --format '{{.Tag}}'" >&2
    exit 1
fi

for svc in ${SERVICES[*]}; do
    case "\$svc" in
        dashboard) docker build -f dashboard/Dockerfile -t ${REGISTRY}/pulse-dashboard:${VERSION} . ;;
        gateway)   docker build -f pulse/Dockerfile     -t ${REGISTRY}/pulse-gateway:${VERSION} . ;;
        *) echo "unknown service: \$svc" >&2; exit 1 ;;
    esac
done
for svc in ${SERVICES[*]}; do
    case "\$svc" in
        dashboard) docker push ${REGISTRY}/pulse-dashboard:${VERSION} ;;
        gateway)   docker push ${REGISTRY}/pulse-gateway:${VERSION} ;;
    esac
done
df -h / | tail -1
echo BUILD_ALL_DONE
REMOTE_EOF

ssh "$HOST" "cat > /tmp/pulse-remote-build.sh" <<< "$REMOTE"
ssh "$HOST" "chmod +x /tmp/pulse-remote-build.sh && systemd-run --unit=pulse-build-${VERSION//./-} --collect bash -c '/tmp/pulse-remote-build.sh > /tmp/build-${VERSION}.log 2>&1'"
echo "started — tail with: ssh $HOST 'tail -f /tmp/build-${VERSION}.log'"
