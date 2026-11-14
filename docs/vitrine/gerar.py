# Gera as ilustrações da página do GitHub (README). Rode: python docs/vitrine/gerar.py
# São SVG animados só com CSS: o GitHub mostra a animação; quem pediu "reduzir movimento" vê tudo parado.
# Regra: o estado escrito nos atributos é o estado "pronto". As animações partem dele e voltam a ele.
import random
from pathlib import Path

AQUI = Path(__file__).parent
FONTE = "'Segoe UI Variable Display','Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif"
VERDE, CIANO, INDIGO, AMBAR, VERMELHO = "#00DC82", "#22d3ee", "#6366f1", "#ffb020", "#ff5a5f"
TEXTO, CINZA, CARTAO, TRILHO = "#f5f5f7", "#a1a1aa", "#11152a", "#262b45"


def esc(t):
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def svg(nome, w, h, corpo, css="", parado=""):
    base = f"""
    text {{ font-family: {FONTE}; }}
    .a {{ transform-box: fill-box; transform-origin: center; }}
    @keyframes deriva1 {{ 50% {{ transform: translate(60px, -30px) scale(1.12); }} }}
    @keyframes deriva2 {{ 50% {{ transform: translate(-70px, 40px) scale(.92); }} }}
    @keyframes deriva3 {{ 50% {{ transform: translate(40px, 50px) scale(1.08); }} }}
    .b1 {{ animation: deriva1 18s ease-in-out infinite; }}
    .b2 {{ animation: deriva2 22s ease-in-out infinite; }}
    .b3 {{ animation: deriva3 26s ease-in-out infinite; }}
    """
    quieto = f"@media (prefers-reduced-motion: reduce) {{ * {{ animation: none !important; }} {parado} }}"
    doc = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
           f"<style>{base}{css}{quieto}</style>{corpo}</svg>\n")
    (AQUI / f"{nome}.svg").write_text(doc, encoding="utf-8")


def fundo(w, h, cores=(VERDE, INDIGO, CIANO), forca=.4, raio=28):
    """Cartão escuro com manchas de cor que derivam devagar (aurora)."""
    id_ = f"f{w}x{h}"
    c1, c2, c3 = cores
    return f"""
    <defs>
      <linearGradient id="{id_}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#070a14"/><stop offset="1" stop-color="#0c1630"/></linearGradient>
      <filter id="nev{id_}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="70"/></filter>
      <clipPath id="c{id_}"><rect width="{w}" height="{h}" rx="{raio}"/></clipPath>
    </defs>
    <g clip-path="url(#c{id_})">
      <rect width="{w}" height="{h}" fill="url(#{id_})"/>
      <g filter="url(#nev{id_})" opacity="{forca}">
        <circle class="a b1" cx="{w*.15}" cy="{h*.2}" r="{min(w,h)*.42}" fill="{c1}"/>
        <circle class="a b2" cx="{w*.85}" cy="{h*.25}" r="{min(w,h)*.36}" fill="{c2}"/>
        <circle class="a b3" cx="{w*.6}" cy="{h*.95}" r="{min(w,h)*.4}" fill="{c3}" opacity=".7"/>
      </g>
      <rect width="{w}" height="{h}" rx="{raio}" fill="none" stroke="#ffffff" stroke-opacity=".08" stroke-width="2"/>
    </g>"""


# ------------------------------------------------------------------ peças
def bloco(x, y, sobre, titulo, texto, cor=VERDE):
    s = [f'<text x="{x}" y="{y}" font-size="17" font-weight="700" letter-spacing="2.2" fill="{cor}">{esc(sobre)}</text>']
    for i, linha in enumerate(titulo):
        s.append(f'<text x="{x}" y="{y+56+i*52}" font-size="44" font-weight="700" letter-spacing="-1.2" fill="{TEXTO}">{esc(linha)}</text>')
    y2 = y + 56 + len(titulo) * 52 + 18
    for i, linha in enumerate(texto):
        s.append(f'<text x="{x}" y="{y2+i*33}" font-size="22" fill="{CINZA}">{esc(linha)}</text>')
    return "".join(s)


def cartao(x, y, w, h, r=18):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{CARTAO}" stroke="#ffffff" stroke-opacity=".09"/>'


def visto(cx, cy, r=9, cor=VERDE):
    return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{cor}" fill-opacity=".18" stroke="{cor}" stroke-width="1.6"/>'
            f'<path d="M{cx-r*.45} {cy} l{r*.32} {r*.34} l{r*.6} {-r*.68}" fill="none" stroke="{cor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>')


# Chave liga/desliga: desenhada ligada; a animação desliga e liga de novo em ciclo de 8 s.
CSS_CHAVE = """
@keyframes ligaT { 0%, 6% { opacity: 0; } 12%, 86% { opacity: 1; } 94%, 100% { opacity: 0; } }
@keyframes ligaB { 0%, 6% { transform: translateX(-20px); } 12%, 86% { transform: none; } 94%, 100% { transform: translateX(-20px); } }
.ligaT { animation: ligaT 8s ease-in-out infinite both; }
.ligaB { animation: ligaB 8s cubic-bezier(.3,1.3,.5,1) infinite both; }
"""


def atraso_chave(k):
    return f"animation-delay: {k*.45 - 4.4:.2f}s"


def chave(x, y, k):
    d = atraso_chave(k)
    return (f'<rect x="{x}" y="{y}" width="46" height="26" rx="13" fill="#2a2f45"/>'
            f'<rect class="ligaT" style="{d}" x="{x}" y="{y}" width="46" height="26" rx="13" fill="{VERDE}"/>'
            f'<circle class="ligaB" style="{d}" cx="{x+33}" cy="{y+13}" r="9" fill="#fff"/>')


def serie(rnd, n, base, amp):
    return [base + rnd.uniform(-amp, amp) for _ in range(n)]


def linha_grafico(x, y, w, h, vals, repetir=True):
    """Polilinha de valores 0..1. Com repetir, desenha duas vezes seguidas para rolar sem emenda."""
    n = len(vals)
    passo = w / (n - 1)
    pts = []
    voltas = 2 if repetir else 1
    for r in range(voltas):
        for i, v in enumerate(vals if r == 0 else vals[1:]):
            idx = i if r == 0 else i + 1
            pts.append(f"{x + r*w + idx*passo:.1f},{y + h - v*h:.1f}")
    return " ".join(pts)


