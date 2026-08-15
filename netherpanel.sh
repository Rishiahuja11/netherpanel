#!/bin/sh
# Portable launcher: this script needs bash, but shebangs like /usr/bin/env
# don't exist on every platform (e.g. Termux). Re-exec with bash from PATH.
if command -v bash >/dev/null 2>&1 && [ -z "${NETHER_REEXEC:-}" ]; then
  NETHER_REEXEC=1
  export NETHER_REEXEC
  exec bash "$0" "$@"
fi
# ============================================================
#  NetherPanel CLI  (Linux / Termux)
#  Manage your NetherPanel servers straight from a terminal.
#
#  First-time setup:
#    ./netherpanel.sh --api https://panel.example.com
#    ./netherpanel.sh login
#
#  Options:
#    --api <url>        Save the default API endpoint and exit
#    --token <token>    Save an API token and exit (or use `login`)
#    -h, --help         Show this help
#
#  Commands:
#    servers                          List all servers
#    status [id|name]                 Live status of one or all servers
#    start  <id|name>                 Start a server
#    stop   <id|name>                 Stop a server
#    restart <id|name>                Restart a server
#    kill   <id|name>                 Force-kill a server
#    send   <id|name> <command>       Send a console command
#    console <id|name> [lines]        Show recent console output
#    logs   <id|name> [lines]         Show recent server log lines
#    backups <id|name>                List backups
#    backup <id|name> [name]          Create a backup
#    plugins <id|name>                List installed plugins/mods
#    plugins search <id|name> <query> Search plugins/mods to install
#    plugins install <id|name> <mod_id> [version_id]
#                                     Install a plugin/mod
#    cf login [email] [password]      Log into Cloudflare (creates API token + tunnel)
#    cf tunnel                        Create/start the Cloudflare Tunnel
#    cf status                        Show Cloudflare login/tunnel status
#
#  Examples:
#    ./netherpanel.sh servers
#    ./netherpanel.sh start smp
#    ./netherpanel.sh send smp "say hello from the CLI"
#    ./netherpanel.sh plugins search smp "world guard"
# ============================================================

set -u

CONF="${NETHERPANEL_CONF:-$HOME/.netherpanel.conf}"

load_conf() {
  API_URL=""
  TOKEN=""
  if [ -f "$CONF" ]; then
    # shellcheck disable=SC1090
    . "$CONF"
  fi
}

save_conf() {
  umask 077
  {
    [ -n "${API_URL:-}" ] && printf 'API_URL=%q\n' "$API_URL"
    [ -n "${TOKEN:-}" ] && printf 'TOKEN=%q\n' "$TOKEN"
  } > "$CONF"
}

have() { command -v "$1" >/dev/null 2>&1; }

json_get() {
  # json_get <json> <dotted.path> -> value (string, empty if missing)
  local json="$1" path="$2"
  if have python3; then
    python3 - "$json" "$path" <<'PYEOF'
import sys, json
try:
    cur = json.loads(sys.argv[1])
except Exception:
    sys.exit(1)
for part in sys.argv[2].split('.'):
    if isinstance(cur, list):
        try:
            cur = cur[int(part)]
        except Exception:
            sys.exit(1)
    elif isinstance(cur, dict) and part in cur:
        cur = cur[part]
    else:
        sys.exit(1)
if isinstance(cur, (dict, list)):
    print(json.dumps(cur))
elif cur is not None:
    print(cur)
PYEOF
  else
    # Degraded fallback: top-level string/number fields only
    sed -n "s/.*\"${path##*.}\":\"\\([^\"]*\\)\".*/\\1/p; s/.*\"${path##*.}\":\\([0-9.]*\\)[,}].*/\\1/p" <<< "$json" | head -n1
  fi
}

