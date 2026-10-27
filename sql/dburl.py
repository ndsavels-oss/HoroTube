"""Turn whatever was pasted into SUPABASE_DB_URL into connection strings to try.

Accepts the string straight from Supabase: the password may still be in
[brackets] and may contain URL-special characters, and the host may be the
IPv6-only direct address (db.<ref>.supabase.co), which GitHub runners can't
reach, so session-pooler addresses for every region are listed after it.
Prints one URL per line; never logs them.
"""
import os, sys
from urllib.parse import quote

REGIONS = ['eu-central-1', 'eu-central-2', 'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-north-1',
           'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'ca-central-1', 'sa-east-1',
           'ap-south-1', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2']

raw = os.environ.get('DB_URL', '').strip().strip('"\'')
pw_env = os.environ.get('DB_PASSWORD', '')
if '://' not in raw or '@' not in raw:
    sys.exit('bad')
scheme, rest = raw.split('://', 1)
userinfo, hostpart = rest.rsplit('@', 1)
user, _, pw = userinfo.partition(':')
pw = pw_env or pw
if pw.startswith('[') and pw.endswith(']'):
    pw = pw[1:-1]
if pw in ('', 'YOUR-PASSWORD'):
    sys.exit('nopw')
hostport, _, tail = hostpart.partition('/')
db = (tail.split('?', 1)[0] or 'postgres')
host, _, port = hostport.partition(':')

def url(u, h, p):
    return 'postgresql://%s:%s@%s:%s/%s' % (quote(u, safe='.'), quote(pw, safe=''), h, p, db)

out = [url(user, host, port or '5432')]
if host.startswith('db.') and host.endswith('.supabase.co'):
    ref = host[3:-len('.supabase.co')]
    for pre in ('aws-0', 'aws-1'):
        for r in REGIONS:
            out.append(url('postgres.' + ref, '%s-%s.pooler.supabase.com' % (pre, r), '5432'))
print('\n'.join(out))