# ================================================================== 1. abertura
def abertura():
    W, H = 1200, 700
    P = 8
    D = -4.8  # começa no meio do ciclo: a primeira imagem já mostra o boost aplicado
    css = f"""
    @keyframes arco {{ 0%, 10% {{ stroke-dashoffset: 38; }} 22%, 90% {{ stroke-dashoffset: 6; }} 100% {{ stroke-dashoffset: 38; }} }}
    @keyframes antes {{ 0%, 12% {{ opacity: 1; }} 16%, 94% {{ opacity: 0; }} 98%, 100% {{ opacity: 1; }} }}
    @keyframes depois {{ 0%, 12% {{ opacity: 0; }} 16%, 94% {{ opacity: 1; }} 98%, 100% {{ opacity: 0; }} }}
    @keyframes aperta {{ 0%, 5% {{ transform: none; }} 7.5% {{ transform: scale(.94); }} 10%, 100% {{ transform: none; }} }}
    @keyframes onda {{ 0%, 7% {{ transform: scale(1); opacity: 0; }} 8% {{ opacity: .8; }} 20%, 100% {{ transform: scale(1.35, 1.9); opacity: 0; }} }}
    @keyframes item {{ 0%, 18% {{ opacity: 0; transform: translateX(-12px); }} 24%, 92% {{ opacity: 1; transform: none; }} 96%, 100% {{ opacity: 0; }} }}
    @keyframes rola {{ to {{ transform: translateX(-360px); }} }}
    .arco {{ animation: arco {P}s cubic-bezier(.2,.8,.2,1) infinite both; animation-delay: {D}s; }}
    .antes {{ animation: antes {P}s linear infinite both; animation-delay: {D}s; }}
    .depois {{ animation: depois {P}s linear infinite both; animation-delay: {D}s; }}
    .aperta {{ transform-box: fill-box; transform-origin: center; animation: aperta {P}s ease-out infinite both; animation-delay: {D}s; }}
    .onda {{ transform-box: fill-box; transform-origin: center; animation: onda {P}s ease-out infinite both; animation-delay: {D}s; }}
    .item {{ animation: item {P}s cubic-bezier(.2,.8,.2,1) infinite both; }}
    .rola {{ animation: rola 9s linear infinite; }}
    """
    parado = ".antes { display: none; }"
    c = [fundo(W, H, forca=.42)]
    c.append(f'<text x="{W/2}" y="92" text-anchor="middle" font-size="18" font-weight="700" letter-spacing="2.4" fill="{VERDE}">HS TECH · PARA WINDOWS</text>')
    c.append(f'<text x="{W/2}" y="158" text-anchor="middle" font-size="58" font-weight="700" letter-spacing="-1.8" fill="{TEXTO}">Seu PC no máximo,</text>')
    c.append(f'<defs><linearGradient id="tit" x1="0" x2="1"><stop offset="0" stop-color="{VERDE}"/><stop offset=".55" stop-color="{CIANO}"/><stop offset="1" stop-color="#a78bfa"/></linearGradient>'
             f'<linearGradient id="arcog" x1="0" x2="1"><stop offset="0" stop-color="{VERDE}"/><stop offset="1" stop-color="{CIANO}"/></linearGradient></defs>')
    c.append(f'<text x="{W/2}" y="222" text-anchor="middle" font-size="58" font-weight="700" letter-spacing="-1.8" fill="url(#tit)">sem complicação.</text>')

    # janela do app
    wx, wy, ww, wh = 110, 270, 980, 390
    c.append(f'<rect x="{wx}" y="{wy+10}" width="{ww}" height="{wh}" rx="22" fill="#000" opacity=".35"/>')
    c.append(f'<clipPath id="jan"><rect x="{wx}" y="{wy}" width="{ww}" height="{wh}" rx="22"/></clipPath>')
    c.append(f'<g clip-path="url(#jan)"><rect x="{wx}" y="{wy}" width="{ww}" height="{wh}" fill="#080b18"/>')
    # barra de título
    c.append(f'<rect x="{wx+20}" y="{wy+13}" width="15" height="15" rx="4" fill="{VERDE}"/>')
    c.append(f'<text x="{wx+44}" y="{wy+26}" font-size="14" font-weight="700" fill="{TEXTO}">HS TECH</text>')
    bx = wx + ww - 110
    c.append(f'<path d="M{bx} {wy+21} h12 M{bx+40} {wy+15} h11 v11 h-11Z M{bx+80} {wy+15} l11 11 M{bx+91} {wy+15} l-11 11" stroke="{CINZA}" stroke-width="1.6" fill="none"/>')
    # menu lateral
    c.append(f'<rect x="{wx}" y="{wy+40}" width="190" height="{wh-40}" fill="#0b0e1d"/>')
    nomes = ["Painel", "Otimização", "Jogos", "Hardware", "Limpeza", "Manutenção", "Diagnóstico", "Rede"]
    for k, nome in enumerate(nomes):
        y = wy + 58 + k * 40
        if k == 0:
            c.append(f'<rect x="{wx+12}" y="{y}" width="166" height="32" rx="9" fill="{VERDE}" fill-opacity=".14"/>'
                     f'<rect x="{wx+12}" y="{y+8}" width="3" height="16" rx="1.5" fill="{VERDE}"/>')
        cor = VERDE if k == 0 else "#5b6283"
        c.append(f'<rect x="{wx+28}" y="{y+9}" width="14" height="14" rx="4" fill="none" stroke="{cor}" stroke-width="1.8"/>')
        c.append(f'<text x="{wx+54}" y="{y+21}" font-size="15" fill="{TEXTO if k == 0 else CINZA}">{nome}</text>')

    # cartão da pontuação
    gx, gy, gw, gh = wx + 210, wy + 58, 330, 312
    c.append(cartao(gx, gy, gw, gh))
    c.append(f'<text x="{gx+22}" y="{gy+34}" font-size="15" fill="{CINZA}">Pontuação de otimização</text>')
    cx, cy, r = gx + gw / 2, gy + 150, 92
    sx, sy = cx - .866 * r, cy + .5 * r
    ex, ey = cx + .866 * r, cy + .5 * r
    arco = f"M{sx:.1f} {sy:.1f} A{r} {r} 0 1 1 {ex:.1f} {ey:.1f}"
    c.append(f'<path d="{arco}" stroke="{TRILHO}" stroke-width="16" stroke-linecap="round" fill="none"/>')
    c.append(f'<path class="arco" d="{arco}" pathLength="100" stroke-dasharray="100" stroke-dashoffset="6" stroke="url(#arcog)" stroke-width="16" stroke-linecap="round" fill="none"/>')
    c.append(f'<text class="antes" x="{cx}" y="{cy+14}" text-anchor="middle" font-size="54" font-weight="700" fill="{TEXTO}">62</text>')
    c.append(f'<text class="depois" x="{cx}" y="{cy+14}" text-anchor="middle" font-size="54" font-weight="700" fill="{TEXTO}">94</text>')
    c.append(f'<text x="{cx}" y="{cy+40}" text-anchor="middle" font-size="14" fill="{CINZA}">de 100</text>')
    btx, bty, btw, bth = gx + 40, gy + 240, 250, 48
    c.append(f'<rect class="onda" x="{btx}" y="{bty}" width="{btw}" height="{bth}" rx="24" fill="none" stroke="{VERDE}" stroke-width="2"/>')
    c.append(f'<g class="aperta"><rect x="{btx}" y="{bty}" width="{btw}" height="{bth}" rx="24" fill="{VERDE}"/>'
             f'<path d="M{btx+56} {bty+14} l-8 12 h8 l-4 10 l12 -14 h-8 l4 -8Z" fill="#04131c"/>'
             f'<text x="{btx+btw/2+12}" y="{bty+30}" text-anchor="middle" font-size="18" font-weight="700" fill="#04131c">Dar Boost Agora</text></g>')

    # monitor
    mx, my, mw, mh = wx + 560, wy + 58, 400, 140
    c.append(cartao(mx, my, mw, mh))
    c.append(f'<text x="{mx+22}" y="{my+32}" font-size="15" fill="{CINZA}">Processador</text>')
    c.append(f'<text x="{mx+mw-22}" y="{my+33}" text-anchor="end" font-size="20" font-weight="700" fill="{TEXTO}">38%</text>')
    rnd = random.Random(2)
    vals = [.35 + .25 * abs(((i * 7) % 11) / 11 - .5) + rnd.uniform(-.08, .08) for i in range(24)]
    vals[-1] = vals[0]
    pts = linha_grafico(mx + 20, my + 56, 360, 66, vals)
    c.append(f'<clipPath id="graf"><rect x="{mx+20}" y="{my+50}" width="360" height="76"/></clipPath>')
    c.append(f'<g clip-path="url(#graf)"><g class="rola">'
             f'<polyline points="{pts} {mx+20+720},{my+122} {mx+20},{my+122}" fill="{VERDE}" fill-opacity=".10" stroke="none"/>'
             f'<polyline points="{pts}" fill="none" stroke="{VERDE}" stroke-width="2.4" stroke-linejoin="round"/></g></g>')

    # o que o boost fez
    lx, ly, lw, lh = mx, my + 158, 400, 154
    c.append(cartao(lx, ly, lw, lh))
    c.append(f'<text x="{lx+22}" y="{ly+32}" font-size="15" font-weight="600" fill="{TEXTO}">Boost aplicado</text>')
    itens = ["Plano de energia HS TECH", "Ajustes para jogos ligados", "Arquivos temporários limpos", "Memória RAM liberada"]
    for k, t in enumerate(itens):
        y = ly + 60 + k * 25
        c.append(f'<g class="item" style="animation-delay: {k*.45 + D:.2f}s">{visto(lx+32, y-5, 8)}'
                 f'<text x="{lx+50}" y="{y}" font-size="15" fill="{CINZA}">{t}</text></g>')
    c.append("</g>")
    c.append(f'<rect x="{wx}" y="{wy}" width="{ww}" height="{wh}" rx="22" fill="none" stroke="#ffffff" stroke-opacity=".12"/>')
    svg("abertura", W, H, "".join(c), css, parado)


