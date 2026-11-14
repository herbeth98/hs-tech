// Fundo interativo: luz que segue o mouse, lente na grade, parallax em camadas e pulso no clique.
// Só anima enquanto há movimento: o laço de quadros para sozinho quando tudo assenta.

export function installInteractiveBackground() {
  const bg = document.getElementById('appBg');
  const spot = document.getElementById('bgSpot');
  const grid = document.getElementById('bgGrid');
  const lens = document.getElementById('bgLens');
  if (!bg || !spot || !grid || !lens) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const layers = [...bg.querySelectorAll('.bg-par')].map((el) => ({ el, depth: Number(el.dataset.depth) || 0 }));
  const SPOT = 560 / 2;
  const LENS = 320 / 2;
  const EASE = 0.14; // quanto o fundo "alcança" o mouse por quadro (atraso suave)

  const target = { x: innerWidth * 0.6, y: innerHeight * 0.35 };
  const cur = { ...target };
  let raf = 0;

  function frame() {
    raf = 0;
    cur.x += (target.x - cur.x) * EASE;
    cur.y += (target.y - cur.y) * EASE;
    const r = bg.getBoundingClientRect();
    const x = cur.x - r.left;
    const y = cur.y - r.top;

    // Luz
    spot.style.transform = `translate3d(${x - SPOT}px, ${y - SPOT}px, 0)`;

    // Parallax: camadas se deslocam no sentido oposto ao mouse, mais as de trás
    const nx = (x / r.width - 0.5) * 2;
    const ny = (y / r.height - 0.5) * 2;
    for (const l of layers) l.el.style.transform = `translate3d(${-nx * l.depth}px, ${-ny * l.depth}px, 0)`;

    // Lente: posição dentro da grade (que tem deriva e parallax), linhas alinhadas às da grade
    const g = grid.getBoundingClientRect();
    const lx = cur.x - g.left - LENS;
    const ly = cur.y - g.top - LENS;
    lens.style.transform = `translate3d(${lx}px, ${ly}px, 0)`;
    lens.style.backgroundPosition = `${-lx}px ${-ly}px`;

    if (Math.abs(target.x - cur.x) > 0.3 || Math.abs(target.y - cur.y) > 0.3) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  window.addEventListener('pointermove', (e) => {
    target.x = e.clientX; target.y = e.clientY;
    bg.classList.add('pointer-in');
    kick();
  }, { passive: true });
  document.addEventListener('pointerleave', () => bg.classList.remove('pointer-in'));
  window.addEventListener('blur', () => bg.classList.remove('pointer-in'));
  window.addEventListener('resize', kick);

  // Pulso discreto no fundo a cada clique
  window.addEventListener('pointerdown', (e) => {
    const r = bg.getBoundingClientRect();
    const p = document.createElement('div');
    p.className = 'bg-pulse';
    p.style.setProperty('--at', `translate(${e.clientX - r.left}px, ${e.clientY - r.top}px)`);
    bg.appendChild(p);
    p.addEventListener('animationend', () => p.remove());
    setTimeout(() => p.remove(), 1000);
  }, { passive: true });

  kick();
}
