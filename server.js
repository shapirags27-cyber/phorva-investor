const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const chains = {
  baseSepolia: {
    name: "Base Sepolia",
    chainId: Number(process.env.BASE_SEPOLIA_CHAIN_ID || 84532),
    rpc: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org"
  },

  ethereumSepolia: {
    name: "Ethereum Sepolia",
    chainId: Number(process.env.ETHEREUM_SEPOLIA_CHAIN_ID || 11155111),
    rpc:
      process.env.ETHEREUM_SEPOLIA_RPC ||
      "https://ethereum-sepolia-rpc.publicnode.com"
  },

  arbitrumSepolia: {
    name: "Arbitrum Sepolia",
    chainId: Number(process.env.ARBITRUM_SEPOLIA_CHAIN_ID || 421614),
    rpc:
      process.env.ARBITRUM_SEPOLIA_RPC ||
      "https://sepolia-rollup.arbitrum.io/rpc"
  }
};

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const knownERC20Contracts = {
  baseSepolia: {
    "0x5555555555555555555555555555555555555555": {
      name: "AgentGuard Test USDC",
      protocol: "ERC20"
    }
  }
};

const knownContracts = {
  baseSepolia: {
    "0x492e6456d9528771018deb9e87ef7750ef184104": {
      name: "Uniswap Universal Router",
      protocol: "Uniswap"
    },
    "0x05e73354cfdd6745c338b50bcfdfa3aa6fa03408": {
      name: "Uniswap v4 PoolManager",
      protocol: "Uniswap"
    },
    "0x4b2c77d209d3405f41a037ec6c77f7f5b8e2ca80": {
      name: "Uniswap v4 PositionManager",
      protocol: "Uniswap"
    }
  },

  ethereumSepolia: {
    "0x3a9d48ab9751398bbfa63ad67599bb04e4bdf98b": {
      name: "Uniswap Universal Router",
      protocol: "Uniswap"
    },
    "0xe03a1074c86cfedd5c142c4f04f1a1536e203543": {
      name: "Uniswap v4 PoolManager",
      protocol: "Uniswap"
    },
    "0x429ba70129df741b2ca2a85bc3a2a3328e5c09b4": {
      name: "Uniswap v4 PositionManager",
      protocol: "Uniswap"
    }
  },

  arbitrumSepolia: {
    "0xefd1d4bd4cf1e86da286bb4cb1b8bced9c10ba47": {
      name: "Uniswap Universal Router",
      protocol: "Uniswap"
    },
    "0xfb3e0c6f74eb1a21cc1da29aec80d2dfe6c9a317": {
      name: "Uniswap v4 PoolManager",
      protocol: "Uniswap"
    },
    "0xac631556d3d4019c95769033b5e719dd77124bac": {
      name: "Uniswap v4 PositionManager",
      protocol: "Uniswap"
    }
  }
};

const functionSelectors = {
  "0x3593564c": {
    name: "execute",
    category: "universalRouter"
  },

  "0x38ed1739": {
    name: "swapExactTokensForTokens",
    category: "swap"
  },
  "0x095ea7b3": {
    name: "approve",
    category: "approval"
  },
  "0xa22cb465": {
    name: "setApprovalForAll",
    category: "approval"
  },
  "0xa9059cbb": {
    name: "transfer",
    category: "transfer"
  },
  "0x23b872dd": {
    name: "transferFrom",
    category: "transfer"
  },
  "0xf2fde38b": {
    name: "transferOwnership",
    category: "administration"
  },
  "0x8456cb59": {
    name: "pause",
    category: "administration"
  }
};

const MAX_UINT256 =
  "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

function normalizeAddress(address) {
  return String(address || "").toLowerCase();
}

function resolveChainKey(tx) {
  const chainId = Number(
    tx.chainId ??
    tx.expectedChainId
  );

  if (chainId === chains.baseSepolia.chainId) {
    return "baseSepolia";
  }

  if (chainId === chains.ethereumSepolia.chainId) {
    return "ethereumSepolia";
  }

  if (chainId === chains.arbitrumSepolia.chainId) {
    return "arbitrumSepolia";
  }

  return null;
}

function resolveKnownContract(tx) {
  const chainKey = resolveChainKey(tx);

  if (!chainKey || !tx.to) {
    return null;
  }

  const address =
    normalizeAddress(tx.to);

  return (
    knownContracts[chainKey]?.[address] ??
    knownERC20Contracts[chainKey]?.[address] ??
    null
  );
}

function decodeFunction(calldata) {
  if (!calldata || calldata.length < 10) {
    return {
      selector: null,
      name: "Unknown function",
      category: "unknown"
    };
  }

  const selector = calldata.slice(0, 10).toLowerCase();
  const known = functionSelectors[selector];

  if (!known) {
    return {
      selector,
      name: "Unknown function",
      category: "unknown"
    };
  }

  return {
    selector,
    name: known.name,
    category: known.category
  };
}

function decodeWord(calldata, index) {
  if (!calldata) {
    return null;
  }

  const clean = calldata.slice(10);
  const start = index * 64;
  const word = clean.slice(start, start + 64);

  if (word.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(word)) {
    return null;
  }

  return word.toLowerCase();
}

function decodeAddressWord(word) {
  if (!word || word.length !== 64) {
    return null;
  }

  return "0x" + word.slice(24);
}

function decodeUintWord(word) {
  if (!word || !/^[0-9a-fA-F]{64}$/.test(word)) {
    return null;
  }

  if (word.toLowerCase() === MAX_UINT256) {
    return "MAX_UINT256";
  }

  try {
    return BigInt("0x" + word).toString();
  } catch {
    return null;
  }
}

function decodeBoolWord(word) {
  if (!word) {
    return null;
  }

  if (word === "0".repeat(64)) {
    return false;
  }

  if (
    word.slice(0, 63) === "0".repeat(63) &&
    word.slice(63) === "1"
  ) {
    return true;
  }

  return null;
}


function decodeUniversalRouterExecute(calldata) {
  const selector =
    calldata.slice(0, 10).toLowerCase();

  /*
   * execute(bytes,bytes[])
   *
   * We initially support the common single-command
   * Universal Router V2 exact-input swap:
   *
   * command 0x08 = V2_SWAP_EXACT_IN
   *
   * The command input is:
   *   address recipient
   *   uint256 amountIn
   *   uint256 amountOutMin
   *   address[] path
   *   bool payerIsUser
   *   uint256[] minHopPriceX36
   *
   * This decoder intentionally rejects malformed or
   * unsupported multi-command payloads instead of
   * guessing.
   */

  if (
    selector !== "0x3593564c"
  ) {
    return null;
  }

  const words = [];

  for (let i = 0; i < 8; i++) {
    const word = decodeWord(calldata, i);

    if (!word) {
      break;
    }

    words.push(word);
  }

  if (words.length < 2) {
    return {
      valid: false,
      router: true,
      error: "Incomplete Universal Router execute calldata."
    };
  }

  const commandsOffset =
    decodeUintWord(words[0]);

  const inputsOffset =
    decodeUintWord(words[1]);

  if (
    commandsOffset === null ||
    inputsOffset === null ||
    commandsOffset === "MAX_UINT256" ||
    inputsOffset === "MAX_UINT256"
  ) {
    return {
      valid: false,
      router: true,
      error: "Invalid Universal Router ABI offsets."
    };
  }

  const body = calldata.slice(10);

  const commandsStart =
    Number(commandsOffset) * 2;

  const inputsStart =
    Number(inputsOffset) * 2;

  if (
    !Number.isSafeInteger(commandsStart) ||
    !Number.isSafeInteger(inputsStart) ||
    commandsStart < 0 ||
    inputsStart < 0 ||
    commandsStart + 64 > body.length ||
    inputsStart + 64 > body.length
  ) {
    return {
      valid: false,
      router: true,
      error: "Universal Router dynamic data is out of bounds."
    };
  }

  const commandsLengthHex =
    body.slice(
      commandsStart,
      commandsStart + 64
    );

  const commandsLength =
    Number(BigInt("0x" + commandsLengthHex));

  if (
    !Number.isSafeInteger(commandsLength) ||
    commandsLength < 1 ||
    commandsLength > 32
  ) {
    return {
      valid: false,
      router: true,
      error: "Invalid Universal Router command count."
    };
  }

  const commandsHex =
    body.slice(
      commandsStart + 64,
      commandsStart + 64 + commandsLength * 2
    );

  if (
    commandsHex.length !== commandsLength * 2 ||
    !/^[0-9a-fA-F]+$/.test(commandsHex)
  ) {
    return {
      valid: false,
      router: true,
      error: "Universal Router commands are incomplete."
    };
  }

  /*
   * inputs is a dynamic bytes[].
   *
   * The first word at inputsStart is the array length.
   * Each following word is an offset to an individual
   * bytes element relative to the start of the array's
   * element-offset area.
   */
  const inputCountHex =
    body.slice(
      inputsStart,
      inputsStart + 64
    );

  const inputCount =
    Number(BigInt("0x" + inputCountHex));

  if (!Number.isSafeInteger(inputCount)) {
    return {
      valid: false,
      router: true,
      error: "Invalid Universal Router input count."
    };
  }

  if (inputCount !== commandsLength) {
    return {
      valid: false,
      router: true,
      error:
        "Universal Router command/input count mismatch: " +
        "commands=" + commandsLength +
        ", inputs=" + inputCount +
        ", commandsOffset=" + commandsOffset +
        ", inputsOffset=" + inputsOffset
    };
  }

  /*
   * For the first milestone we only authorize a
   * single V2 exact-input command.
   */
  if (commandsLength !== 1) {
    return {
      valid: false,
      router: true,
      command: null,
      error:
        "Multi-command Universal Router transactions require explicit command-by-command verification."
    };
  }

  const commandByte =
    parseInt(commandsHex.slice(0, 2), 16);

  const commandType =
    commandByte & 0x7f;

  const allowRevert =
    (commandByte & 0x80) !== 0;

  if (commandType !== 0x08) {
    return {
      valid: false,
      router: true,
      command: "0x" +
        commandType.toString(16).padStart(2, "0"),
      allowRevert,
      error:
        "Universal Router command is not yet supported."
    };
  }

  /*
   * inputs[] offsets begin immediately after the
   * array length word.
   */
  const firstInputOffsetWord =
    body.slice(
      inputsStart + 64,
      inputsStart + 128
    );

  if (firstInputOffsetWord.length !== 64) {
    return {
      valid: false,
      router: true,
      error: "Universal Router input offset is missing."
    };
  }

  const firstInputOffset =
    Number(BigInt("0x" + firstInputOffsetWord));

  if (
    !Number.isSafeInteger(firstInputOffset) ||
    firstInputOffset < 0
  ) {
    return {
      valid: false,
      router: true,
      error: "Invalid Universal Router input offset."
    };
  }

  /*
   * ABI bytes[] offsets are measured from the beginning
   * of the array's element-offset/data region, immediately
   * after the array length word.
   */
  const inputBase =
    inputsStart + 64;

  // The first offset is relative to inputBase.
  const inputStart =
    inputBase + firstInputOffset * 2;

  if (
    inputStart + 64 > body.length
  ) {
    return {
      valid: false,
      router: true,
      error: "Universal Router command input is missing."
    };
  }

  const inputLength =
    Number(
      BigInt(
        "0x" +
        body.slice(
          inputStart,
          inputStart + 64
        )
      )
    );

  if (
    !Number.isSafeInteger(inputLength) ||
    inputLength < 192 ||
    inputLength > 8192
  ) {
    return {
      valid: false,
      router: true,
      error: "Invalid V2 swap command input length."
    };
  }

  const inputDataStart =
    inputStart + 64;

  const inputDataEnd =
    inputDataStart + inputLength * 2;

  if (
    inputDataEnd > body.length
  ) {
    return {
      valid: false,
      router: true,
      error: "V2 swap command input is truncated."
    };
  }

  const input =
    body.slice(
      inputDataStart,
      inputDataEnd
    );

  function inputWord(index) {
    const start = index * 64;
    const word = input.slice(start, start + 64);

    if (
      word.length !== 64 ||
      !/^[0-9a-fA-F]{64}$/.test(word)
    ) {
      return null;
    }

    return word.toLowerCase();
  }

  const recipient =
    decodeAddressWord(inputWord(0));

  const amountIn =
    decodeUintWord(inputWord(1));

  const amountOutMin =
    decodeUintWord(inputWord(2));

  const pathOffset =
    decodeUintWord(inputWord(3));

  const payerIsUser =
    decodeBoolWord(inputWord(4));

  if (
    !recipient ||
    amountIn === null ||
    amountOutMin === null ||
    pathOffset === null ||
    payerIsUser === null
  ) {
    return {
      valid: false,
      router: true,
      command: "V2_SWAP_EXACT_IN",
      error:
        "Invalid V2 swap command parameters."
    };
  }

  const pathOffsetBytes =
    Number(pathOffset);

  if (
    !Number.isSafeInteger(pathOffsetBytes) ||
    pathOffsetBytes % 32 !== 0
  ) {
    return {
      valid: false,
      router: true,
      command: "V2_SWAP_EXACT_IN",
      error: "Invalid V2 swap path offset."
    };
  }

  const pathStart =
    pathOffsetBytes * 2;

  if (
    pathStart + 64 > input.length
  ) {
    return {
      valid: false,
      router: true,
      command: "V2_SWAP_EXACT_IN",
      error: "V2 swap path is missing."
    };
  }

  const pathLength =
    Number(
      BigInt(
        "0x" +
        input.slice(
          pathStart,
          pathStart + 64
        )
      )
    );

  if (
    !Number.isSafeInteger(pathLength) ||
    pathLength < 2 ||
    pathLength > 32
  ) {
    return {
      valid: false,
      router: true,
      command: "V2_SWAP_EXACT_IN",
      error: "Invalid V2 swap path length."
    };
  }

  const path = [];

  for (let i = 0; i < pathLength; i++) {
    const position =
      pathStart + 64 + i * 64;

    if (
      position + 64 > input.length
    ) {
      return {
        valid: false,
        router: true,
        command: "V2_SWAP_EXACT_IN",
        error: "V2 swap path is incomplete."
      };
    }

    const address =
      decodeAddressWord(
        input.slice(
          position,
          position + 64
        )
      );

    if (!address) {
      return {
        valid: false,
        router: true,
        command: "V2_SWAP_EXACT_IN",
        error: "V2 swap path contains an invalid address."
      };
    }

    path.push(address);
  }

  return {
    valid: true,
    router: true,
    function: "execute",
    command: "V2_SWAP_EXACT_IN",
    commandByte:
      "0x" +
      commandByte.toString(16).padStart(2, "0"),
    commandType,
    allowRevert,
    amountIn,
    amountOutMin,
    path,
    recipient,
    payerIsUser,
    actualAmount: amountIn
  };
}


