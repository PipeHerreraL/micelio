/**
 * Lo que la migración 6 → 7 (fase 10) añade a un estado guardado por la 1.4 o la 1.5, escrito a
 * mano con sus ids: las pruebas comparan la migración con esto y no con la propia migración ni con
 * los datos (que crecerán), así que un id de más o de menos en la migración se nota.
 */
export function withV7Additions(state: Record<string, unknown>): Record<string, unknown> {
  return {
    ...state,
    biomeAdaptations: {
      ...(state.biomeAdaptations as Record<string, number>),
      ringFront: 0,
      glomalin: 0,
      pilobolus: 0,
      dwarfBirch: 0,
      snowMold: 0,
      lichen: 0,
    },
    adaptations: {
      ...(state.adaptations as Record<string, number>),
      sporePrint: 0,
      blackCords: 0,
      waxcaps: 0,
    },
    cycle: { stays: 0, done: 0, vows: [], woken: [] },
    records: [],
  };
}