api() {
  # api <METHOD> <path> [json_body]  -> prints response body (no error -> 0)
  local method="$1" path="$2" data="${3:-}" tmp code
  tmp="$(mktemp 2>/dev/null || mktemp -t npXXXXXX)"
  local args=(-sS -X "$method" "$API_URL$path" -o "$tmp" -w '%{http_code}')
  [ -n "$TOKEN" ] && args+=(-H "Authorization: Bearer $TOKEN")
  if [ -n "$data" ]; then
    args+=(-H "Content-Type: application/json" --data "$data")
  fi
  code="$(curl "${args[@]}" 2>"$tmp.err")" || {
    local msg; msg="$(cat "$tmp.err" 2>/dev/null)"
    echo "Error: cannot reach $API_URL ${msg:+($msg)}" >&2
    rm -f "$tmp" "$tmp.err"
    return 1
  }
  local body; body="$(cat "$tmp" 2>/dev/null)"
  rm -f "$tmp" "$tmp.err"
  if [ "${code:-000}" = "000" ]; then
    echo "Error: cannot reach $API_URL" >&2
    return 1
  fi
  if [ "$code" -ge 400 ] 2>/dev/null; then
    local err; err="$(json_get "$body" error)"
    echo "Error ($code): ${err:-HTTP $code}" >&2
    return 1
  fi
  printf '%s' "$body"
}

server_id() {
  # server_id <id|name> -> prints numeric id
  local q="$1"
  case "$q" in
    ''|*[!0-9]*) : ;;
    *) echo "$q"; return 0 ;;
  esac
  if ! have python3; then
    echo "Error: python3 is required to look up servers by name" >&2
    return 1
  fi
  local list; list="$(api GET /api/client/servers)" || return 1
  [ -n "$list" ] || { echo "Error: no servers found" >&2; return 1; }
  local found
  found="$(python3 - "$list" "$q" <<'PYEOF'
import sys, json
try:
    servers = json.loads(sys.argv[1])
except Exception:
    sys.exit(1)
q = sys.argv[2].lower()
for s in servers:
    if str(s.get("id")) == q or str(s.get("name", "")).lower() == q or str(s.get("slug", "")).lower() == q:
        print(s["id"]); sys.exit(0)
sys.exit(1)
PYEOF
  )" || { echo "Error: server '$q' not found" >&2; return 1; }
  echo "$found"
}

need_api() {
  [ -n "${API_URL:-}" ] || { echo "No API endpoint set. Run: $0 --api https://your-panel.example.com" >&2; return 1; }
}

need_server() {
  local id
  id="$(server_id "$1")" || return 1
  echo "$id"
}

# ---------------- commands ----------------

cmd_login() {
  local username password code res body
  read -r -p "Username: " username
  read -r -s -p "Password: " password
  echo
  res="$(api POST /api/auth/login "{\"username\":\"$(json_escape "$username")\",\"password\":\"$(json_escape "$password")\"}")" || return 1
  body="$(printf '%s' "$res")"
  TOKEN="$(json_get "$body" token)"
  if [ -z "$TOKEN" ]; then
    echo "Login failed: $(json_get "$body" error)" >&2
    return 1
  fi
  save_conf
  echo "Logged in as $username. Token stored in $CONF"
}

cmd_servers() {
  local list; list="$(api GET /api/client/servers)" || return 1
  [ -n "$list" ] || { echo "No servers."; return 0; }
  if ! have python3; then echo "$list"; return 0; fi
  python3 - "$list" <<'PYEOF'
import sys, json
try:
    servers = json.loads(sys.argv[1])
except Exception:
    sys.exit(1)
if not servers:
    print("No servers.")
    sys.exit(0)
hdr = "%-4s %-24s %-10s %-10s %s" % ("ID", "NAME", "STATUS", "TYPE", "ADDRESS")
print(hdr)
print("-" * len(hdr))
for s in servers:
    addr = s.get("subdomain") or ("localhost:%s" % s.get("port", ""))
    print("%-4s %-24s %-10s %-10s %s" % (
        s.get("id"), str(s.get("name", ""))[:24], s.get("status", "-"),
        s.get("server_type", "-"), addr))
PYEOF
}

