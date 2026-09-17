const http = require("http");

function word(value) {
  return BigInt(value).toString(16).padStart(64, "0");
}

function addressWord(address) {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function buildUniversalRouterCalldata(amountIn, amountOutMin) {
  const selector = "3593564c";

  const recipient = addressWord(
    "0x3333333333333333333333333333333333333333"
  );

  const tokenA = addressWord(
    "0x1111111111111111111111111111111111111111"
  );

  const tokenB = addressWord(
    "0x2222222222222222222222222222222222222222"
  );

  /*
   * V2_SWAP_EXACT_IN command input:
   *
   * recipient
   * amountIn
   * amountOutMin
   * path offset
   * payerIsUser
   * path length
   * tokenA
   * tokenB
   */

  const commandInput = [
    recipient,
    word(amountIn),
    word(amountOutMin),
    word(160),
    word(1),
    word(2),
    tokenA,
    tokenB
  ].join("");

  const commandInputLength =
    commandInput.length / 2;

  /*
   * bytes[] encoding:
   *
   * offset to commands = 0x40
   * offset to inputs   = 0x80
   */

  const commandsSection =
    word(1) +
    "08".padEnd(64, "0");

  /*
   * The bytes[] element offset is relative
   * to the beginning of the offsets area.
   */

  const inputElementOffset = 32;

  const inputsSection =
    word(1) +
    word(inputElementOffset) +
    word(commandInputLength) +
    commandInput;

  const calldata =
    "0x" +
    selector +
    word(64) +
    word(128) +
    commandsSection +
    inputsSection;

  return calldata;
}

const amount = 300;
const amountOutMin = 290;

const calldata =
  buildUniversalRouterCalldata(amount, amountOutMin);

const request = {
  agent: "TradingAgent-01",

  action: {
    type: "swap",
    chain: "baseSepolia",
    protocol: "Uniswap",
    asset: "USDC",
    amount
  },

  policy: {
    maxTransactionAmount: 500,
    dailyLimit: 2000
  },

  intent: {
    type: "swap",
    chain: "baseSepolia",
    protocol: "Uniswap",
    asset: "USDC",
    amount
  },

  transaction: {
    from: "0xAgentWallet",
    to: "0x492e6456d9528771018deb9e87ef7750ef184104",
    chainId: 84532,
    expectedChainId: 84532,
    value: "0",
    calldata,
    amount
  }
};

const body = JSON.stringify(request);

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
    console.log("\n=== AgentGuard Authorization Test ===\n");
    console.log(`HTTP Status: ${res.statusCode}`);

    try {
      const result = JSON.parse(data);

      console.log(
        `Authorization: ${result.authorized ? "AUTHORIZED" : "BLOCKED"}`
      );

      console.log(`Policy: ${result.policyPassed ? "PASS" : "FAIL"}`);
      console.log(`Intent: ${result.intentMatched ? "MATCH" : "MISMATCH"}`);
      console.log(
        `Parameters: ${result.parameterMatched ? "MATCH" : "MISMATCH"}`
      );
      console.log(
        `Protocol: ${result.protocolMatched ? "MATCH" : "MISMATCH"}`
      );
      console.log(
        `Transaction Security: ${
          result.transactionSecuritySafe ? "SAFE" : "THREAT DETECTED"
        }`
      );

      console.log(`Risk: ${result.risk}`);
      console.log(`Actual Amount: ${result.actualTransactionAmount}`);
      console.log(`Intent Amount: ${result.declaredIntentAmount}`);

      console.log("\nDecoded Transaction:");
      console.log(
        JSON.stringify(result.decodedTransaction, null, 2)
      );

      console.log("\nProof:");
      console.log(
        JSON.stringify(result.proof, null, 2)
      );
    } catch {
      console.log(data);
    }
  });
});

req.on("error", error => {
  console.error("\nConnection failed:", error.message);
});

req.write(body);
req.end();