function decodeParameters(calldata, category) {

  if (category === "universalRouter") {
    const decoded =
      decodeUniversalRouterExecute(calldata);

    if (!decoded.valid) {
      return {
        valid: false,
        protocol: "Uniswap",
        category: "universalRouter",
        actualAmount: null,
        error:
          decoded.error ||
          "Universal Router decoding failed."
      };
    }

    return {
      valid: true,
      protocol: "Uniswap",
      category: "universalRouter",
      command: decoded.command,
      commandType: decoded.commandType,
      allowRevert: decoded.allowRevert,
      recipient: decoded.recipient,
      amountIn: decoded.amountIn,
      amountOutMin: decoded.amountOutMin,
      path: decoded.path,
      payerIsUser: decoded.payerIsUser,
      actualAmount: decoded.actualAmount
    };
  }


  const words = [];

  for (let i = 0; i < 32; i++) {
    const word = decodeWord(calldata, i);

    if (!word) {
      break;
    }

    words.push(word);
  }

  const selector =
    calldata.slice(0, 10).toLowerCase();

  /*
   * approve(address,uint256)
   */
  if (
    category === "approval" &&
    selector === "0x095ea7b3"
  ) {
    const spender = decodeAddressWord(words[0]);
    const amount = decodeUintWord(words[1]);

    return {
      spender,
      amount,
      unlimited: amount === "MAX_UINT256"
    };
  }

  /*
   * setApprovalForAll(address,bool)
   */
  if (
    category === "approval" &&
    selector === "0xa22cb465"
  ) {
    return {
      operator: decodeAddressWord(words[0]),
      approved: decodeBoolWord(words[1])
    };
  }

  /*
   * transfer(address,uint256)
   */
  if (
    category === "transfer" &&
    selector === "0xa9059cbb"
  ) {
    return {
      recipient: decodeAddressWord(words[0]),
      amount: decodeUintWord(words[1])
    };
  }

  /*
   * transferFrom(address,address,uint256)
   */
  if (
    category === "transfer" &&
    selector === "0x23b872dd"
  ) {
    return {
      from: decodeAddressWord(words[0]),
      recipient: decodeAddressWord(words[1]),
      amount: decodeUintWord(words[2])
    };
  }

  /*
   * swapExactTokensForTokens(
   *   uint256 amountIn,
   *   uint256 amountOutMin,
   *   address[] path,
   *   address to,
   *   uint256 deadline
   * )
   *
   * Static ABI words:
   *   word 0 = amountIn
   *   word 1 = amountOutMin
   *   word 2 = offset to path
   *   word 3 = recipient
   *   word 4 = deadline
   *
   * The path is dynamic and begins at the byte offset
   * stored in word 2.
   */
  if (
    category === "swap" &&
    selector === "0x38ed1739"
  ) {
    if (words.length < 5) {
      return {
        rawWords: words,
        valid: false,
        actualAmount: null,
        error:
          "Incomplete swap calldata. Full ABI encoding is required."
      };
    }

    const amountIn = decodeUintWord(words[0]);
    const amountOutMin = decodeUintWord(words[1]);
    const pathOffsetValue = decodeUintWord(words[2]);
    const recipient = decodeAddressWord(words[3]);
    const deadline = decodeUintWord(words[4]);

    if (
      amountIn === null ||
      amountOutMin === null ||
      pathOffsetValue === null ||
      recipient === null ||
      deadline === null ||
      pathOffsetValue === "MAX_UINT256"
    ) {
      return {
        rawWords: words,
        valid: false,
        actualAmount: null,
        error: "Invalid swap ABI parameters."
      };
    }

    const pathOffset = Number(pathOffsetValue);

    if (
      !Number.isSafeInteger(pathOffset) ||
      pathOffset % 32 !== 0 ||
      pathOffset < 160
    ) {
      return {
        rawWords: words,
        valid: false,
        actualAmount: null,
        error: "Invalid swap path offset."
      };
    }

    const calldataBody = calldata.slice(10);

    if (calldataBody.length % 64 !== 0) {
      return {
        rawWords: words,
        valid: false,
        actualAmount: null,
        error: "Invalid ABI calldata length."
      };
    }

    const pathStart = pathOffset * 2;

    if (pathStart + 64 > calldataBody.length) {
      return {
        rawWords: words,
        valid: false,
        actualAmount: null,
        error: "Swap path data is missing."
      };
    }

    const pathLengthHex =
      calldataBody.slice(
        pathStart,
        pathStart + 64
      );

    const pathLength =
      Number(BigInt("0x" + pathLengthHex));

    if (
      !Number.isSafeInteger(pathLength) ||
      pathLength < 2 ||
      pathLength > 32
    ) {
      return {
        rawWords: words,
        valid: false,
        actualAmount: null,
        error: "Invalid swap path length."
      };
    }

    const path = [];

    for (let i = 0; i < pathLength; i++) {
      const position =
        pathStart + 64 + i * 64;

      if (position + 64 > calldataBody.length) {
        return {
          rawWords: words,
          valid: false,
          actualAmount: null,
          error: "Swap path is incomplete."
        };
      }

      const addressWord =
        calldataBody.slice(
          position,
          position + 64
        );

      path.push(
        decodeAddressWord(addressWord)
      );
    }

    if (path.some((address) => !address)) {
      return {
        rawWords: words,
        valid: false,
        actualAmount: null,
        error: "Swap path contains an invalid address."
      };
    }

    return {
      valid: true,
      amountIn,
      amountOutMin,
      path,
      recipient,
      deadline,
      actualAmount: amountIn
    };
  }

  return {
    rawWords: words
  };
}

function normalizeDecodedAction(decodedFunction, decodedParameters) {

  if (
    decodedFunction.category === "universalRouter"
  ) {
    return {
      action: "swap",
      amount:
        decodedParameters.amountIn ??
        null,
      amountOutMin:
        decodedParameters.amountOutMin ??
        null,
      path:
        decodedParameters.path ??
        [],
      recipient:
        decodedParameters.recipient ??
        null,
      protocolAction:
        decodedParameters.command ??
        "swap"
    };
  }

  if (
    decodedFunction.category === "swap"
  ) {
    return {
      action: "swap",
      amount:
        decodedParameters.amountIn ??
        decodedParameters.amount ??
        null,
      amountOutMin:
        decodedParameters.amountOutMin ??
        null,
      path:
        decodedParameters.path ??
        [],
      recipient:
        decodedParameters.recipient ??
        null,
      deadline:
        decodedParameters.deadline ??
        null,
      protocolAction: "swap"
    };
  }

  if (
    decodedFunction.category === "approval"
  ) {
    return {
      action: "approval",
      amount:
        decodedParameters.amount ??
        null,
      spender:
        decodedParameters.spender ??
        decodedParameters.operator ??
        null,
      approved:
        decodedParameters.approved ??
        null,
      protocolAction: "approval"
    };
  }

  if (
    decodedFunction.category === "transfer"
  ) {
    return {
      action: "transfer",
      amount:
        decodedParameters.amount ??
        null,
      recipient:
        decodedParameters.recipient ??
        null,
      from:
        decodedParameters.from ??
        null,
      protocolAction: "transfer"
    };
  }

  if (
    decodedFunction.category === "administration"
  ) {
    return {
      action: "administration",
      amount: null,
      protocolAction:
        decodedFunction.name
    };
  }

  return {
    action: "unknown",
    amount: null,
    protocolAction: "unknown"
  };
}


/*
 * Step 19 — Execution-Type Authorization
 *
 * Verifies that the actual decoded blockchain operation
 * matches the operation authorized by the agent intent.
 *
 * Uses the completed transaction analysis object so this
 * helper does not depend on route-local decoder variables.
 */
