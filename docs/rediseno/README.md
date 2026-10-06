# Rediseño de interfaz y textos (1.6.2)

Plan aprobado por el usuario el 2026-10-06 tras una auditoría de diseño. Se aplica en la versión
1.6.2 (docs/ROADMAP.md), no antes.

- `plan.md`: el plan definitivo. Manda la caja «Decisiones del usuario» del principio: el rediseño
  sale aparte como 1.6.2; la franja fija de arriba no se compacta; el icono de nutrientes es la
  variante D, «Canto acuñado».
- `textos.json`: la tabla de textos reescritos (clave, tipo, texto actual, propuesta en español e
  inglés, motivo). `textos-correcciones.json`: las correcciones que la crítica hizo después a esa
  tabla; mandan sobre ella.
- `icono-nutrientes-pequeno.svg` (un trazado del color del texto, para 12–16 px) e
  `icono-nutrientes-rico.svg` (dorado, para 24 px o más): el icono que sustituye a la letra «N».

Los textos de la tabla se escribieron sobre la rama de la fase 10 antes de terminar los votos:
revisa cada clave contra src/i18n antes de aplicarla.
