export type Role = "ADMIN" | "AGENT";
export type Statut = "PRE_INSCRIT" | "ACTIF" | "SUSPENDU" | "REVOQUE";

export interface Agent {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  ministere: string;
  fonction: string;
  categorie: string;
  role: Role;
  statut: Statut;
  createdAt: string;
  revokedAt: string | null;
}

export interface Stats {
  total: number;
  actifs: number;
  preInscrits: number;
  revoques: number;
  groupes: number;
}

export interface AuditLog {
  id: string;
  actorId: string | null;
  action: string;
  detail: string | null;
  createdAt: string;
}

export interface PreInscriptionData {
  matricule: string;
  nom: string;
  prenom: string;
  ministere: string;
  fonction: string;
  categorie: string;
}

export interface PreInscriptionResult {
  agentId: string;
  codeActivation: string;
}

export interface AuthSession {
  token: string;
  adminId?: string;
  matricule: string;
  nomComplet: string;
}

export interface AdminIdentity {
  id: string;
  matricule: string;
  prenom: string;
  nom: string;
  role: Role;
  statut: Statut;
}

export interface Retention {
  id: string;
  groupeId: string;
  agentId: string;
  epoch: number;
  statut: "EN_ATTENTE" | "TERMINE" | "ECHEC";
  erreur: string | null;
  membresAttendus: number;
  membresAccuses: number;
  recus: number;
  attendus: number;
  createdAt: string;
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ReferenceData {
  categories: string[];
  ministeres: string[];
  postes: Array<{ value: string; label: string; parrainage: boolean }>;
}