# ================================================================== faixas de recurso
def faixa(nome, sobre, titulo, texto, arte, css="", lado="esq", cores=(VERDE, INDIGO, CIANO), parado=""):
    W, H = 1200, 470
    tx = 70 if lado == "esq" else 650
    c = [fundo(W, H, cores, forca=.3), bloco(tx, 120, sobre, titulo, texto), arte(640 if lado == "esq" else 60)]
    svg(nome, W, H, "".join(c), css, parado)


def arte_ajustes(x0):
    s = [cartao(x0 + 20, 45, 500, 380)]
    nomes = ["Plano de energia HS TECH", "Prioridade para o jogo", "Clique sem atraso",
             "Sem gravação em segundo plano", "Placa de vídeo no máximo"]
    for k, n in enumerate(nomes):
        y = 72 + k * 52
        s.append(f'<text x="{x0+48}" y="{y+18}" font-size="18" fill="{TEXTO}">{n}</text>')
        s.append(chave(x0 + 446, y, k))
        if k < 4:
            s.append(f'<rect x="{x0+48}" y="{y+38}" width="444" height="1" fill="#fff" fill-opacity=".06"/>')
    s.append(f'<text x="{x0+48}" y="{352}" font-size="14" fill="{CINZA}">Estabilidade do FPS</text>')
    rnd = random.Random(9)
    tremido = [.5 + (rnd.uniform(-.45, .45) if k % 3 else rnd.uniform(-.1, .1)) for k in range(30)]
    liso = [.62 + rnd.uniform(-.06, .06) for _ in range(30)]
    s.append(f'<polyline class="tremido" opacity="0" points="{linha_grafico(x0+48, 362, 444, 44, tremido, False)}" fill="none" stroke="{AMBAR}" stroke-width="2.2" stroke-linejoin="round"/>')
    s.append(f'<polyline class="liso" points="{linha_grafico(x0+48, 362, 444, 44, liso, False)}" fill="none" stroke="{VERDE}" stroke-width="2.4" stroke-linejoin="round"/>')
    return "".join(s)


CSS_AJUSTES = CSS_CHAVE + """
@keyframes tremido { 0%, 6% { opacity: .95; } 18%, 86% { opacity: 0; } 96%, 100% { opacity: .95; } }
@keyframes liso { 0%, 6% { opacity: 0; } 18%, 86% { opacity: 1; } 96%, 100% { opacity: 0; } }
.tremido { animation: tremido 8s ease-in-out infinite both; animation-delay: -3.4s; }
.liso { animation: liso 8s ease-in-out infinite both; animation-delay: -3.4s; }
"""


