import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@triggers/database';
import { ApiKeyRole } from '@triggers/database';
import { ForbiddenError, UnauthorizedError } from '@triggers/contracts';
import { parseApiKey, verifyApiKeySecret } from '@triggers/domain';

export interface AuthPrincipal {
  apiKeyId: string;
  workspaceId: string;
  role: ApiKeyRole;
  /** Consumer keys may be scoped to a single subscription. */
  subscriptionId: string | null;
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : null;
}

/**
 * Resolve the authenticated principal from the Authorization header.
 * Returns null when no valid credential is present (caller decides how strict).
 */
export async function resolvePrincipal(
  prisma: PrismaClient,
  pepper: string,
  authorization: string | undefined,
): Promise<AuthPrincipal | null> {
  const token = extractBearer(authorization);
  if (!token) return null;

  const parsed = parseApiKey(token);
  if (!parsed) return null;

  const apiKey = await prisma.apiKey.findUnique({ where: { publicPrefix: parsed.publicPrefix } });
  if (!apiKey || !apiKey.isActive) return null;

  if (!verifyApiKeySecret(parsed.secret, apiKey.secretHash, pepper)) {
    return null;
  }

  return {
    apiKeyId: apiKey.id,
    workspaceId: apiKey.workspaceId,
    role: apiKey.role,
    subscriptionId: apiKey.subscriptionId,
  };
}

/**
 * Fastify preHandler factory enforcing that the request carries a valid key
 * with one of the allowed roles. Attaches the principal to the request.
 */
export function requireRole(...roles: ApiKeyRole[]) {
  return async function authPreHandler(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const principal = await resolvePrincipal(
      request.server.prisma,
      request.server.appConfig.API_KEY_PEPPER,
      request.headers.authorization,
    );

    if (!principal) {
      throw new UnauthorizedError();
    }
    if (roles.length > 0 && !roles.includes(principal.role)) {
      throw new ForbiddenError(`This operation requires one of roles: ${roles.join(', ')}`);
    }

    request.principal = principal;
  };
}

export { ApiKeyRole };
