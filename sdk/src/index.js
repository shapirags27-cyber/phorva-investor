const DEFAULT_BASE_URL = "http://localhost:3000";

const SUPPORTED_NETWORKS = {
  baseSepolia: {
    name: "Base Sepolia",
    chainId: 84532
  },
  ethereumSepolia: {
    name: "Ethereum Sepolia",
    chainId: 11155111
  },
  arbitrumSepolia: {
    name: "Arbitrum Sepolia",
    chainId: 421614
  },
  base: {
    name: "Base",
    chainId: 8453
  },
  ethereum: {
    name: "Ethereum",
    chainId: 1
  },
  arbitrum: {
    name: "Arbitrum One",
    chainId: 42161
  }
};

class Phorva {
  constructor(config = {}) {
    this.apiKey = config.apiKey || null;
    this.baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
    this.network = config.network || "baseSepolia";

    if (!SUPPORTED_NETWORKS[this.network]) {
      throw new Error(
        `Unsupported network: ${this.network}. Supported: ${Object.keys(SUPPORTED_NETWORKS).join(", ")}`
      );
    }
  }

  getNetworkInfo() {
    return SUPPORTED_NETWORKS[this.network];
  }

  async request(path, options = {}) {
    const url = `\( {this.baseUrl} \){path}`;
    const headers = {
      "Content-Type": "application/json",
      "X-Phorva-Network": this.network,
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      ...options.headers
    };

    const res = await fetch(url, {
      ...options,
      headers
    });

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      const err = new Error(data.message || data.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  }

  /**
   * Main authorization / verification call
   * Works across all supported chains
   */
  async authorize(payload) {
    return this.request("/authorize", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        network: this.network
      })
    });
  }

  /**
   * Verify full execution
   */
  async verifyExecution(payload) {
    return this.request("/verify-execution", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        network: this.network
      })
    });
  }

  /**
   * Submit / analyze execution graph
   */
  async executionGraph(payload) {
    return this.request("/execution-graph", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        network: this.network
      })
    });
  }

  /**
   * Get verification trace
   */
  async verificationTrace(payload) {
    return this.request("/verification-trace", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        network: this.network
      })
    });
  }

  /**
   * Decode a transaction on any supported chain
   */
  async decodeTransaction(chain, hash) {
    return this.request(`/decode-transaction/\( {chain}/ \){hash}`);
  }

  /**
   * Get transaction details
   */
  async getTransaction(chain, hash) {
    return this.request(`/transaction/\( {chain}/ \){hash}`);
  }

  /**
   * Health check
   */
  async health() {
    return this.request("/health");
  }

  /**
   * Get status of all chains
   */
  async chainStatus() {
    return this.request("/chain-status");
  }
}

module.exports = {
  Phorva,
  SUPPORTED_NETWORKS
};
