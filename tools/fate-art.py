"""Original vector artwork; shared filenames preserve existing world card faces."""
from pathlib import Path
import random
root = Path(__file__).resolve().parents[1] / 'through-the-breach/assets'
out = root/'cards'
out.mkdir(parents=True, exist_ok=True)
paths = {
'rams':'M0 18C-8 9-26 2-25-12C-24-29-4-29-5-14C-6-4-17-8-16-16C-23-10-14 1-7-4L0-13L7-4C14 1 23-10 16-16C17-8 6-4 5-14C4-29 24-29 25-12C26 2 8 9 0 18Z',
'crows':'M0-25C-9-13-25-10-22 5C-20 19-6 18-2 9L-4 22H4L2 9C6 18 20 19 22 5C25-10 9-13 0-25ZM-13 2L0-7L13 2L0 5Z',
'tomes':'M-24-17Q-10-21 0-13Q10-21 24-17V16Q10 11 0 21Q-10 11-24 16ZM-19-12V10Q-8 8-3 13V-9Q-9-15-19-12ZM19-12Q9-15 3-9V13Q8 8 19 10Z',
'masks':'M0-25L24 0L0 25L-24 0ZM-16-2Q-8-10-2-2Q-8 7-16-2ZM16-2Q8-10 2-2Q8 7 16-2ZM-6 12Q0 6 6 12L0 17Z'}
suits={'rams':('БАРАНЫ','#9e302d'),'crows':('ВОРОНЫ','#242e32'),'tomes':('ТОМЫ','#242e32'),'masks':('МАСКИ','#9e302d')}
def emblem(s,x,y,size=1,flip=False):
    return f'<g transform="translate({x} {y}) rotate({180 if flip else 0}) scale({size})"><path d="{paths[s]}" fill="{suits[s][1]}" fill-rule="evenodd"/></g>'
def base(color):
    r=random.Random(417)
    dust=''.join(f'<circle cx="{r.randrange(12,228)}" cy="{r.randrange(12,328)}" r="{r.uniform(.25,1.3):.2f}" fill="#806342" opacity=".09"/>' for _ in range(100))
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="340" viewBox="0 0 240 340"><defs><radialGradient id="paper"><stop stop-color="#fcf7e8"/><stop offset="1" stop-color="#e3d3af"/></radialGradient></defs><rect width="240" height="340" rx="12" fill="url(#paper)"/>{dust}<rect x="9" y="9" width="222" height="322" rx="7" fill="none" stroke="{color}" stroke-width="1.4"/><rect x="14" y="14" width="212" height="312" rx="5" fill="none" stroke="#b59a68" stroke-width=".6"/><path d="M55 17Q85 33 120 17Q155 33 185 17M55 323Q85 307 120 323Q155 307 185 323" fill="none" stroke="{color}" stroke-width=".8"/>'
def index(rank,s):
    one=f'<text x="31" y="48" text-anchor="middle" font-family="Georgia,serif" font-weight="bold" font-size="29" fill="{suits[s][1]}">{rank}</text>{emblem(s,31,67,.45)}'
    return one+f'<g transform="rotate(180 120 170)">{one}</g>'
