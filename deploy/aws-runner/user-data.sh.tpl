#!/bin/bash
# Boots a self-hosted GitHub Actions runner that takes one job at a time (ephemeral).
set -euo pipefail
# also to the serial console, so `aws ec2 get-console-output` shows how far the boot got
exec > >(tee -a /var/log/openhabit-runner-setup.log /dev/console) 2>&1
echo "openhabit-runner: bootstrap started"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends curl ca-certificates git jq unzip libicu70 awscli

# Node 22 (the version CI uses)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

id runner >/dev/null 2>&1 || useradd -m -s /bin/bash runner

# ---- the data disk: npm cache, Playwright browsers and job workspaces survive restarts ----
SERIAL="${data_volume_serial}"
DATA=/opt/runner-data
if [ -n "$SERIAL" ]; then
  DEV="/dev/disk/by-id/nvme-Amazon_Elastic_Block_Store_$SERIAL"
  for i in $(seq 1 60); do [ -e "$DEV" ] && break; echo "waiting for the data disk ($i)"; sleep 5; done
  if [ -e "$DEV" ]; then
    blkid "$DEV" >/dev/null 2>&1 || mkfs.ext4 -L ohdata "$DEV"
    mkdir -p "$DATA"
    grep -q ' /opt/runner-data ' /etc/fstab || echo "LABEL=ohdata $DATA ext4 defaults,nofail 0 2" >> /etc/fstab
    mount -a
  else
    echo "data disk did not appear; falling back to the root disk"
  fi
fi
mkdir -p "$DATA/work" "$DATA/npm-cache" "$DATA/playwright"
chown -R runner:runner "$DATA"
install -d -o runner -g runner /opt/actions-runner
cd /opt/actions-runner

VERSION="${runner_version}"
if [ -z "$VERSION" ]; then
  VERSION=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | jq -r .tag_name | sed 's/^v//')
fi
curl -fsSL -o runner.tgz "https://github.com/actions/runner/releases/download/v$VERSION/actions-runner-linux-x64-$VERSION.tar.gz"
tar xzf runner.tgz && rm runner.tgz
chown -R runner:runner /opt/actions-runner

# Playwright's browser dependencies (the browser itself is installed per job by the workflow)
npx --yes playwright@1.56.1 install-deps chromium

# Register, run one job, repeat. The token never touches disk: it is read from Secrets Manager each time.
cat > /usr/local/bin/openhabit-runner-loop <<'LOOP'
#!/bin/bash
set -uo pipefail
cd /opt/actions-runner
while true; do
  PAT=$(aws secretsmanager get-secret-value --region ${region} --secret-id '${secret_id}' --query SecretString --output text 2>/dev/null || true)
  if [ -z "$PAT" ] || [ "$PAT" = "None" ]; then
    echo "no GitHub token in secret ${secret_id} yet; retrying in 60s" | tee /dev/console; sleep 60; continue
  fi
  REG=$(curl -fsS -X POST -H "Authorization: Bearer $PAT" -H "Accept: application/vnd.github+json" \
        "https://api.github.com/repos/${repository}/actions/runners/registration-token" | jq -r .token) || REG=""
  unset PAT
  if [ -z "$REG" ] || [ "$REG" = "null" ]; then echo "could not get a registration token; retrying in 60s"; sleep 60; continue; fi
  echo "openhabit-runner: registering an ephemeral runner" | tee /dev/console
  ./config.sh --unattended --ephemeral --replace --url "https://github.com/${repository}" --token "$REG" \
    --name "$(hostname)-$(date +%s)" --labels '${labels}' --work /opt/runner-data/work
  ./run.sh   # returns after one job
done
LOOP
chmod +x /usr/local/bin/openhabit-runner-loop

cat > /etc/systemd/system/openhabit-runner.service <<'UNIT'
[Unit]
Description=OpenHabit CI runner (ephemeral)
After=network-online.target
Wants=network-online.target

[Service]
User=runner
Environment=npm_config_cache=/opt/runner-data/npm-cache
Environment=PLAYWRIGHT_BROWSERS_PATH=/opt/runner-data/playwright
ExecStart=/usr/local/bin/openhabit-runner-loop
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now openhabit-runner.service
echo "openhabit-runner: bootstrap finished; waiting for a GitHub token in ${secret_id}"
