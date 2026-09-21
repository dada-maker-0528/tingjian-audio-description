"""Scoped release to the existing, pinned Tencent host. No credentials in output.
Usage: python -X utf8 scripts/deploy-server.py --ssh-helper PATH --stage
       python -X utf8 scripts/deploy-server.py --ssh-helper PATH --activate
"""
from pathlib import Path
import argparse, importlib.util, json, hashlib, secrets, tarfile, datetime, subprocess

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.test-artifacts/deploy'
DOMAIN='tingjian.43.129.168.70.sslip.io'
p=argparse.ArgumentParser();p.add_argument('--ssh-helper',required=True);p.add_argument('--stage',action='store_true');p.add_argument('--activate',action='store_true');args=p.parse_args()
OUT.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('pinned_remote',args.ssh_helper);remote=importlib.util.module_from_spec(spec);spec.loader.exec_module(remote)
access_path=OUT/'access.json'
if access_path.exists(): access=json.loads(access_path.read_text(encoding='utf8'))
else:
 access={'url':'https://'+DOMAIN,'username':'tingjian','password':secrets.token_urlsafe(24)}
 access_path.write_text(json.dumps(access,indent=2),encoding='utf8')
(OUT/'访问说明.md').write_text('# 听见测试入口\n\n地址：'+access['url']+'\n\n用户名：`'+access['username']+'`\n\n密码：`'+access['password']+'`\n\n首次访问在浏览器登录框输入。此为团队共享测试空间，请勿上传私人影片。\n',encoding='utf8')
client=remote.connect()
def command(script):
 ch=client.get_transport().open_session();ch.set_combine_stderr(True);ch.exec_command('sudo -n bash -s');ch.sendall(script.encode());ch.shutdown_write()
 while True:
  block=ch.recv(65536)
  if not block:break
  print(block.decode('utf8','replace'),end='',flush=True)
 if ch.recv_exit_status():raise RuntimeError('Scoped deployment step failed; see preceding status')
def upload(local,dest):
 with client.open_sftp() as sftp:sftp.put(str(local),dest)
