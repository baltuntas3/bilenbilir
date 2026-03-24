import confetti from 'canvas-confetti';

export function fireConfetti() {
  const count = 200;
  const defaults = {
    origin: { y: 0.7 },
    zIndex: 10000,
  };

  function fire(particleRatio, opts) {
    confetti({
      ...defaults,
      particleCount: Math.floor(count * particleRatio),
      ...opts,
    });
  }

  fire(0.25, { spread: 26, startVelocity: 55, colors: ['#00f0ff', '#ff2d95'] });
  fire(0.2, { spread: 60, colors: ['#39ff14', '#ffe600'] });
  fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8, colors: ['#bf00ff', '#00f0ff'] });
  fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2, colors: ['#ff2d95', '#39ff14'] });
  fire(0.1, { spread: 120, startVelocity: 45, colors: ['#ffe600', '#bf00ff'] });
}

export function fireCorrectAnswer() {
  confetti({
    particleCount: 50,
    spread: 60,
    origin: { y: 0.8 },
    colors: ['#39ff14', '#00f0ff'],
    zIndex: 10000,
  });
}

export function fireStreakConfetti(streak) {
  const particleCount = Math.min(streak * 20, 100);
  confetti({
    particleCount,
    spread: 70,
    origin: { y: 0.6 },
    colors: ['#ffe600', '#ff2d95', '#00f0ff'],
    zIndex: 10000,
  });
}