function verifyExecutionType(intent, analysis) {
  const decodedFunction =
    analysis?.decodedFunction || {};

  const decodedParameters =
    analysis?.decodedParameters || {};

  if (intent?.type === "swap") {
    if (decodedFunction.category === "swap") {
      return true;
    }

    if (
      decodedFunction.category === "universalRouter" &&
      decodedParameters.valid === true &&
      decodedParameters.commandType === 0x08 &&
      decodedParameters.allowRevert === false
    ) {
      return true;
    }

    return false;
  }

  if (intent?.type === "approval") {
    return decodedFunction.category === "approval";
  }

  return false;
}
function analyzeTransaction(tx, intent) {
  const securityFlags = [];
  const parameterFlags = [];

  const contract = resolveKnownContract(tx);
  const decodedFunction = decodeFunction(tx.calldata);
  const decodedParameters =
    decodeParameters(
      tx.calldata,
      decodedFunction.category
    );

  const normalizedAction =
    normalizeDecodedAction(
      decodedFunction,
      decodedParameters
    );

  if (
    decodedFunction.category === "universalRouter" &&
    !decodedParameters.valid
  ) {
    securityFlags.push(
      "Universal Router transaction could not be safely decoded."
    );
  }

  if (
    decodedFunction.category === "universalRouter" &&
    decodedParameters.allowRevert === true
  ) {
    securityFlags.push(
      "Universal Router command allows revert."
    );
  }

  const decodedAmount =
    normalizedAction.amount ??
    decodedParameters.rawWords?.[0] ??
    null;

  if (!contract) {
    securityFlags.push("Unknown contract");
  }

  if (decodedFunction.category === "unknown") {
    securityFlags.push("Unknown contract function");
  }

  if (
    decodedFunction.category === "approval" &&
    decodedAmount === "MAX_UINT256"
  ) {
    securityFlags.push("Dangerous token approval");
  }

  if (decodedFunction.category === "administration") {
    securityFlags.push("Dangerous administrative function");
  }

  if (tx.destinationAllowed === false) {
    securityFlags.push("Destination is not authorized");
  }

  if (
    Number(tx.chainId) !== Number(tx.expectedChainId)
  ) {
    securityFlags.push("Unexpected blockchain");
  }

  let parameterMatched = true;

  if (decodedFunction.category === "swap") {
    if (decodedParameters.valid === false) {
      parameterMatched = false;

      parameterFlags.push(
        decodedParameters.error ||
        "Swap parameters could not be verified"
      );
    } else if (
      decodedAmount !== null &&
      decodedAmount !== "MAX_UINT256"
    ) {
      const actual = Number(decodedAmount);
      const declared = Number(intent.amount);

      parameterMatched =
        Number.isFinite(actual) &&
        Number.isFinite(declared) &&
        actual === declared;

      if (!parameterMatched) {
        parameterFlags.push(
          "Actual transaction amount does not match declared intent"
        );
      }
    }
  }

  const malformedSwap =
    decodedFunction.category === "swap" &&
    decodedParameters.valid === false;

  if (malformedSwap) {
    securityFlags.push(
      decodedParameters.error ||
      "Invalid swap calldata"
    );
  }

  const transactionSecuritySafe =
    securityFlags.length === 0;

  const risk =
    securityFlags.includes("Dangerous token approval") ||
    securityFlags.includes("Dangerous administrative function")
      ? "CRITICAL"
      : securityFlags.length > 0 || parameterFlags.length > 0
        ? "HIGH"
        : "LOW";

  return {
    contractKnown: Boolean(contract),
    contractName: contract ? contract.name : "Unknown",
    protocol:
      decodedFunction.category === "universalRouter"
        ? "Uniswap"
        : (contract ? contract.protocol : "Unknown"),

    decodedFunction,

    decodedParameters: {
      ...decodedParameters,
      firstUint256: decodedAmount,
      actualAmount:
        decodedAmount !== null &&
        decodedAmount !== "MAX_UINT256"
          ? Number(decodedAmount)
          : decodedAmount,
      declaredIntentAmount: Number(intent.amount),
      parameterMatched
    },

    normalizedAction,

    parameterFlags,
    securityFlags,
    transactionSecuritySafe,
    risk
  };
}


/*
 * AgentGuard Proof Specification Engine
 *
 * Converts an authorization decision into a deterministic,
 * prover-agnostic statement.
 *
 * This defines what the future ZK circuit must prove.
 */

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

function buildAuthorizationProofSpec({
  transaction,
  intent,
  policy,
  analysis,
  decision
}) {
  const normalizedAction =
    analysis.normalizedAction || {};

  const decodedParameters =
    analysis.decodedParameters || {};

  const proofStatement = {
    version: "agentguard-proof-v1",

    subject: {
      agent:
        intent.agent ??
        transaction.agent ??
        null
    },

    intent: {
      type: intent.type ?? null,
      chain: intent.chain ?? null,
      protocol: intent.protocol ?? null,
      asset: intent.asset ?? null,
      amount:
        intent.amount !== undefined
          ? String(intent.amount)
          : null
    },

    policy: {
      maxTransactionAmount:
        policy.maxTransactionAmount ??
        policy.maxTransaction ??
        null,

      dailyLimit:
        policy.dailyLimit ??
        null
    },

    action: {
      type:
        normalizedAction.action ??
        null,

      protocolAction:
        normalizedAction.protocolAction ??
        null,

      amount:
        decodedParameters.actualAmount ??
        normalizedAction.amount ??
        null,

      amountOutMin:
        normalizedAction.amountOutMin ??
        null,

      recipient:
        normalizedAction.recipient ??
        null,

      path:
        normalizedAction.path ??
        [],

      spender:
        normalizedAction.spender ??
        null
    },

    transaction: {
      chainId:
        transaction.chainId ??
        transaction.expectedChainId ??
        null,

      from:
        transaction.from ??
        null,

      to:
        transaction.to ??
        null,

      value:
        transaction.value ??
        "0",

      function:
        analysis.decodedFunction?.name ??
        null,

      selector:
        analysis.decodedFunction?.selector ??
        null
    },

    security: {
      policyPassed:
        decision.policyPassed === true,

      intentMatched:
        decision.intentMatched === true,

      parameterMatched:
        decision.parameterMatched === true,

      executionTypeMatched:
        decision.executionTypeMatched === true,

      nativeValueMatched:
        decision.nativeValueMatched === true,

      protocolMatched:
        decision.protocolMatched === true,

      transactionSecuritySafe:
        decision.transactionSecuritySafe === true
    },

    decision:
      decision.authorized === true
        ? "AUTHORIZED"
        : "BLOCKED"
  };

  return canonicalizeProofValue(proofStatement);
}


/*
 * Phorva Execution Graph v1
 *
 * Represents an autonomous execution as an ordered,
 * hashable sequence of authorization decisions.
 *
 * This is intentionally prover-agnostic.
 * Future provers can prove properties over this graph.
 */

function buildExecutionNode({
  executionId,
  parentExecutionId = null,
  sequence,
  agent,
  intent,
  transaction,
  analysis,
  decision
}) {
  return canonicalizeProofValue({
    version: "agentguard-execution-v1",

    executionId:
      executionId ?? null,

    parentExecutionId:
      parentExecutionId ?? null,

    sequence:
      Number(sequence ?? 0),

    subject: {
      agent:
        agent ??
        intent?.agent ??
        transaction?.agent ??
        null
    },

    intent: {
      type:
        intent?.type ?? null,

      chain:
        intent?.chain ?? null,

      protocol:
        intent?.protocol ?? null,

      asset:
        intent?.asset ?? null,

      amount:
        intent?.amount !== undefined
          ? String(intent.amount)
          : null
    },

    action: {
      type:
        analysis?.normalizedAction?.action ??
        null,

      protocolAction:
        analysis?.normalizedAction?.protocolAction ??
        null,

      amount:
        analysis?.decodedParameters?.actualAmount ??
        analysis?.normalizedAction?.amount ??
        null,

      amountOutMin:
        analysis?.normalizedAction?.amountOutMin ??
        null,

      recipient:
        analysis?.normalizedAction?.recipient ??
        null,

      path:
        analysis?.normalizedAction?.path ??
        [],

      spender:
        analysis?.normalizedAction?.spender ??
        null
    },

    transaction: {
      chainId:
        transaction?.chainId ??
        transaction?.expectedChainId ??
        null,

      from:
        transaction?.from ??
        null,

      to:
        transaction?.to ??
        null,

      value:
        transaction?.value ??
        "0",

      function:
        analysis?.decodedFunction?.name ??
        null,

      selector:
        analysis?.decodedFunction?.selector ??
        null
    },

    authorization: {
      authorized:
        decision?.authorized === true,

      policyPassed:
        decision?.policyPassed === true,

      intentMatched:
        decision?.intentMatched === true,

      parameterMatched:
        decision?.parameterMatched === true,

      executionTypeMatched:
        decision?.executionTypeMatched === true,

      nativeValueMatched:
        decision?.nativeValueMatched === true,

      protocolMatched:
        decision?.protocolMatched === true,

      transactionSecuritySafe:
        decision?.transactionSecuritySafe === true
    }
  });
}


/*
 * Phorva Pure Execution Verification v1
 *
 * This function is the authoritative verifier for a
 * single raw execution record.
 *
 * It deliberately returns the same authorization
 * semantics used by /execution-graph.
 *
 * No verification receipt is consumed here.
 */

function verifyExecutionAuthorization({
  agent,
  action,
  intent,
  policy,
  transaction
}) {
  if (!agent || !action || !intent || !policy || !transaction) {
    throw new Error(
      "agent, action, intent, policy and transaction are required"
    );
  }

  const analysis = analyzeTransaction(transaction, intent);
  const decodedParameters = analysis.decodedParameters || {};
  const normalizedAction = analysis.normalizedAction || {};

  const decodedActualAmount =
    decodedParameters.actualAmount ??
    decodedParameters.amount;

  const actualTransactionAmount =
    Number.isFinite(Number(decodedActualAmount))
      ? Number(decodedActualAmount)
      : Number(transaction.amount);

  const maximum =
    Number(
      policy.maxTransactionAmount ??
      policy.maxTransaction
    );

  const dailyLimitRaw = policy.dailyLimit;

  const dailyLimit =
    dailyLimitRaw === undefined ||
    dailyLimitRaw === null ||
    dailyLimitRaw === ""
      ? Infinity
      : Number(dailyLimitRaw);

  const policyPassed =
    Number.isFinite(actualTransactionAmount) &&
    Number.isFinite(maximum) &&
    actualTransactionAmount <= maximum &&
    actualTransactionAmount <= dailyLimit;

  const intentMatched =
    action.type === intent.type &&
    action.chain === intent.chain &&
    action.protocol === intent.protocol &&
    action.asset === intent.asset;

  const protocolMatched =
    analysis.protocol === intent.protocol;

  const transactionSecuritySafe =
    analysis.transactionSecuritySafe;

  const decodedParameterAmount =
    Number(
      decodedParameters.actualAmount ??
      decodedParameters.amount
    );

  const intentParameterAmount =
    Number(intent.amount);

  const amountParameterMatched =
    Number.isFinite(decodedParameterAmount) &&
    Number.isFinite(intentParameterAmount) &&
    decodedParameterAmount === intentParameterAmount;

  const normalizeVerifierAddress = value =>
    typeof value === "string"
      ? value.toLowerCase()
      : value;

  const expectedRecipient =
    intent.recipient ??
    intent.destination;

  const actualRecipient =
    decodedParameters.recipient ??
    normalizedAction.recipient ??
    null;

  const recipientMatched =
    expectedRecipient === undefined ||
    expectedRecipient === null ||
    expectedRecipient === "" ||
    (
      actualRecipient &&
      normalizeVerifierAddress(actualRecipient) ===
        normalizeVerifierAddress(expectedRecipient)
    );

  const expectedPath =
    Array.isArray(intent.path)
      ? intent.path.map(normalizeVerifierAddress)
      : null;

  const actualPath =
    Array.isArray(decodedParameters.path)
      ? decodedParameters.path.map(normalizeVerifierAddress)
      : (
          Array.isArray(normalizedAction.path)
            ? normalizedAction.path.map(normalizeVerifierAddress)
            : null
        );

  const pathMatched =
    expectedPath === null ||
    (
      actualPath &&
      actualPath.length === expectedPath.length &&
      actualPath.every(
        (address, index) =>
          address === expectedPath[index]
      )
    );

  const expectedAssetAddress =
    intent.assetAddress;

  const actualAssetAddress =
    action.type === "approval"
      ? transaction.to
      : (
          Array.isArray(decodedParameters.path) &&
          decodedParameters.path.length > 0
            ? decodedParameters.path[0]
            : (
                decodedParameters.tokenIn ??
                decodedParameters.assetAddress ??
                normalizedAction.assetAddress ??
                normalizedAction.tokenIn ??
                null
              )
        );

  const assetAddressMatched =
    expectedAssetAddress === undefined ||
    expectedAssetAddress === null ||
    expectedAssetAddress === "" ||
    (
      actualAssetAddress &&
      normalizeVerifierAddress(actualAssetAddress) ===
        normalizeVerifierAddress(expectedAssetAddress)
    );

  const expectedSpender =
    intent.spender;

  const actualSpender =
    decodedParameters.spender ??
    normalizedAction.spender ??
    null;

  const spenderMatched =
    expectedSpender === undefined ||
    expectedSpender === null ||
    expectedSpender === "" ||
    (
      actualSpender &&
      normalizeVerifierAddress(actualSpender) ===
        normalizeVerifierAddress(expectedSpender)
    );

  const expectedAmountOutMin =
    intent.amountOutMin;

  const actualAmountOutMin =
    decodedParameters.amountOutMin ??
    normalizedAction.amountOutMin;

  const amountOutMinMatched =
    expectedAmountOutMin === undefined ||
    expectedAmountOutMin === null ||
    (
      actualAmountOutMin !== undefined &&
      actualAmountOutMin !== null &&
      Number(actualAmountOutMin) ===
        Number(expectedAmountOutMin)
    );

  const expectedPayerIsUser =
    intent.payerIsUser;

  const actualPayerIsUser =
    decodedParameters.payerIsUser ??
    normalizedAction.payerIsUser;

  const payerIsUserMatched =
    expectedPayerIsUser === undefined ||
    expectedPayerIsUser === null ||
    actualPayerIsUser === expectedPayerIsUser;

  const expectedAllowRevert =
    intent.allowRevert;

  const actualAllowRevert =
    decodedParameters.allowRevert ??
    normalizedAction.allowRevert;

  const allowRevertMatched =
    expectedAllowRevert === undefined ||
    expectedAllowRevert === null ||
    actualAllowRevert === expectedAllowRevert;

  const isApprovalAction =
    action.type === "approval";

  const parameterMatched =
    amountParameterMatched &&
    spenderMatched &&
    assetAddressMatched &&
    (
      isApprovalAction ||
      (
        recipientMatched &&
        pathMatched &&
        amountOutMinMatched &&
        payerIsUserMatched &&
        allowRevertMatched
      )
    );

  const executionTypeMatched =
    verifyExecutionType(intent, analysis);

  const actualNativeValue =
    String(transaction.value ?? "0");

  const expectedNativeValue =
    String(
      intent.nativeValue ??
      intent.value ??
      "0"
    );

  const nativeValueMatched =
    actualNativeValue === expectedNativeValue;

  const authorized =
    policyPassed &&
    intentMatched &&
    parameterMatched &&
    executionTypeMatched &&
    nativeValueMatched &&
    protocolMatched &&
    transactionSecuritySafe;

  return {
    authorized,
    policyPassed,
    intentMatched,
    parameterMatched,
    executionTypeMatched,
    nativeValueMatched,
    protocolMatched,
    transactionSecuritySafe,

    analysis,
    actualTransactionAmount,

    parameterChecks: {
      amountParameterMatched,
      recipientMatched,
      pathMatched,
      assetAddressMatched,
      spenderMatched,
      amountOutMinMatched,
      payerIsUserMatched,
      allowRevertMatched
    },

    expectedNativeValue,
    actualNativeValue,

    expectedAssetAddress:
      expectedAssetAddress ?? null,

    actualAssetAddress:
      actualAssetAddress ?? null
  };
}


