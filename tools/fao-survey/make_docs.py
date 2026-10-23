import json,glob,re,sys
import os
RAW=os.environ.get('RAW','research-raw')
menu=json.load(open(RAW+'/menu0.json'))['d']
title={}
def walk(items,path):
  for it in items or []:
    title.setdefault(it['CommandName'].replace('.aspx',''), (it['HeaderText'],path))
    walk(it.get('MenuItems'),path+[it['HeaderText']])
for t in menu: walk(t['MenuItems'],[t['HeaderText']])
pages={}
for f in sorted(glob.glob(RAW+'/s*-xhr.json')):
  for k,v in json.load(open(f)).items(): pages[k]=v
TYPE={'String':'chuỗi','DateTime':'ngày','Decimal':'số','Boolean':'có/không','Int32':'số nguyên','Int16':'số nguyên','Byte':'số nguyên'}
def fdesc(f):
  lab=(f.get('Label') or f.get('HeaderText') or '').strip()
  t=TYPE.get(f.get('Type'),f.get('Type'))
  if f.get('MaxLength'): t+=f"({f['MaxLength']})"
  ctrl=f.get('ItemController') or ''
  extra=[]
  if ctrl and ctrl not in('CRDetail',): extra.append('tra cứu: '+ctrl)
  its=f.get('Items') or []
  if its: extra.append('chọn: '+'; '.join(f"{a}={b}" if isinstance(x,list) and len(x)>1 else str(x) for x in its for a,b in [ (x[0],x[1]) if isinstance(x,list) and len(x)>1 else (x,'') ]))
  dv=(f.get('DefaultValue') or '').strip()
  if dv and dv not in ("''",'0') : extra.append('mặc định: '+dv)
  if f.get('ReadOnly'): extra.append('chỉ đọc')
  return lab,f['Name'],t,', '.join(extra)
def table(fields, hide_hidden=True):
  rows=["| Nhãn | Mã trường | Kiểu | Ghi chú |","|---|---|---|---|"]
  for f in fields:
    if hide_hidden and (f.get('Hidden') or f.get('Visible') is False): continue
    lab,name,t,ex=fdesc(f)
    if not lab and not ex: continue
    rows.append(f"| {lab or '—'} | `{name}` | {t} | {ex} |")
  return rows
def section(key):
  calls=pages[key]
  cmd=key.replace('-','_') if key.startswith('rpt-') else key
  ttl,path=title.get(cmd,(key,[]))
  out=[f"### {ttl}",""]
  out.append(f"*Menu:* {' › '.join(path+[ttl])} — trang `{cmd}`")
  out.append("")
  grids=[c for c in calls if c['method']=='GetGridViewPage' and not c['step'].endswith(('-new','-form'))]
  if grids and grids[0]['resp'].get('d') and grids[0]['resp']['d'].get('ViewPage'):
    vp=grids[0]['resp']['d']['ViewPage']
    cols=[(f.get('HeaderText') or '').strip() for f in vp['Fields'] if f.get('Visible') and (f.get('HeaderText') or '').strip()]
    if cols: out+=["**Cột danh sách:** "+", ".join(cols),""]
    tb=[t.get('Name') if isinstance(t,dict) else t for t in (vp.get('Toolbar') or [])]
  dirs=[c for c in calls if c['method']=='GetDirViewPage']
  for dcall in dirs:
    d=dcall['resp'].get('d') or {}
    vp=d.get('ViewPage')
    if not vp: continue
    cats={c['Index']:c['Header'] for c in (vp.get('Categories') or [])}
    label='Form nhập liệu' if dcall['req'].get('searchMode') is False else 'Điều kiện lọc'
    out.append(f"**{label}** ({vp.get('TitleText') or ''}; tab: {', '.join(cats.values()) or '—'})")
    out.append("")
    byc={}
    for f in vp['Fields']:
      byc.setdefault(f.get('CategoryIndex',0),[]).append(f)
    for ci in sorted(byc, key=lambda x:(x<0, x)):
      name='Phần đầu' if ci==0 else ('Phần chân/tổng' if ci<0 else cats.get(ci,f'Tab {ci}'))
      rows=table(byc[ci])
      if len(rows)>2:
        out.append(f"*{name}*"); out.append(""); out+=rows; out.append("")
  dets=[c for c in calls if c['method']=='GetGridViewPage' and c['step'].endswith(('-new','-form'))]
  seen=set()
  for c in dets:
    d=c['resp'].get('d') or {}; vp=d.get('ViewPage')
    if not vp: continue
    ctrl=c['req'].get('controller')
    if ctrl in seen: continue
    seen.add(ctrl)
    rows=table(vp['Fields'])
    if len(rows)>2:
      out.append(f"*Lưới chi tiết `{ctrl}`*"); out.append(""); out+=rows; out.append("")
  return out
groups=[
 ('02-chung-tu.md','Màn hình chứng từ','Định nghĩa form nhập chứng từ (phần đầu, các tab, lưới chi tiết) lấy từ metadata `GetDirViewPage` (action New) và `GetGridViewPage` (controller chi tiết).',
  ['cactpt1','cactpc1','cactbc1','cactbn1','glctpk1','socthda','arcthd1','poctpna','apctpn1','inctpnd','inctpxa','inctpxb','factts1','fxctcc1']),
 ('03-danh-muc.md','Danh mục','Form khai báo danh mục (mở bằng nút Mới, không lưu).',
  ['gltk','arkh','invt','inkho','covv','catknh','cohd','arthue','smnk','gldvcs']),
 ('04-bao-cao.md','Báo cáo — điều kiện lọc','Màn hình điều kiện lọc của các báo cáo chính (không chạy báo cáo, không lấy số liệu).',
  ['rpt-glcd1d','rpt-gltc1','rpt-gltc2','rpt-glso2','rpt-glso4','rpt-glthue3','rpt-glthue1','rpt-arso1a','rpt-incd1','rpt-fabckh']),
 ('05-he-thong.md','Hệ thống','Tham số tùy chọn, khóa số liệu, người dùng, phân quyền, tổng quan.',
  ['smoptions','smnamks','user','allowright','dashboard']),
]
for fn,h,intro,keys in groups:
  out=[f"# FAO — {h}","",f"> {intro}",">","> Nguồn: REA `capture-browser-scenario`, tài khoản ADMIN, chỉ đọc, 23/10/2026. Chỉ ghi cấu trúc; không có số liệu/đối tượng thật.",""]
  for k in keys:
    if k in pages: out+=section(k)
    else: out+=[f"### {k}","","*(chưa chụp)*",""]
  open('docs/research/fao/'+fn,'w').write('\n'.join(out))
  print(fn,len(out))
