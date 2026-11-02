export type ProprietairePresence = {
  instanceId: string;
  sessionId: string;
};

/**
 * Un événement `replace` peut arriver en retard : seule la présence durable
 * en base permet de savoir quelle instance possède encore la socket courante.
 */
export function possedePresenceCourante(
  presence: ProprietairePresence | null | undefined,
  instanceId: string,
  sessionId: string,
): boolean {
  return presence?.instanceId === instanceId && presence.sessionId === sessionId;
}