function buildVerificationTrace({
  verification
}) {
  if (!verification) {
    throw new Error(
      "verification is required"
    );
  }

  const checks =
    verification.parameterChecks || {};

  const analysis =
    verification.analysis || {};

  const trace = [
    {
      id: "agent_identity",
      category: "identity",
      passed: true,
      message:
        "Agent identity supplied to the verification request."
    },

    {
      id: "intent",
      category: "intent",
      passed:
        verification.intentMatched === true,
      message:
        verification.intentMatched === true
          ? "Action matches the declared intent."
          : "Action does not match the declared intent."
    },

    {
      id: "policy",
      category: "policy",
      passed:
        verification.policyPassed === true,
      message:
        verification.policyPassed === true
          ? "Transaction satisfies the configured spending policy."
          : "Transaction exceeds the configured spending policy."
    },

    {
      id: "amount",
      category: "parameters",
      passed:
        checks.amountParameterMatched === true,
      message:
        checks.amountParameterMatched === true
          ? "Decoded transaction amount matches the declared intent amount."
          : "Decoded transaction amount does not match the declared intent amount."
    },

    {
      id: "asset_identity",
      category: "parameters",
      passed:
        checks.assetAddressMatched === true,
      message:
        checks.assetAddressMatched === true
          ? "Transaction asset matches the authorized asset."
          : "Transaction asset does not match the authorized asset."
    },

    {
      id: "spender",
      category: "parameters",
      passed:
        checks.spenderMatched === true,
      message:
        checks.spenderMatched === true
          ? "Spender matches the authorized spender."
          : "Spender does not match the authorized spender."
    },

    {
      id: "recipient",
      category: "parameters",
      passed:
        checks.recipientMatched === true,
      message:
        checks.recipientMatched === true
          ? "Recipient matches the authorized recipient."
          : "Recipient does not match the authorized recipient."
    },

    {
      id: "path",
      category: "parameters",
      passed:
        checks.pathMatched === true,
      message:
        checks.pathMatched === true
          ? "Token path matches the authorized path."
          : "Token path does not match the authorized path."
    },

    {
      id: "amount_out_min",
      category: "parameters",
      passed:
        checks.amountOutMinMatched === true,
      message:
        checks.amountOutMinMatched === true
          ? "Minimum output amount matches the authorized constraint."
          : "Minimum output amount does not match the authorized constraint."
    },

    {
      id: "payer",
      category: "parameters",
      passed:
        checks.payerIsUserMatched === true,
      message:
        checks.payerIsUserMatched === true
          ? "Payer matches the authorized payer constraint."
          : "Payer does not match the authorized payer constraint."
    },

    {
      id: "allow_revert",
      category: "parameters",
      passed:
        checks.allowRevertMatched === true,
      message:
        checks.allowRevertMatched === true
          ? "Execution revert behavior matches the authorized constraint."
          : "Execution revert behavior does not match the authorized constraint."
    },

    {
      id: "execution_type",
      category: "execution",
      passed:
        verification.executionTypeMatched === true,
      message:
        verification.executionTypeMatched === true
          ? "Actual blockchain execution type matches the authorized intent."
          : "Actual blockchain execution type does not match the authorized intent."
    },

    {
      id: "native_value",
      category: "execution",
      passed:
        verification.nativeValueMatched === true,
      message:
        verification.nativeValueMatched === true
          ? "Attached native value matches the authorized value."
          : "Attached native value does not match the authorized value."
    },

    {
      id: "protocol",
      category: "protocol",
      passed:
        verification.protocolMatched === true,
      message:
        verification.protocolMatched === true
          ? "Transaction targets the authorized protocol."
          : "Transaction targets a different protocol."
    },

    {
      id: "transaction_security",
      category: "security",
      passed:
        verification.transactionSecuritySafe === true,
      message:
        verification.transactionSecuritySafe === true
          ? "No transaction-security threat was detected."
          : "Transaction-security analysis detected a threat."
    }
  ];

  /*
   * Approval actions intentionally do not require the
   * swap-only checks to determine authorization.
   *
   * Mark those checks as not applicable rather than
   * incorrectly presenting them as failed.
   */
  const isApproval =
    analysis.normalizedAction?.action === "approval";

  if (isApproval) {
    for (const id of [
      "recipient",
      "path",
      "amount_out_min",
      "payer",
      "allow_revert"
    ]) {
      const check =
        trace.find(item => item.id === id);

      if (check) {
        check.applicable = false;
        check.passed = true;
        check.message =
          "Not applicable to approval execution.";
      }
    }
  }

  for (const check of trace) {
    if (check.applicable === undefined) {
      check.applicable = true;
    }
  }

  const passedChecks =
    trace.filter(
      check =>
        check.applicable &&
        check.passed
    ).length;

  const failedChecks =
    trace.filter(
      check =>
        check.applicable &&
        !check.passed
    ).length;

  const applicableChecks =
    trace.filter(
      check =>
        check.applicable
    ).length;

  return canonicalizeProofValue({
    version:
      "phorva-verification-trace-v1",

    checks: trace,

    summary: {
      total:
        applicableChecks,

      passed:
        passedChecks,

      failed:
        failedChecks
    },

    decision:
      verification.authorized
        ? "AUTHORIZED"
        : "BLOCKED"
  });
}

function verifyRawExecution({
  execution,
  index = 0,
  previousExecutionId = null
}) {
  const {
    executionId,
    parentExecutionId,
    agent,
    action,
    intent,
    policy,
    transaction
  } = execution || {};

  const verification =
    verifyExecutionAuthorization({
      agent,
      action,
      intent,
      policy,
      transaction
    });

  const decision = {
    authorized:
      verification.authorized,

    policyPassed:
      verification.policyPassed,

    intentMatched:
      verification.intentMatched,

    parameterMatched:
      verification.parameterMatched,

    executionTypeMatched:
      verification.executionTypeMatched,

    nativeValueMatched:
      verification.nativeValueMatched,

    protocolMatched:
      verification.protocolMatched,

    transactionSecuritySafe:
      verification.transactionSecuritySafe,

    parameterChecks:
      verification.parameterChecks
  };

  return {
    executionId:
      executionId ??
      `execution-${index + 1}`,

    parentExecutionId:
      parentExecutionId ??
      (
        index === 0
          ? null
          : previousExecutionId
      ),

    sequence:
      execution.sequence ??
      index,

    agent,
    intent,
    transaction,

    analysis:
      verification.analysis,

    decision
  };
}


function verifyRawExecutions({
  executions
}) {
  if (
    !Array.isArray(executions) ||
    executions.length === 0
  ) {
    throw new Error(
      "executions must be a non-empty array"
    );
  }

  const nodes = [];

  for (let i = 0; i < executions.length; i++) {
    const node =
      verifyRawExecution({
        execution:
          executions[i],
        index: i,
        previousExecutionId:
          nodes[i - 1]?.executionId ??
          null
      });

    nodes.push(node);
  }

  const graph =
    buildExecutionGraph({
      executions: nodes
    });

  const commitment =
    createExecutionGraphCommitment(
      graph
    );

  const allExecutionsAuthorized =
    nodes.every(
      node =>
        node.decision.authorized === true
    );

  const sequenceValid =
    nodes.every(
      (node, index) =>
        node.sequence === index &&
        (
          index === 0
            ? node.parentExecutionId === null
            : node.parentExecutionId ===
              nodes[index - 1]?.executionId
        )
    );

  const graphInvariants =
    verifyExecutionGraphInvariants(
      nodes
    );

  return {
    nodes,
    graph,
    commitment,

    authorization: {
      decision:
        allExecutionsAuthorized &&
        sequenceValid &&
        graphInvariants.valid
          ? "AUTHORIZED"
          : "BLOCKED",

      allExecutionsAuthorized,
      sequenceValid,
      graphInvariantsValid:
        graphInvariants.valid,

      violations:
        graphInvariants.violations
    }
  };
}


function buildExecutionGraph({
  executions = []
}) {
  const nodes = executions.map((execution, index) =>
    buildExecutionNode({
      ...execution,
      sequence:
        execution.sequence ??
        index
    })
  );

  return canonicalizeProofValue({
    version: "agentguard-execution-graph-v1",
    nodes
  });
}

function createExecutionGraphCommitment(graph) {
  const canonicalJson =
    JSON.stringify(
      canonicalizeProofValue(graph)
    );

  const commitment =
    crypto
      .createHash("sha256")
      .update(canonicalJson, "utf8")
      .digest("hex");

  return {
    algorithm: "SHA-256",
    commitment: "0x" + commitment,
    canonicalJson
  };
}

function buildProofClaims(proofStatement) {
  return {
    version:
      proofStatement.version,

    claim:
      "AGENT_ACTION_AUTHORIZED",

    decision:
      proofStatement.decision,

    policySatisfied:
      proofStatement.security.policyPassed,

    intentSatisfied:
      proofStatement.security.intentMatched,

    parametersSatisfied:
      proofStatement.security.parameterMatched,

    executionTypeSatisfied:
      proofStatement.security.executionTypeMatched,

    nativeValueSatisfied:
      proofStatement.security.nativeValueMatched,

    protocolSatisfied:
      proofStatement.security.protocolMatched,

    transactionSecuritySatisfied:
      proofStatement.security.transactionSecuritySafe,

    action:
      proofStatement.action,

    transaction:
      proofStatement.transaction
  };
}



function createProofCommitment(proofStatement) {
  const canonicalJson =
    JSON.stringify(
      canonicalizeProofValue(proofStatement)
    );

  const commitment =
    crypto
      .createHash("sha256")
      .update(canonicalJson, "utf8")
      .digest("hex");

  return {
    algorithm: "SHA-256",
    commitment: "0x" + commitment,
    canonicalJson
  };
}



/*
 * Phorva Execution Graph API
 *
 * Builds a deterministic graph from a sequence of
 * autonomous execution records.
 *
 * This does not replace /authorize.
 * Each execution can still be evaluated independently.
 */


