import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireMerchantAuth, requireMerchantRole, requireMerchantWriterActor } from "../auth/requireMerchantAuth.js";
import { assertRefundRequestScope, initiateMerchantRefund } from "../refunds/initiateMerchantRefund.js";
import { BadRequestError } from "../lib/errors.js";

interface RefundBody {
  transactionId?: string;
  amountFils?: number;
  reason?: string;
}

interface RefundParams {
  merchantId: string;
}

function getIdempotencyKey(request: FastifyRequest): string {
  const header = request.headers["idempotency-key"];
  const key = Array.isArray(header) ? header[0] : header;
  if (!key) throw new BadRequestError("idempotency_key_required", "Idempotency-Key header is required");
  return key;
}

function createRefundHandler(app: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply, merchantId: string): Promise<void> => {
    const { transactionId, amountFils, reason } = (request.body ?? {}) as RefundBody;
    if (!transactionId) throw new BadRequestError("invalid_request", "transactionId is required");
    if (amountFils !== undefined && (!Number.isSafeInteger(amountFils) || amountFils <= 0)) {
      throw new BadRequestError("invalid_amount", "amountFils must be a positive integer");
    }
    const auth = request.merchantAuth!;
    const result = await initiateMerchantRefund(app.db, app.acquirer, {
      merchantId,
      transactionId,
      amountFils: amountFils as import("@filspay/money").Fils | undefined,
      idempotencyKey: getIdempotencyKey(request),
      actor: requireMerchantWriterActor(auth),
      reason,
    });
    reply.code(result.statusCode).send(result.body);
  };
}

/** Amounts are integer fils; omitted amount refunds the remaining captured amount. */
export async function refundRoutes(app: FastifyInstance): Promise<void> {
  const submit = createRefundHandler(app);
  app.post<{ Body: RefundBody }>("/", { preHandler: [requireMerchantAuth, requireMerchantRole("owner", "finance")] }, async (request, reply) => {
    await submit(request, reply, request.merchantAuth!.merchantId);
  });
}

export async function merchantRefundRoutes(app: FastifyInstance): Promise<void> {
  const submit = createRefundHandler(app);
  app.post<{ Params: RefundParams; Body: RefundBody }>("/:merchantId/refunds", {
    preHandler: [requireMerchantAuth, requireMerchantRole("owner", "finance")],
  }, async (request, reply) => {
    assertRefundRequestScope(request.merchantAuth!, request.params.merchantId);
    await submit(request, reply, request.params.merchantId);
  });
}
