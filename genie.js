// Shared opening/closing motion. The browser owns the toolbar anchor;
// page overlays approximate it at the top-right edge of the viewport.
function dhGenie(element, reverse = false) {
  const frames = [
    { offset: 0, transform: 'translateY(-16px) scale(.025,.008) skewX(-18deg)', opacity: 0,
      borderRadius: '80px', clipPath: 'polygon(0 0,100% 0,100% 100%,0 100%,0 75%,0 50%,0 25%)' },
    { offset: .18, transform: 'translateY(-8px) scale(.12,.22) skewX(-16deg)', opacity: 1,
      borderRadius: '60px', clipPath: 'polygon(58% 0,100% 0,100% 100%,0 100%,5% 75%,24% 50%,45% 25%)' },
    { offset: .44, transform: 'translateY(0) scale(.55,.78) skewX(-9deg)', opacity: 1,
      borderRadius: '36px', clipPath: 'polygon(68% 0,100% 0,100% 100%,0 100%,3% 75%,17% 50%,42% 25%)' },
    { offset: .72, transform: 'translateY(0) scale(.96,1.015) skewX(-2deg)', opacity: 1,
      borderRadius: '18px', clipPath: 'polygon(28% 0,100% 0,100% 100%,0 100%,0 75%,4% 50%,13% 25%)' },
    { offset: 1, transform: 'translateY(0) scale(1,1) skewX(0deg)', opacity: 1,
      borderRadius: '0px', clipPath: 'polygon(0 0,100% 0,100% 100%,0 100%,0 75%,0 50%,0 25%)' },
  ];
  element.style.transformOrigin = '100% 0%';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  return element.animate(frames, { duration: reduced ? 1 : reverse ? 540 : 820,
    direction: reverse ? 'reverse' : 'normal', easing: 'cubic-bezier(.22,.65,.3,1)', fill: 'both' });
}
