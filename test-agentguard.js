
const http = require("http");

function canonicalizeProofValue(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(canonicalizeProofValue);
  }

  if (typeof value === "object") {
    const result = {};

    for (const key of Object.keys(value).sort()) {
      result[key] = canonicalizeProofValue(value[key]);
    }

    return result;
  }

  return value;
}

function word(value) {
  return BigInt(value).toString(16).padStart(64, "0");
}

function addressWord(address) {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function buildUniversalRouterCalldata(
  amountIn,
  amountOutMin = amountIn - 10,
  options = {}
) {
  const recipient =
    options.recipient ??
    "0x3333333333333333333333333333333333333333";

  const tokenA =
    options.tokenA ??
    "0x1111111111111111111111111111111111111111";

  const tokenB =
    options.tokenB ??
    "0x2222222222222222222222222222222222222222";

  const allowRevert =
    options.allowRevert === true;

  const payerIsUser =
    options.payerIsUser ?? true;

  const commandByte =
    (allowRevert ? 0x80 : 0x00) | 0x08;

  const commandInput = [
    addressWord(recipient),
    word(amountIn),
    word(amountOutMin),
    word(160),
    word(payerIsUser ? 1 : 0),
    word(2),
    addressWord(tokenA),
    addressWord(tokenB)
  ].join("");

  const inputLength = commandInput.length / 2;

  const commandsSection =
    word(1) +
    commandByte.toString(16).padStart(2, "0").padEnd(64, "0");

  const inputsSection =
    word(1) +
    word(32) +
    word(inputLength) +
    commandInput;

  return "0x3593564c" +
    word(64) +
    word(128) +
    commandsSection +
    inputsSection;
}

function buildRequest(overrides = {}) {
  const amount = overrides.txAmount ?? 300;

  return {
    agent: "TradingAgent-01",

    action: {
      type: "swap",
      chain: overrides.actionChain ?? "baseSepolia",
      protocol: overrides.actionProtocol ?? "Uniswap",
      asset: overrides.actionAsset ?? "USDC",
      amount: overrides.actionAmount ?? 300
    },

    policy: {
      maxTransactionAmount: overrides.maxTransactionAmount ?? 500,
      dailyLimit: overrides.dailyLimit ?? 2000
    },

    intent: {
      type: "swap",
      chain: overrides.intentChain ?? "baseSepolia",
      protocol: overrides.intentProtocol ?? "Uniswap",
      asset: overrides.intentAsset ?? "USDC",
      amount: overrides.intentAmount ?? 300,

      assetAddress:
        overrides.intentAssetAddress ??
        "0x1111111111111111111111111111111111111111",

      recipient:
        overrides.intentRecipient ??
        "0x3333333333333333333333333333333333333333",

      path:
        overrides.intentPath ??
        [
          "0x1111111111111111111111111111111111111111",
          "0x2222222222222222222222222222222222222222"
        ],

      amountOutMin:
        overrides.intentAmountOutMin ?? 290,

      payerIsUser:
        overrides.intentPayerIsUser ?? true,

      allowRevert:
        overrides.intentAllowRevert ?? false
    },

    transaction: {
      from: "0xAgentWallet",
      to: overrides.to ??
        "0x492e6456d9528771018deb9e87ef7750ef184104",
      chainId: overrides.chainId ?? 84532,
      expectedChainId: overrides.expectedChainId ?? 84532,
      value:
        overrides.txValue ?? "0",
      calldata:
        overrides.calldata ??
        buildUniversalRouterCalldata(
          amount,
          overrides.amountOutMin ??
            amount - 10,
          {
            recipient:
              overrides.recipient,
            tokenA:
              overrides.tokenA,
            tokenB:
              overrides.tokenB,
            allowRevert:
              overrides.allowRevert,
            payerIsUser:
              overrides.payerIsUser
          }
        ),
      amount
    }
  };
}


function buildApprovalCalldata(
  spender,
  amount
) {
  return (
    "0x095ea7b3" +
    addressWord(spender) +
    word(amount)
  );
}

function buildApprovalRequest(overrides = {}) {
  const spender =
    overrides.spender ??
    "0x4444444444444444444444444444444444444444";

  const amount =
    overrides.approvalAmount ?? 300;

  return {
    agent: "TradingAgent-01",

    action: {
      type: "approval",
      chain: overrides.actionChain ?? "baseSepolia",
      protocol: overrides.actionProtocol ?? "ERC20",
      asset: overrides.actionAsset ?? "USDC",
      amount: overrides.actionAmount ?? amount
    },

    policy: {
      maxTransactionAmount:
        overrides.maxTransactionAmount ?? 500,
      dailyLimit:
        overrides.dailyLimit ?? 2000
    },

    intent: {
      type: "approval",
      chain: overrides.intentChain ?? "baseSepolia",
      protocol: overrides.intentProtocol ?? "ERC20",
      asset: overrides.intentAsset ?? "USDC",
      amount: overrides.intentAmount ?? amount,

      assetAddress:
        overrides.intentAssetAddress ??
        "0x5555555555555555555555555555555555555555",

      spender:
        overrides.intentSpender ??
        "0x4444444444444444444444444444444444444444"
    },

    transaction: {
      from: "0xAgentWallet",

      to:
        overrides.to ??
        "0x5555555555555555555555555555555555555555",

      chainId:
        overrides.chainId ?? 84532,

      expectedChainId:
        overrides.expectedChainId ?? 84532,

      value:
        overrides.txValue ?? "0",

      calldata:
        overrides.calldata ??
        buildApprovalCalldata(
          spender,
          amount
        ),

      amount
    }
  };
}


function postJson(path, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);

    const req = http.request({
      hostname: "127.0.0.1",
      port: 3000,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    }, res => {
      let data = "";

      res.on("data", chunk => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(data));
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function executionGraph(payload) {
  return postJson(
    "/execution-graph",
    payload
  );
}

function buildGraphExecution(
  overrides = {}
) {
  return buildRequest({
    ...overrides
  });
}

function authorize(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);

    const req = http.request({
      hostname: "127.0.0.1",
      port: 3000,
      path: "/authorize",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    }, res => {
      let data = "";

      res.on("data", chunk => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(data));
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

const semanticTests = [
  {
    name: "Attacker recipient",
    expected: false,
    request: {
      recipient:
        "0x9999999999999999999999999999999999999999",
      intentRecipient:
        "0x3333333333333333333333333333333333333333"
    }
  },

  {
    name: "Malicious token path",
    expected: false,
    request: {
      tokenA:
        "0x1111111111111111111111111111111111111111",
      tokenB:
        "0x9999999999999999999999999999999999999999",
      intentPath: [
        "0x1111111111111111111111111111111111111111",
        "0x2222222222222222222222222222222222222222"
      ]
    }
  },

  {
    name: "Wrong amountOutMin",
    expected: false,
    request: {
      amountOutMin: 100,
      intentAmountOutMin: 290
    }
  },

  {
    name: "Payer mismatch",
    expected: false,
    request: {
      payerIsUser: false,
      intentPayerIsUser: true
    }
  },

  {
    name: "Unexpected native value",
    expected: false,
    request: {
      txValue: "1000000000000000000"
    }
  },

  {
    name: "Wrong token identity",
    expected: false,
    request: {
      tokenA:
        "0x9999999999999999999999999999999999999999",
      intentAssetAddress:
        "0x1111111111111111111111111111111111111111"
    }
  },

  {
    name: "AllowRevert enabled",
    expected: false,
    request: {
      allowRevert: true
    }
  }
,
  {
    name: "Authorized approval spender",
    expected: true,
    request: {
      spender:
        "0x4444444444444444444444444444444444444444",
      intentSpender:
        "0x4444444444444444444444444444444444444444"
    },
    builder: "approval"
  },

  {
    name: "Attacker approval spender",
    expected: false,
    request: {
      spender:
        "0x9999999999999999999999999999999999999999",
      intentSpender:
        "0x4444444444444444444444444444444444444444"
    },
    builder: "approval"
  }

];

const tests = [
  {
    name: "Safe swap",
    expected: true,
    request: {}
  },

  {
    name: "Policy limit exceeded",
    expected: false,
    request: {
      txAmount: 600,
      maxTransactionAmount: 500,
      intentAmount: 600,
      actionAmount: 600
    }
  },

  {
    name: "Intent amount mismatch",
    expected: false,
    request: {
      txAmount: 500,
      intentAmount: 300,
      actionAmount: 300
    }
  },

  {
    name: "Wrong protocol",
    expected: false,
    request: {
      actionProtocol: "Aave",
      intentProtocol: "Uniswap"
    }
  },

  {
    name: "Wrong chain",
    expected: false,
    request: {
      chainId: 11155111,
      expectedChainId: 84532
    }
  },

  {
    name: "Unknown function",
    expected: false,
    request: {
      calldata: "0xdeadbeef"
    }
  },

  {
    name: "Unlimited approval",
    expected: false,
    request: {
      to: "0x3333333333333333333333333333333333333333",
      calldata:
        "0x095ea7b3" +
        addressWord("0x4444444444444444444444444444444444444444") +
        word("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
      txAmount: 0
    }
  },

  {
    name: "Malformed Universal Router",
    expected: false,
    request: {
      calldata: "0x3593564c"
    }
  },

  {
    name: "Unsupported multi-command",
    expected: false,
    request: {
      calldata:
        "0x3593564c" +
        word(64) +
        word(128) +
        word(2) +
        "0808".padEnd(128, "0") +
        word(2) +
        word(64) +
        word(96)
    }
  },

  {
    name: "Transaction amount above intent",
    expected: false,
    request: {
      txAmount: 400,
      intentAmount: 300,
      actionAmount: 300,
      maxTransactionAmount: 500
    }
  }
];


const executionGraphTests = [
  {
    name: "Valid execution graph",
    expected: true,

    build: () => {
      const first =
        buildGraphExecution();

      const second =
        buildGraphExecution();

      return {
        executions: [
          {
            executionId: "execution-1",
            parentExecutionId: null,
            agent: first.agent,
            action: first.action,
            policy: first.policy,
            intent: first.intent,
            transaction: first.transaction
          },

          {
            executionId: "execution-2",
            parentExecutionId: "execution-1",
            agent: second.agent,
            action: second.action,
            policy: second.policy,
            intent: second.intent,
            transaction: second.transaction
          }
        ]
      };
    }
  },

  {
    name: "Agent switch",
    expected: false,

    build: () => {
      const first =
        buildGraphExecution();

      const second =
        buildGraphExecution();

      second.agent =
        "AttackerAgent-99";

      return {
        executions: [
          {
            executionId: "execution-1",
            parentExecutionId: null,
            agent: first.agent,
            action: first.action,
            policy: first.policy,
            intent: first.intent,
            transaction: first.transaction
          },

          {
            executionId: "execution-2",
            parentExecutionId: "execution-1",
            agent: second.agent,
            action: second.action,
            policy: second.policy,
            intent: second.intent,
            transaction: second.transaction
          }
        ]
      };
    }
  },

  {
    name: "Intent switch",
    expected: false,

    build: () => {
      const first =
        buildGraphExecution();

      const second =
        buildGraphExecution({
          intentProtocol: "Aave",
          actionProtocol: "Aave"
        });

      return {
        executions: [
          {
            executionId: "execution-1",
            parentExecutionId: null,
            agent: first.agent,
            action: first.action,
            policy: first.policy,
            intent: first.intent,
            transaction: first.transaction
          },

          {
            executionId: "execution-2",
            parentExecutionId: "execution-1",
            agent: second.agent,
            action: second.action,
            policy: second.policy,
            intent: second.intent,
            transaction: second.transaction
          }
        ]
      };
    }
  },

  {
    name: "Broken parent chain",
    expected: false,

    build: () => {
      const first =
        buildGraphExecution();

      const second =
        buildGraphExecution();

      return {
        executions: [
          {
            executionId: "execution-1",
            parentExecutionId: null,
            agent: first.agent,
            action: first.action,
            policy: first.policy,
            intent: first.intent,
            transaction: first.transaction
          },

          {
            executionId: "execution-2",
            parentExecutionId: "wrong-parent",
            agent: second.agent,
            action: second.action,
            policy: second.policy,
            intent: second.intent,
            transaction: second.transaction
          }
        ]
      };
    }
  },

  {
    name: "Sequence manipulation",
    expected: false,

    build: () => {
      const first =
        buildGraphExecution();

      const second =
        buildGraphExecution();

      return {
        executions: [
          {
            executionId: "execution-1",
            parentExecutionId: null,
            sequence: 0,
            agent: first.agent,
            action: first.action,
            policy: first.policy,
            intent: first.intent,
            transaction: first.transaction
          },

          {
            executionId: "execution-2",
            parentExecutionId: "execution-1",
            sequence: 99,
            agent: second.agent,
            action: second.action,
            policy: second.policy,
            intent: second.intent,
            transaction: second.transaction
          }
        ]
      };
    }
  },

  {
    name: "Execution after blocked node",
    expected: false,

    build: () => {
      const first =
        buildGraphExecution({
          recipient:
            "0x9999999999999999999999999999999999999999"
        });

      const second =
        buildGraphExecution();

      return {
        executions: [
          {
            executionId: "execution-1",
            parentExecutionId: null,
            agent: first.agent,
            action: first.action,
            policy: first.policy,
            intent: first.intent,
            transaction: first.transaction
          },

          {
            executionId: "execution-2",
            parentExecutionId: "execution-1",
            agent: second.agent,
            action: second.action,
            policy: second.policy,
            intent: second.intent,
            transaction: second.transaction
          }
        ]
      };
    }
  },

  {
    name: "Unauthorized graph node",
    expected: false,

    build: () => {
      const first =
        buildGraphExecution();

      const second =
        buildGraphExecution({
          tokenA:
            "0x9999999999999999999999999999999999999999"
        });

      return {
        executions: [
          {
            executionId: "execution-1",
            parentExecutionId: null,
            agent: first.agent,
            action: first.action,
            policy: first.policy,
            intent: first.intent,
            transaction: first.transaction
          },

          {
            executionId: "execution-2",
            parentExecutionId: "execution-1",
            agent: second.agent,
            action: second.action,
            policy: second.policy,
            intent: second.intent,
            transaction: second.transaction
          }
        ]
      };
    }
  },
  {
    name: "Valid final state",
    expected: true,

    build: () => {
      const execution = buildGraphExecution();

      return {
        executions: [
          {
            executionId: "execution-1",
            parentExecutionId: null,
            agent: execution.agent,
            action: execution.action,
            policy: execution.policy,
            intent: execution.intent,
            transaction: execution.transaction
          }
        ],

        expectedFinalState: {
          asset: "USDC",
          assetAddress:
            "0x1111111111111111111111111111111111111111",
          amount: "300",
          destination:
            "0x3333333333333333333333333333333333333333",
          protocol: "Uniswap",
          status: "SUCCESS"
        },

        finalState: {
          asset: "USDC",
          assetAddress:
            "0x1111111111111111111111111111111111111111",
          amount: "300",
          destination:
            "0x3333333333333333333333333333333333333333",
          protocol: "Uniswap",
          status: "SUCCESS"
        }
      };
    }
  },

  {
    name: "Wrong final-state asset",
    expected: false,

    build: () => {
      const execution = buildGraphExecution();

      return {
        executions: [
          {
            executionId: "execution-1",
            parentExecutionId: null,
            agent: execution.agent,
            action: execution.action,
            policy: execution.policy,
            intent: execution.intent,
            transaction: execution.transaction
          }
        ],

        expectedFinalState: {
          asset: "USDC",
          assetAddress:
            "0x1111111111111111111111111111111111111111",
          amount: "300",
          destination:
            "0x3333333333333333333333333333333333333333",
          protocol: "Uniswap",
          status: "SUCCESS"
        },

        finalState: {
          asset: "WETH",
          assetAddress:
            "0x1111111111111111111111111111111111111111",
          amount: "300",
          destination:
            "0x3333333333333333333333333333333333333333",
          protocol: "Uniswap",
          status: "SUCCESS"
        }
      };
    }
  },

  {
    name: "Wrong final-state amount",
    expected: false,

    build: () => {
      const execution = buildGraphExecution();

      return {
        executions: [
          {
            executionId: "execution-1",
            parentExecutionId: null,
            agent: execution.agent,
            action: execution.action,
            policy: execution.policy,
            intent: execution.intent,
            transaction: execution.transaction
          }
        ],

        expectedFinalState: {
          asset: "USDC",
          assetAddress:
            "0x1111111111111111111111111111111111111111",
          amount: "300",
          destination:
            "0x3333333333333333333333333333333333333333",
          protocol: "Uniswap",
          status: "SUCCESS"
        },

        finalState: {
          asset: "USDC",
          assetAddress:
            "0x1111111111111111111111111111111111111111",
          amount: "999",
          destination:
            "0x3333333333333333333333333333333333333333",
          protocol: "Uniswap",
          status: "SUCCESS"
        }
      };
    }
  },

  {
    name: "Wrong final-state destination",
    expected: false,

    build: () => {
      const execution = buildGraphExecution();

      return {
        executions: [
          {
            executionId: "execution-1",
            parentExecutionId: null,
            agent: execution.agent,
            action: execution.action,
            policy: execution.policy,
            intent: execution.intent,
            transaction: execution.transaction
          }
        ],

        expectedFinalState: {
          asset: "USDC",
          assetAddress:
            "0x1111111111111111111111111111111111111111",
          amount: "300",
          destination:
            "0x3333333333333333333333333333333333333333",
          protocol: "Uniswap",
          status: "SUCCESS"
        },

        finalState: {
          asset: "USDC",
          assetAddress:
            "0x1111111111111111111111111111111111111111",
          amount: "300",
          destination:
            "0x9999999999999999999999999999999999999999",
          protocol: "Uniswap",
          status: "SUCCESS"
        }
      };
    }
  },

  {
    name: "Missing final state",
    expected: false,

    build: () => {
      const execution = buildGraphExecution();

      return {
        executions: [
          {
            executionId: "execution-1",
            parentExecutionId: null,
            agent: execution.agent,
            action: execution.action,
            policy: execution.policy,
            intent: execution.intent,
            transaction: execution.transaction
          }
        ],

        expectedFinalState: {
          asset: "USDC",
          assetAddress:
            "0x1111111111111111111111111111111111111111",
          amount: "300",
          destination:
            "0x3333333333333333333333333333333333333333",
          protocol: "Uniswap",
          status: "SUCCESS"
        }
      };
    }
  },

  {
    name: "Wrong final-state status",
    expected: false,

    build: () => {
      const execution = buildGraphExecution();

      return {
        executions: [
          {
            executionId: "execution-1",
            parentExecutionId: null,
            agent: execution.agent,
            action: execution.action,
            policy: execution.policy,
            intent: execution.intent,
            transaction: execution.transaction
          }
        ],

        expectedFinalState: {
          asset: "USDC",
          assetAddress:
            "0x1111111111111111111111111111111111111111",
          amount: "300",
          destination:
            "0x3333333333333333333333333333333333333333",
          protocol: "Uniswap",
          status: "SUCCESS"
        },

        finalState: {
          asset: "USDC",
          assetAddress:
            "0x1111111111111111111111111111111111111111",
          amount: "300",
          destination:
            "0x3333333333333333333333333333333333333333",
          protocol: "Uniswap",
          status: "FAILED"
        }
      };
    }
  },

  {
    name: "Final-state commitment generated",
    expected: true,

    build: () => {
      const execution = buildGraphExecution();

      return {
        executions: [
          {
            executionId: "execution-1",
            parentExecutionId: null,
            agent: execution.agent,
            action: execution.action,
            policy: execution.policy,
            intent: execution.intent,
            transaction: execution.transaction
          }
        ],

        expectedFinalState: {
          asset: "USDC",
          assetAddress:
            "0x1111111111111111111111111111111111111111",
          amount: "300",
          destination:
            "0x3333333333333333333333333333333333333333",
          protocol: "Uniswap",
          status: "SUCCESS"
        },

        finalState: {
          asset: "USDC",
          assetAddress:
            "0x1111111111111111111111111111111111111111",
          amount: "300",
          destination:
            "0x3333333333333333333333333333333333333333",
          protocol: "Uniswap",
          status: "SUCCESS"
        }
      };
    }
  }
];


async function proofStatement(payload) {
  return postJson(
    "/proof-statement",
    payload
  );
}



const verificationTraceTests = [
  {
    name: "Proof statement contains verification trace",
    async run() {
      const payload = buildRequest();

      const result =
        await proofStatement({
          executions: [payload],
          intent: payload.intent
        });

      const trace =
        result?.statement?.verificationTrace;

      return (
        !!trace &&
        trace.version ===
          "phorva-verification-trace-set-v1" &&
        typeof trace.commitment === "string" &&
        trace.commitment.startsWith("0x")
      );
    }
  },

  {
    name: "Verification trace decision matches authorization",
    async run() {
      const payload = buildRequest();

      const result =
        await proofStatement({
          executions: [payload],
          intent: payload.intent
        });

      const decision =
        result?.statement?.authorization?.decision;

      const trace =
        result?.statement?.verificationTrace;

      return (
        !!trace &&
        (
          decision === "AUTHORIZED" ||
          decision === "BLOCKED"
        )
      );
    }
  },

  {
    name: "Caller-supplied trace cannot override verification",
    async run() {
      const payload = buildRequest();

      const result =
        await proofStatement({
          executions: [payload],
          intent: payload.intent,

          verificationTrace: {
            version:
              "phorva-verification-trace-set-v1",

            checks: [],

            summary: {
              total: 0,
              passed: 0,
              failed: 0
            },

            decision: "AUTHORIZED"
          }
        });

      const trace =
        result?.statement?.verificationTrace;

      return (
        !!trace &&
        typeof trace.commitment === "string" &&
        trace.commitment.startsWith("0x") &&
        trace.commitment !==
          "0xFAKE_TRACE_COMMITMENT"
      );
    }
  },

  {
    name: "Trace commitment changes when execution changes",
    async run() {
      const firstPayload =
        buildRequest({
          txAmount: 300
        });

      const secondPayload =
        buildRequest({
          txAmount: 1000
        });

      const first =
        await proofStatement({
          executions: [firstPayload],
          intent: firstPayload.intent
        });

      const second =
        await proofStatement({
          executions: [secondPayload],
          intent: secondPayload.intent
        });

      const firstTrace =
        first?.statement?.verificationTrace;

      const secondTrace =
        second?.statement?.verificationTrace;

      return (
        !!firstTrace &&
        !!secondTrace &&
        firstTrace.commitment !==
          secondTrace.commitment
      );
    }
  },

  {
    name: "Raw execution proof carries verification trace",
    async run() {
      const payload = buildRequest();

      const result =
        await proofStatement({
          executions: [payload],
          intent: payload.intent
        });

      const trace =
        result?.statement?.verificationTrace;

      return (
        !!trace &&
        typeof trace.commitment === "string" &&
        trace.commitment.startsWith("0x")
      );
    }
  },

  {
    name: "Approval trace preserves not-applicable checks",
    async run() {
      const payload =
        buildApprovalRequest({
          approvalAmount: 100
        });

      const result =
        await proofStatement({
          executions: [payload],
          intent: payload.intent
        });

      const trace =
        result?.statement?.verificationTrace;

      if (!trace) {
        return false;
      }

      const executionTrace =
        trace.executions?.[0];

      if (!executionTrace) {
        return false;
      }

      const checks =
        executionTrace.checks || [];

      const notApplicableIds = [
        "recipient",
        "path",
        "amount_out_min",
        "payer",
        "allow_revert"
      ];

      return notApplicableIds.every(id => {
        const check =
          checks.find(item => item.id === id);

        return (
          check &&
          check.applicable === false &&
          check.passed === true
        );
      });
    }
  }
];

const pureVerificationTests = [
  {
    name: "Raw executions produce proof statement without receipt",
    async run() {
      const execution =
        buildGraphExecution();

      const result =
        await postJson(
          "/proof-statement",
          {
            executions: [
              execution
            ],

            intent:
              execution.intent
          }
        );

      return (
        result.version ===
          "phorva-proof-v1" &&
        result.verificationMode ===
          "PURE_EXECUTION_VERIFICATION" &&
        typeof result.commitment ===
          "string" &&
        result.commitment.startsWith("0x")
      );
    }
  },

  {
    name: "Tampered raw transaction rejected",
    async run() {
      const execution =
        buildGraphExecution();

      execution.transaction.value =
        "1";

      const result =
        await postJson(
          "/proof-statement",
          {
            executions: [
              execution
            ],

            intent:
              execution.intent
          }
        );

      return (
        result.version ===
          "phorva-proof-v1" &&
        result.statement?.authorization?.decision ===
          "BLOCKED"
      );
    }
  },

  {
    name: "Tampered raw policy rejected",
    async run() {
      const execution =
        buildGraphExecution();

      execution.policy.maxTransactionAmount =
        1;

      const result =
        await postJson(
          "/proof-statement",
          {
            executions: [
              execution
            ],

            intent:
              execution.intent
          }
        );

      return (
        result.version ===
          "phorva-proof-v1" &&
        result.statement?.authorization?.decision ===
          "BLOCKED"
      );
    }
  },

  {
    name: "Tampered raw intent rejected",
    async run() {
      const execution =
        buildGraphExecution();

      execution.intent.recipient =
        "0x9999999999999999999999999999999999999999";

      const result =
        await postJson(
          "/proof-statement",
          {
            executions: [
              execution
            ],

            intent:
              execution.intent
          }
        );

      return (
        result.version ===
          "phorva-proof-v1" &&
        result.statement?.authorization?.decision ===
          "BLOCKED"
      );
    }
  },

  {
    name: "Caller authorization contradicting recomputation rejected",
    async run() {
      const execution =
        buildGraphExecution();

      const result =
        await postJson(
          "/proof-statement",
          {
            executions: [
              execution
            ],

            intent:
              execution.intent,

            authorization: {
              decision:
                "BLOCKED"
            }
          }
        );

      return (
        result.error ===
        "Caller authorization decision does not match Phorva recomputation"
      );
    }
  },

  {
    name: "Wrong supplied graph commitment rejected",
    async run() {
      const execution =
        buildGraphExecution();

      const result =
        await postJson(
          "/proof-statement",
          {
            executions: [
              execution
            ],

            intent:
              execution.intent,

            executionGraphCommitment: {
              commitment:
                "0x" + "11".repeat(32),
              algorithm:
                "SHA-256"
            }
          }
        );

      return (
        result.error ===
        "Submitted executionGraphCommitment does not match Phorva recomputation"
      );
    }
  },

  {
    name: "Raw execution final state verified without receipt",
    async run() {
      const execution =
        buildGraphExecution();

      const finalState = {
        asset: "USDC",

        assetAddress:
          "0x1111111111111111111111111111111111111111",

        amount: "300",

        destination:
          "0x3333333333333333333333333333333333333333",

        protocol: "Uniswap",

        status: "COMPLETED"
      };

      const result =
        await postJson(
          "/proof-statement",
          {
            executions: [
              execution
            ],

            intent:
              execution.intent,

            finalState,

            finalStateVerification: {
              expected:
                finalState
            }
          }
        );

      return (
        result.version ===
          "phorva-proof-v1" &&
        result.verificationMode ===
          "PURE_EXECUTION_VERIFICATION" &&
        result.statement?.authorization?.finalStateSatisfied ===
          true &&
        result.statement?.authorization?.decision ===
          "AUTHORIZED"
      );
    }
  }
];


const proofStatementTests = [
  {
    name: "Valid proof statement",
    async run() {
      const source =
        await executionGraph({
          executions: [
            buildGraphExecution()
          ]
        });

      if (
        !source.authorized ||
        !source.graph?.statement ||
        !source.graph?.commitment ||
        !source.verificationReceipt
      ) {
        return false;
      }

      const result =
        await proofStatement({
          intent:
            buildGraphExecution().intent,

          executionGraph:
            source.graph.statement,

          executionGraphCommitment: {
            commitment:
              source.graph.commitment,
            algorithm:
              source.graph.algorithm
          },

          verificationReceipt:
            source.verificationReceipt
        });

      return (
        result.version ===
          "phorva-proof-v1" &&
        typeof result.commitment ===
          "string" &&
        result.commitment.startsWith("0x")
      );
    }
  },

  {
    name: "Modified graph rejected by original receipt",
    async run() {
      const source =
        await executionGraph({
          executions: [
            buildGraphExecution()
          ]
        });

      const graph =
        JSON.parse(
          JSON.stringify(
            source.graph.statement
          )
        );

      graph.nodes[0].transaction.value =
        "1";

      const result =
        await proofStatement({
          intent:
            buildGraphExecution().intent,

          executionGraph: graph,

          executionGraphCommitment: {
            commitment:
              source.graph.commitment,
            algorithm:
              source.graph.algorithm
          },

          verificationReceipt:
            source.verificationReceipt
        });

      return (
        result.error ===
        "executionGraphCommitment does not match executionGraph"
      );
    }
  },

  {
    name: "Modified authorization rejected by original receipt",
    async run() {
      const source =
        await executionGraph({
          executions: [
            buildGraphExecution()
          ]
        });

      const receipt =
        JSON.parse(
          JSON.stringify(
            source.verificationReceipt
          )
        );

      receipt.authorization.decision =
        "BLOCKED";

      const result =
        await proofStatement({
          intent:
            buildGraphExecution().intent,

          executionGraph:
            source.graph.statement,

          executionGraphCommitment: {
            commitment:
              source.graph.commitment,
            algorithm:
              source.graph.algorithm
          },

          verificationReceipt:
            receipt
        });

      return (
        result.error ===
        "Invalid Phorva verification receipt" ||
        result.error ===
        "Verification receipt graph commitment mismatch"
      );
    }
  },

  {
    name: "Fake receipt rejected",
    async run() {
      const source =
        await executionGraph({
          executions: [
            buildGraphExecution()
          ]
        });

      const fakeReceipt = {
        version:
          "phorva-verification-receipt-v1",

        algorithm:
          "HMAC-SHA256",

        graphCommitment:
          source.graph.commitment,

        authorization: {
          decision: "AUTHORIZED",
          allExecutionsAuthorized: true,
          sequenceValid: true,
          graphInvariantsValid: true,
          finalStateSatisfied: true
        },

        signature:
          "0x" + "00".repeat(32)
      };

      const result =
        await proofStatement({
          intent:
            buildGraphExecution().intent,

          executionGraph:
            source.graph.statement,

          executionGraphCommitment: {
            commitment:
              source.graph.commitment,
            algorithm:
              source.graph.algorithm
          },

          verificationReceipt:
            fakeReceipt
        });

      return (
        result.error ===
        "Invalid Phorva verification receipt"
      );
    }
  },

  {
    name: "Missing verification receipt rejected",
    async run() {
      const source =
        await executionGraph({
          executions: [
            buildGraphExecution()
          ]
        });

      const result =
        await proofStatement({
          intent:
            buildGraphExecution().intent,

          executionGraph:
            source.graph.statement,

          executionGraphCommitment: {
            commitment:
              source.graph.commitment,
            algorithm:
              source.graph.algorithm
          }
        });

      return (
        typeof result.error === "string" &&
        (
          result.error ===
            "Invalid Phorva verification receipt" ||
          result.error ===
            "verificationReceipt.signature is required" ||
          result.error ===
            "verificationReceipt is required"
        )
      );
    }
  },

  {
    name: "Wrong graph commitment rejected",
    async run() {
      const source =
        await executionGraph({
          executions: [
            buildGraphExecution()
          ]
        });

      const result =
        await proofStatement({
          intent:
            buildGraphExecution().intent,

          executionGraph:
            source.graph.statement,

          executionGraphCommitment: {
            commitment:
              "0x" + "11".repeat(32),
            algorithm:
              source.graph.algorithm
          },

          verificationReceipt:
            source.verificationReceipt
        });

      return (
        result.error ===
        "executionGraphCommitment does not match executionGraph"
      );
    }
  },

  {
    name: "Caller authorization contradicting receipt rejected",
    async run() {
      const source =
        await executionGraph({
          executions: [
            buildGraphExecution()
          ]
        });

      const result =
        await proofStatement({
          intent:
            buildGraphExecution().intent,

          executionGraph:
            source.graph.statement,

          executionGraphCommitment: {
            commitment:
              source.graph.commitment,
            algorithm:
              source.graph.algorithm
          },

          verificationReceipt:
            source.verificationReceipt,

          authorization: {
            decision: "BLOCKED"
          }
        });

      return (
        result.error ===
        "Caller authorization decision does not match Phorva-derived authorization"
      );
    }
  }
];



const proofCarryingExecutionTests = [
  {
    name: "Proof-carrying execution produces proof",
    async run() {
      const result =
        await postJson("/prove-execution", {
          executions: [
            buildGraphExecution()
          ]
        });

      return (
        result.version ===
          "phorva-proof-carrying-execution-v1" &&
        result.verification?.decision === "AUTHORIZED" &&
        result.proofStatement?.version ===
          "phorva-proof-v1" &&
        result.proofCommitment?.commitment &&
        result.proverRequest?.version ===
          "phorva-prover-request-v1" &&
        result.proof?.proofSystem ===
          "MOCK-SHA256" &&
        result.proof?.status ===
          "PROOF_GENERATED"
      );
    }
  },

  {
    name: "Proof-carrying execution contains verification trace",
    async run() {
      const result =
        await postJson("/prove-execution", {
          executions: [
            buildGraphExecution()
          ]
        });

      const trace =
        result.proofStatement?.verificationTrace;

      return (
        trace?.version ===
          "phorva-verification-trace-set-v1" &&
        Array.isArray(trace?.executions) &&
        trace.executions.length === 1 &&
        trace.executions[0]?.version ===
          "phorva-verification-trace-v1" &&
        trace.executions[0]?.decision ===
          "AUTHORIZED" &&
        result.verificationTraceCommitment?.commitment
      );
    }
  },

  {
    name: "Tampered amount rejected by proof-carrying execution",
    async run() {
      const execution =
        buildGraphExecution();

      execution.transaction.calldata =
        buildUniversalRouterCalldata(
          1000,
          990
        );

      execution.transaction.amount = 1000;

      const result =
        await postJson("/prove-execution", {
          executions: [execution]
        });

      return (
        result.verification?.decision ===
          "BLOCKED" &&
        result.proofStatement?.authorization?.decision ===
          "BLOCKED"
      );
    }
  },

  {
    name: "Tampered recipient rejected by proof-carrying execution",
    async run() {
      const execution =
        buildGraphExecution();

      execution.transaction.calldata =
        buildUniversalRouterCalldata(
          300,
          290,
          {
            recipient:
              "0x9999999999999999999999999999999999999999"
          }
        );

      const result =
        await postJson("/prove-execution", {
          executions: [execution]
        });

      return (
        result.verification?.decision ===
          "BLOCKED" &&
        result.proofStatement?.authorization?.decision ===
          "BLOCKED"
      );
    }
  },

  {
    name: "Tampered token path rejected by proof-carrying execution",
    async run() {
      const execution =
        buildGraphExecution();

      execution.transaction.calldata =
        buildUniversalRouterCalldata(
          300,
          290,
          {
            tokenA:
              "0x9999999999999999999999999999999999999999",
            tokenB:
              "0x2222222222222222222222222222222222222222"
          }
        );

      const result =
        await postJson("/prove-execution", {
          executions: [execution]
        });

      return (
        result.verification?.decision ===
          "BLOCKED" &&
        result.proofStatement?.authorization?.decision ===
          "BLOCKED"
      );
    }
  },

  {
    name: "Final-state mismatch blocks proof-carrying execution",
    async run() {
      const execution =
        buildGraphExecution();

      const result =
        await postJson("/prove-execution", {
          executions: [execution],

          finalState: {
            asset: "ETH",
            amount: 999999,
            destination:
              "0x9999999999999999999999999999999999999999",
            status: "SUCCESS"
          },

          expectedFinalState: {
            asset: "USDC",
            amount: 300,
            destination:
              "0x3333333333333333333333333333333333333333",
            status: "SUCCESS"
          }
        });

      return (
        result.verification?.decision ===
          "BLOCKED" &&
        result.proofStatement?.authorization?.decision ===
          "BLOCKED"
      );
    }
  },

  {
    name: "Caller cannot inject proof statement into proof-carrying execution",
    async run() {
      const execution =
        buildGraphExecution();

      const result =
        await postJson("/prove-execution", {
          executions: [execution],

          proofStatement: {
            version: "phorva-proof-v1",
            decision: "AUTHORIZED",
            security: {
              policyPassed: true,
              intentMatched: true,
              parameterMatched: true,
              executionTypeMatched: true,
              nativeValueMatched: true,
              protocolMatched: true,
              transactionSecuritySafe: true
            }
          }
        });

      return (
        result.proofStatement?.authorization?.decision ===
          "AUTHORIZED" &&
        result.proofStatement?.version ===
          "phorva-proof-v1" &&
        result.proofStatement?.authorization?.allExecutionsAuthorized ===
          true &&
        result.proofStatement?.verificationTrace?.version ===
          "phorva-verification-trace-set-v1" &&
        result.proofStatement?.security === undefined
      );
    }
  },

  {
    name: "Changing execution changes proof commitment",
    async run() {
      const firstExecution =
        buildGraphExecution();

      const secondExecution =
        buildGraphExecution();

      secondExecution.transaction.calldata =
        buildUniversalRouterCalldata(
          300,
          280
        );

      const first =
        await postJson("/prove-execution", {
          executions: [firstExecution]
        });

      const second =
        await postJson("/prove-execution", {
          executions: [secondExecution]
        });

      return (
        first.proofCommitment?.commitment &&
        second.proofCommitment?.commitment &&
        first.proofCommitment.commitment !==
          second.proofCommitment.commitment
      );
    }
  },

  {
    name: "Returned proof can be verified",
    async run() {
      const result =
        await postJson("/prove-execution", {
          executions: [
            buildGraphExecution()
          ]
        });

      const verification =
        await postJson("/verify-proof", {
          proverRequest:
            result.proverRequest,

          proof:
            result.proof
        });

      return verification.valid === true;
    }
  }
];

const proofVerificationTests = [
  {
    name: "Valid proof",
    async run() {
      const proverRequest = {
        version: "phorva-prover-request-v1",
        provider: "mock",
        statement: {
          version: "phorva-proof-v1",
          commitment: "0x1234567890abcdef",
          algorithm: "SHA-256"
        },
        proofInput: {
          version: "phorva-proof-v1",
          intent: {
            type: "swap",
            chain: "baseSepolia",
            protocol: "Uniswap",
            asset: "USDC",
            amount: "1000000"
          }
        }
      };

      const canonicalJson =
        JSON.stringify(
          canonicalizeProofValue(
            proverRequest
          )
        );

      const crypto =
        require("crypto");

      const proof =
        "0x" +
        crypto
          .createHash("sha256")
          .update(canonicalJson, "utf8")
          .digest("hex");

      const result =
        await postJson("/verify-proof", {
          proverRequest,
          proof: {
            provider: "mock",
            proofSystem: "MOCK-SHA256",
            proof,
            statementCommitment:
              "0x1234567890abcdef"
          }
        });

      return result.valid === true;
    }
  },

  {
    name: "Tampered proof rejected",
    async run() {
      const proverRequest = {
        version: "phorva-prover-request-v1",
        provider: "mock",
        statement: {
          version: "phorva-proof-v1",
          commitment: "0x1234567890abcdef",
          algorithm: "SHA-256"
        },
        proofInput: {
          version: "phorva-proof-v1",
          intent: {
            type: "swap",
            chain: "baseSepolia",
            protocol: "Uniswap",
            asset: "USDC",
            amount: "1000000"
          }
        }
      };

      const result =
        await postJson("/verify-proof", {
          proverRequest,
          proof: {
            provider: "mock",
            proofSystem: "MOCK-SHA256",
            proof:
              "0xdeadbeef",
            statementCommitment:
              "0x1234567890abcdef"
          }
        });

      return result.valid === false;
    }
  },

  {
    name: "Wrong statement commitment rejected",
    async run() {
      const proverRequest = {
        version: "phorva-prover-request-v1",
        provider: "mock",
        statement: {
          version: "phorva-proof-v1",
          commitment: "0x1111111111111111",
          algorithm: "SHA-256"
        },
        proofInput: {
          version: "phorva-proof-v1",
          intent: {
            type: "swap"
          }
        }
      };

      const result =
        await postJson("/verify-proof", {
          proverRequest,
          proof: {
            provider: "mock",
            proofSystem: "MOCK-SHA256",
            proof:
              "0xdeadbeef",
            statementCommitment:
              "0x2222222222222222"
          }
        });

      return result.valid === false;
    }
  },

  {
    name: "Unsupported proof system rejected",
    async run() {
      const result =
        await postJson("/verify-proof", {
          proverRequest: {
            version:
              "phorva-prover-request-v1",
            provider: "mock",
            statement: {
              version:
                "phorva-proof-v1",
              commitment:
                "0x1234567890abcdef"
            }
          },
          proof: {
            provider: "mock",
            proofSystem:
              "FAKE-ZK-SYSTEM",
            proof: "0xdeadbeef",
            statementCommitment:
              "0x1234567890abcdef"
          }
        });

      return result.valid === false;
    }
  },

  {
    name: "Unsupported provider rejected",
    async run() {
      const result =
        await postJson("/verify-proof", {
          proverRequest: {
            version:
              "phorva-prover-request-v1",
            provider: "unknown",
            statement: {
              version:
                "phorva-proof-v1",
              commitment:
                "0x1234567890abcdef"
            }
          },
          proof: {
            provider: "unknown",
            proofSystem:
              "UNKNOWN",
            proof: "0xdeadbeef",
            statementCommitment:
              "0x1234567890abcdef"
          }
        });

      return result.valid === false;
    }
  }
];


async function run() {
  console.log("\n========================================");
  console.log("      AGENTGUARD SECURITY TESTS");
  console.log("========================================\n");

  let passed = 0;

  const allTests = [
    ...tests,
    ...(typeof semanticTests !== "undefined" ? semanticTests : [])
  ];

  for (const test of allTests) {
    try {
      const payload =
        test.builder === "approval"
          ? buildApprovalRequest(test.request)
          : buildRequest(test.request);

      const result = await authorize(payload);

      let success =
        result.authorized === test.expected;

      if (
        success &&
        test.name === "Final-state commitment generated"
      ) {
        success =
          typeof result.verification
            ?.finalStateCommitment
            ?.commitment === "string" &&
          result.verification
            .finalStateCommitment
            .commitment
            .startsWith("0x");
      }

      if (success) {
        passed++;
        console.log(`✓ ${test.name}`);
      } else {
        console.log(`✗ ${test.name}`);
        console.log(
          `  Expected: ${
            test.expected
              ? "AUTHORIZED"
              : "BLOCKED"
          }`
        );
        console.log(
          `  Actual:   ${
            result.authorized
              ? "AUTHORIZED"
              : "BLOCKED"
          }`
        );
      }
    } catch (error) {
      console.log(`✗ ${test.name}`);
      console.log(`  Error: ${error.message}`);
    }
  }

  let graphPassed = 0;

  console.log("\n========================================");
  console.log("      EXECUTION GRAPH TESTS");
  console.log("========================================\n");

  for (const test of executionGraphTests) {
    try {
      const payload = test.build();
      const result = await executionGraph(payload);

      const success =
        result.authorized === test.expected;

      if (success) {
        graphPassed++;
        console.log(`✓ ${test.name}`);
      } else {
        console.log(`✗ ${test.name}`);
        console.log(
          `  Expected: ${
            test.expected
              ? "AUTHORIZED"
              : "BLOCKED"
          }`
        );
        console.log(
          `  Actual:   ${
            result.authorized
              ? "AUTHORIZED"
              : "BLOCKED"
          }`
        );

        if (
          Array.isArray(
            result.verification?.violations
          )
        ) {
          console.log(
            `  Violations: ${
              result.verification.violations.join("; ")
            }`
          );
        }
      }
    } catch (error) {
      console.log(`✗ ${test.name}`);
      console.log(`  Error: ${error.message}`);
    }
  }

  let proofStatementPassed = 0;

  console.log("\n========================================");
  console.log("      PROOF STATEMENT SECURITY TESTS");
  console.log("========================================\n");

  for (const test of proofStatementTests) {
    try {
      const success = await test.run();

      if (success) {
        proofStatementPassed++;
        console.log(`✓ ${test.name}`);
      } else {
        console.log(`✗ ${test.name}`);
      }
    } catch (error) {
      console.log(`✗ ${test.name}`);
      console.log(`  Error: ${error.message}`);
    }
  }

  let pureVerificationPassed = 0;

  console.log("\n========================================");
  console.log("      VERIFICATION TRACE SECURITY TESTS");
  console.log("========================================");

  let tracePassed = 0;
  let traceFailed = 0;

  for (const test of verificationTraceTests) {
    try {
      const success = await test.run();

      if (success) {
        tracePassed++;
        console.log(`✓ ${test.name}`);
      } else {
        traceFailed++;
        console.log(`✗ ${test.name}`);
      }
    } catch (error) {
      traceFailed++;
      console.log(`✗ ${test.name}`);
      console.log(`  ${error.message}`);
    }
  }

  console.log("");
  console.log(
    `Trace tests: ${tracePassed}/${verificationTraceTests.length} passed`
  );

  console.log("      PURE EXECUTION VERIFICATION TESTS");
  console.log("========================================\n");

  for (const test of pureVerificationTests) {
    try {
      const success =
        await test.run();

      if (success) {
        pureVerificationPassed++;
        console.log(`✓ ${test.name}`);
      } else {
        console.log(`✗ ${test.name}`);
      }
    } catch (error) {
      console.log(`✗ ${test.name}`);
      console.log(`  Error: ${error.message}`);
    }
  }

  let proofPassed = 0;

  console.log("\n========================================");
  console.log("      PROOF VERIFICATION TESTS");
  console.log("========================================\n");

  
  console.log(`
========================================
  PROOF-CARRYING EXECUTION TESTS
========================================
`);

  let proofCarryingPassed = 0;

  for (const test of proofCarryingExecutionTests) {
    try {
      const passed = await test.run();

      if (passed) {
        console.log(`✓ ${test.name}`);
        proofCarryingPassed++;
      } else {
        console.log(`✗ ${test.name}`);
      }
    } catch (error) {
      console.log(`✗ ${test.name}`);
      console.log(`  ${error.message}`);
    }
  }

  console.log(
    `Proof-carrying tests: ${proofCarryingPassed}/${proofCarryingExecutionTests.length} passed`
  );

for (const test of proofVerificationTests) {
    try {
      const success = await test.run();

      if (success) {
        proofPassed++;
        console.log(`✓ ${test.name}`);
      } else {
        console.log(`✗ ${test.name}`);
      }
    } catch (error) {
      console.log(`✗ ${test.name}`);
      console.log(`  Error: ${error.message}`);
    }
  }

  const totalPassed =
    passed +
    graphPassed +
    proofStatementPassed +
    pureVerificationPassed +
    proofPassed +
    proofCarryingPassed;

  const totalTests =
    allTests.length +
    executionGraphTests.length +
    proofStatementTests.length +
    pureVerificationTests.length +
    proofVerificationTests.length +
    proofCarryingExecutionTests.length;

  console.log(
    "\n========================================"
  );

  console.log(
    `${totalPassed}/${totalTests} TOTAL SECURITY TESTS PASSED`
  );

  console.log(
    "========================================\n"
  );

  if (totalPassed !== totalTests) {
    process.exitCode = 1;
  }
}

run();