/*
 * Execution Graph Security Invariants v1
 *
 * These rules verify the integrity of the autonomous
 * execution sequence itself, rather than only individual
 * transactions.
 */

function buildExecutionIntentFingerprint(intent) {
  return JSON.stringify(
    canonicalizeProofValue({
      type: intent?.type ?? null,
      chain: intent?.chain ?? null,
      protocol: intent?.protocol ?? null,
      asset: intent?.asset ?? null,
      amount:
        intent?.amount !== undefined
          ? String(intent.amount)
          : null
    })
  );
}

function verifyExecutionGraphInvariants(nodes) {
  const violations = [];

  if (!Array.isArray(nodes) || nodes.length === 0) {
    return {
      valid: false,
      violations: ["Execution graph is empty"]
    };
  }

  const first = nodes[0];

  const expectedAgent =
    first.agent ??
    first.intent?.agent ??
    first.transaction?.agent ??
    null;

  const expectedIntent =
    buildExecutionIntentFingerprint(
      first.intent
    );

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    /*
     * 1. Sequence continuity
     */
    if (node.sequence !== i) {
      violations.push(
        `Invalid sequence at execution ${i}`
      );
    }

    /*
     * 2. Agent continuity
     */
    const nodeAgent =
      node.agent ??
      node.intent?.agent ??
      node.transaction?.agent ??
      null;

    if (nodeAgent !== expectedAgent) {
      violations.push(
        `Agent continuity violation at execution ${i}`
      );
    }

    /*
     * 3. Intent continuity
     */
    const nodeIntent =
      buildExecutionIntentFingerprint(
        node.intent
      );

    if (nodeIntent !== expectedIntent) {
      violations.push(
        `Intent continuity violation at execution ${i}`
      );
    }

    /*
     * 4. Parent continuity
     */
    const expectedParent =
      i === 0
        ? null
        : nodes[i - 1].executionId;

    if (
      node.parentExecutionId !==
      expectedParent
    ) {
      violations.push(
        `Parent continuity violation at execution ${i}`
      );
    }

    /*
     * 5. Blocked execution cannot be followed
     *    by another execution.
     */
    if (
      i > 0 &&
      nodes[i - 1].decision?.authorized !== true
    ) {
      violations.push(
        `Execution ${i} follows a blocked execution`
      );
    }
  }

  return {
    valid:
      violations.length === 0,

    violations
  };
}


/*
 * Phorva Final-State Verification v1
 *
 * Verifies that an execution graph reaches the state
 * required by the original autonomous objective.
 *
 * V1 uses explicit declared final-state claims.
 * Future versions can derive these claims from
 * blockchain state and execution receipts.
 */

function buildFinalStateClaim(finalState) {
  return canonicalizeProofValue({
    asset:
      finalState?.asset ?? null,

    assetAddress:
      finalState?.assetAddress ?? null,

    amount:
      finalState?.amount !== undefined
        ? String(finalState.amount)
        : null,

    destination:
      finalState?.destination ?? null,

    protocol:
      finalState?.protocol ?? null,

    status:
      finalState?.status ?? null
  });
}

function verifyFinalState({
  intent,
  finalState,
  expectedFinalState
}) {
  const violations = [];

  if (!finalState) {
    return {
      satisfied: false,
      violations: [
        "Final state is missing"
      ]
    };
  }

  if (!expectedFinalState) {
    return {
      satisfied: false,
      violations: [
        "Expected final state is missing"
      ]
    };
  }

  const actual =
    buildFinalStateClaim(
      finalState
    );

  const expected =
    buildFinalStateClaim(
      expectedFinalState
    );

  /*
   * Asset verification
   */
  if (
    expected.asset !== null &&
    actual.asset !== expected.asset
  ) {
    violations.push(
      "Final-state asset does not match the authorized objective"
    );
  }

  /*
   * Asset identity verification
   */
  if (
    expected.assetAddress !== null &&
    actual.assetAddress !==
      expected.assetAddress
  ) {
    violations.push(
      "Final-state asset address does not match the authorized objective"
    );
  }

  /*
   * Destination verification
   */
  if (
    expected.destination !== null &&
    actual.destination !==
      expected.destination
  ) {
    violations.push(
      "Final-state destination does not match the authorized objective"
    );
  }

  /*
   * Protocol verification
   */
  if (
    expected.protocol !== null &&
    actual.protocol !== expected.protocol
  ) {
    violations.push(
      "Final-state protocol does not match the authorized objective"
    );
  }

  /*
   * Amount verification
   *
   * V1 requires an exact amount when an expected
   * amount is supplied.
   */
  if (
    expected.amount !== null &&
    actual.amount !== expected.amount
  ) {
    violations.push(
      "Final-state amount does not match the authorized objective"
    );
  }

  /*
   * Explicit status verification
   */
  if (
    expected.status !== null &&
    actual.status !== expected.status
  ) {
    violations.push(
      "Final-state status does not satisfy the objective"
    );
  }

  return {
    satisfied:
      violations.length === 0,

    violations,

    expected: expected,
    actual: actual,

    intent:
      canonicalizeProofValue({
        type: intent?.type ?? null,
        chain: intent?.chain ?? null,
        protocol: intent?.protocol ?? null,
        asset: intent?.asset ?? null,
        amount:
          intent?.amount !== undefined
            ? String(intent.amount)
            : null
      })
  };
}

function createFinalStateCommitment({
  graphCommitment,
  finalState,
  verification
}) {
  const statement =
    canonicalizeProofValue({
      version:
        "agentguard-final-state-v1",

      graphCommitment:
        graphCommitment ?? null,

      finalState,

      verification
    });

  const canonicalJson =
    JSON.stringify(statement);

  const commitment =
    crypto
      .createHash("sha256")
      .update(canonicalJson, "utf8")
      .digest("hex");

  return {
    algorithm: "SHA-256",
    commitment: "0x" + commitment,
    statement,
    canonicalJson
  };
}


function verifyCanonicalExecutionGraphInvariants(
  executionGraph
) {
  const nodes =
    executionGraph?.nodes;

  const violations = [];

  if (
    !Array.isArray(nodes) ||
    nodes.length === 0
  ) {
    return {
      valid: false,
      violations: [
        "Execution graph is empty"
      ]
    };
  }

  const first = nodes[0];

  const expectedAgent =
    first?.subject?.agent ??
    null;

  const expectedIntent =
    buildExecutionIntentFingerprint(
      first?.intent
    );

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    /*
     * 1. Sequence continuity
     */
    if (node?.sequence !== i) {
      violations.push(
        `Invalid sequence at execution ${i}`
      );
    }

    /*
     * 2. Agent continuity
     *
     * Canonical execution graph stores the
     * agent under subject.agent.
     */
    const nodeAgent =
      node?.subject?.agent ??
      null;

    if (nodeAgent !== expectedAgent) {
      violations.push(
        `Agent continuity violation at execution ${i}`
      );
    }

    /*
     * 3. Intent continuity
     */
    const nodeIntent =
      buildExecutionIntentFingerprint(
        node?.intent
      );

    if (nodeIntent !== expectedIntent) {
      violations.push(
        `Intent continuity violation at execution ${i}`
      );
    }

    /*
     * 4. Parent continuity
     */
    const expectedParent =
      i === 0
        ? null
        : nodes[i - 1]?.executionId;

    if (
      node?.parentExecutionId !==
      expectedParent
    ) {
      violations.push(
        `Parent continuity violation at execution ${i}`
      );
    }

    /*
     * 5. A blocked execution cannot be
     *    followed by another execution.
     */
    if (
      i > 0 &&
      nodes[i - 1]?.authorization?.authorized !==
        true
    ) {
      violations.push(
        `Execution ${i} follows a blocked execution`
      );
    }
  }

  return {
    valid:
      violations.length === 0,

    violations
  };
}


function derivePhorvaAuthorization({
  executionGraph,
  finalStateVerification = null
}) {
  const nodes =
    executionGraph?.nodes;

  if (
    !Array.isArray(nodes) ||
    nodes.length === 0
  ) {
    throw new Error(
      "executionGraph.nodes must be a non-empty array"
    );
  }

  /*
   * IMPORTANT:
   *
   * executionGraph is the canonical
   * agentguard-execution-graph-v1 representation.
   *
   * It is NOT the raw execution-node structure
   * consumed by verifyExecutionGraphInvariants().
   *
   * Therefore canonical graphs must be verified
   * using their own representation-aware verifier.
   */

  const allExecutionsAuthorized =
    nodes.every(
      node =>
        node?.authorization?.authorized === true
    );

  const sequenceValid =
    nodes.every(
      (node, index) =>
        node?.sequence === index &&
        (
          index === 0
            ? node?.parentExecutionId === null
            : node?.parentExecutionId ===
              nodes[index - 1]?.executionId
        )
    );

  const graphInvariants =
    verifyCanonicalExecutionGraphInvariants(
      executionGraph
    );

  let finalStateSatisfied = true;

  if (finalStateVerification !== null) {
    const actual =
      finalStateVerification?.actual ?? null;

    const expected =
      finalStateVerification?.expected ?? null;

    if (!actual || !expected) {
      finalStateSatisfied = false;
    } else {
      const recomputed =
        verifyFinalState({
          intent:
            finalStateVerification?.intent ??
            null,

          finalState:
            actual,

          expectedFinalState:
            expected
        });

      finalStateSatisfied =
        recomputed.satisfied === true;
    }
  }

  const authorized =
    allExecutionsAuthorized &&
    sequenceValid &&
    graphInvariants.valid &&
    finalStateSatisfied;

  return {
    decision:
      authorized
        ? "AUTHORIZED"
        : "BLOCKED",

    allExecutionsAuthorized,

    sequenceValid,

    graphInvariantsValid:
      graphInvariants.valid,

    finalStateSatisfied,

    violations:
      graphInvariants.violations
  };
}


/*
 * Phorva Verification Receipt v1
 *
 * A verification receipt cryptographically binds a
 * canonical execution graph to the authorization result
 * produced by Phorva.
 *
 * The receipt is NOT a user assertion.
 * It is an authenticated server-side verification artifact.
 */

const PHORVA_VERIFICATION_SECRET =
  process.env.PHORVA_VERIFICATION_SECRET ||
  crypto.randomBytes(32).toString("hex");

function createPhorvaVerificationReceipt({
  executionGraph,
  executionGraphCommitment,
  authorization
}) {
  if (!executionGraph) {
    throw new Error(
      "executionGraph is required"
    );
  }

  if (!executionGraphCommitment?.commitment) {
    throw new Error(
      "executionGraphCommitment.commitment is required"
    );
  }

  if (!authorization) {
    throw new Error(
      "verified authorization is required"
    );
  }

  const payload =
    canonicalizeProofValue({
      version:
        "phorva-verification-receipt-v1",

      graphCommitment:
        executionGraphCommitment.commitment,

      graphAlgorithm:
        executionGraphCommitment.algorithm ??
        "SHA-256",

      authorization
    });

  const canonicalJson =
    JSON.stringify(payload);

  const signature =
    crypto
      .createHmac(
        "sha256",
        PHORVA_VERIFICATION_SECRET
      )
      .update(
        canonicalJson,
        "utf8"
      )
      .digest("hex");

  return {
    version:
      "phorva-verification-receipt-v1",

    graphCommitment:
      executionGraphCommitment.commitment,

    graphAlgorithm:
      executionGraphCommitment.algorithm ??
      "SHA-256",

    authorization:
      canonicalizeProofValue(
        authorization
      ),

    algorithm:
      "HMAC-SHA256",

    signature:
      "0x" + signature
  };
}


