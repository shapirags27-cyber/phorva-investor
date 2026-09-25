const crypto = require("crypto");

function createVerificationId() {
  return `ver_${crypto.randomUUID()}`;
}

function createRequestId() {
  return `req_${crypto.randomUUID()}`;
}

function validateVerifyRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "Request body must be a JSON object";
  }

  if (!body.agent || typeof body.agent !== "object") {
    return "agent is required";
  }

  if (!body.action || typeof body.action !== "object") {
    return "action is required";
  }

  if (!body.intent || typeof body.intent !== "object") {
    return "intent is required";
  }

  if (!body.policy || typeof body.policy !== "object") {
    return "policy is required";
  }

  if (!body.transaction || typeof body.transaction !== "object") {
    return "transaction is required";
  }

  if (!body.intent.type || typeof body.intent.type !== "string") {
    return "intent.type is required";
  }

  if (!body.action.type || typeof body.action.type !== "string") {
    return "action.type is required";
  }

  if (
    body.transaction.chainId !== undefined &&
    !Number.isInteger(body.transaction.chainId)
  ) {
    return "transaction.chainId must be an integer";
  }

  if (
    body.transaction.to !== undefined &&
    typeof body.transaction.to !== "string"
  ) {
    return "transaction.to must be a string";
  }

  if (
    body.transaction.calldata !== undefined &&
    typeof body.transaction.calldata !== "string"
  ) {
    return "transaction.calldata must be a string";
  }

  if (
    body.transaction.data !== undefined &&
    typeof body.transaction.data !== "string"
  ) {
    return "transaction.data must be a string";
  }

  return null;
}

function normalizeVerificationResult(result) {
  const verification = result || {};
  const analysis = verification.analysis || {};

  let risk = "LOW";

  if (!verification.authorized) {
    risk = "HIGH";
  }

  if (
    analysis.risk === "CRITICAL" ||
    analysis.risk === "HIGH"
  ) {
    risk = "HIGH";
  }

  return {
    verdict: verification.authorized
      ? "AUTHORIZED"
      : "BLOCKED",

    risk,

    intentMatch:
      verification.intentMatched === true,

    policyPassed:
      verification.policyPassed === true,

    authorizationPassed:
      verification.authorized === true,

    executionTypeMatched:
      verification.executionTypeMatched === true,

    parameterMatched:
      verification.parameterMatched === true,

    nativeValueMatched:
      verification.nativeValueMatched === true,

    protocolMatched:
      verification.protocolMatched === true,

    transactionSecuritySafe:
      verification.transactionSecuritySafe === true,

    actualTransactionAmount:
      verification.actualTransactionAmount,

    parameterChecks:
      verification.parameterChecks || {},

    analysis,

    message:
      verification.authorized
        ? "Transaction satisfies Phorva verification requirements."
        : "Transaction was blocked by Phorva verification."
  };
}

function createProductionApi({
  express,
  verify,
  getHealth,
  authenticate
}) {
  const router = express.Router();

  router.use(async (req, res, next) => {
    if (typeof authenticate !== "function") {
      return next();
    }

    try {
      const authenticated = await authenticate(req);

      if (!authenticated) {
        return res.status(401).json({
          requestId: createRequestId(),
          error: {
            code: "UNAUTHORIZED",
            message: "Valid Phorva API credentials are required"
          }
        });
      }

      next();
    } catch (error) {
      return res.status(401).json({
        requestId: createRequestId(),
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication failed"
        }
      });
    }
  });

  router.get("/health", async (req, res) => {
    const requestId = createRequestId();

    try {
      const health =
        typeof getHealth === "function"
          ? await getHealth()
          : {
              status: "ok",
              service: "phorva-api"
            };

      return res.status(200).json({
        requestId,
        ...health
      });
    } catch (error) {
      return res.status(503).json({
        requestId,
        status: "unavailable",
        service: "phorva-api"
      });
    }
  });

  router.post("/verify", async (req, res) => {
    const requestId = createRequestId();
    const verificationId = createVerificationId();

    const validationError =
      validateVerifyRequest(req.body);

    if (validationError) {
      return res.status(400).json({
        requestId,
        verificationId,
        error: {
          code: "INVALID_REQUEST",
          message: validationError
        }
      });
    }

    if (typeof verify !== "function") {
      return res.status(503).json({
        requestId,
        verificationId,
        error: {
          code: "VERIFICATION_ENGINE_UNAVAILABLE",
          message:
            "Phorva verification engine is unavailable"
        }
      });
    }

    try {
      const result = await verify(req.body);

      return res.status(200).json({
        requestId,
        verificationId,
        ...normalizeVerificationResult(result)
      });
    } catch (error) {
      console.error(
        `[${requestId}] verification error:`,
        error
      );

      return res.status(400).json({
        requestId,
        verificationId,
        error: {
          code: "VERIFICATION_FAILED",
          message:
            error.message ||
            "Phorva verification failed"
        }
      });
    }
  });

  return router;
}

module.exports = {
  createProductionApi,
  validateVerifyRequest
};