cmd_status() {
  if [ $# -eq 0 ]; then
    cmd_servers
    echo
    local list; list="$(api GET /api/client/servers)" || return 1
    python3 - "$list" <<'PYEOF'
import sys, json
try:
    servers = json.loads(sys.argv[1])
except Exception:
    sys.exit(1)
for s in servers:
    r = s.get("resources") or {}
    print("Server #%s %s: %s (pid %s, mem %s, cpu %s%%, up %s)" % (
        s.get("id"), s.get("name"), s.get("status"), r.get("pid") or "-",
        (r.get("memory") or 0) // (1024 * 1024), r.get("cpu") or 0, r.get("uptime") or "0m"))
PYEOF
    return 0
  fi
  local id; id="$(need_server "$1")" || return 1
  local s; s="$(api GET "/api/servers/$id")" || return 1
  local r; r="$(api GET "/api/servers/$id/resources" 2>/dev/null || echo '{}')"
  local name status type addr
  name="$(json_get "$s" name)"; status="$(json_get "$s" status)"
  type="$(json_get "$s" server_type)"
  addr="$(json_get "$s" subdomain)"; [ -n "$addr" ] || addr="localhost:$(json_get "$s" port)"
  local mem cpu up pid
  mem="$(json_get "$r" memory)"; cpu="$(json_get "$r" cpu)"; up="$(json_get "$r" uptime)"; pid="$(json_get "$r" pid)"
  echo "Server #$id  $name"
  echo "  Status   : $status"
  echo "  Type     : $type"
  echo "  Address  : $addr"
  echo "  PID      : ${pid:-n/a}"
  [ -n "$mem" ] && echo "  Memory   : $((mem / 1024 / 1024)) MB"
  [ -n "$cpu" ] && echo "  CPU      : $cpu %"
  [ -n "$up" ] && echo "  Uptime   : $up"
}

cmd_console() {
  local id lines="${2:-40}"
  id="$(need_server "$1")" || return 1
  local out; out="$(api GET "/api/servers/$id/console")" || return 1
  if ! have python3; then echo "$out"; return 0; fi
  python3 - "$out" "$lines" <<'PYEOF'
import sys, json
try:
    data = json.loads(sys.argv[1])
except Exception:
    sys.exit(1)
entries = data.get("console", []) if isinstance(data, dict) else data
for entry in entries[-int(sys.argv[2]):]:
    line = entry.get("line", entry) if isinstance(entry, dict) else entry
    ts = entry.get("timestamp", "") if isinstance(entry, dict) else ""
    print("%s%s" % (("%s  " % ts) if ts else "", line.rstrip("\n")))
PYEOF
}

cmd_logs() {
  local id lines="${2:-200}"
  id="$(need_server "$1")" || return 1
  local out; out="$(api GET "/api/servers/$id/logs?lines=$lines")" || return 1
  printf '%s' "$(json_get "$out" content)"
  echo
}

cmd_send() {
  local id; id="$(need_server "$1")" || return 1
  local command="${2:-}"
  [ -n "$command" ] || { echo "Usage: $0 send <server> <command>" >&2; return 1; }
  api POST "/api/servers/$id/command" "{\"command\":\"$(json_escape "$command")\"}" >/dev/null || return 1
  echo "Command sent to server $1."
}

cmd_backups() {
  local id; id="$(need_server "$1")" || return 1
  local list; list="$(api GET "/api/servers/$id/backups")" || return 1
  if ! have python3; then echo "$list"; return 0; fi
  python3 - "$list" <<'PYEOF'
import sys, json
try:
    data = json.loads(sys.argv[1])
except Exception:
    sys.exit(1)
backups = data if isinstance(data, list) else data.get("backups", [])
if not backups:
    print("No backups.")
    sys.exit(0)
print("%-4s %-28s %10s  %s" % ("ID", "NAME", "SIZE", "CREATED"))
for b in backups:
    size = b.get("size") or 0
    if size > 1024 * 1024:
        sz = "%.1f MB" % (size / (1024 * 1024))
    else:
        sz = "%.0f KB" % (size / 1024)
    print("%-4s %-28s %10s  %s" % (b.get("id"), str(b.get("name", ""))[:28], sz, b.get("created_at", "")))
PYEOF
}

cmd_backup_create() {
  local id; id="$(need_server "$1")" || return 1
  local name="${2:-backup-$(date +%Y%m%d-%H%M%S)}"
  local body; body="$(api POST "/api/servers/$id/backups" "{\"name\":\"$(json_escape "$name")\"}")" || return 1
  echo "Backup created: $(json_get "$body" name)"
}

cmd_plugins() {
  local id; id="$(need_server "$1")" || return 1
  local list; list="$(api GET "/api/servers/$id/mods")" || return 1
  if ! have python3; then echo "$list"; return 0; fi
  python3 - "$list" <<'PYEOF'
import sys, json
try:
    data = json.loads(sys.argv[1])
except Exception:
    sys.exit(1)
mods = data if isinstance(data, list) else data.get("mods", [])
if not mods:
    print("No plugins/mods installed.")
    sys.exit(0)
print("%-8s %-30s %-12s %s" % ("MOD ID", "NAME", "SOURCE", "FILE"))
for m in mods:
    print("%-8s %-30s %-12s %s" % (m.get("id"), str(m.get("name", ""))[:30], m.get("source", ""), m.get("filename", "")))
PYEOF
}

cmd_plugins_search() {
  local id; id="$(need_server "$1")" || return 1
  local query="${2:-}"
  [ -n "$query" ] || { echo "Usage: $0 plugins search <server> <query>" >&2; return 1; }
  local list; list="$(api GET "/api/servers/$id/mods/search?q=$(url_escape "$query")")" || return 1
  if ! have python3; then echo "$list"; return 0; fi
  python3 - "$list" <<'PYEOF'
import sys, json
try:
    data = json.loads(sys.argv[1])
except Exception:
    sys.exit(1)
    hits = data.get("hits") or []
if not hits:
    print("No results.")
    sys.exit(0)
print("%-12s %-34s %-10s %s" % ("MOD ID", "NAME", "LOADER", "DESCRIPTION"))
for h in hits:
    desc = (h.get("description") or "").split("\n")[0][:50]
    print("%-12s %-34s %-10s %s" % (str(h.get("mod_id") or h.get("id", ""))[:12],
          str(h.get("title") or h.get("name", ""))[:34], h.get("loader", ""), desc))
PYEOF
}

cmd_plugins_install() {
  local id; id="$(need_server "$1")" || return 1
  local mod_id="${2:-}"
  local version_id="${3:-}"
  [ -n "$mod_id" ] || { echo "Usage: $0 plugins install <server> <mod_id> [version_id]" >&2; return 1; }
  local body data
  data="{\"mod_id\":\"$(json_escape "$mod_id")\"${version_id:+,\"version_id\":\"$(json_escape "$version_id")\"}}"
  body="$(api POST "/api/servers/$id/mods/install" "$data")" || return 1
  echo "Installed: $(json_get "$body" name)"
}

cmd_cf_login() {
  local email="${1:-}" password="${2:-}" code res body pending req
  if [ -z "$email" ]; then
    read -r -p "Cloudflare email: " email
  fi
  if [ -z "$password" ]; then
    read -r -s -p "Cloudflare password: " password
    echo
  fi
  [ -n "$email" ] && [ -n "$password" ] || { echo "Cloudflare email and password are required." >&2; return 1; }
  res="$(api POST /api/admin/cloudflare/login "{\"email\":\"$(json_escape "$email")\",\"password\":\"$(json_escape "$password")\"}")" || return 1
  body="$(printf '%s' "$res")"
  pending="$(json_get "$body" requires2fa)"
  if [ "$pending" = "true" ]; then
    read -r -p "2FA code from authenticator: " code
    req="{\"pendingAuthId\":\"$(json_get "$body" pendingAuthId)\",\"code\":\"$(json_escape "$code")\"}"
    body="$(api POST /api/admin/cloudflare/login/2fa "$req")" || return 1
  fi
  if [ "$(json_get "$body" success)" = "true" ]; then
    echo "Cloudflare login successful."
    [ "$(json_get "$body" apiTokenCreated)" = "true" ] \
      && echo "  Scoped API token created." \
      || echo "  Could not create a scoped API token; using session token."
    local url; url="$(json_get "$body" tunnel.url)"
    [ -n "$url" ] && echo "  Tunnel: $url"
  else
    echo "Cloudflare login failed: $(json_get "$body" error)" >&2
    return 1
  fi
}

cmd_cf_tunnel() {
  local body; body="$(api POST /api/admin/cloudflare/tunnel)" || return 1
  if [ "$(json_get "$body" success)" = "true" ]; then
    local url; url="$(json_get "$body" url)"
    echo "Tunnel ready: ${url:-https://panel.<domain>}"
  else
    echo "Tunnel not created: $(json_get "$body" error)" >&2
    return 1
  fi
}

cmd_cf_status() {
  local body; body="$(api GET /api/admin/settings)" || return 1
  python3 - "$body" <<'PYEOF'
import sys, json
try:
    rows = json.loads(sys.argv[1])
except Exception:
    sys.exit(1)
s = {}
for r in rows:
    s[r.get("key")] = r.get("value", "")
def show(k, label, hide=False):
    v = s.get(k, "")
    if hide and v:
        v = "********"
    print("  %-24s %s" % (label + ":", v or "(not set)"))
print("Cloudflare status:")
show("cloudflare_email", "Email")
show("cloudflare_domain", "Domain")
show("cloudflare_zone_id", "Zone ID")
show("cloudflare_api_token_source", "Token source")
show("cloudflare_api_token", "API token", True)
show("cloudflare_tunnel_id", "Tunnel ID")
show("cloudflare_tunnel_url", "Tunnel URL")
PYEOF
}

cmd_start() { local id; id="$(need_server "$1")" || return 1; api POST "/api/servers/$id/start" >/dev/null || return 1; echo "Server $1 started."; }
cmd_stop()  { local id; id="$(need_server "$1")" || return 1; api POST "/api/servers/$id/stop" >/dev/null || return 1; echo "Server $1 stopped."; }
cmd_restart(){ local id; id="$(need_server "$1")" || return 1; api POST "/api/servers/$id/restart" >/dev/null || return 1; echo "Server $1 restarted."; }
cmd_kill()  { local id; id="$(need_server "$1")" || return 1; api POST "/api/servers/$id/kill" >/dev/null || return 1; echo "Server $1 killed."; }

json_escape() {
  printf '%s' "$1" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read())[1:-1])' 2>/dev/null \
    || printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

url_escape() {
  printf '%s' "$1" | python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.stdin.read().strip()))' 2>/dev/null \
    || printf '%s' "$1" | sed 's/ /%20/g; s/&/%26/g'
}