function verifyPhorvaVerificationReceipt({
  executionGraph,
  executionGraphCommitment,
  receipt
}) {
  if (!receipt) {
    return {
      valid: false,
      error:
        "verificationReceipt is required"
    };
  }

  if (
    receipt.version !==
    "phorva-verification-receipt-v1"
  ) {
    return {
      valid: false,
      error:
        "Unsupported verification receipt version"
    };
  }

  if (
    receipt.algorithm !==
    "HMAC-SHA256"
  ) {
    return {
      valid: false,
      error:
        "Unsupported verification receipt algorithm"
    };
  }

  if (!receipt.signature) {
    return {
      valid: false,
      error:
        "verificationReceipt.signature is required"
    };
  }

  if (
    receipt.graphCommitment !==
    executionGraphCommitment?.commitment
  ) {
    return {
      valid: false,
      error:
        "Verification receipt graph commitment mismatch"
    };
  }

  const payload =
    canonicalizeProofValue({
      version:
        "phorva-verification-receipt-v1",

      graphCommitment:
        executionGraphCommitment.commitment,

      graphAlgorithm:
        executionGraphCommitment.algorithm ??
        "SHA-256",

      authorization:
        receipt.authorization ?? null
    });

  const canonicalJson =
    JSON.stringify(payload);

  const expectedSignature =
    "0x" +
    crypto
      .createHmac(
        "sha256",
        PHORVA_VERIFICATION_SECRET
      )
      .update(
        canonicalJson,
        "utf8"
      )
      .digest("hex");

  const valid =
    receipt.signature ===
    expectedSignature;

  return {
    valid,

    authorization:
      receipt.authorization ?? null,

    graphCommitment:
      receipt.graphCommitment,

    algorithm:
      receipt.algorithm,

    expectedSignature,
    actualSignature:
      receipt.signature
  };
}



function createVerificationTraceCommitment(
  verificationTrace
) {
  if (!verificationTrace) {
    return null;
  }

  const canonicalJson =
    JSON.stringify(
      canonicalizeProofValue(
        verificationTrace
      )
    );

  const commitment =
    crypto
      .createHash("sha256")
      .update(
        canonicalJson,
        "utf8"
      )
      .digest("hex");

  return {
    algorithm: "SHA-256",
    commitment: "0x" + commitment,
    canonicalJson
  };
}

function buildPhorvaProofStatement({
  intent,
  executionGraph,
  executionGraphCommitment,
  finalStateVerification,
  finalStateCommitment,
  authorization,
  verifiedAuthorization = null,
  verificationTrace = null,
  verificationTraceCommitment = null
}) {
  const derivedAuthorization =
    verifiedAuthorization ??
    derivePhorvaAuthorization({
      executionGraph,
      finalStateVerification:
        finalStateVerification ?? null
    });

  /*
   * Caller-supplied authorization is treated as
   * an assertion, never as the source of truth.
   *
   * If supplied, every authorization field must
   * agree with Phorva's independently derived result.
   */
  if (authorization) {
    const suppliedDecision =
      authorization.decision;

    if (
      suppliedDecision !== undefined &&
      suppliedDecision !==
        derivedAuthorization.decision
    ) {
      throw new Error(
        "Caller authorization decision does not match Phorva-derived authorization"
      );
    }

    const booleanFields = [
      "allExecutionsAuthorized",
      "sequenceValid",
      "graphInvariantsValid",
      "finalStateSatisfied"
    ];

    for (const field of booleanFields) {
      if (
        authorization[field] !== undefined &&
        authorization[field] !==
          derivedAuthorization[field]
      ) {
        throw new Error(
          `Caller authorization field "${field}" does not match Phorva-derived authorization`
        );
      }
    }
  }

  return canonicalizeProofValue({
    version: "phorva-proof-v1",

    intent: {
      type: intent?.type ?? null,

      chain: intent?.chain ?? null,

      protocol: intent?.protocol ?? null,

      asset: intent?.asset ?? null,

      amount:
        intent?.amount !== undefined
          ? String(intent.amount)
          : null
    },

    authorization: {
      decision:
        derivedAuthorization.decision,

      allExecutionsAuthorized:
        derivedAuthorization.allExecutionsAuthorized,

      sequenceValid:
        derivedAuthorization.sequenceValid,

      graphInvariantsValid:
        derivedAuthorization.graphInvariantsValid,

      finalStateSatisfied:
        derivedAuthorization.finalStateSatisfied
    },

    executionGraph: {
      version:
        executionGraph?.version ?? null,

      commitment:
        executionGraphCommitment?.commitment ?? null,

      algorithm:
        executionGraphCommitment?.algorithm ?? null
    },

    finalState: {
      requested:
        finalStateVerification !== null,

      satisfied:
        derivedAuthorization.finalStateSatisfied,

      commitment:
        finalStateCommitment?.commitment ?? null,

      algorithm:
        finalStateCommitment?.algorithm ?? null
    },

    verificationTrace: {
      ...(verificationTrace ?? {}),

      commitment:
        verificationTraceCommitment?.commitment ?? null,

      algorithm:
        verificationTraceCommitment?.algorithm ?? null
    }
  });
}


function createPhorvaProofStatementCommitment(statement) {
  const canonicalJson =
    JSON.stringify(
      canonicalizeProofValue(statement)
    );

  const commitment =
    crypto
      .createHash("sha256")
      .update(canonicalJson, "utf8")
      .digest("hex");

  return {
    algorithm: "SHA-256",
    commitment: "0x" + commitment,
    canonicalJson
  };
}


/*
 * Phorva Proof Statement API v1
 *
 * Converts an already-verified execution graph into
 * a canonical proof statement suitable for an
 * external prover adapter.
 */
app.post("/proof-statement", (req, res) => {
  const {
    executions,
    intent,
    executionGraph,
    executionGraphCommitment,
    finalStateVerification,
    finalStateCommitment,
    authorization,
    verificationReceipt
  } = req.body || {};

  /*
   * PREFERRED PATH:
   *
   * Raw executions are independently verified by Phorva.
   * No verification receipt is required.
   *
   * The receipt path below remains available for
   * backwards compatibility with v1 callers.
   */
  if (Array.isArray(executions)) {
    try {
      const context =
        buildVerifiedPhorvaProofContext({
          executions,

          intent,

          finalState:
            req.body?.finalState,

          expectedFinalState:
            finalStateVerification?.expected ??
            req.body?.expectedFinalState
        });

      /*
       * Caller-supplied commitments are assertions only.
       * Phorva independently recomputes the authoritative
       * execution graph commitment.
       */
      if (
        executionGraphCommitment?.commitment &&
        executionGraphCommitment.commitment !==
          context.verified.commitment.commitment
      ) {
        return res.status(400).json({
          error:
            "Submitted executionGraphCommitment does not match Phorva recomputation"
        });
      }

      /*
       * If the caller supplies an execution graph,
       * recompute it independently and compare it with
       * Phorva's verified graph commitment.
       */
      if (executionGraph) {
        const suppliedGraphCommitment =
          createExecutionGraphCommitment(
            executionGraph
          );

        if (
          suppliedGraphCommitment.commitment !==
          context.verified.commitment.commitment
        ) {
          return res.status(400).json({
            error:
              "Submitted executionGraph does not match Phorva recomputation"
          });
        }
      }

      /*
       * Caller authorization is never authoritative.
       * It must agree with Phorva's independently derived
       * authorization result.
       */
      if (authorization) {
        if (
          authorization.decision !== undefined &&
          authorization.decision !==
            context.verifiedAuthorization.decision
        ) {
          return res.status(400).json({
            error:
              "Caller authorization decision does not match Phorva recomputation"
          });
        }

        for (const field of [
          "allExecutionsAuthorized",
          "sequenceValid",
          "graphInvariantsValid",
          "finalStateSatisfied"
        ]) {
          if (
            authorization[field] !== undefined &&
            authorization[field] !==
              context.verifiedAuthorization[field]
          ) {
            return res.status(400).json({
              error:
                `Caller authorization field "${field}" does not match Phorva recomputation`
            });
          }
        }
      }

      return res.json({
        version:
          context.proofStatement.version,

        statement:
          context.proofStatement,

        commitment:
          context.proofCommitment.commitment,

        algorithm:
          context.proofCommitment.algorithm,

        verificationMode:
          "PURE_EXECUTION_VERIFICATION",

        verification: {
          ...context.verifiedAuthorization,

          violations:
            context.verified.authorization.violations
        }
      });
    } catch (error) {
      return res.status(400).json({
        error:
          error.message
      });
    }
  }

  if (!executionGraph) {
    return res.status(400).json({
      error:
        "executionGraph is required"
    });
  }

  if (!executionGraphCommitment?.commitment) {
    return res.status(400).json({
      error:
        "executionGraphCommitment.commitment is required"
    });
  }

  const recomputedGraphCommitment =
    createExecutionGraphCommitment(
      executionGraph
    );

  if (
    recomputedGraphCommitment.commitment !==
    executionGraphCommitment.commitment
  ) {
    return res.status(400).json({
      error:
        "executionGraphCommitment does not match executionGraph"
    });
  }

  const receiptVerification =
    verifyPhorvaVerificationReceipt({
      executionGraph,

      executionGraphCommitment,

      receipt:
        verificationReceipt
    });

  if (!receiptVerification.valid) {
    return res.status(400).json({
      error:
        receiptVerification.error ??
        "Invalid Phorva verification receipt"
    });
  }

  try {
    const proofStatement =
      buildPhorvaProofStatement({
        intent,
        executionGraph,
        executionGraphCommitment,
        finalStateVerification:
          finalStateVerification ?? null,
        finalStateCommitment:
          finalStateCommitment ?? null,

        authorization:
          authorization ?? null,

        verifiedAuthorization:
          receiptVerification.authorization
      });

    const commitment =
      createPhorvaProofStatementCommitment(
        proofStatement
      );

    return res.json({
      version:
        proofStatement.version,

      statement:
        proofStatement,

      commitment:
        commitment.commitment,

      algorithm:
        commitment.algorithm
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message
    });
  }
});


/*
 * Phorva Proof-Carrying Execution API v1
 *
 * Preferred end-to-end path:
 *
 * raw executions
 *      ↓
 * independent Phorva verification
 *      ↓
 * canonical proof statement
 *      ↓
 * statement commitment
 *      ↓
 * provider-neutral prover adapter
 *      ↓
 * proof artifact
 *
 * The caller supplies execution evidence.
 * Phorva derives the authoritative proof statement.
 *
 * A caller-supplied proof statement is intentionally
 * NOT accepted as the source of truth.
 */


function buildVerifiedPhorvaProofContext({
  executions,
  intent,
  finalState,
  expectedFinalState
}) {
  if (
    !Array.isArray(executions) ||
    executions.length === 0
  ) {
    throw new Error(
      "executions must be a non-empty array"
    );
  }

  const verified =
    verifyRawExecutions({
      executions
    });

  let verifiedAuthorization =
    verified.authorization;

  const verificationTraces =
    verified.nodes.map(node =>
      buildVerificationTrace({
        verification: {
          ...node.decision,

          analysis:
            node.analysis,

          actualTransactionAmount:
            Number.isFinite(
              Number(
                node.analysis
                  ?.decodedParameters
                  ?.actualAmount ??
                node.analysis
                  ?.decodedParameters
                  ?.amount
              )
            )
              ? Number(
                  node.analysis
                    .decodedParameters
                    .actualAmount ??
                  node.analysis
                    .decodedParameters
                    .amount
                )
              : Number(
                  node.transaction?.amount
                ),

          actualNativeValue:
            String(
              node.transaction?.value ?? "0"
            ),

          expectedNativeValue:
            String(
              node.intent?.nativeValue ??
              node.intent?.value ??
              "0"
            )
        }
      })
    );

  const verificationTrace =
    canonicalizeProofValue({
      version:
        "phorva-verification-trace-set-v1",

      executions:
        verificationTraces
    });

  const verificationTraceCommitment =
    createVerificationTraceCommitment(
      verificationTrace
    );

  let verifiedFinalState = null;
  let verifiedFinalStateCommitment = null;

  const finalStateRequested =
    finalState !== undefined ||
    expectedFinalState !== undefined;

  if (finalStateRequested) {
    verifiedFinalState =
      verifyFinalState({
        intent:
          intent ??
          executions[0]?.intent ??
          null,

        finalState:
          finalState ?? null,

        expectedFinalState:
          expectedFinalState ?? null
      });

    verifiedFinalStateCommitment =
      createFinalStateCommitment({
        graphCommitment:
          verified.commitment.commitment,

        finalState:
          finalState ?? null,

        verification:
          verifiedFinalState
      });

    verifiedAuthorization = {
      ...verifiedAuthorization,

      finalStateSatisfied:
        verifiedFinalState.satisfied === true,

      decision:
        verifiedAuthorization.decision ===
          "AUTHORIZED" &&
        verifiedFinalState.satisfied === true
          ? "AUTHORIZED"
          : "BLOCKED"
    };
  } else {
    verifiedAuthorization = {
      ...verifiedAuthorization,

      finalStateSatisfied:
        true
    };
  }

  const proofStatement =
    buildPhorvaProofStatement({
      intent:
        intent ??
        executions[0]?.intent ??
        null,

      executionGraph:
        verified.graph,

      executionGraphCommitment:
        verified.commitment,

      finalStateVerification:
        verifiedFinalState,

      finalStateCommitment:
        verifiedFinalStateCommitment,

      authorization:
        null,

      verifiedAuthorization,

      verificationTrace,

      verificationTraceCommitment
    });

  const proofCommitment =
    createPhorvaProofStatementCommitment(
      proofStatement
    );

  return {
    verified,

    verifiedAuthorization,

    verificationTrace,

    verificationTraceCommitment,

    verifiedFinalState,

    verifiedFinalStateCommitment,

    proofStatement,

    proofCommitment
  };
}

