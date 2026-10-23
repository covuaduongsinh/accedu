import json,base64,collections,sys
cap=sys.argv[1]
d=json.load(open(cap))
nr=d['normalized_result'] if 'normalized_result' in d else d['details']['partial_observation']
ev=nr['events']['items']
steps={s['step_index']:s['step_id'] for s in nr['steps']}
req={e['transaction_id']:e for e in ev if e['kind']=='request'}
bodies=collections.defaultdict(dict)
for e in ev:
  if e['kind']=='network-content' and e['body'].get('state')=='captured':
    bodies[e['transaction_id']][e['phase']]=base64.b64decode(e['body']['content'])
out=collections.defaultdict(list)
for tid,e in req.items():
  sid=steps.get(e['step_index'],'')
  if e['resource_type'] in('xhr','fetch') and sid.startswith('p-'):
    import re as _re
    page=_re.sub(r'-(w|new|form|esc|esc-w)$','',sid[2:])
    m=e['url']['url'].split('/')[-1]
    try: rq=json.loads(bodies[tid].get('request',b'{}') or b'{}')
    except Exception: rq={}
    try: rs=json.loads(bodies[tid].get('response',b'{}') or b'{}')
    except Exception: rs={}
    out[page].append({'step':sid,'method':m,'req':rq,'resp':rs})
json.dump(out,open(sys.argv[2],'w'),ensure_ascii=False)
print({k:[x['method'] for x in v] for k,v in out.items()})