usage() {
  sed -n '2,/^# =/p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

# ---------------- main ----------------

load_conf

case "${1:-}" in
  -h|--help) usage ;;
  --api)
    [ $# -ge 2 ] || { echo "Usage: $0 --api <url>" >&2; exit 1; }
    API_URL="${2%/}"
    save_conf
    echo "API endpoint set to: $API_URL"
    exit 0
    ;;
  --token)
    [ $# -ge 2 ] || { echo "Usage: $0 --token <token>" >&2; exit 1; }
    TOKEN="$2"
    save_conf
    echo "API token stored."
    exit 0
    ;;
esac

need_api || exit 1

CMD="${1:-}"
shift || true

case "$CMD" in
  login)               cmd_login "$@" ;;
  servers|ls)          cmd_servers "$@" ;;
  status)              cmd_status "$@" ;;
  start)               cmd_start "$@" ;;
  stop)                cmd_stop "$@" ;;
  restart)             cmd_restart "$@" ;;
  kill)                cmd_kill "$@" ;;
  send)                cmd_send "$@" ;;
  console)             cmd_console "$@" ;;
  logs)                cmd_logs "$@" ;;
  backups)             cmd_backups "$@" ;;
  backup)              cmd_backup_create "$@" ;;
  plugins)
    case "${1:-}" in
      search) shift; cmd_plugins_search "$@" ;;
      install) shift; cmd_plugins_install "$@" ;;
      *) cmd_plugins "$@" ;;
    esac
    ;;
  cf)
    case "${1:-}" in
      login) shift; cmd_cf_login "$@" ;;
      tunnel) shift; cmd_cf_tunnel "$@" ;;
      status) shift; cmd_cf_status "$@" ;;
      *) echo "Usage: $0 cf login|tunnel|status" >&2; exit 1 ;;
    esac
    ;;
  *) echo "Unknown command: $CMD" >&2; echo "Run '$0 --help' for usage." >&2; exit 1 ;;
esac