function buildProverRequest({
  proofStatement,
  proofCommitment,
  provider = "mock"
}) {
  if (!proofStatement) {
    throw new Error(
      "proofStatement is required"
    );
  }

  if (!proofCommitment) {
    throw new Error(
      "proofCommitment is required"
    );
  }

  const recomputedCommitment =
    createPhorvaProofStatementCommitment(
      proofStatement
    );

  if (
    proofCommitment.commitment !==
    recomputedCommitment.commitment
  ) {
    throw new Error(
      "Proof commitment does not match Phorva proof statement"
    );
  }

  if (
    proofCommitment.algorithm &&
    proofCommitment.algorithm !==
      recomputedCommitment.algorithm
  ) {
    throw new Error(
      "Proof commitment algorithm does not match Phorva proof statement"
    );
  }

  return canonicalizeProofValue({
    version: "phorva-prover-request-v1",

    provider,

    statement: {
      version:
        proofStatement.version ?? null,

      commitment:
        proofCommitment.commitment ?? null,

      algorithm:
        proofCommitment.algorithm ?? null
    },

    proofInput:
      proofStatement
  });
}

function createMockProofArtifact(
  proverRequest
) {
  const canonicalJson =
    JSON.stringify(
      canonicalizeProofValue(
        proverRequest
      )
    );

  const proofHash =
    crypto
      .createHash("sha256")
      .update(
        canonicalJson,
        "utf8"
      )
      .digest("hex");

  return {
    provider: "mock",

    proofSystem:
      "MOCK-SHA256",

    status: "PROOF_GENERATED",

    proof:
      "0x" + proofHash,

    statementCommitment:
      proverRequest.statement.commitment,

    algorithm: "SHA-256"
  };
}

function proveWithAdapter({
  proofStatement,
  proofCommitment,
  provider = "mock"
}) {
  const proverRequest =
    buildProverRequest({
      proofStatement,
      proofCommitment,
      provider
    });

  const adapter =
    proverAdapters[provider];

  if (!adapter) {
    throw new Error(
      `Unsupported prover provider: ${provider}`
    );
  }

  if (typeof adapter.prove !== "function") {
    throw new Error(
      `Prover provider "${provider}" does not implement prove()`
    );
  }

  return {
    request: proverRequest,

    artifact:
      adapter.prove({
        proverRequest
      })
  };
}

/*
 * Phorva Prover API v1
 *
 * Accepts a canonical Phorva proof statement
 * and routes it through the selected prover adapter.
 */

/*
 * Phorva Proof Verification v1
 *
 * Verifies the provider-neutral proof artifact.
 *
 * The current mock provider uses SHA-256.
 * A real ZK adapter will replace this verification
 * logic with the provider's cryptographic verifier.
 */

const proverAdapters = {
  mock: {
    provider: "mock",
    proofSystem: "MOCK-SHA256",

    prove({
      proverRequest
    }) {
      return createMockProofArtifact(
        proverRequest
      );
    },

    verify({
      proverRequest,
      proof
    }) {
      return verifyMockProofArtifact({
        proverRequest,
        proof
      });
    }
  }
};

function verifyMockProofArtifact({
  proverRequest,
  proof
}) {
  if (!proverRequest) {
    return {
      valid: false,
      error: "proverRequest is required"
    };
  }

  if (!proof) {
    return {
      valid: false,
      error: "proof is required"
    };
  }

  if (proof.provider !== "mock") {
    return {
      valid: false,
      error: "Unsupported proof provider"
    };
  }

  if (proof.proofSystem !== "MOCK-SHA256") {
    return {
      valid: false,
      error: "Unsupported proof system"
    };
  }

  if (!proof.statementCommitment) {
    return {
      valid: false,
      error: "proof.statementCommitment is required"
    };
  }

  const expectedStatementCommitment =
    proverRequest.statement?.commitment ?? null;

  if (
    proof.statementCommitment !==
    expectedStatementCommitment
  ) {
    return {
      valid: false,
      error:
        "Proof statement commitment mismatch"
    };
  }

  const canonicalJson =
    JSON.stringify(
      canonicalizeProofValue(
        proverRequest
      )
    );

  const expectedProof =
    "0x" +
    crypto
      .createHash("sha256")
      .update(
        canonicalJson,
        "utf8"
      )
      .digest("hex");

  const valid =
    proof.proof === expectedProof;

  return {
    valid,

    provider:
      proof.provider,

    proofSystem:
      proof.proofSystem,

    statementCommitment:
      proof.statementCommitment,

    expectedProof,

    actualProof:
      proof.proof,

    algorithm:
      "SHA-256"
  };
}

function verifyProofArtifact({
  proverRequest,
  proof
}) {
  const provider =
    proof?.provider ??
    proverRequest?.provider ??
    null;

  const adapter =
    provider
      ? proverAdapters[provider]
      : null;

  if (!adapter) {
    return {
      valid: false,
      error:
        "No verifier adapter for supplied proof provider"
    };
  }

  if (typeof adapter.verify !== "function") {
    return {
      valid: false,
      error:
        `Proof provider "${provider}" does not implement verify()`
    };
  }

  return adapter.verify({
    proverRequest,
    proof
  });
}

app.post("/prove-execution", (req, res) => {
  const {
    executions,
    intent,
    finalState,
    expectedFinalState,
    provider = "mock"
  } = req.body || {};

  if (
    !Array.isArray(executions) ||
    executions.length === 0
  ) {
    return res.status(400).json({
      error:
        "executions must be a non-empty array"
    });
  }

  try {
    const context =
      buildVerifiedPhorvaProofContext({
        executions,
        intent,
        finalState,
        expectedFinalState
      });

    const proving =
      proveWithAdapter({
        proofStatement:
          context.proofStatement,

        proofCommitment:
          context.proofCommitment,

        provider
      });

    return res.json({
      version:
        "phorva-proof-carrying-execution-v1",

      provider,

      verificationMode:
        "PURE_EXECUTION_VERIFICATION",

      verification: {
        ...context.verifiedAuthorization,

        violations:
          context.verified.authorization
            .violations
      },

      executionGraph:
        context.verified.graph,

      executionGraphCommitment:
        context.verified.commitment,

      verificationTrace:
        context.verificationTrace,

      verificationTraceCommitment:
        context.verificationTraceCommitment,

      finalStateVerification:
        context.verifiedFinalState,

      finalStateCommitment:
        context.verifiedFinalStateCommitment,

      proofStatement:
        context.proofStatement,

      proofCommitment:
        context.proofCommitment,

      proverRequest:
        proving.request,

      proof:
        proving.artifact
    });
  } catch (error) {
    return res.status(400).json({
      error:
        error.message
    });
  }
});

app.post("/prove", (req, res) => {
  const {
    proofStatement,
    proofCommitment,
    provider = "mock"
  } = req.body || {};

  if (!proofStatement) {
    return res.status(400).json({
      error:
        "proofStatement is required"
    });
  }

  if (!proofCommitment?.commitment) {
    return res.status(400).json({
      error:
        "proofCommitment.commitment is required"
    });
  }

  try {
    const result =
      proveWithAdapter({
        proofStatement,
        proofCommitment,
        provider
      });

    return res.json({
      version:
        "phorva-prover-response-v1",

      provider,

      request:
        result.request,

      proof:
        result.artifact
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message
    });
  }
});


/*
 * Phorva Proof Verification API v1
 */
app.post("/verify-proof", (req, res) => {
  const {
    proverRequest,
    proof
  } = req.body || {};

  if (!proverRequest) {
    return res.status(400).json({
      valid: false,
      error:
        "proverRequest is required"
    });
  }

  if (!proof) {
    return res.status(400).json({
      valid: false,
      error:
        "proof is required"
    });
  }

  const verification =
    verifyProofArtifact({
      proverRequest,
      proof
    });

  return res.json({
    version:
      "phorva-proof-verification-v1",

    ...verification
  });
});

app.post("/execution-graph", (req, res) => {
  const {
    executions,
    expectedFinalState,
    finalState
  } = req.body;

  if (
    !Array.isArray(executions) ||
    executions.length === 0
  ) {
    return res.status(400).json({
      authorized: false,
      error:
        "executions must be a non-empty array"
    });
  }

  const nodes = [];

  for (let i = 0; i < executions.length; i++) {
    const execution = executions[i] || {};

    const {
      executionId,
      parentExecutionId,
      agent,
      action,
      intent,
      policy,
      transaction
    } = execution;

    if (
      !agent ||
      !action ||
      !policy ||
      !intent ||
      !transaction
    ) {
      return res.status(400).json({
        authorized: false,
        error:
          `execution ${i} requires agent, action, policy, intent and transaction`
      });
    }

    const verification =
      verifyExecutionAuthorization({
        agent,
        action,
        intent,
        policy,
        transaction
      });

    const analysis =
      verification.analysis;

    const decision = {
      authorized:
        verification.authorized,

      policyPassed:
        verification.policyPassed,

      intentMatched:
        verification.intentMatched,

      parameterMatched:
        verification.parameterMatched,

      executionTypeMatched:
        verification.executionTypeMatched,

      nativeValueMatched:
        verification.nativeValueMatched,

      protocolMatched:
        verification.protocolMatched,

      transactionSecuritySafe:
        verification.transactionSecuritySafe
    };

    nodes.push({
      executionId:
        executionId ??
        `execution-${i + 1}`,

      parentExecutionId:
        parentExecutionId ??
        (i === 0
          ? null
          : nodes[i - 1].executionId),

      sequence:
        execution.sequence ??
        i,

      agent,
      intent,
      transaction,
      analysis,
      decision
    });
  }

  const graph =
    buildExecutionGraph({
      executions: nodes
    });

  const commitment =
    createExecutionGraphCommitment(
      graph
    );

  const allAuthorized =
    nodes.every(
      node =>
        node.decision.authorized === true
    );

  const sequenceValid =
    nodes.every(
      (node, index) =>
        node.sequence === index &&
        (
          index === 0
            ? node.parentExecutionId === null
            : node.parentExecutionId ===
              nodes[index - 1].executionId
        )
    );

  const graphInvariants =
    verifyExecutionGraphInvariants(
      nodes
    );

  /*
   * Final-State Verification v1
   *
   * Optional for backward compatibility.
   * Existing graph requests without final-state
   * fields continue to use the original semantics.
   */
  const finalStateVerificationRequested =
    expectedFinalState !== undefined ||
    finalState !== undefined;

  let finalStateVerification = null;
  let finalStateCommitment = null;

  if (finalStateVerificationRequested) {
    finalStateVerification =
      verifyFinalState({
        intent:
          executions[0]?.intent ?? null,

        finalState,

        expectedFinalState
      });

    finalStateCommitment =
      createFinalStateCommitment({
        graphCommitment:
          commitment.commitment,

        finalState,

        verification:
          finalStateVerification
      });
  }

  const finalStateSatisfied =
    finalStateVerificationRequested
      ? finalStateVerification.satisfied === true
      : true;

  const authorized =
    allAuthorized &&
    sequenceValid &&
    graphInvariants.valid &&
    finalStateSatisfied;

    const phorvaProofStatement =
    buildPhorvaProofStatement({
      intent:
        executions[0]?.intent ?? null,

      executionGraph:
        graph,

      executionGraphCommitment:
        commitment,

      finalStateVerification,

      finalStateCommitment,

      verifiedAuthorization: {
        decision:
          authorized
            ? "AUTHORIZED"
            : "BLOCKED",

        allExecutionsAuthorized:
          allAuthorized,

        sequenceValid,

        graphInvariantsValid:
          graphInvariants.valid,

        finalStateSatisfied
      }
    });

  const phorvaProofCommitment =
    createPhorvaProofStatementCommitment(
      phorvaProofStatement
    );

  /*
   * Phorva Verification Receipt v1
   *
   * This receipt is created only from the
   * authoritative verification result above.
   *
   * It allows /proof-statement to distinguish
   * a graph actually verified by Phorva from
   * arbitrary caller-constructed graph data.
   */
  const verificationReceipt =
    createPhorvaVerificationReceipt({
      executionGraph:
        graph,

      executionGraphCommitment:
        commitment,

      authorization: {
        decision:
          authorized
            ? "AUTHORIZED"
            : "BLOCKED",

        allExecutionsAuthorized:
          allAuthorized,

        sequenceValid,

        graphInvariantsValid:
          graphInvariants.valid,

        finalStateSatisfied
      }
    });

  return res.json({
    authorized,

      proof: {
        version:
          phorvaProofStatement.version,

        statement:
          phorvaProofStatement,

        commitment:
          phorvaProofCommitment.commitment,

        algorithm:
          phorvaProofCommitment.algorithm
      },

      verificationReceipt,

    graph: {
      version:
        graph.version,

      executionCount:
        graph.nodes.length,

      commitment:
        commitment.commitment,

      algorithm:
        commitment.algorithm,

      statement:
        graph
    },

    verification: {
      allExecutionsAuthorized:
        allAuthorized,

      sequenceValid,

      graphInvariantsValid:
        graphInvariants.valid,

      violations:
        graphInvariants.violations,

      graphAuthorized:
        authorized,

      finalStateVerificationRequested,

      finalStateVerification,

      finalStateCommitment
    }
  });
});