positions={2:[(120,100),(120,240)],3:[(120,90),(120,170),(120,250)],4:[(80,100),(160,100),(80,240),(160,240)],5:[(80,95),(160,95),(120,170),(80,245),(160,245)],6:[(80,95),(160,95),(80,170),(160,170),(80,245),(160,245)],7:[(80,95),(160,95),(120,132),(80,170),(160,170),(80,245),(160,245)],8:[(80,85),(160,85),(120,127),(80,170),(160,170),(120,213),(80,255),(160,255)],9:[(80,85),(160,85),(80,142),(160,142),(120,170),(80,198),(160,198),(80,255),(160,255)],10:[(80,80),(160,80),(120,110),(80,140),(160,140),(80,200),(160,200),(120,230),(80,260),(160,260)]}
def court(rank,s):
    color=suits[s][1]
    crown='<path d="M94 82L91 64L105 71L120 56L135 71L149 64L146 82Z" fill="#b18a42"/>' if rank==13 else '<path d="M98 82L97 68L108 73L120 64L132 73L143 68L142 82Z" fill="#b18a42"/>' if rank==12 else f'<path d="M93 82Q97 52 142 66L151 82Z" fill="{color}"/>'
    half=f'<g stroke="#303536" stroke-width="1.2" stroke-linejoin="round"><path d="M65 167L73 126L100 112H140L167 126L175 167Z" fill="#285c5a"/><path d="M104 113L120 146L136 113L143 167H97Z" fill="{color}"/><path d="M82 130L104 155M158 130L136 155M76 145L100 166M164 145L140 166" stroke="#c6a75b" stroke-width="3"/><path d="M100 81Q94 94 103 108Q120 121 137 108Q146 94 140 81Z" fill="#e8ca9c"/><path d="M107 90H113M127 90H133M119 91L117 101H123M112 107Q120 112 128 107" fill="none"/>{crown}<path d="M88 153Q99 145 105 159L102 168H87Z" fill="#e8ca9c"/><path d="M150 115V162" stroke="#b18a42" stroke-width="5"/><path d="M145 147Q136 144 136 156L145 161H151V148Z" fill="#e8ca9c"/></g>{emblem(s,150,113,.36)}'
    return f'<rect x="61" y="51" width="118" height="238" fill="none" stroke="#b59a68"/>{half}<g transform="rotate(180 120 170)">{half}</g><path d="M62 170H178" stroke="#b59a68"/>{emblem(s,120,170,.48)}<text x="120" y="44" text-anchor="middle" font-family="Georgia" font-size="15" fill="{color}">{{}}</text>'.replace('{}',{11:'J',12:'Q',13:'K'}[rank])
for s,(title,color) in suits.items():
    for rank in range(1,14):
        art=emblem(s,120,170,2.3) if rank==1 else court(rank,s) if rank>10 else ''.join(emblem(s,x,y,.66,y>170) for x,y in positions[rank])
        tier='СЛАБЫЙ' if rank<=5 else 'УМЕРЕННЫЙ' if rank<=10 else 'ТЯЖЁЛЫЙ'
        (out/f'{s}-{rank}.svg').write_text(base(color)+index(rank,s)+art+f'<text x="120" y="311" text-anchor="middle" font-family="sans-serif" font-size="7" letter-spacing="1.3" fill="{color}">{title} · {tier}</text></svg>',encoding='utf-8')