def arte_overlay(x0):
    px, py, pw, ph = x0 + 20, 55, 500, 360
    s = ['<defs><linearGradient id="ceu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2b55"/><stop offset="1" stop-color="#4a6aa0"/></linearGradient></defs>',
         f'<clipPath id="jogo"><rect x="{px}" y="{py}" width="{pw}" height="{ph}" rx="18"/></clipPath><g clip-path="url(#jogo)">',
         f'<rect x="{px}" y="{py}" width="{pw}" height="{ph}" fill="url(#ceu)"/>',
         f'<circle cx="{px+380}" cy="{py+120}" r="38" fill="#ffd38a" opacity=".85"/>',
         f'<g class="nuvem"><ellipse cx="{px+150}" cy="{py+80}" rx="60" ry="14" fill="#fff" opacity=".18"/><ellipse cx="{px+420}" cy="{py+60}" rx="44" ry="10" fill="#fff" opacity=".14"/></g>',
         f'<path d="M{px} {py+250} L{px+90} {py+170} L{px+170} {py+230} L{px+260} {py+150} L{px+370} {py+240} L{px+440} {py+190} L{px+pw} {py+230} V{py+ph} H{px}Z" fill="#2c3d66"/>',
         f'<path d="M{px} {py+290} Q{px+150} {py+250} {px+260} {py+285} T{px+pw} {py+270} V{py+ph} H{px}Z" fill="#1a2440"/>',
         f'<rect x="{px+300}" y="{py+215}" width="46" height="80" fill="#121a30"/><rect x="{px+350}" y="{py+235}" width="34" height="60" fill="#0f1628"/>',
         f'<rect x="{px+312}" y="{py+230}" width="8" height="8" fill="#ffd38a" opacity=".7"/><rect x="{px+326}" y="{py+250}" width="8" height="8" fill="#ffd38a" opacity=".5"/>',
         f'<path d="M{px+pw/2-14} {py+ph/2} h9 M{px+pw/2+5} {py+ph/2} h9 M{px+pw/2} {py+ph/2-14} v9 M{px+pw/2} {py+ph/2+5} v9" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>']
    # painel do overlay
    ox, oy, ow, oh = px + 16, py + 16, 196, 186
    s.append(f'<rect x="{ox}" y="{oy}" width="{ow}" height="{oh}" rx="12" fill="#050814" fill-opacity=".84" stroke="{VERDE}" stroke-opacity=".45"/>')
    s.append(f'<text x="{ox+14}" y="{oy+24}" font-size="12" font-weight="700" letter-spacing="1.5" fill="{VERDE}">FPS</text>')
    for k, (v, low) in enumerate([("241", "198"), ("238", "196"), ("244", "201")]):
        cls = "tr" + (" outra" if k else "")
        d = [0, -2, -1][k]
        s.append(f'<g class="{cls}" style="animation-delay: {d}s"><text x="{ox+14}" y="{oy+62}" font-size="36" font-weight="700" fill="{TEXTO}">{v}</text>'
                 f'<text x="{ox+ow-14}" y="{oy+88}" text-anchor="end" font-size="14" font-weight="600" fill="{TEXTO}">{low}</text></g>')
    s.append(f'<text x="{ox+14}" y="{oy+88}" font-size="14" fill="{CINZA}">1% low</text>')
    for k, (rot, val) in enumerate([("CPU", "41%"), ("GPU", "87%"), ("Ping", "12 ms")]):
        y = oy + 112 + k * 22
        s.append(f'<text x="{ox+14}" y="{y}" font-size="14" fill="{CINZA}">{rot}</text>'
                 f'<text x="{ox+ow-14}" y="{y}" text-anchor="end" font-size="14" font-weight="600" fill="{TEXTO}">{val}</text>')
    rnd = random.Random(4)
    ft = [.5 + rnd.uniform(-.18, .18) for _ in range(20)]
    ft[6] = .95
    ft[-1] = ft[0]
    s.append(f'<clipPath id="ft"><rect x="{ox+14}" y="{oy+oh-26}" width="{ow-28}" height="18"/></clipPath>')
    s.append(f'<g clip-path="url(#ft)"><polyline class="rolaFt" points="{linha_grafico(ox+14, oy+oh-26, ow-28, 18, ft)}" fill="none" stroke="{VERDE}" stroke-width="1.6"/></g>')
    s.append("</g>")
    s.append(f'<rect x="{px}" y="{py}" width="{pw}" height="{ph}" rx="18" fill="none" stroke="#fff" stroke-opacity=".12"/>')
    s.append(f'<rect x="{px+pw-170}" y="{py+ph+14}" width="170" height="34" rx="17" fill="{CARTAO}" stroke="#fff" stroke-opacity=".12"/>'
             f'<text x="{px+pw-85}" y="{py+ph+36}" text-anchor="middle" font-size="14" fill="{TEXTO}">Ctrl + Shift + F10</text>')
    return "".join(s)


CSS_OVERLAY = """
@keyframes tr { 0%, 33% { opacity: 1; } 33.4%, 100% { opacity: 0; } }
@keyframes nuvem { 50% { transform: translateX(40px); } }
@keyframes rolaFt { to { transform: translateX(-168px); } }
.tr { animation: tr 3s linear infinite both; }
.nuvem { animation: nuvem 14s ease-in-out infinite; }
.rolaFt { animation: rolaFt 4s linear infinite; }
"""


def arte_hwmon(x0):
    s = [cartao(x0 + 20, 40, 500, 395)]
    grupos = [("Processador", VERDE, [("Uso total", "38%", .38), ("Núcleo 1", "4,6 GHz", .92), ("Núcleo 2", "4,4 GHz", .86)]),
              ("Placa de vídeo", CIANO, [("Uso", "87%", .87), ("Temperatura", "64 °C", .64), ("Memória", "6,1 GB", .52)]),
              ("Memória e disco", "#a78bfa", [("RAM", "11,2 GB", .70), ("Disco C:", "41 °C", .41)])]
    y = 76
    n = 0
    for titulo, cor, linhas in grupos:
        s.append(f'<text x="{x0+44}" y="{y}" font-size="13" font-weight="700" letter-spacing="1.4" fill="{cor}">{esc(titulo.upper())}</text>')
        y += 28
        for rot, val, frac in linhas:
            s.append(f'<text x="{x0+44}" y="{y}" font-size="16" fill="{CINZA}">{rot}</text>')
            s.append(f'<rect x="{x0+180}" y="{y-11}" width="210" height="10" rx="5" fill="{TRILHO}"/>')
            dur = [3.2, 4.1, 2.7, 3.7][n % 4]
            s.append(f'<rect class="barra" style="animation-duration: {dur}s; animation-delay: {-n*.7:.1f}s" x="{x0+180}" y="{y-11}" width="{210*frac:.0f}" height="10" rx="5" fill="{cor}"/>')
            s.append(f'<text x="{x0+496}" y="{y}" text-anchor="end" font-size="16" font-weight="600" fill="{TEXTO}">{val}</text>')
            y += 30
            n += 1
        y += 14
    return "".join(s)