app.post("/verification-trace", (req, res) => {
  try {
    const {
      agent,
      action,
      intent,
      policy,
      transaction
    } = req.body || {};

    const verification =
      verifyExecutionAuthorization({
        agent,
        action,
        intent,
        policy,
        transaction
      });

    const trace =
      buildVerificationTrace({
        verification
      });

    return res.json({
      verificationTrace:
        trace,

      authorization: {
        authorized:
          verification.authorized,

        policyPassed:
          verification.policyPassed,

        intentMatched:
          verification.intentMatched,

        parameterMatched:
          verification.parameterMatched,

        executionTypeMatched:
          verification.executionTypeMatched,

        nativeValueMatched:
          verification.nativeValueMatched,

        protocolMatched:
          verification.protocolMatched,

        transactionSecuritySafe:
          verification.transactionSecuritySafe
      }
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message
    });
  }
});

app.post("/authorize", (req, res) => {
  try {
    const {
      agent,
      action,
      intent,
      policy,
      transaction
    } = req.body || {};

    const verification =
      verifyExecutionAuthorization({
        agent,
        action,
        intent,
        policy,
        transaction
      });

    const {
      authorized,
      policyPassed,
      intentMatched,
      parameterMatched,
      executionTypeMatched,
      nativeValueMatched,
      protocolMatched,
      transactionSecuritySafe,
      analysis,
      actualTransactionAmount,
      parameterChecks
    } = verification;

    let reason;

    if (!policyPassed) {
      const maximum =
        Number(
          policy.maxTransactionAmount ??
          policy.maxTransaction
        );

      reason =
        `Actual transaction amount ${actualTransactionAmount} exceeds the policy limit of ${maximum}.`;
    } else if (!intentMatched) {
      reason =
        "The agent action does not match its declared intent.";
    } else if (!parameterMatched) {
      reason =
        analysis.decodedParameters?.error ||
        `Actual calldata amount ${analysis.decodedParameters?.actualAmount} does not match declared intent amount ${intent.amount}.`;
    } else if (!executionTypeMatched) {
      reason =
        "The actual blockchain execution type does not match the authorized intent.";
    } else if (!nativeValueMatched) {
      reason =
        `Transaction native value ${verification.actualNativeValue} does not match authorized native value ${verification.expectedNativeValue}.`;
    } else if (!parameterChecks.assetAddressMatched) {
      reason =
        `Actual input token ${verification.actualAssetAddress || "unknown"} does not match the authorized asset address ${verification.expectedAssetAddress}.`;
    } else if (!protocolMatched) {
      reason =
        "The transaction targets a protocol different from the declared intent.";
    } else if (!transactionSecuritySafe) {
      reason =
        "AgentGuard detected a transaction-security threat.";
    } else {
      reason =
        "Transaction satisfies policy, intent, parameters, protocol and transaction-security checks.";
    }

    const proofDecision = {
      authorized,
      policyPassed,
      intentMatched,
      parameterMatched,
      executionTypeMatched,
      nativeValueMatched,
      protocolMatched,
      transactionSecuritySafe
    };

    const proofSpecification =
      buildAuthorizationProofSpec({
        transaction,
        intent,
        policy,
        analysis,
        decision: proofDecision
      });

    const proofClaims =
      buildProofClaims(proofSpecification);

    const proofCommitment =
      createProofCommitment(proofSpecification);

    return res.json({
      authorized,

      proof: {
        version: proofSpecification.version,
        claim: proofClaims.claim,
        decision: proofSpecification.decision,
        commitment: proofCommitment.commitment,
        algorithm: proofCommitment.algorithm,
        statement: proofSpecification
      },

      agent,
      action,
      intent,

      policyPassed,
      intentMatched,
      parameterMatched,
      nativeValueMatched,
      protocolMatched,
      transactionSecuritySafe,

      actualTransactionAmount,
      declaredIntentAmount: intent.amount,

      policyMaximum:
        Number(
          policy.maxTransactionAmount ??
          policy.maxTransaction
        ),

      transaction,

      decodedTransaction: {
        contract: analysis.contractName,
        protocol: analysis.protocol,
        selector: analysis.decodedFunction?.selector,
        function: analysis.decodedFunction?.name,
        category: analysis.decodedFunction?.category,
        parameters: analysis.decodedParameters
      },

      risk: analysis.risk,

      verdict: {
        policy: policyPassed ? "PASSED" : "FAILED",
        intent: intentMatched ? "MATCHED" : "MISMATCH",
        parameters: parameterMatched ? "MATCHED" : "MISMATCH",
        protocol: protocolMatched ? "MATCHED" : "MISMATCH",
        contract: analysis.contractKnown ? "KNOWN" : "UNKNOWN",
        transactionSecurity:
          transactionSecuritySafe
            ? "SAFE"
            : "THREAT DETECTED"
      },

      securityFlags: analysis.securityFlags,
      parameterFlags: analysis.parameterFlags,

      reason
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message
    });
  }
});

app.get("/chain-status", async (req, res) => {
  const results = {};

  for (const [key, chain] of Object.entries(chains)) {
    try {
      const response = await fetch(chain.rpc, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_chainId",
          params: [],
          id: 1
        })
      });

      const data = await response.json();

      const actualChainId =
        data.result
          ? parseInt(data.result, 16)
          : null;

      results[key] = {
        name: chain.name,
        rpc: chain.rpc,
        expectedChainId: chain.chainId,
        actualChainId,
        connected: Boolean(actualChainId),
        chainMatches: actualChainId === chain.chainId
      };
    } catch (error) {
      results[key] = {
        name: chain.name,
        rpc: chain.rpc,
        expectedChainId: chain.chainId,
        connected: false,
        chainMatches: false,
        error: error.message
      };
    }
  }

  const allConnected =
    Object.values(results).every(
      chain => chain.connected && chain.chainMatches
    );

  res.json({
    connected: allConnected,
    chains: results
  });
});



app.get("/latest-block/:chain", async (req, res) => {
  const { chain } = req.params;
  const chainConfig = chains[chain];

  if (!chainConfig) {
    return res.status(400).json({
      error: "Unsupported chain",
      supportedChains: Object.keys(chains)
    });
  }

  try {
    const response = await fetch(chainConfig.rpc, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getBlockByNumber",
        params: ["latest", true],
        id: 1
      })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(502).json({
        error: "RPC error",
        details: data.error
      });
    }

    if (!data.result) {
      return res.status(404).json({
        error: "Latest block unavailable"
      });
    }

    const block = data.result;

    res.json({
      chain: {
        key: chain,
        name: chainConfig.name,
        chainId: chainConfig.chainId
      },
      block: {
        number: block.number,
        hash: block.hash,
        timestamp: block.timestamp,
        transactionCount: block.transactions.length
      },
      transactions: block.transactions.map(tx => ({
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: tx.value,
        input: tx.input
      }))
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to read latest block",
      details: error.message
    });
  }
});

app.get("/transaction/:chain/:hash", async (req, res) => {
  const { chain, hash } = req.params;

  const chainConfig = chains[chain];

  if (!chainConfig) {
    return res.status(400).json({
      error: "Unsupported chain",
      supportedChains: Object.keys(chains)
    });
  }

  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
    return res.status(400).json({
      error: "Invalid transaction hash"
    });
  }

  try {
    const response = await fetch(chainConfig.rpc, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getTransactionByHash",
        params: [hash],
        id: 1
      })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(502).json({
        error: "RPC error",
        details: data.error
      });
    }

    if (!data.result) {
      return res.status(404).json({
        error: "Transaction not found",
        chain: chainConfig.name,
        hash
      });
    }

    const tx = data.result;

    res.json({
      found: true,

      chain: {
        key: chain,
        name: chainConfig.name,
        chainId: chainConfig.chainId
      },

      transaction: {
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: tx.value,
        nonce: tx.nonce,
        gas: tx.gas,
        gasPrice: tx.gasPrice,
        input: tx.input,
        blockHash: tx.blockHash,
        blockNumber: tx.blockNumber,
        transactionIndex: tx.transactionIndex
      }
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to read transaction",
      details: error.message
    });
  }
});


app.get("/decode-transaction/:chain/:hash", async (req, res) => {
  try {
    const { chain, hash } = req.params;
    const chainConfig = chains[chain];

    if (!chainConfig) {
      return res.status(400).json({
        error: "Unknown chain",
        supportedChains: Object.keys(chains)
      });
    }

    if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
      return res.status(400).json({
        error: "Invalid transaction hash"
      });
    }

    const response = await fetch(chainConfig.rpc, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getTransactionByHash",
        params: [hash]
      })
    });

    const rpc = await response.json();
    const tx = rpc.result;

    if (!tx) {
      return res.status(404).json({
        found: false,
        chain: chainConfig.name,
        hash
      });
    }

    const selector = tx.input.slice(0, 10).toLowerCase();

    const decodedFunction =
      functionSelectors[selector] || {
        name: "Unknown Function",
        category: "unknown"
      };

    const decodedParameters = decodeParameters(
      tx.input,
      decodedFunction.category
    );

    const result = {
      found: true,

      chain: {
        key: chain,
        name: chainConfig.name,
        chainId: chainConfig.chainId
      },

      transaction: {
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: tx.value,
        input: tx.input
      },

      decoded: {
        selector,
        function: decodedFunction.name,
        category: decodedFunction.category,
        parameters: decodedParameters
      }
    };

    res.json(result);

  } catch (error) {
    console.error("Decode transaction error:", error);

    res.status(500).json({
      error: "Failed to decode transaction",
      message: error.message
    });
  }
});

app.get("/health", (req, res) => {
  res.json({
    service: "AgentGuard",
    status: "running",
    analyzer: "EVM parameter verification",
    mode: "local simulation"
  });
});

app.listen(PORT, () => {
  console.log(`AgentGuard running on port ${PORT}`);
  console.log("Security verdict engine enabled");
});
