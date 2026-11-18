import sys, numpy as np
from PIL import Image
def runs(mask, minlen):
    out=[]; start=None
    for i,v in enumerate(mask):
        if v and start is None: start=i
        if not v and start is not None:
            if i-start>=minlen: out.append((start,i))
            start=None
    if start is not None and len(mask)-start>=minlen: out.append((start,len(mask)))
    return out
for f in sys.argv[1:]:
    a=np.asarray(Image.open(f).convert('RGB')).astype(int); H,W,_=a.shape
    bg=a[5:40, W//2-200:W//2+200].reshape(-1,3).mean(0)
    diff=np.abs(a-bg).sum(2)>40
    cols=diff[int(H*0.05):int(H*0.85)].mean(0)>0.5
    rows=diff[:, :].mean(1)
    print(f.split('/')[-1], W, H, 'bg', bg.round())
    xr=runs(cols, 80); print(' x-runs', xr)
    for (x0,x1) in xr:
        r=runs(diff[:, x0:x1].mean(1)>0.6, 60); print('  in', (x0,x1), 'y-runs', r)