CSS_HWMON = """
@keyframes barra { 0%, 100% { transform: scaleX(1); } 30% { transform: scaleX(.78); } 60% { transform: scaleX(.92); } 80% { transform: scaleX(.7); } }
.barra { transform-box: fill-box; transform-origin: left center; animation: barra 3s ease-in-out infinite; }
"""


def capa(x, y, w, h, tipo, idc):
    s = [f'<clipPath id="capa{idc}"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12"/></clipPath><g clip-path="url(#capa{idc})">']
    if tipo == 0:
        s += [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#3b1d4f"/>',
              f'<circle cx="{x+w*.7}" cy="{y+h*.35}" r="{h*.22}" fill="#ff7ab6" opacity=".8"/>',
              f'<path d="M{x} {y+h} L{x+w*.35} {y+h*.45} L{x+w*.6} {y+h*.8} L{x+w*.8} {y+h*.55} L{x+w} {y+h*.85} V{y+h}Z" fill="#1c0d29"/>']
    elif tipo == 1:
        s += [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#0f3b3a"/>',
              f'<path d="M{x+w*.5} {y+h*.15} L{x+w*.1} {y+h} H{x+w*.9}Z" fill="#1d5f5c"/>',
              f'<path d="M{x+w*.5} {y+h*.3} V{y+h}" stroke="#ffd54f" stroke-width="3" stroke-dasharray="8 8"/>']
    else:
        s += [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#3a2a12"/>',
              f'<circle cx="{x+w*.25}" cy="{y+h*.3}" r="{h*.16}" fill="#ffb020" opacity=".85"/>',
              f'<path d="M{x} {y+h*.75} Q{x+w*.4} {y+h*.55} {x+w} {y+h*.7} V{y+h} H{x}Z" fill="#5d4520"/>',
              f'<path d="M{x+w*.65} {y+h*.7} l12 -34 l12 34Z" fill="#2c6b2f"/>']
    s.append("</g>")
    return "".join(s)


def arte_jogos(x0):
    s = []
    nomes = ["Jogo de tiro", "Corrida", "Mundo aberto"]
    for k in range(3):
        x = x0 + 20 + k * 172
        s.append(capa(x, 40, 156, 96, k, k))
        if k == 0:
            s.append(f'<rect class="a sel" x="{x-3}" y="37" width="162" height="102" rx="14" fill="none" stroke="{VERDE}" stroke-width="3"/>')
        s.append(f'<text x="{x+4}" y="160" font-size="15" fill="{TEXTO if k == 0 else CINZA}">{nomes[k]}</text>')
    s.append(cartao(x0 + 20, 180, 500, 250))
    rotulos = ["Liberar o núcleo 0", "Só núcleos físicos", "Prioridade alta", "Placa de vídeo dedicada"]
    for k, t in enumerate(rotulos):
        y = 206 + k * 52
        s.append(f'<text x="{x0+44}" y="{y+18}" font-size="17" fill="{TEXTO}">{t}</text>')
        s.append(chave(x0 + 254, y, k))
    gx, gy = x0 + 336, 236
    s.append(f'<text x="{gx}" y="{gy-12}" font-size="14" fill="{CINZA}">Núcleos do processador</text>')
    for k in range(8):
        col, lin = k % 4, k // 4
        x, y = gx + col * 42, gy + lin * 42
        cls = ' class="nucleo0" opacity=".25"' if k == 0 else ""
        s.append(f'<g{cls}><rect x="{x}" y="{y}" width="34" height="34" rx="8" fill="{VERDE}" fill-opacity=".14" stroke="{VERDE}" stroke-width="1.6"/>'
                 f'<circle cx="{x+12}" cy="{y+17}" r="4.5" fill="{VERDE}"/>'
                 f'<circle class="smt" opacity=".2" cx="{x+23}" cy="{y+17}" r="4.5" fill="{VERDE}"/></g>')
    s.append(f'<text x="{gx}" y="{gy+108}" font-size="13" fill="{CINZA}">O núcleo 0 fica livre</text>')
    s.append(f'<text x="{gx}" y="{gy+127}" font-size="13" fill="{CINZA}">para o Windows.</text>')
    return "".join(s)


CSS_JOGOS = CSS_CHAVE + f"""
@keyframes nucleo0 {{ 0%, 6% {{ opacity: 1; }} 12%, 86% {{ opacity: .25; }} 94%, 100% {{ opacity: 1; }} }}
@keyframes smt {{ 0%, 6% {{ opacity: 1; }} 12%, 86% {{ opacity: .2; }} 94%, 100% {{ opacity: 1; }} }}
@keyframes sel {{ 50% {{ opacity: .45; }} }}
.nucleo0 {{ animation: nucleo0 8s ease-in-out infinite both; animation-delay: {0*.45 - 4.4:.2f}s; }}
.smt {{ animation: smt 8s ease-in-out infinite both; animation-delay: {1*.45 - 4.4:.2f}s; }}
.sel {{ animation: sel 2.4s ease-in-out infinite; }}
"""


