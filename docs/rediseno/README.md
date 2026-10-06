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
- `socios-boceto.html`: el boceto estático de Socios a 375 px del que parte el §5 del plan (con tres
  pasos; el plan pide cuatro). Se abre en el navegador.
- `amount-prototipo.txt`: el prototipo de `src/ui/amount.ts` (cifra, icono oculto al lector y la
  palabra para el lector), como texto: no se compila.

El plan se escribió en una carpeta de trabajo que no está en el repositorio, y cita archivos de allí:
su nota del principio dice qué nombre tiene aquí cada uno y qué no se guardó.

Los textos de la tabla se escribieron sobre la rama de la fase 10 antes de terminar los votos:
revisa cada clave contra src/i18n antes de aplicarla. Una ya está aplicada: `wind.confirm.oneWay`
lleva su texto de la tabla desde la 1.6.0, porque el de antes («En esta versión no se puede volver a
un bioma que dejaste») dejó de ser cierto con El regreso y el ciclo libre.