try:
 if args.stage:
  release='release-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
  manifest=[];archive=OUT/(release+'.tar.gz')
  with tarfile.open(archive,'w:gz') as tar:
   paths=[ROOT/'package.json',ROOT/'package-lock.json']
   for folder in ['backend','server','public']:
    paths.extend(f for f in (ROOT/folder).rglob('*') if f.is_file() and not f.name.endswith('.test.mjs'))
   for f in paths:
    rel=f.relative_to(ROOT).as_posix();tar.add(f,arcname=rel,recursive=False);manifest.append({'file':rel,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
   # Fixed prompts only. Do not export dynamically spoken filenames or private text.
   code="import {UISpeechCache} from './server/ui-speech.mjs';import {UI_PROMPTS} from './public/ui-speech.js';import {VOICES} from './public/voices.js';const c=new UISpeechCache('.');console.log(JSON.stringify(VOICES.flatMap(v=>UI_PROMPTS.map(t=>c.input(t,v.id).key+'.wav'))));"
   fixed=json.loads(subprocess.run(['node','--env-file=.env','--input-type=module','-e',code],cwd=ROOT,text=True,capture_output=True,check=True).stdout)
   for name in fixed:
    f=ROOT/'.aimedia/ui-speech'/name
    if f.exists():tar.add(f,arcname='seed/ui-speech/'+f.name,recursive=False)
  state={'release':release,'url':access['url'],'files':manifest};(OUT/'release.json').write_text(json.dumps(state,indent=2),encoding='utf8')
  upload(archive,'/home/ubuntu/tingjian-release.tar.gz')
  env={}
  for line in (ROOT/'.env').read_text(encoding='utf8').splitlines():
   if '=' in line and not line.startswith('#'):
    k,v=line.split('=',1)
    if k in ['VOLC_TTS_KEY','VOLC_TTS_RESOURCE_ID','AIMEDIA_API_KEY','AIMEDIA_BASE_URL','AIMEDIA_PROVIDER','AIMEDIA_VISION_MODEL','AIMEDIA_ASR_MODEL']:env[k]=v
  env.update(PORT='5295',TINGJIAN_TTS_PROVIDER='doubao',AIMEDIA_DATA_DIR='/opt/tingjian/data',FFMPEG_PATH='/usr/bin/ffmpeg',TINGJIAN_PUBLIC_ORIGIN=access['url'],TINGJIAN_RELEASE=release,NODE_OPTIONS='--max-old-space-size=384',OMP_NUM_THREADS='1',OPENBLAS_NUM_THREADS='1')
  private={'environment':env,'login':access}
  with client.open_sftp() as sftp:
   with sftp.open('/home/ubuntu/tingjian-private.json','w') as f:f.write(json.dumps(private))
   sftp.chmod('/home/ubuntu/tingjian-private.json',0o600)
  command('''set -eu
id tingjian >/dev/null 2>&1 || useradd --system --home /opt/tingjian --shell /usr/sbin/nologin tingjian
install -d -m 755 /opt/tingjian/releases /opt/tingjian/acme /var/www/tingjian-acme/.well-known/acme-challenge
install -d -m 700 /etc/tingjian /etc/tingjian/tls
install -d -o tingjian -g tingjian -m 700 /opt/tingjian/data /opt/tingjian/data/ui-speech
if [ ! -x /opt/tingjian/runtime/bin/node ]; then cp -a /opt/liming-classroom/runtime /opt/tingjian/runtime; fi
cp /opt/liming-classroom/acme/acme_tiny.py /opt/tingjian/acme/acme_tiny.py
if [ ! -x /usr/bin/ffmpeg ]; then export DEBIAN_FRONTEND=noninteractive; apt-get update -qq > /opt/tingjian/install.log 2>&1; apt-get install -y --no-install-recommends ffmpeg >> /opt/tingjian/install.log 2>&1; fi
install -d /opt/tingjian/releases/RELEASE
tar -xzf /home/ubuntu/tingjian-release.tar.gz -C /opt/tingjian/releases/RELEASE
cp -n /opt/tingjian/releases/RELEASE/seed/ui-speech/*.wav /opt/tingjian/data/ui-speech/
chown -R tingjian:tingjian /opt/tingjian/data
python3 - <<'PY'
import json,pathlib,subprocess,os
p=pathlib.Path('/home/ubuntu/tingjian-private.json');d=json.loads(p.read_text())
env=pathlib.Path('/etc/tingjian/app.env');env.write_text(''.join(k+'='+v+'\\n' for k,v in d['environment'].items()));os.chmod(env,0o600)
subprocess.run(['chown','tingjian:tingjian',str(env)],check=True)
hashed=subprocess.run(['openssl','passwd','-apr1','-stdin'],input=d['login']['password']+'\\n',text=True,capture_output=True,check=True).stdout.strip()
auth=pathlib.Path('/etc/tingjian/htpasswd');auth.write_text(d['login']['username']+':'+hashed+'\\n');os.chmod(auth,0o640)
subprocess.run(['chown','root:www-data',str(auth)],check=True);p.unlink()
PY
chmod 711 /etc/tingjian
cd /opt/tingjian/releases/RELEASE
PATH=/opt/tingjian/runtime/bin:$PATH npm ci --omit=dev --ignore-scripts --no-audit --no-fund > /opt/tingjian/npm-install.log 2>&1
/opt/tingjian/runtime/bin/node --check server/local.mjs
echo 'Release staged; no public entry switched.'
'''.replace('RELEASE',release))
 if args.activate:
  result=json.loads((ROOT/'.test-artifacts/live-release/result.json').read_text(encoding='utf8'))
  if not result.get('passed'):raise RuntimeError('Real backend chain must pass before activation')
  release=json.loads((OUT/'release.json').read_text(encoding='utf8'))['release']
  command('''set -eu
cat > /etc/nginx/sites-available/tingjian.conf <<'NGINX'
server {
 listen 80;
 server_name DOMAIN;
 location /.well-known/acme-challenge/ { root /var/www/tingjian-acme; }
 location / { return 301 https://DOMAIN$request_uri; }
}
NGINX
ln -sfn /etc/nginx/sites-available/tingjian.conf /etc/nginx/sites-enabled/tingjian.conf
nginx -t
systemctl reload nginx
if ! openssl x509 -in /etc/tingjian/tls/fullchain.pem -checkend 604800 -noout 2>/dev/null; then
 umask 077
 openssl genrsa -out /etc/tingjian/tls/account.key 4096 2>/dev/null
 openssl req -new -newkey rsa:2048 -nodes -keyout /etc/tingjian/tls/domain.key -out /etc/tingjian/tls/domain.csr -subj '/CN=DOMAIN' -addext 'subjectAltName=DNS:DOMAIN' 2>/dev/null
 timeout 180 python3 /opt/tingjian/acme/acme_tiny.py --account-key /etc/tingjian/tls/account.key --csr /etc/tingjian/tls/domain.csr --acme-dir /var/www/tingjian-acme/.well-known/acme-challenge > /etc/tingjian/tls/fullchain.pem
fi
openssl x509 -in /etc/tingjian/tls/fullchain.pem -checkend 604800 -noout
cat > /etc/systemd/system/tingjian.service <<'SERVICE'
[Unit]
Description=Tingjian audio description
After=network-online.target
Wants=network-online.target
[Service]
User=tingjian
Group=tingjian
WorkingDirectory=/opt/tingjian/current
ExecStart=/opt/tingjian/runtime/bin/node --env-file=/etc/tingjian/app.env server/local.mjs
Restart=on-failure
RestartSec=4
MemoryMax=800M
CPUQuota=120%
TasksMax=128
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/tingjian/data
UMask=0077
[Install]
WantedBy=multi-user.target
SERVICE
readlink /opt/tingjian/current > /opt/tingjian/previous-release.txt 2>/dev/null || true
ln -sfn /opt/tingjian/releases/RELEASE /opt/tingjian/current
systemctl daemon-reload
systemctl enable tingjian
systemctl restart tingjian
for i in $(seq 1 30); do if curl -fsS http://127.0.0.1:5295/healthz; then break; fi; sleep 1; done
curl -fsS http://127.0.0.1:5295/healthz
cat >> /etc/nginx/sites-available/tingjian.conf <<'NGINX'
server {
 listen 443 ssl http2;
 server_name DOMAIN;
 ssl_certificate /etc/tingjian/tls/fullchain.pem;
 ssl_certificate_key /etc/tingjian/tls/domain.key;
 ssl_protocols TLSv1.2 TLSv1.3;
 auth_basic "Tingjian team preview";
 auth_basic_user_file /etc/tingjian/htpasswd;
 client_max_body_size 500m;
 add_header X-Content-Type-Options nosniff always;
 add_header X-Robots-Tag "noindex, nofollow" always;
 add_header Referrer-Policy same-origin always;
 add_header Permissions-Policy 'microphone=(self)' always;
 location / {
  proxy_pass http://127.0.0.1:5295;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto https;
  proxy_http_version 1.1;
  proxy_request_buffering off;
  proxy_buffering off;
  proxy_read_timeout 120s;
 }
}
NGINX
nginx -t
systemctl reload nginx
cat > /opt/tingjian/acme/renew.sh <<'RENEW'
#!/bin/sh
set -eu
TLS=/etc/tingjian/tls
if openssl x509 -in "$TLS/fullchain.pem" -checkend 2592000 -noout; then exit 0; fi
umask 077
timeout 180 python3 /opt/tingjian/acme/acme_tiny.py --account-key "$TLS/account.key" --csr "$TLS/domain.csr" --acme-dir /var/www/tingjian-acme/.well-known/acme-challenge > "$TLS/fullchain.new.pem"
openssl x509 -in "$TLS/fullchain.new.pem" -checkend 604800 -noout
openssl x509 -in "$TLS/fullchain.new.pem" -noout -checkhost DOMAIN
cp "$TLS/fullchain.pem" "$TLS/fullchain.previous.pem"
mv "$TLS/fullchain.new.pem" "$TLS/fullchain.pem"
if ! /usr/sbin/nginx -t; then mv "$TLS/fullchain.previous.pem" "$TLS/fullchain.pem"; exit 1; fi
systemctl reload nginx
RENEW
chmod 700 /opt/tingjian/acme/renew.sh
cat > /etc/systemd/system/tingjian-certificate-renew.service <<'RENEW'
[Unit]
Description=Renew Tingjian HTTPS certificate
[Service]
Type=oneshot
ExecStart=/opt/tingjian/acme/renew.sh
RENEW
cat > /etc/systemd/system/tingjian-certificate-renew.timer <<'RENEW'
[Unit]
Description=Daily Tingjian certificate check
[Timer]
OnCalendar=daily
RandomizedDelaySec=3600
Persistent=true
[Install]
WantedBy=timers.target
RENEW
systemctl daemon-reload
systemctl enable --now tingjian-certificate-renew.timer
echo 'Tingjian activated with HTTPS and team authentication.'
systemctl show liming-classroom -p MainPID -p ActiveEnterTimestamp
'''.replace('DOMAIN',DOMAIN).replace('RELEASE',release))
finally:client.close()