def arte_diag(x0):
    s = [cartao(x0 + 20, 40, 270, 390)]
    s.append(f'<text x="{x0+44}" y="74" font-size="15" font-weight="600" fill="{TEXTO}">Registros do Windows</text>')
    eventos = [("21:02", "Jogo aberto", False), ("21:40", "Tudo normal", False), ("22:13", "Desligou de repente", True),
               ("22:14", "Windows iniciou", False), ("22:14", "Sem tela azul", False)]
    s.append(f'<rect x="{x0+53}" y="110" width="2" height="250" fill="#fff" fill-opacity=".1"/>')
    for k, (h, t, alvo) in enumerate(eventos):
        y = 112 + k * 62
        cor = AMBAR if alvo else "#5b6283"
        if alvo:
            s.append(f'<rect class="marca" x="{x0+34}" y="{y-20}" width="238" height="48" rx="10" fill="{AMBAR}" fill-opacity=".12" stroke="{AMBAR}" stroke-width="1.6"/>')
        s.append(f'<circle cx="{x0+54}" cy="{y}" r="6" fill="{cor}"/>')
        s.append(f'<text x="{x0+74}" y="{y-2}" font-size="13" font-weight="700" fill="{AMBAR if alvo else CINZA}">{h}</text>')
        s.append(f'<text x="{x0+74}" y="{y+18}" font-size="16" fill="{TEXTO if alvo else CINZA}">{t}</text>')
    s.append(f'<clipPath id="reg"><rect x="{x0+20}" y="90" width="270" height="320"/></clipPath>'
             f'<g clip-path="url(#reg)"><rect class="varre" x="{x0+20}" y="90" width="270" height="3" fill="{CIANO}" opacity=".8"/></g>')
    cx, cy = x0 + 306, 80
    s.append(f'<g class="conclui">{cartao(cx, cy, 214, 310)}'
             f'<text x="{cx+20}" y="{cy+34}" font-size="14" fill="{CINZA}">Motivo provável</text>'
             f'<text x="{cx+20}" y="{cy+66}" font-size="22" font-weight="700" fill="{TEXTO}">Queda de energia</text>'
             f'<text x="{cx+20}" y="{cy+92}" font-size="14" fill="{CINZA}">O PC desligou sem aviso</text>'
             f'<text x="{cx+20}" y="{cy+111}" font-size="14" fill="{CINZA}">e sem erro do Windows.</text>'
             f'<rect x="{cx+20}" y="{cy+130}" width="174" height="1" fill="#fff" fill-opacity=".1"/>'
             f'<text x="{cx+20}" y="{cy+160}" font-size="14" font-weight="600" fill="{VERDE}">O que fazer</text>')
    for k, t in enumerate(["Confira a tomada", "Teste sem o filtro", "Veja a fonte do PC"]):
        y = cy + 192 + k * 34
        s.append(f'<circle cx="{cx+31}" cy="{y-5}" r="11" fill="{VERDE}" fill-opacity=".16"/>'
                 f'<text x="{cx+31}" y="{y}" text-anchor="middle" font-size="13" font-weight="700" fill="{VERDE}">{k+1}</text>'
                 f'<text x="{cx+50}" y="{y}" font-size="15" fill="{TEXTO}">{t}</text>')
    s.append("</g>")
    return "".join(s)


CSS_DIAG = """
@keyframes varre { 0% { transform: translateY(0); opacity: 0; } 5% { opacity: .8; } 40% { transform: translateY(315px); opacity: .8; } 44%, 100% { transform: translateY(315px); opacity: 0; } }
@keyframes marca { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
@keyframes conclui { 0%, 30% { opacity: 0; transform: translateX(16px); } 40%, 92% { opacity: 1; transform: none; } 100% { opacity: 0; } }
.varre { transform-box: view-box; animation: varre 7s ease-in-out infinite; }
.marca { animation: marca 2.2s ease-in-out infinite; }
.conclui { animation: conclui 7s cubic-bezier(.2,.8,.2,1) infinite both; animation-delay: -3.5s; }
"""


def arte_limpeza(x0):
    D = -4.2
    cx, cy, r = x0 + 150, 215, 100
    s = [f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{TRILHO}" stroke-width="26"/>',
         f'<circle class="disco" style="animation-delay: {D}s" cx="{cx}" cy="{cy}" r="{r}" pathLength="100" stroke-dasharray="100" stroke-dashoffset="36" '
         f'transform="rotate(-90 {cx} {cy})" fill="none" stroke="url(#discog)" stroke-width="26" stroke-linecap="round"/>',
         f'<defs><linearGradient id="discog" x1="0" x2="1"><stop offset="0" stop-color="{VERDE}"/><stop offset="1" stop-color="{CIANO}"/></linearGradient></defs>',
         f'<text x="{cx}" y="{cy-18}" text-anchor="middle" font-size="15" fill="{CINZA}">Disco C:</text>',
         f'<text class="antes" style="animation-delay: {D}s" x="{cx}" y="{cy+22}" text-anchor="middle" font-size="40" font-weight="700" fill="{TEXTO}">82%</text>',
         f'<text class="depois" style="animation-delay: {D}s" x="{cx}" y="{cy+22}" text-anchor="middle" font-size="40" font-weight="700" fill="{TEXTO}">64%</text>',
         f'<text x="{cx}" y="{cy+46}" text-anchor="middle" font-size="14" fill="{CINZA}">usado</text>',
         f'<g class="depois" style="animation-delay: {D}s"><rect x="{cx-100}" y="{cy+128}" width="200" height="40" rx="20" fill="{VERDE}" fill-opacity=".14" stroke="{VERDE}" stroke-opacity=".5"/>'
         f'<text x="{cx}" y="{cy+154}" text-anchor="middle" font-size="16" font-weight="600" fill="{VERDE}">18,4 GB liberados</text></g>']
    rx, ry = x0 + 290, 50
    s.append(cartao(rx, ry, 230, 120))
    s.append(f'<text x="{rx+20}" y="{ry+32}" font-size="15" fill="{CINZA}">Memória RAM</text>')
    s.append(f'<text class="antes" style="animation-delay: {D}s" x="{rx+210}" y="{ry+33}" text-anchor="end" font-size="20" font-weight="700" fill="{TEXTO}">78%</text>')
    s.append(f'<text class="depois" style="animation-delay: {D}s" x="{rx+210}" y="{ry+33}" text-anchor="end" font-size="20" font-weight="700" fill="{TEXTO}">41%</text>')
    s.append(f'<rect x="{rx+20}" y="{ry+58}" width="190" height="14" rx="7" fill="{TRILHO}"/>')
    s.append(f'<rect class="ram" style="animation-delay: {D}s" x="{rx+20}" y="{ry+58}" width="{190*.41:.0f}" height="14" rx="7" fill="#a78bfa"/>')
    s.append(f'<text x="{rx+20}" y="{ry+98}" font-size="13" fill="{CINZA}">Sem fechar seus programas</text>')
    ly = ry + 140
    s.append(cartao(rx, ly, 230, 240))
    s.append(f'<text x="{rx+20}" y="{ly+32}" font-size="15" font-weight="600" fill="{TEXTO}">Limpo agora</text>')
    for k, (t, v) in enumerate([("Temporários", "9,2 GB"), ("Cache", "5,1 GB"), ("Logs antigos", "2,6 GB"), ("Lixeira", "1,5 GB")]):
        y = ly + 72 + k * 42
        s.append(f'<g class="item" style="animation-delay: {k*.35 + D:.2f}s">{visto(rx+30, y-5, 8)}'
                 f'<text x="{rx+46}" y="{y}" font-size="15" fill="{CINZA}">{t}</text>'
                 f'<text x="{rx+210}" y="{y}" text-anchor="end" font-size="15" font-weight="600" fill="{TEXTO}">{v}</text></g>')
    return "".join(s)


