/**
 * Mola amortecida usada na geometria da ilha. Parametrizada como no iOS: `response` (segundos até
 * chegar perto do alvo) e `damping` (1 = sem overshoot, menor que 1 = quica). Como só o alvo muda,
 * a animação é interrompível: ela sempre parte do valor e da velocidade atuais.
 */
export class Spring {
  x: number;
  v = 0;
  target: number;

  constructor(initial: number) {
    this.x = initial;
    this.target = initial;
  }

  step(dt: number, response: number, damping: number): void {
    const omega = (2 * Math.PI) / response;
    const stiffness = omega * omega;
    const drag = 2 * damping * omega;

    // Sub-passos pequenos mantêm a integração estável mesmo com frames lentos.
    const steps = Math.max(1, Math.ceil(dt / 0.004));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.v += (-stiffness * (this.x - this.target) - drag * this.v) * h;
      this.x += this.v * h;
    }
  }

  snap(value: number): void {
    this.x = value;
    this.target = value;
    this.v = 0;
  }

  get settled(): boolean {
    return Math.abs(this.x - this.target) < 0.05 && Math.abs(this.v) < 0.05;
  }
}