for red in (False,True):
    color='#9e302d' if red else '#242e32';value=14 if red else 0
    name='КРАСНЫЙ ДЖОКЕР' if red else 'ЧЁРНЫЙ ДЖОКЕР'
    art='<path d="M75 157L92 130H147L171 157L155 257H85Z" fill="#285c5a"/><path d="M92 134L122 180L147 134L137 253H100Z" fill="#9e302d"/><path d="M99 108L79 66L105 85L119 58L134 85L162 67L142 110Z" fill="#9e302d"/><path d="M102 104Q93 124 108 137Q121 146 137 133Q146 118 137 104Z" fill="#e8ca9c"/><path d="M107 117L114 119M129 119L136 117M111 130Q122 138 134 128" fill="none"/><path d="M121 168L135 190L121 212L107 190Z" fill="#c6a75b"/><circle cx="79" cy="66" r="5" fill="#c6a75b"/><circle cx="119" cy="58" r="5" fill="#c6a75b"/><circle cx="162" cy="67" r="5" fill="#c6a75b"/>' if red else '<path d="M71 265L78 133Q76 83 120 67Q164 83 162 133L175 265Z" fill="#303b3e"/><path d="M93 125Q90 88 120 82Q150 88 147 125L136 144H104Z" fill="#161d21"/><path d="M106 105Q120 97 134 105L133 126L128 140H112L107 126Z" fill="#d6c7a5"/><path d="M110 113L116 111L116 119L110 119ZM124 111L130 113V119H124ZM117 128L120 123L123 128Z" fill="#161d21"/><path d="M112 133H128M117 131V138M123 131V138M87 155L120 186L148 152M94 187L121 217L144 184" fill="none" stroke="#8a9a92"/><path d="M162 88V270" stroke="#ac8753" stroke-width="5"/><path d="M164 88Q140 40 88 55Q137 55 149 94Z" fill="#9ba9a3"/>'
    corner=f'<text x="31" y="48" text-anchor="middle" font-family="Georgia" font-size="29" fill="{color}">{value}</text><text x="31" y="65" text-anchor="middle" font-family="Georgia" font-size="9" fill="{color}">JOKER</text>'
    (out/('red-joker.svg' if red else 'black-joker.svg')).write_text(base(color)+corner+f'<g transform="rotate(180 120 170)">{corner}</g><g stroke="#303536" stroke-width="1.2" stroke-linejoin="round">{art}</g><text x="120" y="302" text-anchor="middle" font-size="10" font-family="sans-serif" fill="{color}">{name}</text></svg>',encoding='utf-8')
vines=''.join(f'<g transform="rotate({a} 120 170)"><path d="M120 170Q55 140 71 83Q91 65 100 83Q103 104 84 102Q76 88 89 86" fill="none" stroke="#c6a75b"/><path d="M87 124Q49 116 59 96Q80 102 87 124Z" fill="#c6a75b" opacity=".7"/></g>' for a in (0,90,180,270))
(out/'back.svg').write_text(base('#245e60')+'<rect x="19" y="19" width="202" height="302" rx="3" fill="#245e60"/><path d="M40 170Q18 87 78 49Q120 24 162 49Q222 87 200 170Q222 253 162 291Q120 316 78 291Q18 253 40 170Z" fill="none" stroke="#c6a75b" stroke-width="2"/>'+vines+'<path d="M120 99L180 170L120 241L60 170Z" fill="#e8d5aa" stroke="#c6a75b" stroke-width="3"/><path d="M120 123L136 158L126 178L139 192L120 217L104 183L114 163L101 148Z" fill="#245e60"/><circle cx="120" cy="170" r="9" fill="#c6a75b"/></svg>',encoding='utf-8')
icons={'main':'<circle cx="16" cy="9" r="5"/><path d="M6 28V24Q6 16 16 16Q26 16 26 24V28Z"/>','skills':'<path d="M3 7Q10 4 16 9Q22 4 29 7V25Q22 22 16 27Q10 22 3 25ZM16 9V27M7 11L12 12M7 16L12 17M20 12L25 11M20 17L25 16"/>','fate':'<rect x="9" y="4" width="17" height="24" rx="2"/><path d="M7 7L3 8L7 29L10 28M17 10L22 16L17 22L12 16Z"/>','story':'<path d="M5 27L12 20M10 23Q6 12 26 4Q28 19 10 23ZM11 22L23 8M14 19L22 18M18 13L17 9"/>','records':'<path d="M6 11H26V28H6ZM11 11V6H21V11M6 17H26M14 15H18V21H14Z"/>','development':'<path d="M5 28V22H11V16H17V10H23M23 4L25 9L30 10L26 14L27 19L23 16L19 19L20 14L16 10L21 9Z"/>','send':'<path d="M4 5H28V22H14L7 28V22H4ZM9 13H22M17 8L22 13L17 18"/>'}
ui=root/'ui';ui.mkdir(exist_ok=True)
for name,art in icons.items():
    (ui/f'{name}.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g fill="#e4d0a5" stroke="#245e60" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">{art}</g></svg>',encoding='utf-8')
print('Created 55 original card assets and 7 interface icons')