CSS_LIMPEZA = """
@keyframes disco { 0%, 10% { stroke-dashoffset: 18; } 24%, 90% { stroke-dashoffset: 36; } 100% { stroke-dashoffset: 18; } }
@keyframes ram { 0%, 10% { transform: scaleX(1.9); } 24%, 90% { transform: scaleX(1); } 100% { transform: scaleX(1.9); } }
@keyframes antes { 0%, 14% { opacity: 1; } 18%, 92% { opacity: 0; } 96%, 100% { opacity: 1; } }
@keyframes depois { 0%, 14% { opacity: 0; } 18%, 92% { opacity: 1; } 96%, 100% { opacity: 0; } }
@keyframes item { 0%, 16% { opacity: 0; transform: translateX(-10px); } 24%, 90% { opacity: 1; transform: none; } 96%, 100% { opacity: 0; } }
.disco { animation: disco 7s cubic-bezier(.2,.8,.2,1) infinite both; }
.ram { transform-box: fill-box; transform-origin: left center; animation: ram 7s cubic-bezier(.2,.8,.2,1) infinite both; }
.antes { animation: antes 7s linear infinite both; }
.depois { animation: depois 7s linear infinite both; }
.item { animation: item 7s cubic-bezier(.2,.8,.2,1) infinite both; }
"""


def arte_formatar(x0):
    D = -5.4
    s = [cartao(x0 + 20, 40, 500, 395)]
    s.append(f'<text x="{x0+44}" y="76" font-size="17" font-weight="700" fill="{TEXTO}">Instalando seus programas</text>')
    apps = [("Chrome", "C", "#4285f4"), ("Discord", "D", "#5865f2"), ("Steam", "S", "#2a475e"), ("7-Zip", "7", "#6b7280"), ("VLC", "V", "#f97316")]
    for k, (n, l, cor) in enumerate(apps):
        y = 104 + k * 46
        d = f"animation-delay: {k*.55 + D:.2f}s"
        s.append(f'<rect x="{x0+44}" y="{y}" width="30" height="30" rx="8" fill="{cor}"/>'
                 f'<text x="{x0+59}" y="{y+21}" text-anchor="middle" font-size="15" font-weight="700" fill="#fff">{l}</text>'
                 f'<text x="{x0+88}" y="{y+21}" font-size="17" fill="{TEXTO}">{n}</text>'
                 f'<rect x="{x0+220}" y="{y+11}" width="220" height="8" rx="4" fill="{TRILHO}"/>'
                 f'<rect class="enche" style="{d}" x="{x0+220}" y="{y+11}" width="220" height="8" rx="4" fill="{VERDE}"/>'
                 f'<g class="ok" style="{d}">{visto(x0+476, y+15, 10)}</g>')
    s.append(f'<rect x="{x0+44}" y="342" width="452" height="1" fill="#fff" fill-opacity=".08"/>')
    for k, (t, w) in enumerate([("Telemetria desligada", 164), ("Copilot removido", 142), ("Apps extras fora", 126)]):
        x = x0 + 44 + [0, 176, 330][k]
        s.append(f'<g class="chip" style="animation-delay: {2.9 + k*.3 + D:.2f}s"><rect x="{x}" y="366" width="{w}" height="36" rx="18" fill="{VERDE}" fill-opacity=".12" stroke="{VERDE}" stroke-opacity=".45"/>'
                 f'<text x="{x+w/2}" y="389" text-anchor="middle" font-size="13" font-weight="600" fill="{VERDE}">{t}</text></g>')
    return "".join(s)


CSS_FORMATAR = """
@keyframes enche { 0%, 2% { transform: scaleX(0); } 12%, 90% { transform: scaleX(1); } 96%, 100% { transform: scaleX(0); } }
@keyframes ok { 0%, 11% { opacity: 0; transform: scale(.4); } 15%, 90% { opacity: 1; transform: none; } 96%, 100% { opacity: 0; } }
@keyframes chip { 0%, 2% { opacity: 0; transform: translateY(8px); } 8%, 90% { opacity: 1; transform: none; } 96%, 100% { opacity: 0; } }
.enche { transform-box: fill-box; transform-origin: left center; animation: enche 10s cubic-bezier(.4,0,.2,1) infinite both; }
.ok { transform-box: fill-box; transform-origin: center; animation: ok 10s cubic-bezier(.3,1.4,.5,1) infinite both; }
.chip { animation: chip 10s cubic-bezier(.2,.8,.2,1) infinite both; }
"""


# ================================================================== confiança
def confianca():
    W, H = 1200, 470
    css = """
    @keyframes anel { 0% { transform: scale(.7); opacity: .9; } 100% { transform: scale(1.6); opacity: 0; } }
    @keyframes volta { 0%, 60% { transform: rotate(0); } 80%, 100% { transform: rotate(-360deg); } }
    .anel { transform-box: fill-box; transform-origin: center; animation: anel 3.6s ease-out infinite; }
    .volta { transform-box: fill-box; transform-origin: center; animation: volta 5s cubic-bezier(.6,0,.2,1) infinite; }
    """
    cx, cy = W / 2, 120
    c = [fundo(W, H, (VERDE, CIANO, INDIGO), forca=.28)]
    for k in range(3):
        c.append(f'<circle class="anel" style="animation-delay: {k*1.2}s" cx="{cx}" cy="{cy}" r="56" fill="none" stroke="{VERDE}" stroke-width="2"/>')
    c.append(f'<circle cx="{cx}" cy="{cy}" r="56" fill="{VERDE}" fill-opacity=".14" stroke="{VERDE}" stroke-width="2"/>')
    c.append(f'<g class="volta"><path d="M{cx+18} {cy-14} A24 24 0 1 0 {cx+24} {cy+4}" fill="none" stroke="{VERDE}" stroke-width="6" stroke-linecap="round"/>'
             f'<path d="M{cx+6} {cy-24} L{cx+22} {cy-14} L{cx+8} {cy-1}" fill="none" stroke="{VERDE}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></g>')
    c.append(f'<text x="{cx}" y="{cy+132}" text-anchor="middle" font-size="46" font-weight="700" letter-spacing="-1.2" fill="{TEXTO}">Tudo pode ser desfeito.</text>')
    c.append(f'<text x="{cx}" y="{cy+180}" text-anchor="middle" font-size="22" fill="{CINZA}">Cada ajuste tem um botão para voltar ao que era. Antes das mudanças</text>')
    c.append(f'<text x="{cx}" y="{cy+212}" text-anchor="middle" font-size="22" fill="{CINZA}">grandes, ele cria um ponto de restauração. E nada sai do seu PC.</text>')
    pilulas = ["Ponto de restauração", "Sem drivers escondidos", "Sem anúncios e sem cadastro"]
    larg = [230, 250, 290]
    total = sum(larg) + 2 * 16
    x = cx - total / 2
    for t, w in zip(pilulas, larg):
        c.append(f'<rect x="{x}" y="{cy+250}" width="{w}" height="42" rx="21" fill="#ffffff" fill-opacity=".05" stroke="#fff" stroke-opacity=".12"/>'
                 f'{visto(x+24, cy+271, 8)}<text x="{x+42}" y="{cy+277}" font-size="16" fill="{TEXTO}">{t}</text>')
        x += w + 16
    svg("confianca", W, H, "".join(c), css)


