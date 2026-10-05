from pathlib import Path
from html import escape

out = Path(__file__).resolve().parents[1] / 'through-the-breach/assets/cards'
out.mkdir(parents=True, exist_ok=True)
suits = {'rams': ('БАРАНЫ', '♥', '#a94732'), 'crows': ('ВОРОНЫ', '♠', '#2e4148'), 'tomes': ('ТОМЫ', '♣', '#3b6960'), 'masks': ('МАСКИ', '♦', '#896034')}
def card(filename, rank, title, symbol, color):
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="240" height="340" viewBox="0 0 240 340">
<rect width="240" height="340" rx="14" fill="#eee7d5"/><rect x="9" y="9" width="222" height="322" rx="9" fill="none" stroke="{color}" stroke-width="2"/>
<rect x="16" y="16" width="208" height="308" rx="6" fill="none" stroke="#baab87"/>
<path d="M35 74H205M35 266H205" stroke="#baab87"/><text x="27" y="52" font-family="Georgia,serif" font-weight="bold" font-size="32" fill="{color}">{rank}</text>
<text x="212" y="306" text-anchor="end" font-family="Georgia,serif" font-size="30" fill="{color}">{rank}</text>
<circle cx="120" cy="158" r="60" fill="none" stroke="#cabb9a"/><path d="M120 91L184 158L120 225L56 158Z" fill="none" stroke="#cabb9a"/>
<text x="120" y="187" text-anchor="middle" font-family="Georgia,serif" font-size="83" fill="{color}">{symbol}</text>
<text x="120" y="250" text-anchor="middle" font-family="sans-serif" font-size="15" letter-spacing="2" fill="{color}">{escape(title)}</text>
<text x="120" y="292" text-anchor="middle" font-family="sans-serif" font-size="8" letter-spacing="1.4" fill="#807458">СКВОЗЬ ПРОЛОМ</text></svg>'''
    (out/filename).write_text(svg,encoding='utf-8')
for suit,(title,symbol,color) in suits.items():
    for rank in range(1,14): card(f'{suit}-{rank}.svg',rank,title,symbol,color)
card('red-joker.svg',14,'КРАСНЫЙ ДЖОКЕР','✦','#a94732')
card('black-joker.svg',0,'ЧЁРНЫЙ ДЖОКЕР','✦','#29343d')
card('back.svg','', 'КОЛОДА СУДЬБЫ','✧','#245e60')
print(f'Created {len(list(out.glob("*.svg")))} vector card assets')
