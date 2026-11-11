"""Generate original mBlock icons using only the Python standard library."""
import struct, zlib
from pathlib import Path
def inside(x,y,p):
    result=False;j=len(p)-1
    for i,(a,b) in enumerate(p):
        c,d=p[j]
        if (b>y)!=(d>y) and x<(c-a)*(y-b)/(d-b)+a: result=not result
        j=i
    return result
root=Path(__file__).resolve().parents[1]/'src/icons';root.mkdir(exist_ok=True)
for size in (16,32,48,128):
    pixels=bytearray()
    shield=[(.15,.12),(.5,.04),(.85,.12),(.81,.57),(.69,.78),(.5,.95),(.31,.78),(.19,.57)]
    letter=[(.30,.31),(.40,.31),(.50,.46),(.60,.31),(.70,.31),(.70,.67),(.60,.67),(.60,.49),(.50,.63),(.40,.49),(.40,.67),(.30,.67)]
    inner=[(.5+(x-.5)*.94,.5+(y-.5)*.94) for x,y in shield]
    for y in range(size):
        pixels.append(0)
        for x in range(size):
            samples=[]
            for yy in range(4):
                for xx in range(4):
                    sx=(x+(xx+.5)/4)/size;sy=(y+(yy+.5)/4)/size
                    c=(239,27,51,255) if inside(sx,sy,letter) else (8,8,10,255) if inside(sx,sy,inner) else (69,69,76,255) if inside(sx,sy,shield) else (0,0,0,0)
                    samples.append(c)
            alpha=sum(c[3] for c in samples)
            rgb=[round(sum(c[k]*c[3] for c in samples)/alpha) if alpha else 0 for k in range(3)]
            pixels.extend(rgb+[round(alpha/16)])
    def chunk(t,b): return struct.pack('!I',len(b))+t+b+struct.pack('!I',zlib.crc32(t+b)&0xffffffff)
    png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(bytes(pixels)))+chunk(b'IEND',b'')
    (root/f'{size}.png').write_bytes(png)