# ================================================================== três passos
def passos():
    W, H = 1200, 330
    css = """
    @keyframes vai { 0% { stroke-dashoffset: 40; } 100% { stroke-dashoffset: 0; } }
    .liga { stroke-dasharray: 6 14; animation: vai 1.2s linear infinite; }
    """
    itens = [("1", "Baixe o programa", ["Instalador ou versão portátil,", "na página de versões."]),
             ("2", "Abra o HS TECH", ["Ele confere o seu PC e", "mostra a sua nota."]),
             ("3", "Dê o Boost", ["Um clique. E dá para", "voltar quando quiser."])]
    c = [fundo(W, H, forca=.22)]
    for k, (n, tit, txt) in enumerate(itens):
        x = 200 + k * 400
        if k:
            c.append(f'<path class="liga" d="M{x-330} 110 H{x-70}" stroke="{VERDE}" stroke-width="3" stroke-linecap="round" fill="none"/>')
        c.append(f'<circle cx="{x}" cy="110" r="44" fill="{VERDE}" fill-opacity=".14" stroke="{VERDE}" stroke-width="2.5"/>')
        c.append(f'<text x="{x}" y="125" text-anchor="middle" font-size="40" font-weight="700" fill="{TEXTO}">{n}</text>')
        c.append(f'<text x="{x}" y="200" text-anchor="middle" font-size="26" font-weight="700" fill="{TEXTO}">{tit}</text>')
        for i, l in enumerate(txt):
            c.append(f'<text x="{x}" y="{238+i*28}" text-anchor="middle" font-size="19" fill="{CINZA}">{l}</text>')
    svg("passos", W, H, "".join(c), css)


# ================================================================== botão de baixar
def botao():
    W, H = 420, 84
    c = [f'<defs><linearGradient id="bt" x1="0" x2="1"><stop offset="0" stop-color="#2ef0a0"/><stop offset="1" stop-color="{VERDE}"/></linearGradient></defs>',
         f'<rect width="{W}" height="{H}" rx="{H/2}" fill="url(#bt)"/>',
         f'<rect x="1" y="1" width="{W-2}" height="{H-2}" rx="{H/2-1}" fill="none" stroke="#fff" stroke-opacity=".35"/>',
         '<g transform="translate(46 42)" fill="none" stroke="#04131c" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">'
         '<path d="M0 -15 V9 M-10 -1 L0 9 L10 -1 M-14 17 H14"/></g>',
         '<text x="84" y="40" font-size="25" font-weight="700" fill="#04131c">Baixar para Windows</text>',
         '<text x="84" y="64" font-size="16" fill="#04131c" fill-opacity=".75">Windows 10 e 11 · 64 bits · grátis</text>']
    svg("baixar", W, H, "".join(c))


abertura()
faixa("ajustes", "AJUSTES PARA JOGOS", ["Mais FPS, menos", "atraso no clique."],
      ["Cada ajuste mostra se já está ligado", "no seu Windows. Ligue o que quiser", "e desligue quando quiser."],
      arte_ajustes, CSS_AJUSTES, "esq", parado=".tremido { display: none; }")
faixa("overlay", "POR CIMA DO JOGO", ["Seu FPS na tela,", "sem atrapalhar."],
      ["Um painel pequeno mostra o FPS, o 1% low,", "a CPU, a placa de vídeo e o ping", "enquanto você joga. Um atalho", "mostra e esconde."],
      arte_overlay, CSS_OVERLAY, "dir", (CIANO, INDIGO, VERDE), parado=".outra { display: none; }")
faixa("hardware", "DENTRO DO PC", ["Cada peça do PC,", "ao vivo."],
      ["Processador, placa de vídeo, memória,", "discos e rede, com o valor de agora,", "o mínimo e o máximo. Dá para", "gravar tudo e abrir no Excel."],
      arte_hwmon, CSS_HWMON, "esq", (VERDE, CIANO, "#a78bfa"))
faixa("jogos", "SEUS JOGOS", ["Ele acha seus jogos", "sozinho."],
      ["Steam, Epic, Xbox e outras lojas.", "Para cada jogo, você escolhe os", "núcleos, a prioridade e a placa de", "vídeo. Vale só para aquele jogo."],
      arte_jogos, CSS_JOGOS, "dir", ("#ff7ab6", INDIGO, VERDE))
faixa("diagnostico", "QUANDO ALGO DÁ ERRADO", ["Ele conta o que", "aconteceu."],
      ["O PC desligou sozinho? Ele lê os", "registros do Windows, diz o motivo", "provável e o que fazer, em ordem."],
      arte_diag, CSS_DIAG, "esq", (AMBAR, INDIGO, VERDE))
faixa("limpeza", "LIMPEZA", ["Espaço de volta e", "memória mais leve."],
      ["Apaga temporários, caches e restos", "de atualização. A memória RAM", "também é liberada sem fechar", "nenhum programa."],
      arte_limpeza, CSS_LIMPEZA, "dir", (VERDE, "#a78bfa", CIANO), parado=".antes { display: none; }")
faixa("formatar", "ACABOU DE FORMATAR?", ["O Windows pronto", "de uma vez."],
      ["Marque seus programas e ele instala", "todos. Também tira os apps que vêm", "de fábrica, desliga a telemetria e", "remove o Copilot."],
      arte_formatar, CSS_FORMATAR, "esq", (CIANO, VERDE, INDIGO))
confianca()
passos()
botao()
print("ok:", ", ".join(sorted(p.stem for p in AQUI.glob("*.svg"))))
