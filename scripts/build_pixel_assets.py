"""Technical sprite extraction/GIF encoding. Artwork comes from image generation."""
from pathlib import Path
from PIL import Image
import subprocess, tempfile, shutil, json, hashlib
ROOT=Path(__file__).resolve().parents[1]
INPUT=ROOT.parent/'generated_images'
ASSETS=ROOT/'assets/pixel-characters'
NEW={'zelda':'exec-6997e730-c07f-4b32-a897-0d659c505f3a.png','link':'exec-860fa1c3-2430-4a55-998b-f70ff67e366b.png','nova':'exec-75aae464-e549-413d-b3c3-c101086110ae.png','ember':'exec-b4bbad4f-1a12-4e5d-977c-ba80a9d6276d.png','luna':'exec-24ede2a7-ad9e-4ceb-b41a-afb1978a7ceb.png'}
SPECIAL={'sukuna':'exec-3741af73-6fe2-4434-a375-783bde542fc2.png','geto':'exec-13c83a23-fd52-4eea-9604-c32b08f6e3d1.png','nanami':'exec-de99850c-560e-4c66-a3b8-0a5a7f92efd1.png','toji':'exec-87e97a0c-af04-4a7b-ba97-8c1213a17a39.png'}
def run(args):subprocess.run(args,check=True,stdout=subprocess.DEVNULL)
def frames(source,rows,folder):
    im=Image.open(source).convert('RGBA');w,h=im.size;alpha=im.getchannel('A').point(lambda v:255 if v>=128 else 0)
    cuts=[0]
    for r in range(1,rows):
        nominal=round(h*r/rows)
        candidates=[]
        for y in range(max(cuts[-1]+1,nominal-45),min(h,nominal+46)):
            count=sum(v>0 for v in alpha.crop((0,y,w,y+1)).getdata())
            candidates.append((count,abs(y-nominal),y))
        cuts.append(min(candidates)[2])
    cuts.append(h)
    bounds=[];cells=[]
    for r in range(rows):
        for c in range(3):
            x0,x1=round(w*c/3),round(w*(c+1)/3);y0,y1=cuts[r],cuts[r+1]
            box=alpha.crop((x0,y0,x1,y1)).getbbox();assert box,(source,r,c)
            cells.append((x0,y0,x1-x0,y1-y0,box));bounds.append(box)
    left=min(b[0] for b in bounds);top=min(b[1] for b in bounds);right=max(b[2] for b in bounds);bottom=max(b[3] for b in bounds)
    side=max(right-left,bottom-top)+32
    output=[]
    for n,(x,y,cw,ch,b) in enumerate(cells):
        cell=folder/f'cell-{n}.png';out=folder/f'frame-{n}.png'
        run(['convert',str(source),'-crop',f'{cw}x{ch}+{x}+{y}','+repage',str(cell)])
        # Use one common viewport across all frames; no per-frame stretching or trimming.
        run(['convert',str(cell),'-crop',f'{right-left}x{bottom-top}+{left}+{top}','+repage','-background','none','-gravity','center','-extent',f'{side}x{side}','-filter','point','-resize','128x128','-channel','A','-threshold','50%','+channel',str(out)])
        output.append(out)
    return output
def gif(output,sequence):
    args=['convert','-background','none','-dispose','Background']
    for n,p in enumerate(sequence):args+=['-delay','65' if n==len(sequence)-1 else '26',str(p)]
    run(args+['-colors','96','+map','-loop','0',str(output)])
    check=Image.open(output);assert check.n_frames==len(sequence),(output,check.n_frames)
    assert output.stat().st_size<256*1024
    for i in range(check.n_frames):
        check.seek(i);assert check.disposal_method==2;frame=check.convert('RGBA');assert frame.getpixel((0,0))[3]==0;assert frame.getpixel((127,127))[3]==0
    return {'frames':check.n_frames,'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest()}
manifest=json.loads((ASSETS/'animations.json').read_text())
manifest['characters']=list(SPECIAL)+list(NEW)
for character,name in NEW.items():
    dest=ASSETS/character;dest.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory() as temp:
        f=frames(INPUT/name,4,Path(temp))
        groups={'idle':f[:3],'laptop':f[3:6],'waiting':f[6:9],'jumping':f[9:12],'special':f[9:12],'failed':[f[7],f[6],f[7]],'all':f}
        for state,sequence in groups.items():manifest['animations'][f'{character}/{state}.gif']=gif(dest/f'{state}.gif',sequence)
        shutil.copyfile(f[0],dest/'portrait.png')
for character,name in SPECIAL.items():
    dest=ASSETS/character
    with tempfile.TemporaryDirectory() as temp:
        f=frames(INPUT/name,1,Path(temp))
        for state in ['all','special']:manifest['animations'][f'{character}/{state}.gif']=gif(dest/f'{state}.gif',f)
manifest['note']='Jede Figur besitzt eigene Arbeit-, Warte- und Spezialposen. Die vier bestehenden JJK-Figuren bekommen eigene Spezialanimationen; Gojo bleibt erhalten.'
(ASSETS/'animations.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
labels=['Gojo','Sukuna','Geto','Nanami','Toji','Zelda','Link','Nova','Ember','Luna']
ids=['gojo']+list(SPECIAL)+list(NEW)
args=['montage','-font','DejaVu-Sans','-pointsize','18','-fill','#f2f3f5','-background','#17181c','-gravity','center']
for cid,label in zip(ids,labels):args+=['-label',label,str(ASSETS/cid/'portrait.png')]
run(args+['-font','DejaVu-Sans','-pointsize','18','-fill','#f2f3f5','-background','#17181c','-gravity','center','-tile','5x2','-geometry','144x144+10+10',str(ASSETS/'auswahl.png')])
print('63 GIFs geprüft; Auswahlbild mit 10 Figuren erstellt.')
