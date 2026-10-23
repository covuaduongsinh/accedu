import json,sys,os
out, chrome, cmds = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
caps = sys.argv[4].split(',') if len(sys.argv)>4 else ["url","accessibility"]
wait = int(os.environ.get('WAIT','7000'))
menu = json.load(open(os.path.join(os.environ.get('RAW','research-raw'),'menu0.json')))['d']
idx = {}
def walk(items):
  for it in items or []:
    idx.setdefault(it['CommandName'], it['CommandIndex']); walk(it.get('MenuItems'))
for t in menu: walk(t['MenuItems'])
BASE="https://e6.faonline.vn/DUONGSINH/Main/"
acts = [
 {"step_id":"settle","action":"wait_for_timeout","duration_ms":2500},
 {"step_id":"user","action":"fill","locator":{"kind":"css","selector":"#LoginExtender_txtUserName"},"value":{"source":"literal","value":"ADMIN"}},
 {"step_id":"user-tab","action":"press","locator":{"kind":"css","selector":"#LoginExtender_txtUserName"},"key":"Tab"},
 {"step_id":"unit-load","action":"wait_for_timeout","duration_ms":2500},
 {"step_id":"password","action":"fill","locator":{"kind":"css","selector":"#LoginExtender_txtPassword"},"value":{"source":"secret","secret_id":"fao_password"}},
 {"step_id":"ok","action":"click","locator":{"kind":"css","selector":"#LoginExtender_Ok"},"timeout_ms":15000},
]
if os.environ.get('FORCE')=='1':
  acts += [{"step_id":"dup-wait","action":"wait_for_timeout","duration_ms":3000},
           {"step_id":"force","action":"click","locator":{"kind":"role","role":"button","name":"Có"},"timeout_ms":10000}]
acts += [{"step_id":"main","action":"wait_for","locator":{"kind":"css","selector":"#ctl00_MenuExtender_MenuBarGroup0"},"state":"visible","timeout_ms":30000}]
for c in cmds:
  new = c.startswith('+')
  c = c.lstrip('+')
  sid = 'p-' + c.replace('.aspx','').replace('_','-').lower()
  acts += [{"step_id":sid,"action":"goto","destination":{"url":BASE+c+"?id="+idx[c]},"wait_until":"load","timeout_ms":45000},
           {"step_id":sid+"-w","action":"wait_for_timeout","duration_ms":wait}]
  if new:
    acts += [{"step_id":sid+"-new","action":"click","locator":{"kind":"css","selector":"#ctl00_FastBusiness_MainReport_ToolbarButton_New"},"timeout_ms":15000},
             {"step_id":sid+"-form","action":"wait_for_timeout","duration_ms":6000},
             {"step_id":sid+"-esc","action":"press","locator":{"kind":"css","selector":"body"},"key":"Escape"},
             {"step_id":sid+"-esc-w","action":"wait_for_timeout","duration_ms":1500}]
acts += [
 {"step_id":"logout-home","action":"goto","destination":{"url":BASE+"Main.aspx"},"wait_until":"load","timeout_ms":30000},
 {"step_id":"logout","action":"click","locator":{"kind":"css","selector":"a[onclick*=\"commandName:'Logout'\"]"},"timeout_ms":15000},
 {"step_id":"logout-wait","action":"wait_for_timeout","duration_ms":3000},
]
sc = {"browser":{"mode":"launch","executable_path":chrome,"headless":True},
 "start_url":{"url":BASE+"Login.aspx"},
 "environment":{"locale":"vi-VN","timezone":"Asia/Ho_Chi_Minh","viewport":{"width":1600,"height":1000}},
 "secrets":[{"secret_id":"fao_password","environment_variable":"FAO_PASSWORD"}],
 "actions":acts,
 "capture":{"after_each_step":caps,"events":["network"],
   "network":{"request_body":True,"response_body":True,"header_values":False},
   "limits":{"max_network_body_bytes":2097152,"max_network_body_allocation_bytes":134217728,"max_event_allocation_bytes":67108864,"max_total_event_allocation_bytes":268435456,"max_network_transactions":4096}}}
json.dump(sc, open(out,'w'), ensure_ascii=False, indent=1)
print(len(acts),'actions')
