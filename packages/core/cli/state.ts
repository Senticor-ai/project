import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type StoredUser = {
  id: string;
  email: string;
  username?: string | null;
  default_org_id?: string | null;
  created_at: string;
};

export type SessionState = {
  host: string;
  cookies: Record<string, string>;
  csrfToken: string | null;
  user: StoredUser | null;
  updatedAt: string;
};

export type ProposalState = {
  id: string;
  operation: "items.create" | "items.triage";
  status: "pending" | "applied";
  createdAt: string;
  appliedAt?: string;
  payload: Record<string, unknown>;
};

const DEFAULT_CONFIG_DIR = path.join(os.homedir(), ".config", "senticor-copilot");

function configDir(): string {
  return process.env.COPILOT_CONFIG_DIR?.trim() || DEFAULT_CONFIG_DIR;
}

function sessionPath(): string {
  return path.join(configDir(), "session.json");
}

function proposalsPath(): string {
  return path.join(configDir(), "proposals.json");
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  await writeFile(tmpPath, content, "utf8");
  await rename(tmpPath, filePath);
}

export function defaultSession(host: string): SessionState {
  return {
    host,
    cookies: {},
    csrfToken: null,
    user: null,
    updatedAt: new Date().toISOString(),
  };
}

export async function loadSession(host: string): Promise<SessionState> {
  try {
    const raw = await readFile(sessionPath(), "utf8");
    const parsed = JSON.parse(raw) as SessionState;
    if (!parsed || typeof parsed !== "object") {
      return defaultSession(host);
    }
    return {
      host,
      cookies: parsed.cookies ?? {},
      csrfToken: parsed.csrfToken ?? null,
      user: parsed.user ?? null,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return defaultSession(host);
  }
}

export async function saveSession(session: SessionState): Promise<void> {
  const payload: SessionState = {
    ...session,
    updatedAt: new Date().toISOString(),
  };
  await atomicWrite(sessionPath(), JSON.stringify(payload, null, 2));
}

export async function clearSession(host: string): Promise<SessionState> {
  const fresh = defaultSession(host);
  await saveSession(fresh);
  return fresh;
}

export async function loadProposals(): Promise<ProposalState[]> {
  try {
    const raw = await readFile(proposalsPath(), "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((value): value is ProposalState => {
      return Boolean(
        value &&
          typeof value === "object" &&
          typeof value.id === "string" &&
          typeof value.operation === "string" &&
          typeof value.status === "string" &&
          value.payload &&
          typeof value.payload === "object",
      );
    });
  } catch {
    return [];
  }
}

export async function saveProposals(proposals: ProposalState[]): Promise<void> {
  await atomicWrite(proposalsPath(), JSON.stringify(proposals, null, 2));
}

export async function addProposal(
  operation: ProposalState["operation"],
  payload: Record<string, unknown>,
): Promise<ProposalState> {
  const proposals = await loadProposals();
  const proposal: ProposalState = {
    id: `prp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    operation,
    status: "pending",
    createdAt: new Date().toISOString(),
    payload,
  };
  proposals.unshift(proposal);
  await saveProposals(proposals);
  return proposal;
}

export async function updateProposal(proposal: ProposalState): Promise<void> {
  const proposals = await loadProposals();
  const idx = proposals.findIndex((item) => item.id === proposal.id);
  if (idx === -1) {
    proposals.unshift(proposal);
  } else {
    proposals[idx] = proposal;
  }
  await saveProposals(proposals);
}

export async function getProposal(id: string): Promise<ProposalState | null> {
  const proposals = await loadProposals();
  return proposals.find((proposal) => proposal.id === id) ?? null;
}
